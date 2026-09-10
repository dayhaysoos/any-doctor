import { mutation } from "../_generated/server";

// The audit's rateLimiter shape (D22): an index with NO range callback,
// filtered after the fact, collected without a bound — one finding at the
// chain start, whose fix is to bound the index scan.
export const cleanupExpired = mutation({
  args: {},
  handler: async (ctx, _args, cutoff) => {
    const expired = await ctx.db
      .query("rate_limit_hits")
      .withIndex("by_createdAt")
      .filter((q) => q.lt(q.field("createdAt"), cutoff))
      .collect();
    for (const row of expired) {
      await ctx.db.delete(row._id);
    }
  },
});
