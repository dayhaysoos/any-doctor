export const meta = {
  id: "effect-v4-doctor",
  description: "Effect v4 discipline: typed errors over hand-rolled tags, Config over direct env reads, named Effect.fn, deterministic generators, validated boundaries, no casts that silence the type system. The mechanical rules of the kitlangton Effect skill, enforced.",
  severity: "warning",
  category: "effect",
  blindSpots: [
    "Scope: only files that import the effect package (from \"effect\" or \"effect/...\") are scanned; Effect idioms routed through re-exporting wrappers or untyped .js are not covered.",
    "Generated .d.ts files are skipped entirely: tsc renders tagged-error base classes as Schema.Class<...> in declarations even when source uses the sanctioned APIs, so declaration scanning would re-report every synthesized class.",
    "Fixture-named files (*.fixtures.mjs) in the target are skipped: they are doctor test data, not target source.",
    "process.env: boundary and startup code (CLI switches, bootstrap scripts) legitimately reads the environment directly - the check cannot tell application logic from boundaries.",
    "Cause-level recovery is flagged wholesale at info severity: deliberately inspecting defects via the cause channel is legitimate; the check records the default, not a proof of misuse.",
    "Non-null assertions are pattern-matched textually (ident! followed by ., ( or [); formatting that separates the assertion from its target is not seen.",
    "Class-body tracking counts braces: a _tag defined after an unbalanced brace (template holes, regex literals) ends the class span early.",
    "Effect.fn naming is read from the raw line: a name string placed on the following line is not recognized, and the check cannot see names computed at runtime.",
    "Layer.mergeAll/provideMerge have legitimate composition uses; like all merge-tools findings this is the skill's default recorded, not a defect proven.",
    "sleep-in-test only fires when test files are scanned: any-doctor's default run excludes them — pass --include-tests to check test discipline.",
    "zod checks apply to files importing zod - a superset of the effect-importing files; z.record discipline is ecosystem-wide, not effect-gated.",
    "gen-span tracking counts braces from Effect.gen(function* - non-generator callbacks are deliberately not spans (only generator bodies are the deterministic runtime), and a gen body that never closes owns everything after it.",
    "Judgment rules from the same skill (thin handlers, idempotent-only retry, business rules out of transports) are semantic and stay with review - this doctor enforces only the mechanical subset.",
  ],
  checks: [
    {
      id: "type-silencing-cast",
      description: "`as any`, a double cast, or a non-null assertion used in Effect code.",
      severity: "warning",
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
      impact: "Unnamed Effect.fn functions show up in traces and stack frames as anonymous noise - the observability the API exists to provide is silently discarded.",
      why: "The skill: public service methods and non-trivial internal methods are defined with `Effect.fn(\"Domain.operation\")` - the name is the point; Effect.fnUntraced is the explicit opt-out, not the default.",
      fix: "Pass the dotted name first: Effect.fn(\"User.load\")((userId) => ...) - or use Effect.fnUntraced deliberately when span metadata is intentionally unnecessary.",
      claim: "An Effect.fn call whose first argument is not a name string (read from the raw line).",
      lookalikes: ["Effect.fnUntraced (the sanctioned unnamed form)", "names on following lines"],
    },
    {
      id: "date-now-in-gen",
      description: "Date.now() called inside an Effect.gen body.",
      severity: "warning",
      impact: "The generator reads wall-clock time directly, so the workflow is untestable with TestClock and non-reproducible across runs - time-sensitive branches flip depending on when the code executes.",
      why: "Effect generators run against the runtime's Clock service precisely so time can be controlled (TestClock in tests); Date.now() steps around that contract. The ecosystem's rule: read time through Clock, or pass it in.",
      fix: "yield* Clock.currentTimeMillisNow() (TestClock controls it in tests), or accept the timestamp as a parameter from the caller.",
      claim: "Date.now() inside an Effect.gen(function* span (non-generator callbacks are not spans).",
      lookalikes: ["Date.now outside generators", "time read through Clock"],
    },
    {
      id: "zod-single-record",
      description: "z.record called with a single argument.",
      severity: "warning",
      impact: "The single-argument form leaves the record's keys unconstrained - a schema that validates values but accepts any key shape, which is exactly the drift the boundary was meant to stop.",
      why: "z.record's single-argument call is the legacy loose form; the explicit form names both halves of the contract (z.record(keySchema, valueSchema)) and keeps key validation honest. In Effect apps, boundary validation is the discipline - Schema or zod, either way both halves are named.",
      fix: "Name both halves: z.record(z.string(), valueType) - or migrate the boundary to Effect Schema (Schema.Struct plus decoding at the edge).",
      claim: "A z.record call whose argument span has no top-level comma, in a zod-importing file.",
      lookalikes: ["explicit key+value schemas", "trailing-comma multiline calls"],
    },
    {
      id: "sleep-in-test",
      description: "Effect.sleep used inside a test file.",
      severity: "warning",
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
      impact: "Merging everything blurs which layer provides which dependency; requirement errors surface as far-away runtime resolution failures instead of close-to-the-code build errors.",
      why: "The skill names these as blind make-it-compile tools: composition should express the dependency structure, not flatten it. Recorded at info severity because legitimate merges exist.",
      fix: "Express the wiring: build layers from their dependencies (Layer.provide / composition at the layer that needs them) so the graph is readable in code.",
      claim: "Layer.mergeAll or provideMerge usage \u2014 the skill's default, recorded at info.",
      lookalikes: ["legitimate dependency-structure composition"],
    },
  ],
};

export async function doctor(ctx) {
  const files = await ctx.files.list([".ts", ".tsx", ".js", ".jsx", ".mjs"]);
  for (const file of files) {
    // Fixture sandboxes are doctor test data, not target source.
    if (/\.fixtures\.mjs$/.test(file)) continue;
    // Generated declarations are skipped: tsc renders tagged-error bases as
    // Schema.Class<...> in .d.ts even when the source uses the sanctioned
    // APIs - scanning build artifacts would re-report synthesized classes.
    if (/\.d\.[cm]?ts$/.test(file)) continue;
    const raw = await ctx.files.read(file);
    const isEffect = EFFECT_IMPORT.test(raw);
    const isZod = ZOD_IMPORT.test(raw);
    if (!isEffect && !isZod) continue;
    const masked = ctx.files.readMasked(file);
    const lines = masked.split("\n");
    const rawLines = raw.split("\n");

    if (!isEffect) {
      checkZodRecord(ctx, file, lines);
      continue;
    }
    checkCasts(ctx, file, lines);
    checkGenClock(ctx, file, lines);
    checkSchemaClass(ctx, file, lines);
    checkTaggedError(ctx, file, lines);
    checkCauseRecovery(ctx, file, lines);
    checkProcessEnv(ctx, file, lines);
    checkEffectFn(ctx, file, rawLines);
    if (isTestFile(file)) checkSleepInTest(ctx, file, lines);
    checkLayerMerge(ctx, file, lines);
    if (isZod) checkZodRecord(ctx, file, lines);
  }
}

// --- deterministic generators -----------------------------------------------------

// Only generator bodies are the deterministic runtime: Effect.gen(function*
// opens a span (brace-tracked), and wall-clock reads inside it step around
// the Clock contract.
const GEN_OPEN = /\bEffect\.gen\s*\(\s*function\s*\*\s*\(/;
const DATE_NOW = /\bDate\s*\.\s*now\s*\(/;

function genSpans(lines) {
  const spans = [];
  let cur = null;
  let depth = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!cur) {
      if (!GEN_OPEN.test(line)) continue;
      cur = { start: i, end: i };
      depth = countChars(line, "{") - countChars(line, "}");
      if (depth <= 0) {
        spans.push(cur);
        cur = null;
      }
      continue;
    }
    depth += countChars(line, "{") - countChars(line, "}");
    cur.end = i;
    if (depth <= 0) {
      spans.push(cur);
      cur = null;
    }
  }
  if (cur) spans.push(cur);
  return spans;
}

function checkGenClock(ctx, file, lines) {
  for (const span of genSpans(lines)) {
    for (let i = span.start; i <= span.end; i++) {
      if (DATE_NOW.test(lines[i])) {
        ctx.report.finding({ rule: "date-now-in-gen", file, line: i + 1 });
      }
    }
  }
}

// --- zod boundary discipline --------------------------------------------------------

// Single-argument z.record is the legacy loose form: the call's argument
// span (generics optional) must contain a top-level comma to name both
// halves of the record.
const Z_RECORD = /\bz\.record\b\s*(?:<[^>]*>)?\s*\(/;

function checkZodRecord(ctx, file, lines) {
  for (let i = 0; i < lines.length; i++) {
    const m = Z_RECORD.exec(lines[i]);
    if (!m) continue;
    // The call may wrap: scan the tail of the file (from this line) so a
    // closing paren on a later line still bounds the argument span.
    const tail = lines.slice(i).join(" ");
    const tailMatch = Z_RECORD.exec(tail);
    const open = tail.indexOf("(", tailMatch.index + tailMatch[0].length - 1);
    const close = matchingParen(tail, open);
    if (close === -1) continue;
    // A trailing comma (multiline call style) is not a separator.
    const args = tail.slice(open + 1, close).replace(/[,\s]+$/, "");
    if (!hasTopLevelComma(args)) {
      ctx.report.finding({ rule: "zod-single-record", file, line: i + 1 });
    }
  }
}

function hasTopLevelComma(args) {
  let depth = 0;
  for (const ch of args) {
    if (ch === "(" || ch === "[" || ch === "{") depth++;
    else if (ch === ")" || ch === "]" || ch === "}") depth--;
    else if (ch === "," && depth === 0) return true;
  }
  return false;
}

function matchingParen(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === "(") depth++;
    if (text[i] === ")") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

// --- scope gate ---------------------------------------------------------------

// The doctor applies where Effect applies: any file importing the effect
// package (static, dynamic, or subpath). "useEffect" from react does not
// match - the from-clause must name effect itself.
const EFFECT_IMPORT = /\bfrom\s+["']effect(?:\/[^"']*)?["']|\b(?:require|import)\s*\(\s*["']effect(?:\/[^"']*)?["']/;

// zod is the ecosystem's other validation boundary: these checks apply to
// zod-importing files whether or not effect is present.
const ZOD_IMPORT = /\bfrom\s+["']zod["']|\b(?:require|import)\s*\(\s*["']zod["']/;

// Two faces of the platform's test-file law, matching contract.ts's
// isTestPath on every reachable path (ctx.files.list extension-filters,
// so a bare directory-final path like "src/test" never reaches here):
// file names match case-insensitively (Spec.Test.ts), directory segments
// match exactly (src/Test/ is not a test directory), and separators may
// be either slash in either position.
const TEST_FILE_NAME = /(?:\.test|\.spec)\.[cm]?[jt]sx?$/i;
const TEST_DIR_SEGMENT = /(?:^|[\/\\])(?:test|tests|__tests__)[\/\\]/;

function isTestFile(file) {
  return TEST_FILE_NAME.test(file) || TEST_DIR_SEGMENT.test(file);
}

// --- type-silencing casts -----------------------------------------------------

const ANY_CAST = /\bas\s+any\b/;
const DOUBLE_CAST = /\bas\s+unknown\s+as\b/;
const NON_NULL_ASSERT = /[A-Za-z_$][\w$]*![.(\[]/;

function checkCasts(ctx, file, lines) {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (ANY_CAST.test(line) || DOUBLE_CAST.test(line) || NON_NULL_ASSERT.test(line)) {
      ctx.report.finding({ rule: "type-silencing-cast", file, line: i + 1 });
    }
  }
}

// --- schema class as default --------------------------------------------------

function checkSchemaClass(ctx, file, lines) {
  for (let i = 0; i < lines.length; i++) {
    if (/\bSchema\.Class\b|\bSchema\.TaggedClass\b/.test(lines[i])) {
      ctx.report.finding({ rule: "schema-class-as-default", file, line: i + 1 });
    }
  }
}

// --- hand-rolled tagged errors --------------------------------------------------

// Two shapes: the Data.TaggedError class-builder (any usage), and any class
// declaring its own _tag member - the body is brace-tracked from the class
// line the same way convex-doctor tracks function bodies.
function checkTaggedError(ctx, file, lines) {
  for (let i = 0; i < lines.length; i++) {
    if (/\bData\.TaggedError\b/.test(lines[i])) {
      ctx.report.finding({ rule: "handrolled-tagged-error", file, line: i + 1 });
    }
  }
  for (const span of classSpans(lines)) {
    for (let i = span.start; i <= span.end; i++) {
      if (/\b_tag\b\s*[:=]/.test(lines[i])) {
        ctx.report.finding({ rule: "handrolled-tagged-error", file, line: span.start + 1 });
        break;
      }
    }
  }
}

function classSpans(lines) {
  const spans = [];
  let cur = null;
  let depth = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!cur) {
      if (!/\bclass\s+\w+\s+extends\b/.test(line)) continue;
      cur = { start: i, end: i };
      depth = countChars(line, "{") - countChars(line, "}");
      if (depth <= 0) {
        spans.push(cur);
        cur = null;
      }
      continue;
    }
    depth += countChars(line, "{") - countChars(line, "}");
    cur.end = i;
    if (depth <= 0) {
      spans.push(cur);
      cur = null;
    }
  }
  // A class that never closes still owns everything after it — flush the
  // open span so an unclosed body is scanned, not silently dropped.
  if (cur) spans.push(cur);
  return spans;
}

// --- cause-level recovery --------------------------------------------------------

function checkCauseRecovery(ctx, file, lines) {
  for (let i = 0; i < lines.length; i++) {
    if (/\bEffect\.catchCause\s*\(|\bEffect\.catchAllCause\s*\(|\bEffect\.sandbox\s*\(/.test(lines[i])) {
      ctx.report.finding({ rule: "cause-level-recovery", file, line: i + 1 });
    }
  }
}

// --- direct process.env ----------------------------------------------------------

function checkProcessEnv(ctx, file, lines) {
  for (let i = 0; i < lines.length; i++) {
    if (/\bprocess\.env\s*[.[\]]/.test(lines[i])) {
      ctx.report.finding({ rule: "direct-process-env-read", file, line: i + 1 });
    }
  }
}

// --- unnamed Effect.fn -----------------------------------------------------------

// Runs on RAW lines: the name is a string literal, which masking would blank.
// Effect.fnUntraced is the sanctioned unnamed form and never matches because
// the search requires the "(" directly after "Effect.fn".
function checkEffectFn(ctx, file, rawLines) {
  for (let i = 0; i < rawLines.length; i++) {
    const bare = rawLines[i].trimStart();
    if (bare.startsWith("//") || bare.startsWith("*") || bare.startsWith("/*")) continue;
    let at = rawLines[i].indexOf("Effect.fn(");
    while (at !== -1) {
      const after = rawLines[i].slice(at + "Effect.fn(".length).replace(/^[ \t]+/, "");
      if (!/^["']/.test(after)) {
        ctx.report.finding({ rule: "unnamed-effect-fn", file, line: i + 1 });
        break;
      }
      at = rawLines[i].indexOf("Effect.fn(", at + 1);
    }
  }
}

// --- real sleep in tests ------------------------------------------------------------

function checkSleepInTest(ctx, file, lines) {
  for (let i = 0; i < lines.length; i++) {
    if (/\bEffect\.sleep\s*\(/.test(lines[i])) {
      ctx.report.finding({ rule: "sleep-in-test", file, line: i + 1 });
    }
  }
}

// --- blind layer merge ----------------------------------------------------------------

function checkLayerMerge(ctx, file, lines) {
  for (let i = 0; i < lines.length; i++) {
    if (/\bLayer\.mergeAll\s*\(|\bprovideMerge\s*\(/.test(lines[i])) {
      ctx.report.finding({ rule: "blind-layer-merge", file, line: i + 1 });
    }
  }
}

// --- shared helpers -----------------------------------------------------------------

function countChars(line, ch) {
  let n = 0;
  for (const c of line) if (c === ch) n++;
  return n;
}


