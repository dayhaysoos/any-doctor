export const meta = {
  id: "unawaited-async-map",
  description: "Unawaited async array work",
  severity: "warning",
  category: "bugs",
  blindSpots: [
    "consumption inside template strings or dynamic property access",
    "reassignable bindings (let) with conditional awaits",
    "results passed to a helper that awaits them internally",
  ],
  checks: [
    {
      id: "unawaited-async-map",
      description: ".map(async ...) result is never awaited — the promises are dropped",
      severity: "warning",
      impact: "The async work starts but nothing waits for it: errors vanish silently and the results are lost mid-flight.",
      why: "Array.map returns a new array of promises. Without Promise.all or an await on the result, the async callbacks run fire-and-forget.",
      fix: "Wrap the mapped array in Promise.all and await it — or drop the async if the work should actually be sequential.",
    },
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
