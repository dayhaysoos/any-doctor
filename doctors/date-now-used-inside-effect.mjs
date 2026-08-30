export const meta = {
  id: "date-now-used-inside-effect",
  description: "Date.now must not be used inside Effect.gen blocks",
  severity: "warning",
  blindSpots: [
    "aliased or namespace-qualified Effect imports and Date references",
    "Effect.gen calls or Date.now calls constructed dynamically",
    "generator bodies expressed through template-literal interpolations",
  ],
};

export async function doctor(ctx) {
  const files = new Map(
    ctx.files.list([".ts", ".tsx", ".js", ".jsx", ".mjs"]).map(file => [file, ctx.files.read(file)]),
  );
  const dateCalls = ctx.search.pattern("Date.now()");

  for (const match of dateCalls) {
    const source = files.get(match.file);
    if (!source) continue;

    const offset = offsetAt(source, match.line, match.column);
    if (effectGenBodies(source).some(body => offset > body.start && offset < body.end)) {
      ctx.report.finding({ file: match.file, line: match.line, column: match.column });
    }
  }
}

function offsetAt(source, line, column) {
  let offset = 0;
  for (let currentLine = 1; currentLine < line; currentLine++) {
    offset = source.indexOf("\n", offset) + 1;
  }
  return offset + column - 1;
}

function effectGenBodies(source) {
  const bodies = [];
  const effect = /\bEffect\b/g;
  let match;

  while ((match = effect.exec(source))) {
    if (!isCodeAt(source, match.index)) continue;
    let pos = skipTrivia(source, match.index + match[0].length);
    if (source[pos] !== ".") continue;
    pos = skipTrivia(source, pos + 1);
    if (!source.startsWith("gen", pos) || /[\w$]/.test(source[pos + 3] || "")) continue;
    pos = skipTrivia(source, pos + 3);
    if (source[pos] !== "(") continue;

    const bodyStart = generatorBodyStart(source, pos + 1);
    if (bodyStart === -1) continue;
    const bodyEnd = matchingBrace(source, bodyStart);
    if (bodyEnd === -1) continue;
    bodies.push({ start: bodyStart, end: bodyEnd });
  }

  return bodies;
}

function generatorBodyStart(source, pos) {
  pos = skipTrivia(source, pos);
  if (source.startsWith("async", pos) && !/[\w$]/.test(source[pos + 5] || "")) {
    pos = skipTrivia(source, pos + 5);
  }
  if (!source.startsWith("function", pos) || /[\w$]/.test(source[pos + 8] || "")) return -1;
  pos = skipTrivia(source, pos + 8);
  if (source[pos] !== "*") return -1;

  let depth = 0;
  for (pos++; pos < source.length; pos++) {
    if (startsIgnored(source, pos)) {
      pos = skipIgnored(source, pos) - 1;
      continue;
    }
    if (source[pos] === "(") depth++;
    else if (source[pos] === ")") depth--;
    else if (source[pos] === "{" && depth === 0) return pos;
  }
  return -1;
}

function matchingBrace(source, start) {
  let depth = 0;
  for (let pos = start; pos < source.length; pos++) {
    if (startsIgnored(source, pos)) {
      pos = skipIgnored(source, pos) - 1;
      continue;
    }
    if (source[pos] === "{") depth++;
    if (source[pos] === "}" && --depth === 0) return pos;
  }
  return -1;
}

function isCodeAt(source, target) {
  for (let pos = 0; pos < target; pos++) {
    if (startsIgnored(source, pos)) {
      const end = skipIgnored(source, pos);
      if (target < end) return false;
      pos = end - 1;
    }
  }
  return true;
}

function skipTrivia(source, pos) {
  while (/\s/.test(source[pos] || "")) pos++;
  return pos;
}

function startsIgnored(source, pos) {
  return source.startsWith("//", pos) || source.startsWith("/*", pos) || /['"`]/.test(source[pos] || "");
}

function skipIgnored(source, pos) {
  if (source.startsWith("//", pos)) {
    const end = source.indexOf("\n", pos + 2);
    return end === -1 ? source.length : end + 1;
  }
  if (source.startsWith("/*", pos)) {
    const end = source.indexOf("*/", pos + 2);
    return end === -1 ? source.length : end + 2;
  }

  const quote = source[pos++];
  while (pos < source.length) {
    if (source[pos] === "\\") pos += 2;
    else if (source[pos++] === quote) break;
  }
  return pos;
}
