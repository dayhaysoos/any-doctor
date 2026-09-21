import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { buildCtx, setAnalysisDisabled, probeAnalysisAvailable } from "./sdk.js";
import { withinDir } from "./contract.js";
import * as contract from "./contract.js";
// One execution of a doctor program against a root, framed as a run result.
// Owned here because both halves need it: the loader's run mode and every
// certification sandbox. Typed, not Record<string, unknown> — consumers
// (certify, the loader frame) read .findings and .meta off it directly.
export async function runOnce(root, mod, opts) {
    const started = Date.now();
    const { ctx, getFindings, getAnalysisCoverage, getSemanticReport } = buildCtx(root, opts);
    const fileCount = ctx.files.list().length;
    const result = mod.doctor(ctx);
    if (!result || typeof result.then !== "function") {
        throw new Error("doctor() must be async — declare it `export async function doctor(ctx)`");
    }
    return result.then(() => {
        const analysisCoverage = getAnalysisCoverage();
        const semantic = getSemanticReport(mod.meta);
        return {
            protocolVersion: contract.PROTOCOL_VERSION,
            kind: "run",
            root,
            fileCount,
            durationMs: Date.now() - started,
            meta: mod.meta,
            findings: getFindings(),
            ...(semantic ? { semantic } : {}),
            ...(analysisCoverage ? { analysisCoverage } : {}),
        };
    });
}
// The claim contract (D23): certification requires each declared check to
// state the observable condition it establishes, its innocent lookalikes,
// and - when it needs the identity engine - what happens on unknown. Prose
// impact is not a testable claim. Thrown before any sandbox runs; the
// loader renders the problems and exits 3.
export class ClaimContractViolation extends Error {
    constructor(problems) {
        super("claim contract violations:\n  " + problems.join("\n  "));
        this.problems = problems;
        this.name = "ClaimContractViolation";
    }
}
export function validateClaimContract(mod) {
    var _a;
    const checks = (_a = mod.meta) === null || _a === void 0 ? void 0 : _a.checks;
    if (!Array.isArray(checks))
        return;
    const problems = [];
    for (const c of checks) {
        if (typeof c.claim !== "string" || c.claim.trim().length === 0) {
            problems.push(`check "${String(c.id)}": claim is required — one sentence, the observable condition detected, not the consequence`);
        }
        if (!Array.isArray(c.lookalikes) || c.lookalikes.length === 0) {
            problems.push(`check "${String(c.id)}": lookalikes is required — at least one innocent shape that must stay silent`);
        }
        if (c.reportingUnit !== undefined && !["occurrence", "file", "project"].includes(String(c.reportingUnit))) {
            problems.push(`check "${String(c.id)}": reportingUnit must be occurrence, file, or project`);
        }
        if (contract.checkAnalysisNeeds(c).length > 0
            && (c.onUnknown !== "narrow" && c.onUnknown !== "skip")) {
            problems.push(`check "${String(c.id)}": onUnknown is required when analysis needs are explicit or implied by a recipe — "narrow" or "skip"`);
        }
        if (c.recipe !== undefined) {
            try {
                const fixtures = challengeProfileFixtures(c);
                if (fixtures.length === 0)
                    problems.push(`check "${String(c.id)}": recipe declaration produced no challenge profiles`);
            }
            catch (e) {
                problems.push(`check "${String(c.id)}": ${e instanceof Error ? e.message : String(e)}`);
            }
        }
    }
    if (problems.length > 0)
        throw new ClaimContractViolation(problems);
}
const SKIP_ANALYSIS = "analysis engine unavailable — pins the analysis-on path";
// The result-row constructors: every policy speaks in the same row shape,
// so a verify frame's consumers never see policy-specific spellings.
const okRow = (name) => ({ name, ok: true, missing: [], unexpected: [] });
const skipRow = (name) => ({ ...okRow(name), skipped: SKIP_ANALYSIS });
const errorRow = (name, e) => ({
    name, ok: false, missing: [], unexpected: [],
    error: e instanceof Error ? e.message : String(e),
});
function materializeSeed(tmp, rel, content) {
    const abs = path.resolve(tmp, rel);
    if (!withinDir(abs, tmp)) {
        throw new Error(`fixture seed path escapes the sandbox: ${rel}`);
    }
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
}
// The one sandbox lifecycle: materialize a seed into a fresh temp dir, run,
// clean up. A crashing sandbox is a named failing result (or the caller's
// error row) — siblings always run.
async function inSandbox(seed, run) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "any-doctor-verify-"));
    try {
        for (const [rel, content] of Object.entries(seed))
            materializeSeed(tmp, rel, content);
        return await run(tmp);
    }
    finally {
        fs.rmSync(tmp, { recursive: true, force: true });
    }
}
// The one corpus walker: a directory tree as a seed map. `skip` carves out
// manifest files (the sensitivity corpus's expect.json).
function collectSeed(dir, prefix, seed, skip) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const abs = path.join(dir, entry.name);
        const rel = prefix ? prefix + "/" + entry.name : entry.name;
        if (entry.isDirectory())
            collectSeed(abs, rel, seed, skip);
        else if (entry.name !== skip)
            seed[rel] = fs.readFileSync(abs, "utf8");
    }
}
// doctor-reliability's witness law as one named predicate: an occurrence
// check needs two distinct positions of that check in one file. A line-only
// expectation overlaps every column on its line, so it counts once no
// matter how many column-exact siblings share the line (D28's overlap fix).
function distinctLocationsInFile(hits) {
    var _a, _b;
    const files = new Map();
    for (const hit of hits) {
        const lines = (_a = files.get(hit.file)) !== null && _a !== void 0 ? _a : new Map();
        const columns = (_b = lines.get(hit.line)) !== null && _b !== void 0 ? _b : new Set();
        columns.add(hit.column);
        lines.set(hit.line, columns);
        files.set(hit.file, lines);
    }
    return [...files.values()].some((lines) => [...lines.values()]
        .reduce((count, columns) => count + (columns.has(undefined) ? 1 : columns.size), 0) >= 2);
}
// The certification entry point: every policy, in gate order, as result
// rows a verify frame can carry.
export async function certify(mod, fixtures) {
    var _a, _b, _c, _d;
    validateClaimContract(mod);
    const results = [];
    // Only a doctor whose checks declare analysis needs can have
    // analysis-on sandboxes — probing anyone else would make a channel-less
    // direct invocation fail fixtures that never touch analysis at all.
    const declaresNeeds = contract.narrowedCheckIds(mod.meta).length > 0;
    let analysisAvailable;
    // The fixture loop's own rows, keyed by fixture — the location-coverage
    // witness asks "did THIS fixture pass", never "which row is this index".
    const rowByFixture = new Map();
    // The one skip policy (D25): an analysis-on sandbox whose engine is not
    // installed here is an honest skip, not a failure — expectations belong
    // to the full-power path. One decision for every policy that asks.
    const skipFor = async (analysisOn) => {
        if (!declaresNeeds || !analysisOn)
            return false;
        if (analysisAvailable === undefined) {
            analysisAvailable = await inSandbox({}, async (tmp) => probeAnalysisAvailable(tmp));
        }
        return analysisAvailable === false;
    };
    for (const fixture of fixtures) {
        try {
            // The fixture's declared analysis mode: "off" forces the degraded
            // path (pinning the narrowed behavior); the default "on" runs with
            // the engine — and skips honestly when it is not installed here,
            // rather than failing a fixture whose expectations belong to the
            // full-power path.
            setAnalysisDisabled(fixture.analysis === "off");
            if (await skipFor(fixture.analysis !== "off")) {
                results.push(skipRow(fixture.name));
                continue;
            }
            // Verify always lists everything (includeTestsFor): the sandbox is
            // the doctor's own world — a seed named *.test.ts is deliberate
            // test data (effect-v4-kitlangton's sleep-in-test depends on it).
            const result = await inSandbox(fixture.seed, (tmp) => { var _a; return runOnce(tmp, mod, { includeTests: (_a = fixture.includeTests) !== null && _a !== void 0 ? _a : true }); });
            const diff = contract.compareFindings(fixture.expected, result.findings);
            const row = { name: fixture.name, ok: diff.missing.length === 0 && diff.unexpected.length === 0, ...diff };
            results.push(row);
            rowByFixture.set(fixture, row);
        }
        catch (e) {
            results.push(errorRow(fixture.name, e));
        }
        finally {
            setAnalysisDisabled(false);
        }
    }
    // Recipe declarations select maintained adversarial profiles. The generated
    // sources vary only by serialized selectors; labels and expectations stay
    // host-owned, deterministic, and separate from author fixtures.
    for (const check of (_a = mod.meta.checks) !== null && _a !== void 0 ? _a : []) {
        if (!check.recipe)
            continue;
        for (const fixture of challengeProfileFixtures(check)) {
            const name = `challenge profile: ${check.recipe.name} / ${check.id} / ${fixture.name}`;
            try {
                setAnalysisDisabled(fixture.analysis === 'off');
                if (await skipFor(fixture.analysis !== 'off')) {
                    results.push(skipRow(name));
                    continue;
                }
                const result = await inSandbox(fixture.seed, tmp => runOnce(tmp, mod, { includeTests: true }));
                const diff = contract.compareFindings(fixture.expected, result.findings);
                const actual = !result.semantic ? 'unobserved' : result.semantic.narrowed.some(item => !item.check || item.check === check.id) ? 'narrowed' : 'complete';
                const semantic = fixture.expectedSemantic ? { expected: fixture.expectedSemantic, actual } : undefined;
                const semanticOk = !semantic || semantic.expected === semantic.actual;
                results.push({ name, ok: !diff.missing.length && !diff.unexpected.length && semanticOk, ...diff,
                    ...(semantic ? { semantic } : {}), ...(!semanticOk ? { error: `semantic coverage: expected ${semantic.expected}, received ${actual}` } : {}) });
            }
            catch (e) {
                results.push(errorRow(name, e));
            }
            finally {
                setAnalysisDisabled(false);
            }
        }
    }
    // The shared innocent corpus (D23): files that look guilty but aren't —
    // the audit counterexamples as commons. Every doctor runs against them
    // with expected: []; a finding here is a false positive by definition,
    // whoever wrote the check.
    const innocentDir = corpusDir("innocent");
    if (innocentDir !== null) {
        const seed = {};
        collectSeed(innocentDir, "", seed);
        try {
            const diff = await inSandbox(seed, (tmp) => runOnce(tmp, mod, { includeTests: true }))
                .then((r) => contract.compareFindings([], r.findings));
            results.push({
                name: "shared innocent corpus (" + Object.keys(seed).length + " files)",
                ok: diff.missing.length === 0 && diff.unexpected.length === 0,
                ...diff,
            });
        }
        catch (e) {
            results.push(errorRow("shared innocent corpus", e));
        }
    }
    // Explicit, context-preserving witnesses per check replace source rewriting.
    // One sibling's fixture cannot establish another check's location coverage.
    for (const check of (_b = mod.meta.checks) !== null && _b !== void 0 ? _b : []) {
        const name = `location coverage: ${check.id}`;
        if (!check.reportingUnit) {
            results.push({ ...okRow(name), skipped: "reporting unit undeclared — location coverage not exercised" });
            continue;
        }
        if (contract.checkAnalysisNeeds(check).length > 0 && await skipFor(true)) {
            results.push(skipRow(name));
            continue;
        }
        const witness = fixtures.find((fixture) => {
            const row = rowByFixture.get(fixture);
            if (row === undefined || !row.ok || row.skipped !== undefined)
                return false;
            if (contract.checkAnalysisNeeds(check).length > 0 && fixture.analysis === "off")
                return false;
            const hits = fixture.expected.filter(f => f.rule === check.id);
            if (check.reportingUnit !== "occurrence")
                return hits.length > 0;
            return distinctLocationsInFile(hits);
        });
        if (witness)
            results.push(okRow(name));
        else {
            const reason = check.reportingUnit === "occurrence"
                ? "requires a passing fixture with two distinct locations of this check in one file"
                : "requires a passing positive fixture for this check";
            const severity = (_c = check.severity) !== null && _c !== void 0 ? _c : mod.meta.severity;
            results.push(severity === "info" ? { ...okRow(name), skipped: reason } : errorRow(name, reason));
        }
    }
    // The sensitivity corpus (D24): the innocent corpus's complement —
    // confirmed-real patterns from the audits, patterns that MUST produce
    // findings. Each case directory carries its seed files plus an expect.json
    // mapping doctor id -> expected findings; a doctor only runs the cases it
    // has stakes in.
    const sensDir = corpusDir("sensitivity");
    if (sensDir !== null) {
        for (const entry of fs.readdirSync(sensDir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
            if (!entry.isDirectory())
                continue;
            const caseDir = path.join(sensDir, entry.name);
            const expectPath = path.join(caseDir, "expect.json");
            if (!fs.existsSync(expectPath))
                continue;
            const name = `sensitivity: ${entry.name}`;
            let manifest;
            try {
                manifest = JSON.parse(fs.readFileSync(expectPath, "utf8"));
            }
            catch (e) {
                results.push({ ...okRow(name), ok: false, error: "unreadable expect.json: " + (e instanceof Error ? e.message : String(e)) });
                continue;
            }
            const expected = (_d = manifest === null || manifest === void 0 ? void 0 : manifest.expect) === null || _d === void 0 ? void 0 : _d[String(mod.meta.id)];
            if (!Array.isArray(expected))
                continue;
            try {
                const seed = {};
                collectSeed(caseDir, "", seed, "expect.json");
                if (await skipFor(true)) {
                    results.push(skipRow(name));
                    continue;
                }
                const diff = await inSandbox(seed, (tmp) => runOnce(tmp, mod, { includeTests: true }))
                    .then((r) => contract.compareFindings(expected, r.findings));
                results.push({ name, ok: diff.missing.length === 0 && diff.unexpected.length === 0, ...diff });
            }
            catch (e) {
                results.push(errorRow(name, e));
            }
        }
    }
    return results;
}
const occurrence = (source, rule, needle, nth = 0, file = 'profile.ts') => { var _a; const offset = (_a = [...source.matchAll(new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'))][nth]) === null || _a === void 0 ? void 0 : _a.index; if (offset === undefined)
    throw new Error(`profile occurrence missing: ${needle}`); const before = source.slice(0, offset), line = before.split('\n').length, column = offset - (before.lastIndexOf('\n') + 1); return { rule, file, line, column }; };
const profile = (name, source, expected, semantic) => {
    return profileAt('profile.ts', name, source, expected, semantic);
};
const profileAt = (file, name, source, expected, semantic) => {
    const fixture = { name, seed: { [file]: source }, expected };
    return semantic === 'unavailable' ? { ...fixture, analysis: 'off' } : { ...fixture, analysis: 'on', expectedSemantic: semantic };
};
/** Deterministic extension point for maintained recipe challenge cases. */
export function challengeProfileFixtures(check) {
    const declaration = check.recipe;
    if (!declaration)
        return [];
    const fixtures = declaration.name === 'unhandled-value' ? unhandledProfile(check.id, declaration) : declaration.name === 'resource-without-release' ? resourceProfile(check.id, declaration) : declaration.name === 'required-or-recommended-option' ? optionProfile(check.id, declaration) : forbiddenCallProfile(check.id, declaration);
    if (!fixtures.length)
        throw new Error(`recipe ${declaration.name} has no applicable challenge profile for this declaration`);
    for (const fixture of fixtures) {
        if (fixture.analysis !== 'off' && !['complete', 'narrowed'].includes(fixture.expectedSemantic)) {
            throw new Error(`profile "${fixture.name}": semantic expectation is required for analysis-on challenges`);
        }
    }
    return fixtures;
}
function unhandledProfile(rule, declaration) {
    const member = declaration.query.producer.member, p = `[1].${member}(async value=>value)`;
    const positive = `${p};`, lookalike = `const object={${member}:async callback=>callback(1)};object.${member}(async value=>value);`, transfer = `function own(){return ${p}}`, unknown = `const items=getItems();items.${member}(async value=>value);\n${positive}`, same = `${positive}${positive}`;
    return [
        profile('genuine positive', positive, [occurrence(positive, rule, p)], 'complete'),
        profile('valid lookalike and shadowed producer', lookalike, [], 'complete'),
        profile('ownership transfer', transfer, [], 'complete'),
        profile('unsupported receiver with positive neighbor', unknown, [occurrence(unknown, rule, p)], 'narrowed'),
        profile('two same-line occurrences', same, [occurrence(same, rule, p, 0), occurrence(same, rule, p, 1)], 'complete'),
        profile('analysis unavailable', positive, [], 'unavailable'),
    ];
}
function identityFixtures(query, alias) {
    var _a, _b;
    const fixtures = [];
    for (const global of (_a = query.globals) !== null && _a !== void 0 ? _a : []) {
        const root = global.split('.')[0];
        fixtures.push({ label: `global ${global}`, head: '', callee: global, shadow: `function probe(${root}){${global}(__ARGS__)}` });
    }
    for (const spec of (_b = query.imports) !== null && _b !== void 0 ? _b : []) {
        for (const name of spec.names) {
            if (name.startsWith('*.') && name.length > 2) {
                const member = name.slice(2);
                fixtures.push({ label: `namespace import ${spec.source} ${name}`, head: `import * as ${alias} from ${JSON.stringify(spec.source)};\n`, callee: `${alias}.${member}`, shadow: `function probe(${alias}){${alias}.${member}(__ARGS__)}` });
                continue;
            }
            if (name.startsWith('default.') && name.length > 'default.'.length) {
                const member = name.slice('default.'.length);
                fixtures.push({ label: `default import member ${spec.source} ${name}`, head: `import ${alias} from ${JSON.stringify(spec.source)};\n`, callee: `${alias}.${member}`, shadow: `function probe(${alias}){${alias}.${member}(__ARGS__)}` });
                continue;
            }
            if (name === 'default') {
                fixtures.push({ label: `default import ${spec.source}`, head: `import ${alias} from ${JSON.stringify(spec.source)};\n`, callee: alias, shadow: `function probe(${alias}){${alias}(__ARGS__)}` });
                continue;
            }
            if (!name.includes('.')) {
                fixtures.push({ label: `named import ${spec.source} ${name}`, head: `import {${name} as ${alias}} from ${JSON.stringify(spec.source)};\n`, callee: alias, shadow: `function probe(${alias}){${alias}(__ARGS__)}` });
                continue;
            }
            throw new Error(`identity query cannot generate import challenge for ${JSON.stringify(spec.source)} ${JSON.stringify(name)}; use a named import, default, default.member, or *.member`);
        }
    }
    const unique = [...new Map(fixtures.map(fixture => [fixture.label, fixture])).values()];
    if (unique.length)
        return unique;
    throw new Error(`identity query cannot generate a challenge target; declare a global, named import, default import, or namespace member`);
}
function optionProfile(rule, declaration) {
    const query = declaration.query, targets = identityFixtures(query.call, 'profileCall'), target = targets[0], callee = target.callee, head = target.head;
    const option = query.option.option, positive = `${callee}("payload",{})`, value = option === 'signal' ? 'new AbortController().signal' : 'true';
    const present = `${head}${callee}("payload",{${option}:${value}});`, shadow = `${head}${target.shadow.replace('__ARGS__', '"payload",{}')}`;
    const alias = `${head}const invoke=${callee};invoke("payload",{});`, unknown = `${head}const options={};configure(options);${callee}("payload",options);\n${positive};`, same = `${head}${positive};${positive};`, positiveSource = `${head}${positive};`;
    const declared = targets.slice(1).map(candidate => { const source = `${candidate.head}${candidate.callee}("payload",{});`; return profile(`declared call identity: ${candidate.label}`, source, [occurrence(source, rule, `${candidate.callee}("payload",{})`)], 'complete'); });
    return [
        profile('genuine absence positive', positiveSource, [occurrence(positiveSource, rule, positive)], 'complete'),
        profile('present option lookalike', present, [], 'complete'),
        profile('shadowed call identity', shadow, [], 'complete'),
        profile('immutable call alias', alias, [occurrence(alias, rule, 'invoke("payload",{})')], 'complete'),
        profile('unknown options with positive neighbor', unknown, [occurrence(unknown, rule, positive)], 'narrowed'),
        profile('two same-line occurrences', same, [occurrence(same, rule, positive, 0), occurrence(same, rule, positive, 1)], 'complete'),
        ...declared,
        profile('analysis unavailable', positiveSource, [], 'unavailable'),
    ];
}
function forbiddenCallProfile(rule, declaration) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
    const query = declaration.query, targets = identityFixtures(query.target, 'profileForbidden'), target = targets[0], callee = target.callee, head = target.head;
    const under = (_d = (_c = (_b = (_a = query.scope) === null || _a === void 0 ? void 0 : _a.under) === null || _b === void 0 ? void 0 : _b[0]) === null || _c === void 0 ? void 0 : _c.replace(/\/$/, '')) !== null && _d !== void 0 ? _d : '', extension = (_g = (_f = (_e = query.scope) === null || _e === void 0 ? void 0 : _e.extensions) === null || _f === void 0 ? void 0 : _f[0]) !== null && _g !== void 0 ? _g : '.ts';
    if (extension && !extension.startsWith('.'))
        throw new Error('forbidden-call scope extensions must include the leading dot');
    let file = (under ? under + '/' : '') + 'recipe-profile' + extension, index = 2;
    while ((_j = (_h = query.scope) === null || _h === void 0 ? void 0 : _h.exclude) === null || _j === void 0 ? void 0 : _j.includes(file))
        file = (under ? under + '/' : '') + `recipe-profile-${index++}` + extension;
    const positive = `${head}${callee}(1);`;
    const parts = callee.split('.'), member = parts.length > 1 ? parts.pop() : undefined, receiver = parts.join('.');
    const receiverVariants = member ? [`(${receiver}).${member}(1);`, `(${receiver} as any).${member}(1);`, `${receiver}!.${member}(1);`, `${receiver} /* comment */\n  .${member}(1);`] : [];
    const variants = [`${callee}(1);`, `(${callee})(1);`, `(${callee} as any)(1);`, `${callee}!(1);`, ...receiverVariants];
    const equivalentSource = head + variants.join('\n');
    const equivalentExpected = variants.map(variant => occurrence(equivalentSource, rule, variant, 0, file));
    const shadow = `${head}${target.shadow.replace('__ARGS__', '1')}`;
    const alias = `${head}const forbiddenAlias=${callee};forbiddenAlias(1);`;
    const unrelated = `${head}console.log(0);${callee}(1);`;
    const uncertain = `${head}let maybe=${callee};if(flag)maybe=other;maybe(1);\n${callee}(2);`;
    const uncertainExpected = ((_k = query.reportUnknown) === null || _k === void 0 ? void 0 : _k.includes('unresolved-identity'))
        ? [occurrence(uncertain, rule, 'maybe(1)', 0, file), occurrence(uncertain, rule, `${callee}(2)`, 0, file)]
        : [occurrence(uncertain, rule, `${callee}(2)`, 0, file)];
    const same = `${head}${callee}(1);${callee}(2);`;
    const declared = targets.slice(1).map(candidate => { const source = `${candidate.head}${candidate.callee}(1);`; return profileAt(file, `declared target identity: ${candidate.label}`, source, [occurrence(source, rule, `${candidate.callee}(1)`, 0, file)], 'complete'); });
    return [
        profileAt(file, 'genuine positive', positive, [occurrence(positive, rule, `${callee}(1)`, 0, file)], 'complete'),
        profileAt(file, 'equivalent syntax variants', equivalentSource, equivalentExpected, 'complete'),
        profileAt(file, 'shadowed call identity', shadow, [], 'complete'),
        profileAt(file, 'immutable call alias', alias, [occurrence(alias, rule, 'forbiddenAlias(1)', 0, file)], 'complete'),
        profileAt(file, 'unrelated call with positive neighbor', unrelated, [occurrence(unrelated, rule, `${callee}(1)`, 0, file)], 'complete'),
        profileAt(file, 'mutable alias with positive neighbor', uncertain, uncertainExpected, 'narrowed'),
        profileAt(file, 'two same-line occurrences', same, [occurrence(same, rule, `${callee}(1)`, 0, file), occurrence(same, rule, `${callee}(2)`, 0, file)], 'complete'),
        ...declared,
        profileAt(file, 'analysis unavailable', positive, [], 'unavailable'),
    ];
}
function resourceProfile(rule, declaration) {
    var _a;
    const query = declaration.query, acquisitions = identityFixtures(query.acquisition, 'profileAcquire'), owners = identityFixtures(query.owner.identity, 'profileOwner'), acquisition = acquisitions[0], ownerTarget = owners[0], release = query.release[0];
    if (!release)
        throw new Error('resource recipe needs at least one release identity');
    const head = acquisition.head + ownerTarget.head, acquire = acquisition.callee, owner = ownerTarget.callee, call = `${acquire}(()=>{},1)`, positive = `${head}${owner}(()=>{${call};},[]);`, lookalike = `${head}${owner}(()=>{${acquisition.shadow.replace('__ARGS__', '()=>{},1')}\n${call};},[]);`;
    const releasedAlias = `${head}${owner}(()=>{const handle=${call};const alias=handle;return()=>${release}(alias)},[]);`;
    const wrongHandle = `${head}${owner}(()=>{const handle=${call};return()=>{const other=0;${release}(other)}},[]);`;
    const helper = `${head}function transfer(handle){${release}(handle)}\n${owner}(()=>{const handle=${call};return()=>transfer(handle)},[]);`;
    const unsupported = `${head}${owner}(()=>{const handle=${call};return()=>externalTransfer(handle)},[]);\n${owner}(()=>{${call};},[]);`;
    const unsupportedExpected = ((_a = declaration.query.reportUnknown) === null || _a === void 0 ? void 0 : _a.includes('unsupported-expression')) ? [occurrence(unsupported, rule, call, 0), occurrence(unsupported, rule, call, 1)] : [occurrence(unsupported, rule, call, 1)];
    const same = `${head}${owner}(()=>{${call};${call};},[]);`;
    const declaredAcquisitions = acquisitions.slice(1).map(candidate => { const candidateHead = candidate.head + ownerTarget.head, candidateCall = `${candidate.callee}(()=>{},1)`, source = `${candidateHead}${owner}(()=>{${candidateCall};},[]);`; return profile(`declared acquisition identity: ${candidate.label}`, source, [occurrence(source, rule, candidateCall)], 'complete'); });
    const declaredOwners = owners.slice(1).map(candidate => { const candidateHead = acquisition.head + candidate.head, source = `${candidateHead}${candidate.callee}(()=>{${call};},[]);`; return profile(`declared owner identity: ${candidate.label}`, source, [occurrence(source, rule, call)], 'complete'); });
    const declaredReleases = query.release.slice(1).map(candidate => { const source = `${head}${owner}(()=>{const handle=${call};return()=>${candidate}(handle)},[]);`; return profile(`declared release identity: ${candidate}`, source, [], 'complete'); });
    return [
        profile('genuine unreleased positive', positive, [occurrence(positive, rule, call)], 'complete'),
        profile('shadowed acquisition with positive neighbor', lookalike, [occurrence(lookalike, rule, call, 1)], 'complete'),
        profile('immutable handle alias release', releasedAlias, [], 'complete'),
        profile('different handle does not release acquisition', wrongHandle, [occurrence(wrongHandle, rule, call)], 'complete'),
        profile('supported local cleanup transfer', helper, [], 'complete'),
        profile('unsupported cleanup transfer with positive neighbor', unsupported, unsupportedExpected, 'narrowed'),
        profile('two same-line occurrences', same, [occurrence(same, rule, call, 0), occurrence(same, rule, call, 1)], 'complete'),
        ...declaredAcquisitions,
        ...declaredOwners,
        ...declaredReleases,
        profile('analysis unavailable', positive, [], 'unavailable'),
    ];
}
// A shipped corpus directory, resolved next to the compiled module (bin/'s
// sibling fixtures/), or null when absent — an unbundled checkout still
// certifies, just without the commons. ANY_DOCTOR_CORPUS_ROOT is the test
// seam: tests point the harness at their own corpus trees instead of
// planting synthetic stakes in the shipped commons.
function corpusDir(name) {
    const override = process.env.ANY_DOCTOR_CORPUS_ROOT;
    if (override !== undefined && override !== "") {
        const dir = path.join(path.resolve(override), name);
        return fs.existsSync(dir) ? dir : null;
    }
    try {
        const dir = fs.realpathSync(new URL("../fixtures/" + name, import.meta.url));
        return fs.existsSync(dir) ? dir : null;
    }
    catch {
        return null;
    }
}
