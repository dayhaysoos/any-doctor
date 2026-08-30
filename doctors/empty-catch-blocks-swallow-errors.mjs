export const meta = {
  id: "empty-catch-blocks-swallow-errors",
  description: "Empty catch block swallows an error",
  severity: "warning",
  blindSpots: [
    "Catch blocks whose error handling is hidden in comments or generated code cannot be distinguished from intentionally empty handlers.",
    "This check cannot determine whether swallowing an error is intentional at runtime.",
    "The optional catch binding fallback does not recognize catch blocks inside template-literal interpolations.",
  ],
};

export async function doctor(ctx) {
  const findings = await ctx.search.pattern("try { $$$BODY } catch ($ERROR) {}");

  for (const match of findings) {
    ctx.report.finding({
      file: match.file,
      line: match.line,
      column: match.column,
    });
  }

  for (const file of await ctx.files.list()) {
    const source = await ctx.files.read(file);
    const code = source.replace(/(['"`])(?:\\.|(?!\1)[^\\\n])*\1|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (match) =>
      match.replace(/[^\n]/g, " "),
    );

    for (const match of code.matchAll(/\bcatch\s*\{\s*\}/g)) {
      const line = code.slice(0, match.index).split("\n").length;
      ctx.report.finding({ file, line });
    }
  }
}
