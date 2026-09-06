export const meta = {
  id: "z-record-called-with-single",
  description: "z.record is called with a single argument.",
  severity: "warning",
  blindSpots: [
    "Does not detect bracket notation, optional chaining, or calls through an alias or wrapper.",
    "Cannot determine whether the identifier z refers to Zod rather than a local value.",
  ],
};

export async function doctor(ctx) {
  const calls = await Promise.all([
    ctx.search.pattern("z.record($ARG)"),
    ctx.search.pattern("z.record<$$$TYPE_ARGS>($ARG)"),
  ]);
  for (const call of calls.flat()) {
    ctx.report.finding(call);
  }
}
