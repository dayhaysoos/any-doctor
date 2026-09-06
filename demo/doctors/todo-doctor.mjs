export const meta = {
  id: "todo-doctor",
  description: "TODO comments left in the codebase",
  severity: "warning",
  category: "hygiene",
  blindSpots: [
    "Only double-slash TODO line comments are recognized; FIXME, block comments, and lowercase prose are not flagged.",
  ],
  checks: [
    {
      id: "todo-comment-left-in-code",
      description: "A TODO comment marks known-unfinished work",
      severity: "warning",
      impact: "TODOs rot in place: nobody owns them, nobody schedules them, and the code around them drifts.",
      why: "A TODO in a shipped file is a promise with no owner. Issues exist so work can be prioritized — comments can't be.",
      fix: "Resolve it, or move it into an issue tracker and delete the comment.",
    },
  ],
};

export async function doctor(ctx) {
  const files = await ctx.files.list();

  for (const file of files) {
    const source = await ctx.files.read(file);
    const lines = source.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const todo = /\/\/\s*TODO\b/.exec(lines[i]);
      if (todo) {
        ctx.report.finding({
          rule: "todo-comment-left-in-code",
          file,
          line: i + 1,
          column: todo.index + 1,
        });
      }
    }
  }
}
