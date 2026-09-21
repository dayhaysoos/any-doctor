import { ANALYSIS_CAPABILITY_NAMES, AnalysisCapabilityName, recipeAnalysisNeeds, RecipeName, UNKNOWN_REASONS } from "./contract.js";

export const AUTHORING_CATALOG_VERSION = 1 as const;

export const AUTHORING_BOUNDARY = "Consumer agents use public facts and recipes; do not patch an installed Any Doctor package or build a private parser/resolver. When public facts are insufficient, narrow the affected check and produce a capability-gap report. Any Doctor maintainers may extend the shared provider only with a framework-neutral change and definite-positive, negative, uncertain, and mixed-neighbor regressions. A capability-gap report is evidence for future product work, not permission to guess or claim a clean result.";
const GAP_STAKES = ["currentFailure", "definitePositive", "negativeControl", "uncertainControl"] as const;


const capabilityDetails: Record<AnalysisCapabilityName, { api: string; purpose: string; limits?: string[]; outcomes?: string[] }> = {
  bindings: { api: "ctx.analysis.bindings(file)", purpose: "Resolve lexical bindings, references, exports and exclusions.", limits: ["same-file lexical identity", "runtime reflection remains unknown"] },
  spans: { api: "ctx.analysis.spans(file)", purpose: "Locate function, method, arrow and class spans without brace parsing.", limits: ["syntax extents, not runtime execution"] },
  calls: { api: "ctx.analysis.calls(file)", purpose: "Read call, receiver, argument, JSX prop, branch, loop and value-flow facts.", limits: ["bounded local flow; JSX attributes and ternary selection expose value IDs", "branch edges and dependency are not proof of predicate truth or numeric policy compliance", "SDK reference: Custom checks section; shipped bin/contract.d.ts and bin/value-flow.d.ts define exact result fields"] },
  identity: { api: "ctx.analysis.callIdentity(file, call, query); ctx.analysis.identity(file, expression, query)", purpose: "Classify whole-call candidates with shared alias/identity rules, or inspect an expression origin.", limits: ["Whole-call queries return known matches/nonmatches or unknown; exact globals include explicit globalThis paths. No source-root prefilter is needed."], outcomes: ["known match", "known non-match", "unknown"] },
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

type RecipeDetail = {
  api: string;
  purpose: string;
  limits: string[];
  inputSchema: Record<string, unknown>;
  example: string;
};

const recipeDetails: Record<RecipeName, RecipeDetail> = {
  "forbidden-call": {
    api: "ctx.recipes.forbiddenCall(file, expression, query, finding)",
    purpose: "Report a call only when its callee resolves to a configured global or import identity.",
    limits: ["the recipe enforces declared directory, extension and exact-path scope", "mutable or conditional aliases to a candidate remain unknown"],
    inputSchema: {
      type: "object", required: ["file", "expression", "query", "finding"],
      properties: {
        file: { type: "string", description: "A relative path returned by ctx.files.list()." },
        expression: expressionSchema,
        query: {
          type: "object", required: ["target"],
          properties: {
            target: identitySchema,
            scope: {
              type: "object",
              properties: {
                under: { type: "array", items: { type: "string" } },
                extensions: { type: "array", items: { type: "string" } },
                exclude: { type: "array", items: { type: "string" } },
              },
              additionalProperties: false,
            },
            reportUnknown: unknownReasonsSchema,
          },
          additionalProperties: false,
        },
        finding: findingSchema,
      },
      additionalProperties: false,
    },
    example: `for (const file of ctx.files.list([".ts", ".tsx", ".mts", ".cts"])) {
  const calls = ctx.analysis.calls(file).structure.flow.values
    .filter(value => value.kind === "call" && !value.dead);
  for (const call of calls) {
    ctx.recipes.forbiddenCall(
      file,
      { id: call.id, start: call.start, end: call.end },
      {
        target: { globals: ["process.exit"] },
        scope: {
          under: ["src"],
          extensions: [".ts", ".tsx", ".mts", ".cts"],
          exclude: ["src/doctor-loader.mts"],
        },
      },
      { rule: "direct-process-exit", message: "Return an exit code instead of terminating immediately." },
    );
  }
}`,
  },
  "unhandled-value": {
    api: "ctx.recipes.unhandledValue(file, expression, query, finding)",
    purpose: "Report a configured produced value only when no supported consumer or ownership transfer is established.",
    limits: ["supported native-array producers", "bounded lexical value flow"],
    inputSchema: {
      type: "object", required: ["file", "expression", "query", "finding"],
      properties: {
        file: { type: "string", description: "A relative path returned by ctx.files.list()." },
        expression: expressionSchema,
        query: {
          type: "object", required: ["producer", "consumers"],
          properties: {
            producer: {
              type: "object", required: ["member", "asyncArgument", "receiver"],
              properties: { member: { type: "string" }, asyncArgument: { type: "number" }, receiver: { const: "array" } },
              additionalProperties: false,
            },
            consumers: { type: "array", items: { type: "string" } },
            reportUnknown: unknownReasonsSchema,
          },
          additionalProperties: false,
        },
        finding: findingSchema,
      },
      additionalProperties: false,
    },
    example: `for (const file of ctx.files.list()) {
  const calls = ctx.analysis.calls(file).structure.flow.values
    .filter(value => value.kind === "call" && !value.dead);
  for (const call of calls) {
    ctx.recipes.unhandledValue(
      file,
      { id: call.id, start: call.start, end: call.end },
      {
        producer: { member: "map", asyncArgument: 0, receiver: "array" },
        consumers: ["Promise.all", "Promise.allSettled"],
      },
      { rule: "unhandled-map-work", message: "This async map result is discarded." },
    );
  }
}`,
  },
  "resource-without-release": {
    api: "ctx.recipes.resourceWithoutRelease(file, expression, query, finding)",
    purpose: "Report a supported acquisition when no matching release is established in its owner cleanup.",
    limits: ["supported owner and acquisition identities", "conditional or opaque cleanup may be unknown"],
    inputSchema: {
      type: "object", required: ["file", "expression", "query", "finding"],
      properties: {
        file: { type: "string", description: "A relative path returned by ctx.files.list()." },
        expression: expressionSchema,
        query: {
          type: "object", required: ["acquisition", "owner", "release"],
          properties: {
            acquisition: identitySchema,
            owner: {
              type: "object", required: ["identity", "argument"],
              properties: { identity: identitySchema, argument: { type: "number" } },
              additionalProperties: false,
            },
            release: { type: "array", items: { type: "string" } },
            reportUnknown: unknownReasonsSchema,
          },
          additionalProperties: false,
        },
        finding: findingSchema,
      },
      additionalProperties: false,
    },
    example: `for (const file of ctx.files.list()) {
  const calls = ctx.analysis.calls(file).structure.flow.values
    .filter(value => value.kind === "call" && !value.dead);
  for (const call of calls) {
    ctx.recipes.resourceWithoutRelease(
      file,
      { id: call.id, start: call.start, end: call.end },
      {
        acquisition: { globals: ["setInterval", "window.setInterval"] },
        owner: {
          identity: { imports: [{ source: "react", names: ["useEffect", "*.useEffect"] }] },
          argument: 0,
        },
        release: ["clearInterval", "window.clearInterval"],
      },
      { rule: "interval-without-effect-cleanup", message: "No matching interval cleanup was established." },
    );
  }
}`,
  },
  "required-or-recommended-option": {
    api: "ctx.recipes.requiredOrRecommendedOption(file, expression, query, finding)",
    purpose: "Report a supported call when an ordered option is established absent.",
    limits: ["option presence does not validate arbitrary runtime value types", "opaque inputs may be unknown"],
    inputSchema: {
      type: "object", required: ["file", "expression", "query", "finding"],
      properties: {
        file: { type: "string", description: "A relative path returned by ctx.files.list()." },
        expression: expressionSchema,
        query: {
          type: "object", required: ["call", "option"],
          properties: {
            call: identitySchema,
            option: {
              type: "object", required: ["option", "sources"],
              properties: {
                option: { type: "string" },
                sources: { type: "array", items: { type: "string" } },
              },
              additionalProperties: false,
            },
            reportUnknown: unknownReasonsSchema,
          },
          additionalProperties: false,
        },
        finding: findingSchema,
      },
      additionalProperties: false,
    },
    example: `for (const file of ctx.files.list()) {
  const calls = ctx.analysis.calls(file).structure.flow.values
    .filter(value => value.kind === "call" && !value.dead);
  for (const call of calls) {
    ctx.recipes.requiredOrRecommendedOption(
      file,
      { id: call.id, start: call.start, end: call.end },
      {
        call: { globals: ["fetch", "globalThis.fetch"] },
        option: { option: "signal", sources: ["RequestInit", "Request"] },
      },
      { rule: "fetch-without-signal", message: "No caller cancellation signal was established." },
    );
  }
}`,
  },
};

export function authoringCatalog() {
  const capabilities = ANALYSIS_CAPABILITY_NAMES.map((name) => ({ name, ...capabilityDetails[name] }));
  const recipes = (Object.keys(recipeDetails) as RecipeName[]).map((name) => ({
    name,
    ...recipeDetails[name],
    requires: recipeAnalysisNeeds(name),
    outcomes: ["report", "clear", "unknown"] as const,
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

export type AuthoringCatalog = ReturnType<typeof authoringCatalog>;

/** Validate authoring evidence without executing seeds or claiming their assertions passed. */
export function validateCapabilityGapReport(value: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
  const text = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
  const relativeFile = (v: unknown): v is string => text(v) && !v.startsWith("/") && !v.includes("\\") && !v.split("/").some(part => part === ".." || part === "");
  const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every(text);
  const contract = authoringCatalog().customChecks.gapReport;
  if (!object(value)) return { valid: false, errors: ["report must be an object"] };
  for (const field of contract.requiredFields) {
    if (field === "acceptanceCases") continue;
    if (field === "availableFacts" ? !strings(value[field]) || value[field].length === 0 : !text(value[field]))
      errors.push(`${field} must be ${field === "availableFacts" ? "a nonempty string array" : "a nonempty string"}`);
  }
  if (!text(value.classification) || !Object.hasOwn(contract.classifications, value.classification)) errors.push("classification is not recognized");
  const stakes = value.acceptanceCases;
  if (!object(stakes)) return { valid: false, errors: [...errors, "acceptanceCases must contain the four named stakes"] };
  for (const name of GAP_STAKES) {
    const stake = stakes[name];
    if (!object(stake)) { errors.push(`acceptanceCases.${name} is required`); continue; }
    const fail = (message: string) => errors.push(`acceptanceCases.${name}: ${message}`);
    const seed = stake.seed;
    if (!(object(seed) && Object.keys(seed).length > 0 && Object.entries(seed).every(([file, source]) => relativeFile(file) && text(source))) && !text(stake.fixturePath))
      fail("supply a runnable seed file map or fixturePath");
    if (!Array.isArray(stake.findings) || !stake.findings.every(f => object(f) && text(f.rule) && relativeFile(f.file) && Number.isInteger(f.line) && Number(f.line) > 0 && Number.isInteger(f.column) && Number(f.column) >= 0))
      fail("findings must list exact rule, file, line and column");
    const narrowing = stake.narrowing;
    if (!object(narrowing) || (narrowing.state !== "complete" && narrowing.state !== "narrowed") || !strings(narrowing.reasons) ||
      (narrowing.state === "complete" ? narrowing.reasons.length !== 0 : narrowing.reasons.length === 0) ||
      !narrowing.reasons.every(reason => UNKNOWN_REASONS.includes(reason as typeof UNKNOWN_REASONS[number]))) {
      fail("narrowing must declare complete with no reasons, or narrowed with public unknown reasons");
    }
    const narrowed = object(narrowing) && narrowing.state === "narrowed";
    for (const field of ["score", "grade"] as const) if (stake[field] !== (narrowed ? "null" : "present")) fail(`${field} must be ${narrowed ? "null" : "present"}`);
    if (name === "definitePositive" && (!Array.isArray(stake.findings) || !stake.findings.length)) fail("a definite positive must retain a finding, including beside uncertainty");
    if (name === "negativeControl" && (narrowed || !Array.isArray(stake.findings) || stake.findings.length !== 0)) fail("a negative control must be complete with no findings");
    if (name === "uncertainControl" && !narrowed) fail("an uncertain control must narrow and withhold score/grade");
  }
  return { valid: errors.length === 0, errors };
}
