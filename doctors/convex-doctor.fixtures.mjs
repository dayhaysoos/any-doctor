export const fixtures = [
  // --- filter-table-scan ---
  {
    name: "flags .filter() with no .withIndex()",
    seed: {
      "convex/messages.ts": [
        "export const listByRoom = query({ args: { room: v.string() }, handler: async (ctx, { room }) => {",
        "  return await ctx.db.query(\"messages\").filter(q => q.eq(q.field(\"room\"), room)).collect();",
        "}});",
      ].join("\n"),
    },
    expected: [{ file: "convex/messages.ts", line: 2 }],
  },
  {
    name: "accepts .withIndex() with a range expression",
    seed: {
      "convex/messages.ts": [
        "export const listByRoom = query({ args: { room: v.string() }, handler: async (ctx, { room }) => {",
        "  return await ctx.db.query(\"messages\").withIndex(\"by_room\", q => q.eq(\"room\", room)).collect();",
        "}});",
      ].join("\n"),
    },
    expected: [],
  },
  {
    name: "accepts .filter() chained AFTER .withIndex() (filter narrows the indexed read)",
    seed: {
      "convex/messages.ts": [
        "export const recent = query({ args: { room: v.string() }, handler: async (ctx, { room }) => {",
        "  return await ctx.db.query(\"messages\")",
        "    .withIndex(\"by_room\", q => q.eq(\"room\", room))",
        "    .filter(q => q.eq(q.field(\"pinned\"), true))",
        "    .take(20);",
        "}});",
      ].join("\n"),
    },
    expected: [],
  },

  // --- index-without-range ---
  {
    name: "flags .withIndex() with no range expression",
    seed: {
      "convex/messages.ts": [
        "export const all = query({ args: {}, handler: async (ctx) => {",
        "  return await ctx.db.query(\"messages\").withIndex(\"by_room\").collect();",
        "}});",
      ].join("\n"),
    },
    expected: [{ file: "convex/messages.ts", line: 2 }],
  },
  {
    name: "flags .withIndex(name, q => ...) whose callback never calls q.eq",
    seed: {
      "convex/messages.ts": [
        "export const all = query({ args: {}, handler: async (ctx) => {",
        "  return await ctx.db.query(\"messages\").withIndex(\"by_room\", q => q).collect();",
        "}});",
      ].join("\n"),
    },
    expected: [{ file: "convex/messages.ts", line: 2 }],
  },
  {
    name: "accepts .withIndex() with q.gt range",
    seed: {
      "convex/messages.ts": [
        "export const since = query({ args: {}, handler: async (ctx) => {",
        "  return await ctx.db.query(\"messages\").withIndex(\"by_time\", q => q.gt(\"time\", 100)).collect();",
        "}});",
      ].join("\n"),
    },
    expected: [],
  },
  {
    name: "accepts .withIndex() with no range when .take() bounds the read",
    seed: {
      "convex/messages.ts": [
        "export const recent = query({ args: {}, handler: async (ctx) => {",
        "  return await ctx.db.query(\"messages\").withIndex(\"by_room\").order(\"desc\").take(20);",
        "}});",
      ].join("\n"),
    },
    expected: [],
  },

  // --- unbounded-subscription ---
  {
    name: "flags useQuery on a whole-table query",
    seed: {
      "src/App.tsx": [
        "import { useQuery } from \"convex/react\";",
        "import { api } from \"../convex/_generated/api\";",
        "export function Messages() {",
        "  const messages = useQuery(api.messages.list);",
        "  return <ul>{messages?.map(m => <li key={m._id}>{m.body}</li>)}</ul>;",
        "}",
      ].join("\n"),
    },
    expected: [{ file: "src/App.tsx", line: 4 }],
  },
  {
    name: "accepts usePaginatedQuery",
    seed: {
      "src/App.tsx": [
        "import { usePaginatedQuery } from \"convex/react\";",
        "import { api } from \"../convex/_generated/api\";",
        "export function Messages() {",
        "  const { results, loadMore } = usePaginatedQuery(api.messages.list, {}, { initialNumItems: 25 });",
        "  return <ul>{results.map(m => <li key={m._id}>{m.body}</li>)}</ul>;",
        "}",
      ].join("\n"),
    },
    expected: [],
  },

  // --- nondeterministic-clock-in-transaction ---
  {
    name: "flags elapsed-time math on Date.now() inside a mutation handler",
    seed: {
      "convex/timers.ts": [
        "export const touch = mutation({ args: { startedAt: v.number() }, handler: async (ctx, { startedAt }) => {",
        "  const elapsed = Date.now() - startedAt;",
        "  return elapsed;",
        "}});",
      ].join("\n"),
    },
    expected: [{ file: "convex/timers.ts", line: 2 }],
  },
  {
    name: "flags branching on Math.random() inside a query handler",
    seed: {
      "convex/roll.ts": [
        "export const sample = query({ args: {}, handler: async (ctx) => {",
        "  if (Math.random() < 0.5) return null;",
        "  return 1;",
        "}});",
      ].join("\n"),
    },
    expected: [{ file: "convex/roll.ts", line: 2 }],
  },
  {
    name: "flags elapsed-time math comparing two Date.now() calls in one transaction",
    seed: {
      "convex/sessions.ts": [
        "export const expire = mutation({ args: {}, handler: async (ctx, s) => {",
        "  const elapsed = Date.now() - s.startedAt;",
        "  if (elapsed > 5000) await ctx.db.delete(s._id);",
        "}});",
      ].join("\n"),
    },
    expected: [{ file: "convex/sessions.ts", line: 2 }],
  },
  {
    name: "accepts Date.now() in a plain (non-Convex) function",
    seed: {
      "src/lib/time.ts": [
        "export function nowMs() {",
        "  return Date.now();",
        "}",
      ].join("\n"),
    },
    expected: [],
  },
  {
    name: "accepts Date.now() passed in as a mutation argument",
    seed: {
      "convex/timers.ts": [
        "export const touch = mutation({ args: { now: v.number() }, handler: async (ctx, { now }) => {",
        "  await ctx.db.patch(id, { updatedAt: now });",
        "}});",
      ].join("\n"),
    },
    expected: [],
  },
  {
    name: "ignores clock lookalikes inside comments and strings",
    seed: {
      "convex/timers.ts": [
        "export const touch = mutation({ args: {}, handler: async (ctx) => {",
        "  // const now = Date.now();",
        "  const note = 'call Date.now() from the client';",
        "  await ctx.db.patch(id, { note });",
        "}});",
      ].join("\n"),
    },
    expected: [],
  },
  {
    name: "accepts a stored timestamp (safe to store)",
    seed: {
      "convex/timers.ts": [
        "export const touch = mutation({ args: { id: v.id(\"notes\") }, handler: async (ctx, args) => {",
        "  const now = Date.now();",
        "  await ctx.db.patch(args.id, { updatedAt: now });",
        "}});",
      ].join("\n"),
    },
    expected: [],
  },
  {
    name: "accepts a stored random value (safe to store)",
    seed: {
      "convex/roll.ts": [
        "export const sample = query({ args: {}, handler: async (ctx) => {",
        "  const id = Math.random().toString(36).slice(2);",
        "  return id;",
        "}});",
      ].join("\n"),
    },
    expected: [],
  },

  {
    name: "unbounded-collect: whole-table collect with no bound",
    seed: {
      "src/posts.ts": [
        'export const listPosts = query({',
        '  args: {},',
        '  handler: async (ctx) => {',
        '    return await ctx.db.query("posts").order("desc").collect();',
        "  },",
        "});",
      ].join("\n"),
    },
    expected: [{ file: "src/posts.ts", line: 4 }],
  },
  {
    name: "unbounded-collect: index range bounds the collect",
    seed: {
      "src/team-posts.ts": [
        'export const listTeamPosts = query({',
        '  args: {},',
        '  handler: async (ctx) => await ctx.db.query("posts").withIndex("by_team", q => q.eq("teamId", args.teamId)).collect(),',
        "});",
      ].join("\n"),
    },
    expected: [],
  },
  {
    name: "unbounded-collect: take bounds the collect",
    seed: {
      "src/recent.ts": [
        'export const recentPosts = query({',
        '  args: {},',
        '  handler: async (ctx) => await ctx.db.query("posts").order("desc").take(50),',
        "});",
      ].join("\n"),
    },
    expected: [],
  },
  {
    name: "index-filter-combo: withIndex narrowed then filtered",
    seed: {
      "src/members.ts": [
        'export const activeMembers = query({',
        '  args: {},',
        "  handler: async (ctx) => {",
        "    return await ctx.db",
        '      .query("members")',
        '      .withIndex("by_teamId", q => q.eq("teamId", args.teamId))',
        '      .filter(q => q.eq(q.field("status"), "active"))',
        "      .collect();",
        "  },",
        "});",
      ].join("\n"),
    },
    expected: [{ file: "src/members.ts", line: 7 }],
  },
  {
    name: "index-filter-combo: multi-field index serves both bounds",
    seed: {
      "src/members2.ts": [
        'export const activeMembers = query({',
        '  args: {},',
        "  handler: async (ctx) => {",
        "    return await ctx.db",
        '      .query("members")',
        '      .withIndex("by_teamId_status", q => q.eq("teamId", args.teamId).eq("status", "active"))',
        "      .collect();",
        "  },",
        "});",
      ].join("\n"),
    },
    expected: [],
  },
  {
    name: "presence-patch: lastSeen patched onto a user document",
    seed: {
      "src/heartbeat.ts": [
        'export const heartbeat = mutation({',
        '  args: {},',
        "  handler: async (ctx, args) => {",
        "    await ctx.db.patch(args.userId, { lastSeen: args.now });",
        "  },",
        "});",
      ].join("\n"),
    },
    expected: [{ file: "src/heartbeat.ts", line: 4 }],
  },
  {
    name: "presence-patch: segmented into its own table",
    seed: {
      "src/heartbeat2.ts": [
        'export const heartbeat = mutation({',
        '  args: {},',
        "  handler: async (ctx, args) => {",
        '    await ctx.db.insert("heartbeats", { userId: args.userId, at: args.now });',
        "  },",
        "});",
      ].join("\n"),
    },
    expected: [],
  },

  // --- missing-args-validator ---
  {
    name: "missing-args-validator: flags a public mutation with no args config",
    seed: {
      "convex/tasks.ts": [
        "export const createTask = mutation({",
        "  handler: async (ctx, args) => {",
        '    await ctx.db.insert("tasks", { body: args.body });',
        "  },",
        "});",
      ].join("\n"),
    },
    expected: [{ file: "convex/tasks.ts", line: 1 }],
  },
  {
    name: "missing-args-validator: accepts an explicit args object",
    seed: {
      "convex/tasks.ts": [
        "export const createTask = mutation({",
        '  args: { body: v.string() },',
        "  handler: async (ctx, args) => {",
        '    await ctx.db.insert("tasks", { body: args.body });',
        "  },",
        "});",
      ].join("\n"),
    },
    expected: [],
  },
  {
    name: "missing-args-validator: flags internal functions too (validators carry the types)",
    seed: {
      "convex/prune.ts": [
        "export const prune = internalMutation({",
        "  handler: async (ctx, args) => {",
        "    await ctx.db.delete(args.sessionId);",
        "  },",
        "});",
      ].join("\n"),
    },
    expected: [{ file: "convex/prune.ts", line: 1 }],
  },

  // --- public-api-in-server-call ---
  {
    name: "public-api-in-server-call: flags ctx.runMutation pointing at the public api tree",
    seed: {
      "convex/ops.ts": [
        "export const backfill = action({",
        "  args: {},",
        "  handler: async (ctx) => {",
        '    await ctx.runMutation(api.tasks.create, { title: "x" });',
        "  },",
        "});",
      ].join("\n"),
    },
    expected: [{ file: "convex/ops.ts", line: 4 }],
  },
  {
    name: "public-api-in-server-call: accepts the internal namespace",
    seed: {
      "convex/ops.ts": [
        "export const backfill = action({",
        "  args: {},",
        "  handler: async (ctx) => {",
        "    await ctx.runMutation(internal.tasks.create, { title: \"x\" });",
        "  },",
        "});",
      ].join("\n"),
    },
    expected: [],
  },

  // --- write-in-query ---
  {
    name: "write-in-query: flags an insert inside a query",
    seed: {
      "convex/views.ts": [
        "export const logView = query({",
        "  args: {},",
        "  handler: async (ctx, args) => {",
        '    await ctx.db.insert("views", { post: args.postId });',
        "  },",
        "});",
      ].join("\n"),
    },
    expected: [{ file: "convex/views.ts", line: 4 }],
  },
  {
    name: "write-in-query: accepts the same write in a mutation",
    seed: {
      "convex/views.ts": [
        "export const logView = mutation({",
        "  args: {},",
        "  handler: async (ctx, args) => {",
        '    await ctx.db.insert("views", { post: args.postId });',
        "  },",
        "});",
      ].join("\n"),
    },
    expected: [],
  },

  // --- db-in-action ---
  {
    name: "db-in-action: flags ctx.db.get inside an action",
    seed: {
      "convex/sync.ts": [
        "export const syncUser = action({",
        '  args: { id: v.id("users") },',
        "  handler: async (ctx, args) => {",
        "    const user = await ctx.db.get(args.id);",
        "  },",
        "});",
      ].join("\n"),
    },
    expected: [{ file: "convex/sync.ts", line: 4 }],
  },
  {
    name: "db-in-action: accepts runQuery from an action",
    seed: {
      "convex/sync.ts": [
        "export const syncUser = action({",
        "  args: {},",
        "  handler: async (ctx) => {",
        "    const user = await ctx.runQuery(internal.users.get, {});",
        "  },",
        "});",
      ].join("\n"),
    },
    expected: [],
  },

  // --- unawaited-convex-call ---
  {
    name: "unawaited-convex-call: flags a bare ctx.db.patch statement",
    seed: {
      "convex/notes.ts": [
        "export const markSeen = mutation({",
        '  args: { id: v.id("notes") },',
        "  handler: async (ctx, args) => {",
        "    ctx.db.patch(args.id, { seen: true });",
        "  },",
        "});",
      ].join("\n"),
    },
    expected: [{ file: "convex/notes.ts", line: 4 }],
  },
  {
    name: "unawaited-convex-call: accepts the awaited form",
    seed: {
      "convex/notes.ts": [
        "export const markSeen = mutation({",
        '  args: { id: v.id("notes") },',
        "  handler: async (ctx, args) => {",
        "    await ctx.db.patch(args.id, { seen: true });",
        "  },",
        "});",
      ].join("\n"),
    },
    expected: [],
  },
  {
    name: "unawaited-convex-call: accepts a returned ctx call",
    seed: {
      "convex/notes.ts": [
        "export const getNote = query({",
        '  args: { id: v.id("notes") },',
        "  handler: async (ctx, args) => {",
        "    return ctx.db.get(args.id);",
        "  },",
        "});",
      ].join("\n"),
    },
    expected: [],
  },

  // --- node-runtime-transaction ---
  {
    name: "node-runtime-transaction: flags a query defined in a use-node file",
    seed: {
      "convex/reindex.ts": [
        '"use node";',
        'import fs from "node:fs";',
        "export const reindex = query({",
        "  args: {},",
        "  handler: async (ctx) => {",
        '    return fs.readFileSync("idx.bin").length;',
        "  },",
        "});",
      ].join("\n"),
    },
    expected: [{ file: "convex/reindex.ts", line: 3 }],
  },
  {
    name: "node-runtime-transaction: accepts an action in a use-node file",
    seed: {
      "convex/reindex.ts": [
        '"use node";',
        'import fs from "node:fs";',
        "export const reindex = action({",
        "  args: {},",
        "  handler: async (ctx) => {",
        '    return fs.readFileSync("idx.bin").length;',
        "  },",
        "});",
      ].join("\n"),
    },
    expected: [],
  },

  // --- sequential-run-in-loop ---
  {
    name: "sequential-run-in-loop: flags awaited runMutation inside a for loop",
    seed: {
      "convex/touchAll.ts": [
        "export const touchAll = action({",
        '  args: { ids: v.array(v.id("things")) },',
        "  handler: async (ctx, args) => {",
        "    for (const id of args.ids) {",
        "      await ctx.runMutation(internal.things.touch, { id });",
        "    }",
        "  },",
        "});",
      ].join("\n"),
    },
    expected: [{ file: "convex/touchAll.ts", line: 5 }],
  },
  {
    name: "sequential-run-in-loop: accepts ctx.db writes looped inside one mutation",
    seed: {
      "convex/touchAll.ts": [
        "export const touchAll = mutation({",
        '  args: { ids: v.array(v.id("things")) },',
        "  handler: async (ctx, args) => {",
        "    for (const id of args.ids) {",
        '      await ctx.db.patch(id, { touched: true });',
        "    }",
        "  },",
        "});",
      ].join("\n"),
    },
    expected: [],
  },

  // --- spread-into-patch ---
  {
    name: "spread-into-patch: flags a client-controlled spread merged into patch",
    seed: {
      "convex/profile.ts": [
        "export const updateProfile = mutation({",
        '  args: { id: v.id("users"), name: v.string(), role: v.string() },',
        "  handler: async (ctx, args) => {",
        "    await ctx.db.patch(args.id, { ...args });",
        "  },",
        "});",
      ].join("\n"),
    },
    expected: [{ file: "convex/profile.ts", line: 4 }],
  },
  {
    name: "spread-into-patch: accepts explicitly named fields",
    seed: {
      "convex/profile.ts": [
        "export const updateProfile = mutation({",
        '  args: { id: v.id("users"), name: v.string() },',
        "  handler: async (ctx, args) => {",
        "    await ctx.db.patch(args.id, { name: args.name });",
        "  },",
        "});",
      ].join("\n"),
    },
    expected: [],
  },
];
