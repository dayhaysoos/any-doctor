export const meta = {
  id: "map-async-results-never-wrapped",
  description: "Async .map results must be wrapped in Promise.all.",
  severity: "warning",
  blindSpots: [
    "Does not follow map results through variables, returns, or other cross-statement flows before Promise.all consumes them.",
    "Does not recognize aliased, destructured, or custom Promise.all implementations.",
    "Cannot determine whether a method named map has standard Array.prototype.map semantics.",
  ],
};

function offsetFor(result, source, lineOffsets) {
  const lineStart = lineOffsets[result.line - 1];
  const candidates = [lineStart + result.column, lineStart + result.column - 1];

  for (const offset of candidates) {
    if (offset >= 0 && source.startsWith(result.text, offset)) return offset;
  }

  return source.indexOf(result.text, lineStart);
}

export async function doctor(ctx) {
  const files = await ctx.files.list();
  const [maps, promiseAllCalls] = await Promise.all([
    ctx.search.pattern("$OBJECT.map($$$ARGS)"),
    ctx.search.pattern("Promise.all($$$ARGS)"),
  ]);

  for (const file of files) {
    const source = await ctx.files.read(file);
    const lineOffsets = [0];
    for (let index = 0; index < source.length; index += 1) {
      if (source[index] === "\n") lineOffsets.push(index + 1);
    }

    const wrappedRanges = promiseAllCalls
      .filter((result) => result.file === file)
      .map((result) => {
        const start = offsetFor(result, source, lineOffsets);
        return start < 0 ? null : [start, start + result.text.length];
      })
      .filter(Boolean);

    for (const result of maps.filter((match) => match.file === file)) {
      if (!/\.map\s*\(\s*async(?:\s+function\b|\s*(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>)/.test(result.text)) {
        continue;
      }

      const start = offsetFor(result, source, lineOffsets);
      const isWrapped = start >= 0 && wrappedRanges.some(([from, to]) => start >= from && start < to);
      if (!isWrapped) ctx.report.finding({ file, line: result.line, column: result.column });
    }
  }
}
