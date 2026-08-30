export const meta = {
  id: "settimeout-calls-inside-useeffect-without",
  description: "setTimeout inside useEffect is not cleared with clearTimeout",
  severity: "warning",
  blindSpots: [
    "Only directly named useEffect, setTimeout, and clearTimeout calls are recognized; aliased or imported-under-another-name APIs are not detected.",
    "Timeouts must be assigned to a simple local identifier and cleared with that same identifier in the same effect; dynamic handles and cross-file cleanup are not tracked.",
    "Timers in string literals, comments, and template literal expressions are not analyzed.",
  ],
};

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

export async function doctor(ctx) {
  const files = await ctx.files.list();

  for (const file of files) {
    const source = await ctx.files.read(file);
    const masked = maskNonCode(source);
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
          ctx.report.finding({ file, line: lineAt(source, index) });
        }
      }
    }
  }
}
