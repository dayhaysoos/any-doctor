import { query } from "./_generated/server";

query({
  args: {},
  handler: async (ctx, args) => {
    return (
      args.flag
        ? external
        : ctx.db
            .query("rows")
            .withIndex("by_x")
            .filter((q) => q.eq(q.field("x"), 1))
    ).collect();
  },
});
