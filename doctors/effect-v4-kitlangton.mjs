export const meta = {
  id: "effect-v4-kitlangton",
  description: "Effect v4 discipline: typed errors over hand-rolled tags, Config over direct env reads, named Effect.fn, deterministic generators, validated boundaries, no casts that silence the type system. The mechanical rules of the kitlangton Effect skill, enforced.",
  severity: "warning",
  category: "effect",
  blindSpots: [
    "Scope: syntax-only checks run only in files with a parser-resolved reference imported from effect or effect/...; Effect idioms routed through re-exporting wrappers are not covered.",
    "Generated .d.ts files are skipped entirely: tsc renders tagged-error base classes as Schema.Class<...> in declarations even when source uses the sanctioned APIs, so declaration scanning would re-report every synthesized class.",
    "Fixture-named files (*.fixtures.mjs) in the target are skipped: they are doctor test data, not target source.",
    "process.env: boundary and startup code (CLI switches, bootstrap scripts) legitimately reads the environment directly - the check cannot tell application logic from boundaries.",
    "Cause-level recovery is flagged wholesale at info severity: deliberately inspecting defects via the cause channel is legitimate; the check records the default, not a proof of misuse.",
    "Effect.fn names are classified when the first argument is a direct static value. Aliased or dynamic names narrow instead of being reported as definitely unnamed.",
    "Layer.mergeAll/provideMerge have legitimate composition uses; like all merge-tools findings this is the skill's default recorded, not a defect proven.",
    "sleep-in-test only fires when test files are scanned: any-doctor's default run excludes them — pass --include-tests to check test discipline.",
    "zod checks apply to files importing zod - a superset of the effect-importing files; z.record discipline is ecosystem-wide, not effect-gated.",
    "Date.now is checked inside the exact direct same-file generator passed to a resolved Effect.gen call. Nested callbacks, aliased generators, generators returned by opaque helpers, and generators defined in another module are not treated as the Effect.gen body.",
    "All checks depend on the shared JS/TS analysis provider and narrow to silence when it is unavailable or cannot resolve a candidate identity.",
    "Judgment rules from the same skill (thin handlers, idempotent-only retry, business rules out of transports) are semantic and stay with review - this doctor enforces only the mechanical subset.",
  ],
  checks: [
    {
      id: "type-silencing-cast",
      description: "`as any`, a double cast, or a non-null assertion used in Effect code.",
      severity: "warning",
      revision: 2,
      reportingUnit: "occurrence",
      needs: ["calls"],
      onUnknown: "narrow",
      impact: "The cast disables exactly the guarantee Effect's types exist to give - that every failure is typed and every value's context is known. The next reader inherits an unsound spot that neither the compiler nor the runtime will ever flag.",
      why: "Effect's type system is the discipline: errors are values, contexts are tracked. The Effect skill's first Do Not names this directly - no `as any`, no non-null assertions, no unchecked casts to silence typing problems.",
      fix: "Answer the type instead: narrow with Schema decoding at the boundary, model the absence (Option/nullable field) instead of asserting it away, or scope one `Effect.castTo`-style escape with a comment if it is truly unavoidable.",
      claim: "`as any`, a double cast, or a non-null assertion in a file importing effect.",
      lookalikes: ["casts in non-effect files"],
    },
    {
      id: "schema-class-as-default",
      description: "Schema.Class / Schema.TaggedClass used for application data modeling.",
      severity: "warning",
      revision: 2,
      reportingUnit: "occurrence",
      needs: ["calls", "identity"],
      onUnknown: "narrow",
      impact: "Class-based schemas pull inheritance and identity semantics into what is usually a plain record, and they accrete: one class schema becomes the base of a hierarchy the codebase never needed.",
      why: "The Effect skill's model is records as `Schema.Struct(...)` plus a same-name interface, with tagged variants reserved for boundary-crossing unions - Schema.Class and Schema.TaggedClass are explicitly not the default modeling pattern.",
      fix: "Model the record with Schema.Struct({...}) and an interface of the same name; reach for Schema.TaggedStruct/TaggedUnion only at boundaries that need discriminants.",
      claim: "Schema.Class / Schema.TaggedClass referenced in an effect-importing file.",
      lookalikes: ["Schema.Struct as the record model"],
    },
    {
      id: "handrolled-tagged-error",
      description: "A _tag error class hand-rolled (extends Error with a _tag, or Data.TaggedError) instead of Schema.TaggedErrorClass.",
      severity: "warning",
      revision: 2,
      reportingUnit: "occurrence",
      needs: ["calls", "identity", "spans", "bindings"],
      onUnknown: "narrow",
      impact: "Hand-rolled error classes drift from the schema ecosystem: no decoder at boundaries, no derived interface, and each one re-implements tagging slightly differently - exhaustiveness checking gets weaker the more exist.",
      why: "The skill's rule: expected typed failures are `Schema.TaggedErrorClass`; do not hand-roll `_tag` error classes when it fits.",
      fix: "Declare the failure with Schema.TaggedErrorClass<Name>()(\"Name\", { field: Schema.String }) - it carries the tag, the payload schema, and the interface in one definition.",
      claim: "A class extending Error declaring its own _tag, or Data.TaggedError, in an effect-importing file.",
      lookalikes: ["Schema.TaggedErrorClass"],
    },
    {
      id: "cause-level-recovery",
      description: "Effect.catchCause / catchAllCause / sandbox used where typed-error recovery is the default.",
      severity: "info",
      revision: 2,
      reportingUnit: "occurrence",
      needs: ["calls", "identity"],
      onUnknown: "narrow",
      impact: "Cause-level recovery sees defects (failures the code was not prepared for) as recoverable, which quietly swallows programming errors into fallback paths instead of letting them surface.",
      why: "The skill's ordering: typed-error recovery first; cause-level recovery only when the boundary truthfully wants defects too. This check records every cause-level use at info severity because the legitimate cases exist.",
      fix: "Recover on the typed tag (catchTag / catchAll over the error union); reserve cause-level handling for boundaries that genuinely observe defects (logging, supervision).",
      claim: "Effect.catchCause/catchAllCause/sandbox usage \u2014 the skill's default, recorded at info.",
      lookalikes: ["deliberate cause inspection in supervision/logging"],
    },
    {
      id: "direct-process-env-read",
      description: "process.env read directly inside Effect application code.",
      severity: "warning",
      revision: 2,
      reportingUnit: "occurrence",
      needs: ["calls"],
      onUnknown: "narrow",
      impact: "Env reads scattered through logic cannot be overridden in tests, differ between layers, and hide configuration from the ConfigProvider - the app's settings become untestable ambient state.",
      why: "The skill's core default: runtime configuration is read through `Config` recipes in layers, not direct process.env access in application logic.",
      fix: "Declare Config.schema/redacted/string for the variable, read it with yield* inside the owning layer, and swap ConfigProvider layers in tests.",
      claim: "A process.env read in an effect-importing file.",
      lookalikes: ["boundary and startup code reading config explicitly"],
    },
    {
      id: "unnamed-effect-fn",
      description: "Effect.fn defined without a span/tracing name.",
      severity: "warning",
      revision: 2,
      reportingUnit: "occurrence",
      needs: ["calls", "identity"],
      onUnknown: "narrow",
      impact: "Unnamed Effect.fn functions show up in traces and stack frames as anonymous noise - the observability the API exists to provide is silently discarded.",
      why: "The skill: public service methods and non-trivial internal methods are defined with `Effect.fn(\"Domain.operation\")` - the name is the point; Effect.fnUntraced is the explicit opt-out, not the default.",
      fix: "Pass the dotted name first: Effect.fn(\"User.load\")((userId) => ...) - or use Effect.fnUntraced deliberately when span metadata is intentionally unnecessary.",
      claim: "A resolved Effect.fn call whose first argument is absent or established as a non-string value.",
      lookalikes: ["Effect.fnUntraced (the sanctioned unnamed form)", "multiline names", "dynamic values that may be strings"],
    },
    {
      id: "date-now-in-gen",
      description: "Date.now() called inside an Effect.gen body.",
      severity: "warning",
      revision: 2,
      reportingUnit: "occurrence",
      needs: ["calls", "identity"],
      onUnknown: "narrow",
      impact: "The generator reads wall-clock time directly, so the workflow is untestable with TestClock and non-reproducible across runs - time-sensitive branches flip depending on when the code executes.",
      why: "Effect generators run against the runtime's Clock service precisely so time can be controlled (TestClock in tests); Date.now() steps around that contract. The ecosystem's rule: read time through Clock, or pass it in.",
      fix: "yield* Clock.currentTimeMillisNow() (TestClock controls it in tests), or accept the timestamp as a parameter from the caller.",
      claim: "A resolved global Date.now() call inside the exact generator function passed to a resolved Effect.gen call.",
      lookalikes: ["Date.now outside generators", "time read through Clock"],
    },
    {
      id: "zod-single-record",
      description: "z.record called with a single argument.",
      severity: "warning",
      revision: 2,
      reportingUnit: "occurrence",
      needs: ["calls", "identity"],
      onUnknown: "narrow",
      impact: "The single-argument form leaves the record's keys unconstrained - a schema that validates values but accepts any key shape, which is exactly the drift the boundary was meant to stop.",
      why: "z.record's single-argument call is the legacy loose form; the explicit form names both halves of the contract (z.record(keySchema, valueSchema)) and keeps key validation honest. In Effect apps, boundary validation is the discipline - Schema or zod, either way both halves are named.",
      fix: "Name both halves: z.record(z.string(), valueType) - or migrate the boundary to Effect Schema (Schema.Struct plus decoding at the edge).",
      claim: "A resolved zod record call with exactly one non-spread argument.",
      lookalikes: ["explicit key+value schemas", "spread arguments with unresolved arity"],
    },
    {
      id: "sleep-in-test",
      description: "Effect.sleep used inside a test file.",
      severity: "warning",
      revision: 2,
      reportingUnit: "occurrence",
      needs: ["calls", "identity"],
      onUnknown: "narrow",
      impact: "Real sleeps make tests slow and flaky: they encode a guess about timing instead of a synchronization fact, so they pass until the machine is busy - then fail spuriously.",
      why: "The skill's testing rule: no arbitrary Effect.sleep in tests when a deterministic primitive is available - TestClock controls time, and Deferred/Queue/Latch/Ref synchronize for real.",
      fix: "Advance time with TestClock, or synchronize on a Deferred/Latch the code under test completes; sleep only when pacing itself is the behavior under test.",
      claim: "Effect.sleep in a test-named file.",
      lookalikes: ["deterministic TestClock synchronization"],
    },
    {
      id: "blind-layer-merge",
      description: "Layer.mergeAll / provideMerge used as a make-it-compile composition tool.",
      severity: "info",
      revision: 2,
      reportingUnit: "occurrence",
      needs: ["calls", "identity"],
      onUnknown: "narrow",
      impact: "Merging everything blurs which layer provides which dependency; requirement errors surface as far-away runtime resolution failures instead of close-to-the-code build errors.",
      why: "The skill names these as blind make-it-compile tools: composition should express the dependency structure, not flatten it. Recorded at info severity because legitimate merges exist.",
      fix: "Express the wiring: build layers from their dependencies (Layer.provide / composition at the layer that needs them) so the graph is readable in code.",
      claim: "Layer.mergeAll or provideMerge usage \u2014 the skill's default, recorded at info.",
      lookalikes: ["legitimate dependency-structure composition"],
    },
  ],
};

export async function doctor(ctx) {
  if (!ctx.analysis.available) return;
  const files = ctx.files.list([".ts", ".tsx", ".js", ".jsx", ".mjs"])
    .filter((file) => !/\.fixtures\.mjs$/.test(file) && !/\.d\.[cm]?ts$/.test(file));
  const castMatches = ctx.search.rules([
    { id: "as-any", pattern: "$EXPR as any" },
    { id: "as-unknown", pattern: "$EXPR as unknown" },
    { id: "non-null", pattern: "$EXPR!" },
  ], "TypeScript");
  const castsByFile = new Map();
  for (const match of castMatches) {
    const matches = castsByFile.get(match.file) ?? [];
    matches.push(match);
    castsByFile.set(match.file, matches);
  }

  for (const file of files) inspectFile(ctx, file, castsByFile.get(file) ?? []);
}

const TEST_FILE_NAME = /(?:\.test|\.spec)\.[cm]?[jt]sx?$/i;
const TEST_DIR_SEGMENT = /(?:^|[\/\\])(?:test|tests|__tests__)[\/\\]/;
const importedNames = (namespace, name) => [`${namespace}.${name}`, `*.${namespace}.${name}`, `*.${name}`, `default.${name}`, name];
const importedApi = (api, namespace, name, module = `effect/${namespace}`) => ({
  api,
  query: { imports: [
    { source: "effect", names: importedNames(namespace, name) },
    { source: module, names: importedNames(namespace, name) },
  ] },
});
const API_QUERIES = [
  ...["fn", "gen", "catchCause", "catchAllCause", "sandbox", "sleep", "provideMerge"]
    .map((name) => importedApi(`Effect.${name}`, "Effect", name)),
  ...["Class", "TaggedClass"].map((name) => importedApi(`Schema.${name}`, "Schema", name)),
  importedApi("Data.TaggedError", "Data", "TaggedError"),
  ...["mergeAll", "provideMerge"].map((name) => importedApi(`Layer.${name}`, "Layer", name)),
  { api: "zod.record", query: { imports: [{ source: "zod", names: ["z.record", "*.record", "default.record", "record"] }] } },
  { api: "Date.now", query: { globals: ["Date.now"] } },
];
const rulesForApi = (api) => ({
  "Effect.fn": ["unnamed-effect-fn"],
  "Effect.gen": ["date-now-in-gen"],
  "Effect.catchCause": ["cause-level-recovery"],
  "Effect.catchAllCause": ["cause-level-recovery"],
  "Effect.sandbox": ["cause-level-recovery"],
  "Effect.sleep": ["sleep-in-test"],
  "Effect.provideMerge": ["blind-layer-merge"],
  "Schema.Class": ["schema-class-as-default"],
  "Schema.TaggedClass": ["schema-class-as-default"],
  "Data.TaggedError": ["handrolled-tagged-error"],
  "Layer.mergeAll": ["blind-layer-merge"],
  "Layer.provideMerge": ["blind-layer-merge"],
  "zod.record": ["zod-single-record"],
  "Date.now": ["date-now-in-gen"],
})[api] ?? [];

function inspectFile(ctx, file, castMatches) {
  const raw = ctx.files.read(file);
  const masked = ctx.files.readMasked(file);
  const facts = ctx.analysis.calls(file);
  const flow = facts.structure.flow;
  const values = new Map(flow.values.map((value) => [value.id, value]));
  const effectFile = flow.values.some((value) => value.target?.source === "effect" || value.target?.source?.startsWith("effect/"));
  const zodFile = flow.values.some((value) => value.target?.source === "zod");
  if (!effectFile && !zodFile) return;

  const narrowed = new Set();
  const reported = new Set();
  const finding = (rule, location) => {
    const key = `${rule}:${location.start ?? `${location.line}:${location.column}`}:${location.end ?? `${location.endLine}:${location.endColumn}`}`;
    if (reported.has(key)) return;
    reported.add(key);
    ctx.report.finding({
      rule, file, line: location.line, column: location.column,
      evidence: { endLine: location.endLine, endColumn: location.endColumn },
    });
  };
  const narrow = (rule, location, capability = "identity") => {
    const key = `${rule}:${location?.start ?? "file"}:${capability}`;
    if (narrowed.has(key)) return;
    narrowed.add(key);
    ctx.report.narrowing({ check: rule, file, reason: "unsupported-expression", capability });
  };
  const apiCalls = [];
  for (const value of flow.values) {
    if (value.kind !== "call" || value.dead) continue;
    for (const { api, query } of API_QUERIES) {
      const identity = ctx.analysis.callIdentity(file, { id: value.id, start: value.start, end: value.end }, query);
      if (identity.status === "unknown") {
        for (const rule of rulesForApi(api)) narrow(rule, value);
        continue;
      }
      if (identity.status === "known" && identity.value.matches) apiCalls.push({ api, call: value, value });
    }
  }

  if (effectFile) {
    checkCasts(ctx, file, raw, castMatches, finding);
    checkProcessEnv(flow, finding);
    checkTaggedErrorClasses(ctx, file, raw, masked, apiCalls, finding);
  }

  for (const item of apiCalls) {
    const { api, call, value } = item;
    if (!effectFile && api !== "zod.record") continue;
    if (api === "Schema.Class" || api === "Schema.TaggedClass") finding("schema-class-as-default", call);
    else if (["Effect.catchCause", "Effect.catchAllCause", "Effect.sandbox"].includes(api)) finding("cause-level-recovery", call);
    else if (api === "Effect.sleep" && isTestFile(file)) finding("sleep-in-test", call);
    else if (["Layer.mergeAll", "Layer.provideMerge", "Effect.provideMerge"].includes(api)) finding("blind-layer-merge", call);
    else if (api === "zod.record") {
      if (value.argumentRoles?.some((argument) => argument.spread)) narrow("zod-single-record", call, "calls");
      else if (call.arguments.length === 1) finding("zod-single-record", call);
    } else if (api === "Effect.fn") {
      if (!value.arguments?.length) finding("unnamed-effect-fn", call);
      else {
        const name = values.get(value.arguments[0]);
        if (!name) narrow("unnamed-effect-fn", call, "calls");
        else if (typeof name.literal === "string" || name.primitive === "string") continue;
        else if (["literal", "function", "object", "array", "void"].includes(name.kind)) finding("unnamed-effect-fn", call);
        else narrow("unnamed-effect-fn", call, "calls");
      }
    }
  }

  checkGeneratorClock(raw, apiCalls, values, finding, narrow);
}

function checkCasts(_ctx, _file, raw, matches, finding) {
  for (const match of matches) {
    if (match.ruleId === "as-unknown") {
      const tail = raw.slice(offsetAt(raw, match.endLine, match.endColumn));
      if (!/^(?:\s*\))*\s+as\b/.test(tail)) continue;
    }
    finding("type-silencing-cast", match);
  }
}

function checkProcessEnv(flow, finding) {
  const byStart = new Map();
  for (const value of flow.values) {
    if (value.kind !== "member" || value.target?.binding !== null || value.target.root !== "process" || value.target.members[0] !== "env") continue;
    const previous = byStart.get(value.start);
    if (!previous || previous.end < value.end) byStart.set(value.start, value);
  }
  for (const value of byStart.values()) finding("direct-process-env-read", value);
}

function checkTaggedErrorClasses(ctx, file, raw, masked, apiCalls, finding) {
  const spans = ctx.analysis.spans(file).spans.map((span) => ({
    ...span,
    start: offsetAt(raw, span.line, span.column),
    end: offsetAt(raw, span.endLine, span.endColumn),
  }));
  const classes = spans.filter((span) => span.kind === "class");
  const bindings = ctx.analysis.bindings(file).bindings;
  const dataCalls = apiCalls.filter((item) => item.api === "Data.TaggedError");
  const contained = new Set();
  for (const location of classes) {
    const text = masked.slice(location.start, location.end);
    const headerEnd = text.indexOf("{");
    const header = headerEnd < 0 ? text : text.slice(0, headerEnd);
    const headerLimit = location.start + (headerEnd < 0 ? text.length : headerEnd);
    const builders = dataCalls.filter(({ call }) => location.start <= call.start && call.end <= headerLimit);
    for (const builder of builders) contained.add(builder.call.start);
    const containsDataBuilder = builders.length > 0;
    let handrolled = containsDataBuilder;
    const ownText = [...text];
    for (const nested of spans) {
      if (nested.start <= location.start || nested.end > location.end) continue;
      const from = Math.max(0, nested.start - location.start);
      const to = Math.min(ownText.length, nested.end - location.start);
      ownText.fill(" ", from, to);
    }
    if (!handrolled && /\bextends\s+Error\b/.test(header) && /\b_tag\b\s*(?::[^=;]+)?=/.test(ownText.join(""))) {
      const bodyOffset = location.start + Math.max(0, headerEnd);
      const body = positionAt(raw, bodyOffset);
      const shadowed = bindings.some((binding) => binding.name === "Error" && binding.references.some((reference) =>
        comparePosition(reference, location) >= 0 && comparePosition(reference, body) < 0));
      handrolled = !shadowed;
    }
    if (handrolled) finding("handrolled-tagged-error", location);
  }
  for (const { call } of dataCalls) if (!contained.has(call.start)) finding("handrolled-tagged-error", call);
}

function checkGeneratorClock(raw, apiCalls, values, finding, narrow) {
  const generators = [];
  for (const { api, call, value } of apiCalls) {
    if (api !== "Effect.gen") continue;
    const callback = values.get(value.arguments?.[0]);
    if (!callback) {
      narrow("date-now-in-gen", call, "calls");
      continue;
    }
    if (callback.kind !== "function") {
      if (["call", "construct", "reference", "member", "unknown", "choice"].includes(callback.kind)) {
        narrow("date-now-in-gen", call, "calls");
      }
      continue;
    }
    const source = raw.slice(callback.start, callback.end);
    if (/^(?:\s*\()*\s*(?:async\s+)?function\s*\*/.test(source)) generators.push(callback);
  }
  for (const { api, call, value } of apiCalls) {
    if (api === "Date.now" && generators.some((generator) => value.functionStart === generator.start)) {
      finding("date-now-in-gen", call);
    }
  }
}

function isTestFile(file) {
  return TEST_FILE_NAME.test(file) || TEST_DIR_SEGMENT.test(file);
}

function offsetAt(source, line, column) {
  if (line === undefined || column === undefined) return source.length;
  let offset = 0;
  for (let current = 1; current < line; current++) offset = source.indexOf("\n", offset) + 1;
  return offset + column;
}

function positionAt(source, offset) {
  const before = source.slice(0, offset).split("\n");
  return { line: before.length, column: before.at(-1).length };
}

function comparePosition(left, right) {
  return left.line === right.line ? left.column - right.column : left.line - right.line;
}
