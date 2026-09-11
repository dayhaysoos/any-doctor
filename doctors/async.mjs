export const meta = {
  id: "async",
  description: "Async and concurrency discipline: fetch hygiene, promise handling, timer cleanup.",
  severity: "warning",
  category: "async",
  blindSpots: [
    "Fetch: cannot determine whether an options variable, spread, or helper supplies a signal at runtime; aliased or member-expression fetch functions are not recognized.",
    "Promises: with the analysis engine, per-element consumption, same-name bindings in other scopes, and never-reassigned let/var targets are checked; without it (degraded mode) only combiner calls over the bound name are recognized — per-element awaits, rebinding, and shadowed names are not tracked.",
    "Promises: reassigned bindings (written again after their declaration) are inconclusive and skipped; consumption inside template strings or dynamic property access is not tracked.",
    "Promises: mapped results that are returned, passed into a call, wrapped in parens or comma expressions, chained after another call (xs.filter(f).map(async ...)), or behind a mid-chain optional link (a?.b.map(async ...)) are not tracked — a bare map(async) is judged only in statement or await position.",
    "Timers: only directly named useEffect/setTimeout/clearTimeout are recognized; handles must be a simple local identifier cleared in the same effect.",
    "Fixture-named files (*.fixtures.mjs) in the target are skipped: they are doctor test data, not target source.",
  ],
  checks: [
    {
      id: "fetch-calls-without-abortsignal",
      description: "Fetch call does not provide an AbortSignal.",
      severity: "warning",
      revision: 1,
      impact: "Requests cannot be cancelled: navigating away, unmounting, or superseding leaves fetches running to completion.",
      why: "A fetch without a signal has no path to cancellation, so component-driven requests outlive the components that issued them.",
      fix: "Pass an AbortController's signal via the request options and abort it on cleanup or supersede.",
      claim: "A fetch call whose options contain no signal.",
      lookalikes: ["signal threaded through a variable the pattern cannot see"],
    },
    {
      id: "unawaited-async-map",
      description: ".map(async ...) result is never awaited — the promises are dropped.",
      severity: "warning",
      revision: 1,
      needs: ["bindings"],
      impact: "The async work starts but nothing waits for it: errors vanish silently and the results are lost mid-flight.",
      why: "Array.map returns a new array of promises. Without Promise.all or an await on the result, the async callbacks run fire-and-forget.",
      fix: "Wrap the mapped array in Promise.all and await it — or drop the async if the work should actually be sequential.",
      claim: "A .map(async ...) result whose binding has no consuming reference (combiner, per-element await, or return) and no inline combiner at the call site.",
      lookalikes: ["inline Promise.all around the map", "for-await over results", "results returned to the caller"],
      onUnknown: "narrow",
    },
    {
      id: "uncleared-settimeout-in-effect",
      description: "setTimeout inside useEffect is not cleared with clearTimeout.",
      severity: "warning",
      revision: 1,
      impact: "The callback fires after the component is gone: state updates on unmounted components, work the user cancelled, and hard-to-trace bugs.",
      why: "Every timer started inside an effect must be cleared in that effect's cleanup; an uncleared setTimeout outlives the render that created it.",
      fix: "Assign the timer and return a cleanup that calls clearTimeout with the same identifier.",
      claim: "A setTimeout inside a useEffect span with no clearTimeout of the same identifier in that effect.",
      lookalikes: ["timers cleared in cleanup", "lookalike names outside effects"],
    },
  ],
};

export async function doctor(ctx) {
  // One masked read per file, shared by every check: a full-repo pass is
  // this doctor's dominant cost, and the checks examine the same files.
  // Masking itself is the host's (ctx.files.readMasked) — the one
  // implementation, offsets preserved (D20 Stage 1).
  const byFile = new Map();
  const readFile = (file) => {
    let entry = byFile.get(file);
    if (entry === undefined) {
      entry = { masked: ctx.files.readMasked(file) };
      byFile.set(file, entry);
    }
    return entry;
  };

  // Every structural question in ONE engine invocation — each ctx.search
  // call is a process spawn (~85ms regardless of repo size), so a doctor
  // with many shapes batches them and pays once.
  const identity = ctx.analysis.available;
  const queries = [
    { id: "fetch", pattern: "fetch($$$ARGS)" },
    ...(identity ? [
      { id: "map-arrow", pattern: "$X.map(async $A => $B)" },
      { id: "map-arrow-opt", pattern: "$X?.map(async $A => $B)" },
      { id: "map-fn", pattern: "$X.map(async function ($$$A) { $$$B })" },
      { id: "map-fn-opt", pattern: "$X?.map(async function ($$$A) { $$$B })" },
      { id: "map-fn-named", pattern: "$X.map(async function $F($$$A) { $$$B })" },
      { id: "map-fn-named-opt", pattern: "$X?.map(async function $F($$$A) { $$$B })" },
      { id: "combiner", pattern: "Promise.$M($$$A)" },
      { id: "forof", pattern: "for (const $V of $ARR) $$$B" },
      { id: "await", pattern: "await $E" },
    ] : []),
  ];
  const all = await ctx.search.rules(queries);
  const byId = (id) => all.filter((m) => m.ruleId === id);
  const bucket = identity
    ? {
      shapes: all.filter((m) => m.ruleId.startsWith("map-")),
      combiners: byId("combiner").filter((m) => ["all", "allSettled", "race", "any"].includes(m.captures?.M?.text)),
      forOfs: byId("forof"),
      awaits: byId("await"),
    }
    : null;

  await checkFetch(ctx, byId("fetch"));
  await (identity ? checkUnawaitedMapAnalyzed(ctx, readFile, bucket) : checkUnawaitedMapRegex(ctx, readFile));
  await checkSetTimeout(ctx, readFile);
}

// --- fetch-calls-without-abortsignal ------------------------------------

async function checkFetch(ctx, calls) {
  // The rule query hands back the argument list as parsed capture nodes —
  // the options argument is args[1], no brace-counting the call text to
  // find where it begins (D20 Stage 1 pilot: the seam stopped discarding
  // what the engine already parsed).
  for (const call of calls) {
    const args = call.captures?.ARGS;
    const options = Array.isArray(args) ? args[1]?.text : undefined;
    if (!hasInlineSignal(options)) {
      ctx.report.finding({
        rule: "fetch-calls-without-abortsignal",
        file: call.file,
        line: call.line,
        column: call.column,
      });
    }
  }
}

function hasInlineSignal(options) {
  if (typeof options !== "string") return false;
  const text = options.trim();
  if (!text.startsWith("{")) return false;

  const close = matchingBrace(text);
  if (close < 0) return false;

  return splitTopLevel(text.slice(1, close)).some((property) =>
    /^(?:signal|["']signal["'])\s*(?::|$)/.test(property.trim()),
  );
}

function splitTopLevel(text) {
  const parts = [];
  let start = 0;
  let depth = 0;
  let quote = null;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quote) {
      if (character === "\\") index += 1;
      else if (character === quote) quote = null;
    } else if (character === "'" || character === '"' || character === "`") {
      quote = character;
    } else if (character === "(" || character === "[" || character === "{") {
      depth += 1;
    } else if (character === ")" || character === "]" || character === "}") {
      depth -= 1;
    } else if (character === "," && depth === 0) {
      parts.push(text.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(text.slice(start));
  return parts;
}

function matchingBrace(text) {
  let depth = 0;
  let quote = null;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quote) {
      if (character === "\\") index += 1;
      else if (character === quote) quote = null;
    } else if (character === "'" || character === '"' || character === "`") {
      quote = character;
    } else if (character === "{") {
      depth += 1;
    } else if (character === "}" && --depth === 0) {
      return index;
    }
  }
  return -1;
}

// --- unawaited-async-map -------------------------------------------------

// Two engines, one defect (D20 Stage 2 pilot). The identity path: ast-grep
// finds the map(async) shapes, ctx.analysis says which binding each one
// initializes and every REAL reference to it — consumption is decided by
// position, so a same-named binding in another scope can never silence
// this one. The degraded path (no analysis engine) is the name-matching
// regex, with its declared blind spots; the report says "narrowed".

async function checkUnawaitedMapAnalyzed(ctx, readFile, queries) {
  const files = (await ctx.files.list([".ts", ".tsx", ".js", ".jsx", ".mjs"]))
    .filter((file) => !/\.fixtures\.mjs$/.test(file));
  if (files.length === 0) return;

  const { shapes, combiners, forOfs, awaits } = queries;

  for (const file of files) {
    const fileShapes = shapes.filter((m) => m.file === file);
    if (fileShapes.length === 0) continue;

    const model = ctx.analysis.bindings(file);
    const fileCombiners = combiners.filter((m) => m.file === file);
    const fileForOfs = forOfs.filter((m) => m.file === file);
    const fileAwaits = awaits.filter((m) => m.file === file);
    const masked = readFile(file).masked;

    for (const shape of fileShapes) {
      const shapePos = { line: shape.line, column: shape.column };
      // Inline consumption: the combiner (or an awaiting for-of) wraps the
      // map call itself — `Promise.all(ids.map(async ...))` settles the
      // promises the moment they are created, no reference needed.
      if (fileCombiners.some((c) => matchContains(c, shapePos))) continue;
      if (fileForOfs.some((f) => matchContains(f, shapePos) && loopVarAwaited(f, model, fileAwaits))) continue;

      // The binding this map initializes: the innermost variable
      // declarator whose span contains the call. Only a Variable
      // declarator can own an initializer — function and class bindings
      // span their whole bodies and would claim anything inside them.
      const containing = model.bindings.filter(
        (b) => b.kind === "Variable" && spanContains(b, shape.line, shape.column),
      );
      const binding = containing.sort((a, b) =>
        (a.endLine - a.line) - (b.endLine - b.line) || a.endColumn - b.endColumn,
      )[0];
      if (!binding) {
        // No binding initialized here — a bare or flowing map. The same
        // statement-position judgment as the degraded path owns it.
        const index = offsetAt(masked, shape.line, shape.column);
        const position = statementPosition(masked, index);
        if (position === "statement" || position === "awaited") {
          reportDropped(ctx, masked, file, index);
        }
        continue;
      }

      // A binding written again after its declaration may hold anything —
      // consumption analysis would be a guess, so it is skipped (declared).
      const reassigned = binding.references.some(
        (r) => r.write && !spanContains(binding, r.line, r.column),
      );
      if (reassigned) continue;

      const consumed = binding.references.some((r) => {
        if (r.write) return false;
        if (fileCombiners.some((c) => matchContains(c, r))) return true;
        // Per-element: a read in a for-of head whose loop variable is
        // itself awaited inside that same loop.
        return fileForOfs.some(
          (f) => matchContains(f, r) && loopVarAwaited(f, model, fileAwaits),
        );
      });
      if (!consumed) {
        reportDropped(ctx, masked, file, offsetAt(masked, shape.line, shape.column));
      }
    }
  }
}

function loopVarAwaited(forOf, model, awaits) {
  // The loop variable: a binding declared inside the for-of's head.
  const loopVar = model.bindings.find(
    (b) => matchContains(forOf, b) && b.references.some((r) => !r.write && matchContains(forOf, r)),
  );
  if (!loopVar) return false;
  return loopVar.references.some(
    (r) => !r.write && awaits.some((a) => matchContains(a, r)),
  );
}

// Position containment: [start, end) in (line, column) pairs — lines
// 1-based, columns 0-based, ends exclusive (both engines' convention).
function posGe(a, b) {
  return a.line > b.line || (a.line === b.line && a.column >= b.column);
}

function spanContains(span, line, column) {
  const p = { line, column };
  const start = { line: span.line, column: span.column };
  const end = { line: span.endLine, column: span.endColumn };
  return posGe(p, start) && !posGe(p, end);
}

function matchContains(m, ref) {
  return spanContains(m, ref.line, ref.column);
}

function offsetAt(source, line, column) {
  let off = 0;
  for (let l = 1; l < line; l++) off = source.indexOf("\n", off) + 1;
  return off + column;
}

// The degraded path: name-matching over masked text. Every limitation
// here is declared in meta.blindSpots and pinned by analysis: "off"
// fixtures; the check narrows to this exactly when the engine is absent.
const CONSUMERS = /Promise\s*\.\s*(?:allSettled|all|race|any)\s*\((?:[^()]|\([^()]*\))*\bNAME\b/;

async function checkUnawaitedMapRegex(ctx, readFile) {
  for (const file of ctx.files.list([".ts", ".tsx", ".js", ".jsx", ".mjs"])) {
    // Fixture sandboxes are doctor test data, not target source.
    if (/\.fixtures\.mjs$/.test(file)) continue;
    // Masked (shared cache): a commented-out or string-literal ".map(async ..."
    // is not code — raw scanning false-positives on documentation and seeds.
    const masked = readFile(file).masked;

    // Bound arrays: `const jobs = xs.map(async ...)` (optional chaining
    // included — `xs?.map` produces the same array of promises). The
    // consumer scan is anchored at the declaration POINT, not the line
    // after it — consumption on the same line (`...; return
    // Promise.all(jobs);` in one statement block) is real consumption
    // (D20: wrong region anchor).
    const decl = /\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*[\w.$\]]+\s*\??\.\s*map\(\s*async\b/g;
    let match;
    while ((match = decl.exec(masked))) {
      const consumer = new RegExp(CONSUMERS.source.replace(/NAME/g, escapeRe(match[1])));
      if (consumer.test(masked.slice(match.index + match[0].length))) continue;
      reportDropped(ctx, masked, file, match.index);
    }

    // Discarded arrays: a bare `xs.map(async ...)` statement with no binding
    // at all — the promises are dropped the moment the expression completes
    // (D20: over-narrow trigger saw only the const-decorated shape). Only
    // statement position counts: preceded by `=`, `(`, a keyword, or an
    // operator, the result flows somewhere else and is not this check's to
    // judge (blind spots). `await xs.map(async ...)` is the exception —
    // awaiting the array leaves the promises unsettled, the same defect.
    const bare = /[\w.$\]]+\s*\??\.\s*map\(\s*async\b/g;
    while ((match = bare.exec(masked))) {
      const position = statementPosition(masked, match.index);
      if (position !== "statement" && position !== "awaited") continue;
      reportDropped(ctx, masked, file, match.index);
    }
  }
}

function reportDropped(ctx, masked, file, index) {
  ctx.report.finding({
    rule: "unawaited-async-map",
    file: file,
    line: lineAt(masked, index),
    column: columnAt(masked, index),
  });
}

// What precedes the receiver at `index`: "statement" (nothing, `;`, `{`,
// `}`, `)`, or `else` — a discarded expression), "awaited" (directly after
// `await`), or "flowing" (assigned, wrapped, or keyword/operator context —
// the result goes somewhere, declared blind spot or another pass's case).
function statementPosition(masked, index) {
  let cursor = index - 1;
  while (cursor >= 0 && /\s/.test(masked[cursor])) cursor -= 1;
  if (cursor < 0) return "statement";
  const previous = masked[cursor];
  if (previous === ";" || previous === "{" || previous === "}" || previous === ")") return "statement";
  if (/[\w$]/.test(previous)) {
    let word = "";
    let scan = cursor;
    while (scan >= 0 && /[\w$]/.test(masked[scan])) {
      word = masked[scan] + word;
      scan -= 1;
    }
    if (word === "await") return "awaited";
    if (word === "else") return "statement";
    return "flowing";
  }
  return "flowing";
}

function columnAt(source, index) {
  return index - source.lastIndexOf("\n", index - 1);
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// --- uncleared-settimeout-in-effect ---------------------------

async function checkSetTimeout(ctx, readFile) {
  const files = await ctx.files.list();

  for (const file of files) {
    const masked = readFile(file).masked;
    const effects = [];
    const useEffect = /\buseEffect\b/g;
    let match;

    while ((match = useEffect.exec(masked))) {
      const open = nextNonSpace(masked, match.index + match[0].length);
      if (masked[open] !== "(") continue;
      const close = matchingDelimiter(masked, open, "(", ")");
      if (close === -1) continue;
      const body = effectBody(masked, open + 1, firstArgumentEnd(masked, open, close));
      if (body) effects.push(body);
    }

    for (const effect of effects) {
      const cleared = new Set();
      const clearTimeout = /\bclearTimeout\s*\(\s*([A-Za-z_$][\w$]*)\s*\)/g;
      const body = masked.slice(effect.start, effect.end);
      while ((match = clearTimeout.exec(body))) cleared.add(match[1]);

      const timeout = /\bsetTimeout\s*\(/g;
      while ((match = timeout.exec(body))) {
        const index = effect.start + match.index;
        const insideNestedEffect = effects.some(
          (other) => other !== effect && other.start < index && index < other.end,
        );
        if (insideNestedEffect) continue;

        const before = masked.slice(effect.start, index);
        const assignment = /(?:(?:\bconst|\blet|\bvar)\s+)?([A-Za-z_$][\w$]*)\s*=\s*$/.exec(before);
        if (!assignment || !cleared.has(assignment[1])) {
          // masked preserves offsets and newlines — lineAt on it addresses
          // the same line as the raw source (readMasked's guarantee).
          ctx.report.finding({ rule: "uncleared-settimeout-in-effect", file, line: lineAt(masked, index) });
        }
      }
    }
  }
}

function nextNonSpace(source, index) {
  while (index < source.length && /\s/.test(source[index])) index += 1;
  return index;
}

function matchingDelimiter(source, open, opening, closing) {
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === opening) depth += 1;
    if (source[index] === closing) {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function firstArgumentEnd(source, open, close) {
  let parens = 0;
  let brackets = 0;
  let braces = 0;
  for (let index = open + 1; index < close; index += 1) {
    const char = source[index];
    if (char === "(") parens += 1;
    if (char === ")") parens -= 1;
    if (char === "[") brackets += 1;
    if (char === "]") brackets -= 1;
    if (char === "{") braces += 1;
    if (char === "}") braces -= 1;
    if (char === "," && parens === 0 && brackets === 0 && braces === 0) return index;
  }
  return close;
}

function effectBody(masked, start, end) {
  const argument = masked.slice(start, end);
  const arrow = argument.indexOf("=>");
  const functionMatch = /\bfunction\b/.exec(argument);
  const callbackStart = arrow === -1 ? functionMatch?.index : arrow + 2;
  if (callbackStart === undefined || callbackStart === -1) return null;

  const brace = masked.indexOf("{", start + callbackStart);
  if (brace === -1 || brace >= end) return null;
  const bodyEnd = matchingDelimiter(masked, brace, "{", "}");
  if (bodyEnd === -1 || bodyEnd > end) return null;
  return { start: brace + 1, end: bodyEnd };
}

function lineAt(source, index) {
  let line = 1;
  for (let cursor = 0; cursor < index; cursor += 1) {
    if (source[cursor] === "\n") line += 1;
  }
  return line;
}
