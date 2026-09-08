export const meta = {
  id: "async-doctor",
  description: "Async and concurrency discipline: fetch hygiene, promise handling, timer cleanup.",
  severity: "warning",
  category: "async",
  blindSpots: [
    "Fetch: cannot determine whether an options variable, spread, or helper supplies a signal at runtime; aliased or member-expression fetch functions are not recognized.",
    "Promises: consumption inside template strings or dynamic property access, reassignable bindings (let) with conditional awaits, and results passed to a helper that awaits internally are not tracked.",
    "Timers: only directly named useEffect/setTimeout/clearTimeout are recognized; handles must be a simple local identifier cleared in the same effect.",
    "Fixture-named files (*.fixtures.mjs) in the target are skipped: they are doctor test data, not target source.",
  ],
  checks: [
    {
      id: "fetch-calls-without-abortsignal",
      description: "Fetch call does not provide an AbortSignal.",
      severity: "warning",
      impact: "Requests cannot be cancelled: navigating away, unmounting, or superseding leaves fetches running to completion.",
      why: "A fetch without a signal has no path to cancellation, so component-driven requests outlive the components that issued them.",
      fix: "Pass an AbortController's signal via the request options and abort it on cleanup or supersede.",
    },
    {
      id: "unawaited-async-map",
      description: ".map(async ...) result is never awaited — the promises are dropped.",
      severity: "warning",
      impact: "The async work starts but nothing waits for it: errors vanish silently and the results are lost mid-flight.",
      why: "Array.map returns a new array of promises. Without Promise.all or an await on the result, the async callbacks run fire-and-forget.",
      fix: "Wrap the mapped array in Promise.all and await it — or drop the async if the work should actually be sequential.",
    },
    {
      id: "uncleared-settimeout-in-effect",
      description: "setTimeout inside useEffect is not cleared with clearTimeout.",
      severity: "warning",
      impact: "The callback fires after the component is gone: state updates on unmounted components, work the user cancelled, and hard-to-trace bugs.",
      why: "Every timer started inside an effect must be cleared in that effect's cleanup; an uncleared setTimeout outlives the render that created it.",
      fix: "Assign the timer and return a cleanup that calls clearTimeout with the same identifier.",
    },
  ],
};

export async function doctor(ctx) {
  // One read+mask per file, shared by every check: a full-repo pass is
  // this doctor's dominant cost, and the checks examine the same files.
  const byFile = new Map();
  const readFile = (file) => {
    let entry = byFile.get(file);
    if (entry === undefined) {
      const raw = ctx.files.read(file);
      entry = { raw, masked: maskNonCode(raw) };
      byFile.set(file, entry);
    }
    return entry;
  };
  await checkFetch(ctx);
  await checkUnawaitedMap(ctx, readFile);
  await checkSetTimeout(ctx, readFile);
}

// --- fetch-calls-without-abortsignal ------------------------------------

async function checkFetch(ctx) {
  const calls = await ctx.search.pattern("fetch($$$ARGS)");
  for (const call of calls) {
    if (!hasInlineSignal(call.text)) {
      ctx.report.finding({ ...call, rule: "fetch-calls-without-abortsignal" });
    }
  }
}

function hasInlineSignal(call) {
  const open = call.indexOf("(");
  if (open < 0) return false;

  const argumentsText = call.slice(open + 1, -1);
  const argumentsList = splitTopLevel(argumentsText);
  const options = argumentsList[1]?.trim();
  if (!options?.startsWith("{")) return false;

  const close = matchingBrace(options);
  if (close < 0) return false;

  return splitTopLevel(options.slice(1, close)).some((property) =>
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

async function checkUnawaitedMap(ctx, readFile) {
  const CONSUMERS = /(Promise\s*\.\s*(all|allSettled|race|any)\s*\((?:[^()]|\([^()]*\))*\bNAME\b|await\s+(?:[\w.$]+\s*=\s*)?\s*\bNAME\b)/;

  for (const file of ctx.files.list([".ts", ".tsx", ".js", ".jsx", ".mjs"])) {
    // Fixture sandboxes are doctor test data, not target source.
    if (/\.fixtures\.mjs$/.test(file)) continue;
    // Masked (shared cache): a commented-out or string-literal ".map(async ..."
    // is not code — raw scanning false-positives on documentation and seeds.
    const lines = readFile(file).masked.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const decl = lines[i].match(/\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*[\w.$\]]+\s*\.\s*map\(\s*async\b/);
      if (!decl) continue;
      const name = decl[1];

      const rest = lines.slice(i + 1).join("\n");
      const consumer = new RegExp(CONSUMERS.source.replace(/NAME/g, escapeRe(name)));
      if (consumer.test(rest)) continue;

      ctx.report.finding({
        rule: "unawaited-async-map",
        file: file,
        line: i + 1,
        column: decl.index + 1,
      });
    }
  }
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// --- uncleared-settimeout-in-effect ---------------------------

async function checkSetTimeout(ctx, readFile) {
  const files = await ctx.files.list();

  for (const file of files) {
    const { raw, masked } = readFile(file);
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
          ctx.report.finding({ rule: "uncleared-settimeout-in-effect", file, line: lineAt(raw, index) });
        }
      }
    }
  }
}

function maskNonCode(source) {
  const chars = source.split("");
  let index = 0;

  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];

    if (char === "/" && next === "/") {
      const end = source.indexOf("\n", index + 2);
      const stop = end === -1 ? source.length : end;
      for (let cursor = index; cursor < stop; cursor += 1) chars[cursor] = " ";
      index = stop;
    } else if (char === "/" && next === "*") {
      const end = source.indexOf("*/", index + 2);
      const stop = end === -1 ? source.length : end + 2;
      for (let cursor = index; cursor < stop; cursor += 1) {
        if (chars[cursor] !== "\n") chars[cursor] = " ";
      }
      index = stop;
    } else if (char === "'" || char === '"' || char === "`") {
      const quote = char;
      let cursor = index + 1;
      while (cursor < source.length) {
        if (source[cursor] === "\\") {
          cursor += 2;
        } else if (source[cursor] === quote) {
          cursor += 1;
          break;
        } else {
          cursor += 1;
        }
      }
      for (let position = index; position < cursor; position += 1) {
        if (chars[position] !== "\n") chars[position] = " ";
      }
      index = cursor;
    } else {
      index += 1;
    }
  }

  return chars.join("");
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
