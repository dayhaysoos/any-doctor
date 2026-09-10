import { query, mutation, action, internalQuery, internalMutation, internalAction } from "../_generated/server";
export const markSeen = mutation({
  args: { id: v.id("notes") },
  handler: async (ctx, args) => {
    ctx.db.patch(args.id, { seen: true });
    const unrelated = 42;
    await Promise.all([]);
  },
});
