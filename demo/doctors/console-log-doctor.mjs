export const meta = {
  id: "console-log-doctor",
  description: "console.log calls left in application code",
  severity: "warning",
  category: "hygiene",
  blindSpots: [
    "Only direct console.log calls are recognized; wrapped loggers and template indirection are not flagged.",
  ],
  checks: [
    {
      id: "console-log-left-in-code",
      description: "A console.log call left in application code",
      severity: "warning",
      impact: "Noisy logs ship to users, leak internals, and drown real telemetry.",
      why: "Ad-hoc logging is how code debugs itself on the way to done. Once it's done, the log is litter.",
      fix: "Delete it, or route it through a leveled logger if it is genuinely useful in production.",
    },
  ],
};

export async function doctor(ctx) {
  const files = await ctx.files.list();

  for (const file of files) {
    const source = await ctx.files.read(file);
    const lines = source.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const call = /\bconsole\s*\.\s*log\s*\(/.exec(lines[i]);
      if (call) {
        ctx.report.finding({
          rule: "console-log-left-in-code",
          file,
          line: i + 1,
          column: call.index + 1,
        });
      }
    }
  }
}
