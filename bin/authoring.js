import { ANALYSIS_CAPABILITY_NAMES, UNKNOWN_REASONS } from "./contract.js";
import { isDeepStrictEqual } from "node:util";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { RECIPE_DEFINITIONS, recipeAnalysisNeeds, recipeAuthoringDetails } from "./recipe-definitions.js";
export const AUTHORING_CATALOG_VERSION = 1;
export const AUTHORING_BOUNDARY = "Consumer agents use public facts and recipes; do not patch an installed Any Doctor package or build a private parser/resolver. When public facts are insufficient, narrow the affected check and produce a capability-gap report. Any Doctor maintainers may extend the shared provider only with a framework-neutral change and definite-positive, negative, uncertain, and mixed-neighbor regressions. A capability-gap report is evidence for future product work, not permission to guess or claim a clean result.";
const GAP_STAKES = ["currentFailure", "definitePositive", "negativeControl", "uncertainControl"];
const capabilityDetails = {
    bindings: { api: "ctx.analysis.bindings(file)", purpose: "Resolve lexical bindings, references, exports and exclusions.", limits: ["same-file lexical identity", "runtime reflection remains unknown"] },
    spans: { api: "ctx.analysis.spans(file)", purpose: "Locate function, method, arrow and class spans without brace parsing.", limits: ["syntax extents, not runtime execution"] },
    calls: { api: "ctx.analysis.calls(file)", purpose: "Read call, receiver, argument, JSX prop, branch, loop and value-flow facts.", limits: ["bounded local flow; JSX attributes and ternary selection expose value IDs", "branch edges and dependency are not proof of predicate truth or numeric policy compliance", "SDK reference: Custom checks section; shipped bin/contract.d.ts and bin/value-flow.d.ts define exact result fields"] },
    identity: { api: "ctx.analysis.callIdentity(file, call, query); ctx.analysis.identity(file, expression, query)", purpose: "Classify whole-call candidates with shared alias/identity rules, or inspect an expression origin.", limits: ["Whole-call queries return known matches/nonmatches or unknown; exact globals include explicit globalThis paths. No source-root prefilter is needed."], outcomes: ["known match", "known non-match", "unknown"] },
    "value-path": { api: "ctx.analysis.valueAtPath(file, subject, { at, path })", purpose: "Establish whether one static property path is present or absent at an exact source observation.", limits: ["same-file JavaScript and TypeScript value flow", "dynamic keys, accessors, prior mutation, prior escape and opaque helpers remain unknown", "does not infer domain meaning or automatically narrow a check"], outcomes: ["present with terminal expression and optional constant", "absent", "unknown"] },
    "value-disposition": { api: "ctx.analysis.valueDisposition(file, expression, query)", purpose: "Classify a produced value as consumed, transferred or discarded.", outcomes: ["consumed", "transferred", "discarded", "unknown"] },
    "resource-lifetime": { api: "ctx.analysis.resourceLifetime(file, expression, query)", purpose: "Relate a supported acquisition to a release inside an owner.", outcomes: ["released", "unreleased", "unknown"] },
    "option-presence": { api: "ctx.analysis.optionPresence(file, expression, query)", purpose: "Resolve supported ordered options, spreads and constructor inputs.", outcomes: ["present", "absent", "unknown"] },
    consumers: { api: "ctx.analysis.consumers(file)", purpose: "Read cross-file import, runtime, test, type, re-export, public and uncertain export-consumer evidence.", limits: ["captured project graph", "evidence does not prove runtime reachability or deletion safety"] },
    structures: { api: "ctx.analysis.structures(file)", purpose: "Read stable function fingerprints, size facts and captured names without exposing an AST.", limits: ["fingerprints do not prove semantic equivalence"] },
};
const expressionSchema = {
    type: "object",
    required: ["id", "start", "end"],
    properties: {
        id: { type: "number", description: "The value id from ctx.analysis.calls(file).structure.flow.values." },
        start: { type: "number", description: "Zero-based source start offset." },
        end: { type: "number", description: "Zero-based source end offset." },
    },
    additionalProperties: false,
};
const identitySchema = {
    type: "object",
    description: "Supported identities. List every source spelling the check claims: globals use exact paths; import names use name, default, default.member, or *.member.",
    properties: {
        globals: { type: "array", description: "Exact global call paths, for example fetch, process.exit, or window.setInterval.", items: { type: "string" } },
        imports: {
            type: "array",
            description: "Imported identities. Local aliases resolve automatically; declare the exported identity spelling.",
            items: {
                type: "object",
                required: ["source", "names"],
                properties: {
                    source: { type: "string", description: "Exact module specifier, such as react." },
                    names: { type: "array", description: "Export selectors: name (named import), default, default.member, or *.member (namespace import member).", items: { type: "string" } },
                },
                additionalProperties: false,
            },
        },
    },
    additionalProperties: false,
};
const findingSchema = {
    type: "object",
    required: ["rule"],
    properties: {
        rule: { type: "string", description: "A check id declared in meta.checks." },
        message: { type: "string" },
    },
    additionalProperties: false,
};
const unknownReasonsSchema = { type: "array", items: { enum: [...UNKNOWN_REASONS] } };
export function authoringCatalog() {
    const capabilities = ANALYSIS_CAPABILITY_NAMES.map((name) => ({ name, ...capabilityDetails[name] }));
    const recipes = Object.keys(RECIPE_DEFINITIONS).map((name) => ({
        name,
        ...recipeAuthoringDetails(name, {
            expression: expressionSchema,
            identity: identitySchema,
            finding: findingSchema,
            unknownReasons: unknownReasonsSchema,
        }),
        requires: recipeAnalysisNeeds(name),
        outcomes: ["report", "clear", "unknown"],
    }));
    return {
        schema: AUTHORING_CATALOG_VERSION,
        tool: "any-doctor",
        command: "capabilities",
        rule: "Use a shared capability or recipe when it covers the accepted rule boundary; report a product gap instead of building a private parser or resolver.",
        sourceAccess: [
            { api: "ctx.files", purpose: "List, inventory and read authorized target files, including host-owned masking." },
            { api: "ctx.search", purpose: "Ask ast-grep pattern, structural rule and batched-rule questions." },
        ],
        capabilities,
        recipes,
        customChecks: {
            reference: "docs/doctor-sdk.md#capability-gap-report",
            boundary: AUTHORING_BOUNDARY,
            procedure: [
                "Map each accepted claim to a public fact or recipe before implementing it.",
                "Enumerate structural candidates, then call ctx.analysis.callIdentity; do not exclude aliases, wrappers or globalThis by source spelling.",
                "A dependency in any alternative does not prove the selected policy path uses it; inspect selection test and both arms, or narrow and report the missing proof.",
                "Keep definite, complete negative, and unknown JSON stakes with an independent positive beside uncertainty.",
            ],
            gapReport: {
                classifications: {
                    "authoring-error": "Existing facts cover the case; fix the author query or traversal and preserve equivalent-syntax tests.",
                    "reusable-sdk-gap": "A deterministic local relationship is missing; propose the smallest framework-neutral fact or bounded query with positive, negative and unknown stakes.",
                    "project-policy": "The threshold, exception or meaning needs a project decision; record that policy separately from mechanism.",
                    "runtime-dynamic": "The result depends on external execution, runtime input or cross-module behavior beyond the bounded contract; abstain and name the required evidence.",
                },
                requiredFields: ["intent", "classification", "minimalSeed", "expected", "actual", "reproductionCommand", "availableFacts", "missingProof", "affectedScope", "proposedNextStep", "acceptanceCases"],
                validation: {
                    api: "validateCapabilityGapReport(value) from the shipped bin/authoring.js (author tooling only, not a confined doctor import)",
                    certificationApi: "certifyCapabilityGapReport(value, { doctorPath, reportDir? }) executes every stake through the real CLI",
                    consumedByDoctorVerify: false,
                    stakes: GAP_STAKES,
                    stakeFields: {
                        seed: "Nonempty object mapping relative source file paths to complete source strings; alternatively supply fixturePath.",
                        fixturePath: "Nonempty runnable fixture path, relative to the report or absolute.",
                        findings: "Array of exact { rule, file, line, column } expected findings (one-based line, zero-based column); empty for a negative control.",
                        narrowing: "{ state: complete | narrowed, reasons: string[] }; narrowed requires at least one public unknown reason.",
                        score: "present | null; null when narrowed",
                        grade: "present | null; null when narrowed",
                    },
                    constraints: "All four acceptanceCases keys are required. definitePositive has findings, negativeControl is complete with none, uncertainControl is narrowed with null score/grade. A mixed positive may be narrowed but must retain its findings.",
                },
                completion: "Report blocked or partial for the affected claim. A gap report is authoring output, not a new runtime API or permission to build a private analyzer.",
            },
        },
        reporting: [
            { api: "ctx.report.finding", purpose: "Emit a definite check result tied to source evidence." },
            { api: "ctx.report.narrowing", purpose: "Expose check-specific uncertainty without inventing a finding or clean score." },
        ],
    };
}
/** Validate authoring evidence without executing seeds or claiming their assertions passed. */
export function validateCapabilityGapReport(value) {
    const errors = [];
    const object = (v) => !!v && typeof v === "object" && !Array.isArray(v);
    const text = (v) => typeof v === "string" && v.trim().length > 0;
    const relativeFile = (v) => text(v) && !v.startsWith("/") && !v.includes("\\") && !v.split("/").some(part => part === ".." || part === "");
    const strings = (v) => Array.isArray(v) && v.every(text);
    const contract = authoringCatalog().customChecks.gapReport;
    if (!object(value))
        return { valid: false, errors: ["report must be an object"] };
    for (const field of contract.requiredFields) {
        if (field === "acceptanceCases")
            continue;
        if (field === "availableFacts" ? !strings(value[field]) || value[field].length === 0 : !text(value[field]))
            errors.push(`${field} must be ${field === "availableFacts" ? "a nonempty string array" : "a nonempty string"}`);
    }
    if (!text(value.classification) || !Object.hasOwn(contract.classifications, value.classification))
        errors.push("classification is not recognized");
    const stakes = value.acceptanceCases;
    if (!object(stakes))
        return { valid: false, errors: [...errors, "acceptanceCases must contain the four named stakes"] };
    for (const name of GAP_STAKES) {
        const stake = stakes[name];
        if (!object(stake)) {
            errors.push(`acceptanceCases.${name} is required`);
            continue;
        }
        const fail = (message) => errors.push(`acceptanceCases.${name}: ${message}`);
        const seed = stake.seed;
        if (!(object(seed) && Object.keys(seed).length > 0 && Object.entries(seed).every(([file, source]) => relativeFile(file) && text(source))) && !text(stake.fixturePath))
            fail("supply a runnable seed file map or fixturePath");
        if (!Array.isArray(stake.findings) || !stake.findings.every(f => object(f) && text(f.rule) && relativeFile(f.file) && Number.isInteger(f.line) && Number(f.line) > 0 && Number.isInteger(f.column) && Number(f.column) >= 0))
            fail("findings must list exact rule, file, line and column");
        const narrowing = stake.narrowing;
        if (!object(narrowing) || (narrowing.state !== "complete" && narrowing.state !== "narrowed") || !strings(narrowing.reasons) ||
            (narrowing.state === "complete" ? narrowing.reasons.length !== 0 : narrowing.reasons.length === 0) ||
            !narrowing.reasons.every(reason => UNKNOWN_REASONS.includes(reason))) {
            fail("narrowing must declare complete with no reasons, or narrowed with public unknown reasons");
        }
        const narrowed = object(narrowing) && narrowing.state === "narrowed";
        for (const field of ["score", "grade"])
            if (stake[field] !== (narrowed ? "null" : "present"))
                fail(`${field} must be ${narrowed ? "null" : "present"}`);
        if (name === "definitePositive" && (!Array.isArray(stake.findings) || !stake.findings.length))
            fail("a definite positive must retain a finding, including beside uncertainty");
        if (name === "negativeControl" && (narrowed || !Array.isArray(stake.findings) || stake.findings.length !== 0))
            fail("a negative control must be complete with no findings");
        if (name === "uncertainControl" && !narrowed)
            fail("an uncertain control must narrow and withhold score/grade");
    }
    return { valid: errors.length === 0, errors };
}
/**
 * Execute every declared capability-gap stake through the real CLI and compare
 * findings, narrowing, scoring and run integrity. This remains separate from
 * ordinary Doctor verification: a gap report is authoring evidence, not a
 * Doctor fixture or a new runtime capability.
 */
export function certifyCapabilityGapReport(value, options) {
    var _a, _b;
    const validation = validateCapabilityGapReport(value);
    if (!validation.valid) {
        return { valid: false, validationErrors: validation.errors, passed: 0, failed: 0, cases: [] };
    }
    const report = value;
    const doctorPath = path.resolve(options.doctorPath);
    const reportDir = path.resolve((_a = options.reportDir) !== null && _a !== void 0 ? _a : process.cwd());
    const cliPath = path.resolve((_b = options.cliPath) !== null && _b !== void 0 ? _b : fileURLToPath(new URL("./cli.js", import.meta.url)));
    const cases = Object.entries(report.acceptanceCases).map(([name, stake]) => { var _a; return certifyCapabilityGapCase(name, stake, { doctorPath, reportDir, cliPath, timeoutMs: (_a = options.timeoutMs) !== null && _a !== void 0 ? _a : 30000 }); });
    const passed = cases.filter(item => item.ok).length;
    return { valid: true, validationErrors: [], passed, failed: cases.length - passed, cases };
}
function certifyCapabilityGapCase(name, stake, options) {
    const temporary = stake.seed ? fs.mkdtempSync(path.join(os.tmpdir(), "any-doctor-gap-")) : undefined;
    try {
        const target = temporary !== null && temporary !== void 0 ? temporary : path.resolve(options.reportDir, stake.fixturePath);
        if (stake.seed)
            materializeGapSeed(target, stake.seed);
        const run = spawnSync(process.execPath, [options.cliPath, "run", options.doctorPath, target, "--format", "json"], {
            cwd: options.reportDir,
            encoding: "utf8",
            timeout: options.timeoutMs,
            maxBuffer: 20e6,
        });
        const errors = [];
        if (run.error)
            return { name, ok: false, errors: [run.error.message] };
        if (run.status !== 0)
            return { name, ok: false, errors: [`CLI exited ${run.status}: ${run.stderr || run.stdout}`] };
        let output;
        try {
            output = JSON.parse(run.stdout);
        }
        catch {
            return { name, ok: false, errors: ["CLI did not return JSON"] };
        }
        const groups = Array.isArray(output.groups) ? output.groups : [];
        const findings = groups.flatMap(group => Array.isArray(group.checks) ? group.checks.flatMap(check => Array.isArray(check.findings) ? check.findings.map(finding => ({
            rule: String(check.rule), file: String(finding.file), line: Number(finding.line), column: Number(finding.column),
        })) : []) : []);
        const narrowed = groups.flatMap(group => {
            const semantic = group.semantic;
            return Array.isArray(semantic === null || semantic === void 0 ? void 0 : semantic.narrowed) ? semantic.narrowed : [];
        });
        const reasons = [...new Set(narrowed.map(item => String(item.reason)))].sort();
        const state = narrowed.length > 0 ? "narrowed" : "complete";
        const score = output.score;
        compareGapValue(errors, "findings", findings, stake.findings);
        compareGapValue(errors, "narrowing reasons", reasons, [...stake.narrowing.reasons].sort());
        compareGapValue(errors, "narrowing state", state, stake.narrowing.state);
        compareGapValue(errors, "score", gapPresence(score, "score"), stake.score);
        compareGapValue(errors, "grade", gapPresence(score, "grade"), stake.grade);
        for (const field of ["crashed", "broken", "skippedUnsafe"]) {
            compareGapValue(errors, field, output[field], []);
        }
        return { name, ok: errors.length === 0, errors };
    }
    finally {
        if (temporary)
            fs.rmSync(temporary, { recursive: true, force: true });
    }
}
function materializeGapSeed(root, seed) {
    for (const [relative, source] of Object.entries(seed)) {
        const destination = path.resolve(root, relative);
        if (destination !== root && !destination.startsWith(root + path.sep))
            throw new Error(`gap seed path escapes sandbox: ${relative}`);
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        fs.writeFileSync(destination, source);
    }
}
function compareGapValue(errors, label, actual, expected) {
    if (!isDeepStrictEqual(actual, expected))
        errors.push(`${label}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
}
function gapPresence(value, field) {
    if (!value || !Object.hasOwn(value, field))
        return "missing";
    return value[field] === null ? "null" : "present";
}
