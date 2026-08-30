export const meta = {
  id: "unawaited-async-map",
  description: ".map(async ...) result is never awaited — the promises are dropped",
  severity: "warning",
  category: "bugs",
  blindSpots: [
    "consumption inside template strings or dynamic property access",
    "reassignable bindings (let) with conditional awaits",
    "results passed to a helper that awaits them internally",
  ],
};

export async function doctor(ctx) {
  const CONSUMERS = /(Promise\s*\.\s*(all|allSettled|race|any)\s*\((?:[^()]|\([^()]*\))*\bNAME\b|await\s+(?:[\w.$]+\s*=\s*)?\s*\bNAME\b)/;

  for (const file of ctx.files.list([".ts", ".tsx", ".js", ".jsx", ".mjs"])) {
    const src = ctx.files.read(file);
    const lines = src.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const decl = lines[i].match(/\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*[\w.$\]]+\s*\.\s*map\(\s*async\b/);
      if (!decl) continue;
      const name = decl[1];

      const rest = lines.slice(i + 1).join("\n");
      const consumer = new RegExp(CONSUMERS.source.replace(/NAME/g, escapeRe(name)));
      if (consumer.test(rest)) continue;

      ctx.report.finding({
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
