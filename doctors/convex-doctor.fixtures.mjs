export const fixtures = [
  {
    "name": "flags .filter() with no .withIndex()",
    "seed": {
      "convex/messages.ts": "import { query, mutation, action, internalQuery, internalMutation, internalAction } from \"../_generated/server\";\nexport const listByRoom = query({ args: { room: v.string() }, handler: async (ctx, { room }) => {\n  return await ctx.db.query(\"messages\").filter(q => q.eq(q.field(\"room\"), room)).collect();\n}});"
    },
    "expected": [
      {
        "rule": "filter-table-scan",
        "file": "convex/messages.ts",
        "line": 3
      }
    ]
  },
  {
    "name": "accepts .withIndex() with a range expression",
    "seed": {
      "convex/messages.ts": "import { query, mutation, action, internalQuery, internalMutation, internalAction } from \"../_generated/server\";\nexport const listByRoom = query({ args: { room: v.string() }, handler: async (ctx, { room }) => {\n  return await ctx.db.query(\"messages\").withIndex(\"by_room\", q => q.eq(\"room\", room)).collect();\n}});"
    },
    "expected": []
  },
  {
    "name": "accepts .filter() chained AFTER .withIndex() (filter narrows the indexed read)",
    "seed": {
      "convex/messages.ts": "import { query, mutation, action, internalQuery, internalMutation, internalAction } from \"../_generated/server\";\nexport const recent = query({ args: { room: v.string() }, handler: async (ctx, { room }) => {\n  return await ctx.db.query(\"messages\")\n    .withIndex(\"by_room\", q => q.eq(\"room\", room))\n    .filter(q => q.eq(q.field(\"pinned\"), true))\n    .take(20);\n}});"
    },
    "expected": []
  },
  {
    "name": "flags .withIndex() with no range expression",
    "seed": {
      "convex/messages.ts": "import { query, mutation, action, internalQuery, internalMutation, internalAction } from \"../_generated/server\";\nexport const all = query({ args: {}, handler: async (ctx) => {\n  return await ctx.db.query(\"messages\").withIndex(\"by_room\").collect();\n}});"
    },
    "expected": [
      {
        "rule": "index-without-range",
        "file": "convex/messages.ts",
        "line": 3
      }
    ]
  },
  {
    "name": "flags .withIndex(name, q => ...) whose callback never calls q.eq",
    "seed": {
      "convex/messages.ts": "import { query, mutation, action, internalQuery, internalMutation, internalAction } from \"../_generated/server\";\nexport const all = query({ args: {}, handler: async (ctx) => {\n  return await ctx.db.query(\"messages\").withIndex(\"by_room\", q => q).collect();\n}});"
    },
    "expected": [
      {
        "rule": "index-without-range",
        "file": "convex/messages.ts",
        "line": 3
      }
    ]
  },
  {
    "name": "accepts .withIndex() with q.gt range",
    "seed": {
      "convex/messages.ts": "import { query, mutation, action, internalQuery, internalMutation, internalAction } from \"../_generated/server\";\nexport const since = query({ args: {}, handler: async (ctx) => {\n  return await ctx.db.query(\"messages\").withIndex(\"by_time\", q => q.gt(\"time\", 100)).collect();\n}});"
    },
    "expected": []
  },
  {
    "name": "accepts .withIndex() with no range when .take() bounds the read",
    "seed": {
      "convex/messages.ts": "import { query, mutation, action, internalQuery, internalMutation, internalAction } from \"../_generated/server\";\nexport const recent = query({ args: {}, handler: async (ctx) => {\n  return await ctx.db.query(\"messages\").withIndex(\"by_room\").order(\"desc\").take(20);\n}});"
    },
    "expected": []
  },
  {
    "name": "flags useQuery on a whole-table query",
    "seed": {
      "src/App.tsx": "import { useQuery } from \"convex/react\";\nimport { api } from \"../convex/_generated/api\";\nexport function Messages() {\n  const messages = useQuery(api.messages.list);\n  return <ul>{messages?.map(m => <li key={m._id}>{m.body}</li>)}</ul>;\n}"
    },
    "expected": [
      {
        "rule": "unbounded-subscription",
        "file": "src/App.tsx",
        "line": 4
      }
    ]
  },
  {
    "name": "accepts usePaginatedQuery",
    "seed": {
      "src/App.tsx": "import { usePaginatedQuery } from \"convex/react\";\nimport { api } from \"../convex/_generated/api\";\nexport function Messages() {\n  const { results, loadMore } = usePaginatedQuery(api.messages.list, {}, { initialNumItems: 25 });\n  return <ul>{results.map(m => <li key={m._id}>{m.body}</li>)}</ul>;\n}"
    },
    "expected": []
  },
  {
    "name": "flags elapsed-time math on Date.now() inside a mutation handler",
    "seed": {
      "convex/timers.ts": "import { query, mutation, action, internalQuery, internalMutation, internalAction } from \"../_generated/server\";\nexport const touch = mutation({ args: { startedAt: v.number() }, handler: async (ctx, { startedAt }) => {\n  const elapsed = Date.now() - startedAt;\n  return elapsed;\n}});"
    },
    "expected": [
      {
        "rule": "nondeterministic-clock-in-transaction",
        "file": "convex/timers.ts",
        "line": 3
      }
    ]
  },
  {
    "name": "flags branching on Math.random() inside a query handler",
    "seed": {
      "convex/roll.ts": "import { query, mutation, action, internalQuery, internalMutation, internalAction } from \"../_generated/server\";\nexport const sample = query({ args: {}, handler: async (ctx) => {\n  if (Math.random() < 0.5) return null;\n  return 1;\n}});"
    },
    "expected": [
      {
        "rule": "nondeterministic-clock-in-transaction",
        "file": "convex/roll.ts",
        "line": 3
      }
    ]
  },
  {
    "name": "flags elapsed-time math comparing two Date.now() calls in one transaction",
    "seed": {
      "convex/sessions.ts": "import { query, mutation, action, internalQuery, internalMutation, internalAction } from \"../_generated/server\";\nexport const expire = mutation({ args: {}, handler: async (ctx, s) => {\n  const elapsed = Date.now() - s.startedAt;\n  if (elapsed > 5000) await ctx.db.delete(s._id);\n}});"
    },
    "expected": [
      {
        "rule": "nondeterministic-clock-in-transaction",
        "file": "convex/sessions.ts",
        "line": 3
      }
    ]
  },
  {
    "name": "accepts Date.now() in a plain (non-Convex) function",
    "seed": {
      "src/lib/time.ts": "export function nowMs() {\n  return Date.now();\n}"
    },
    "expected": []
  },
  {
    "name": "accepts Date.now() passed in as a mutation argument",
    "seed": {
      "convex/timers.ts": "import { query, mutation, action, internalQuery, internalMutation, internalAction } from \"../_generated/server\";\nexport const touch = mutation({ args: { now: v.number() }, handler: async (ctx, { now }) => {\n  await ctx.db.patch(id, { updatedAt: now });\n}});"
    },
    "expected": []
  },
  {
    "name": "ignores clock lookalikes inside comments and strings",
    "seed": {
      "convex/timers.ts": "import { query, mutation, action, internalQuery, internalMutation, internalAction } from \"../_generated/server\";\nexport const touch = mutation({ args: {}, handler: async (ctx) => {\n  // const now = Date.now();\n  const note = 'call Date.now() from the client';\n  await ctx.db.patch(id, { note });\n}});"
    },
    "expected": []
  },
  {
    "name": "accepts a stored timestamp (safe to store)",
    "seed": {
      "convex/timers.ts": "import { query, mutation, action, internalQuery, internalMutation, internalAction } from \"../_generated/server\";\nexport const touch = mutation({ args: { id: v.id(\"notes\") }, handler: async (ctx, args) => {\n  const now = Date.now();\n  await ctx.db.patch(args.id, { updatedAt: now });\n}});"
    },
    "expected": []
  },
  {
    "name": "accepts a stored random value (safe to store)",
    "seed": {
      "convex/roll.ts": "import { query, mutation, action, internalQuery, internalMutation, internalAction } from \"../_generated/server\";\nexport const sample = query({ args: {}, handler: async (ctx) => {\n  const id = Math.random().toString(36).slice(2);\n  return id;\n}});"
    },
    "expected": []
  },
  {
    "name": "unbounded-collect: whole-table collect with no bound",
    "seed": {
      "src/posts.ts": "import { query, mutation, action, internalQuery, internalMutation, internalAction } from \"../_generated/server\";\nexport const listPosts = query({\n  args: {},\n  handler: async (ctx) => {\n    return await ctx.db.query(\"posts\").order(\"desc\").collect();\n  },\n});"
    },
    "expected": [
      {
        "rule": "unbounded-collect",
        "file": "src/posts.ts",
        "line": 5
      }
    ]
  },
  {
    "name": "unbounded-collect: index range bounds the collect",
    "seed": {
      "src/team-posts.ts": "import { query, mutation, action, internalQuery, internalMutation, internalAction } from \"../_generated/server\";\nexport const listTeamPosts = query({\n  args: {},\n  handler: async (ctx) => await ctx.db.query(\"posts\").withIndex(\"by_team\", q => q.eq(\"teamId\", args.teamId)).collect(),\n});"
    },
    "expected": []
  },
  {
    "name": "unbounded-collect: take bounds the collect",
    "seed": {
      "src/recent.ts": "import { query, mutation, action, internalQuery, internalMutation, internalAction } from \"../_generated/server\";\nexport const recentPosts = query({\n  args: {},\n  handler: async (ctx) => await ctx.db.query(\"posts\").order(\"desc\").take(50),\n});"
    },
    "expected": []
  },
  {
    "name": "index-filter-combo: withIndex narrowed then filtered",
    "seed": {
      "src/members.ts": "import { query, mutation, action, internalQuery, internalMutation, internalAction } from \"../_generated/server\";\nexport const activeMembers = query({\n  args: {},\n  handler: async (ctx) => {\n    return await ctx.db\n      .query(\"members\")\n      .withIndex(\"by_teamId\", q => q.eq(\"teamId\", args.teamId))\n      .filter(q => q.eq(q.field(\"status\"), \"active\"))\n      .collect();\n  },\n});"
    },
    "expected": [
      {
        "rule": "index-filter-combo",
        "file": "src/members.ts",
        "line": 8
      }
    ]
  },
  {
    "name": "index-filter-combo: multi-field index serves both bounds",
    "seed": {
      "src/members2.ts": "import { query, mutation, action, internalQuery, internalMutation, internalAction } from \"../_generated/server\";\nexport const activeMembers = query({\n  args: {},\n  handler: async (ctx) => {\n    return await ctx.db\n      .query(\"members\")\n      .withIndex(\"by_teamId_status\", q => q.eq(\"teamId\", args.teamId).eq(\"status\", \"active\"))\n      .collect();\n  },\n});"
    },
    "expected": []
  },
  {
    "name": "presence-patch: lastSeen patched onto a user document",
    "seed": {
      "src/heartbeat.ts": "import { query, mutation, action, internalQuery, internalMutation, internalAction } from \"../_generated/server\";\nexport const heartbeat = mutation({\n  args: {},\n  handler: async (ctx, args) => {\n    await ctx.db.patch(args.userId, { lastSeen: args.now });\n  },\n});"
    },
    "expected": [
      {
        "rule": "presence-patch-on-shared-document",
        "file": "src/heartbeat.ts",
        "line": 5
      }
    ]
  },
  {
    "name": "presence-patch: segmented into its own table",
    "seed": {
      "src/heartbeat2.ts": "import { query, mutation, action, internalQuery, internalMutation, internalAction } from \"../_generated/server\";\nexport const heartbeat = mutation({\n  args: {},\n  handler: async (ctx, args) => {\n    await ctx.db.insert(\"heartbeats\", { userId: args.userId, at: args.now });\n  },\n});"
    },
    "expected": []
  },
  {
    "name": "missing-args-validator: flags a public mutation with no args config",
    "seed": {
      "convex/tasks.ts": "import { query, mutation, action, internalQuery, internalMutation, internalAction } from \"../_generated/server\";\nexport const createTask = mutation({\n  handler: async (ctx, args) => {\n    await ctx.db.insert(\"tasks\", { body: args.body });\n  },\n});"
    },
    "expected": [
      {
        "rule": "missing-args-validator",
        "file": "convex/tasks.ts",
        "line": 2
      }
    ]
  },
  {
    "name": "missing-args-validator: accepts an explicit args object",
    "seed": {
      "convex/tasks.ts": "import { query, mutation, action, internalQuery, internalMutation, internalAction } from \"../_generated/server\";\nexport const createTask = mutation({\n  args: { body: v.string() },\n  handler: async (ctx, args) => {\n    await ctx.db.insert(\"tasks\", { body: args.body });\n  },\n});"
    },
    "expected": []
  },
  {
    "name": "missing-args-validator: flags internal functions too (validators carry the types)",
    "seed": {
      "convex/prune.ts": "import { query, mutation, action, internalQuery, internalMutation, internalAction } from \"../_generated/server\";\nexport const prune = internalMutation({\n  handler: async (ctx, args) => {\n    await ctx.db.delete(args.sessionId);\n  },\n});"
    },
    "expected": [
      {
        "rule": "missing-args-validator",
        "file": "convex/prune.ts",
        "line": 2
      }
    ]
  },
  {
    "name": "public-api-in-server-call: flags ctx.runMutation pointing at the public api tree",
    "seed": {
      "convex/ops.ts": "import { query, mutation, action, internalQuery, internalMutation, internalAction } from \"../_generated/server\";\nexport const backfill = action({\n  args: {},\n  handler: async (ctx) => {\n    await ctx.runMutation(api.tasks.create, { title: \"x\" });\n  },\n});"
    },
    "expected": [
      {
        "rule": "public-api-in-server-call",
        "file": "convex/ops.ts",
        "line": 5
      }
    ]
  },
  {
    "name": "public-api-in-server-call: accepts the internal namespace",
    "seed": {
      "convex/ops.ts": "import { query, mutation, action, internalQuery, internalMutation, internalAction } from \"../_generated/server\";\nexport const backfill = action({\n  args: {},\n  handler: async (ctx) => {\n    await ctx.runMutation(internal.tasks.create, { title: \"x\" });\n  },\n});"
    },
    "expected": []
  },
  {
    "name": "write-in-query: flags an insert inside a query",
    "seed": {
      "convex/views.ts": "import { query, mutation, action, internalQuery, internalMutation, internalAction } from \"../_generated/server\";\nexport const logView = query({\n  args: {},\n  handler: async (ctx, args) => {\n    await ctx.db.insert(\"views\", { post: args.postId });\n  },\n});"
    },
    "expected": [
      {
        "rule": "write-in-query",
        "file": "convex/views.ts",
        "line": 5
      }
    ]
  },
  {
    "name": "write-in-query: accepts the same write in a mutation",
    "seed": {
      "convex/views.ts": "import { query, mutation, action, internalQuery, internalMutation, internalAction } from \"../_generated/server\";\nexport const logView = mutation({\n  args: {},\n  handler: async (ctx, args) => {\n    await ctx.db.insert(\"views\", { post: args.postId });\n  },\n});"
    },
    "expected": []
  },
  {
    "name": "db-in-action: flags ctx.db.get inside an action",
    "seed": {
      "convex/sync.ts": "import { query, mutation, action, internalQuery, internalMutation, internalAction } from \"../_generated/server\";\nexport const syncUser = action({\n  args: { id: v.id(\"users\") },\n  handler: async (ctx, args) => {\n    const user = await ctx.db.get(args.id);\n  },\n});"
    },
    "expected": [
      {
        "rule": "db-in-action",
        "file": "convex/sync.ts",
        "line": 5
      }
    ]
  },
  {
    "name": "db-in-action: accepts runQuery from an action",
    "seed": {
      "convex/sync.ts": "import { query, mutation, action, internalQuery, internalMutation, internalAction } from \"../_generated/server\";\nexport const syncUser = action({\n  args: {},\n  handler: async (ctx) => {\n    const user = await ctx.runQuery(internal.users.get, {});\n  },\n});"
    },
    "expected": []
  },
  {
    "name": "unawaited-convex-call: flags a bare ctx.db.patch statement",
    "seed": {
      "convex/notes.ts": "import { query, mutation, action, internalQuery, internalMutation, internalAction } from \"../_generated/server\";\nexport const markSeen = mutation({\n  args: { id: v.id(\"notes\") },\n  handler: async (ctx, args) => {\n    ctx.db.patch(args.id, { seen: true });\n  },\n});"
    },
    "expected": [
      {
        "rule": "unawaited-convex-call",
        "file": "convex/notes.ts",
        "line": 5
      }
    ]
  },
  {
    "name": "unawaited-convex-call: accepts the awaited form",
    "seed": {
      "convex/notes.ts": "import { query, mutation, action, internalQuery, internalMutation, internalAction } from \"../_generated/server\";\nexport const markSeen = mutation({\n  args: { id: v.id(\"notes\") },\n  handler: async (ctx, args) => {\n    await ctx.db.patch(args.id, { seen: true });\n  },\n});"
    },
    "expected": []
  },
  {
    "name": "unawaited-convex-call: accepts a returned ctx call",
    "seed": {
      "convex/notes.ts": "import { query, mutation, action, internalQuery, internalMutation, internalAction } from \"../_generated/server\";\nexport const getNote = query({\n  args: { id: v.id(\"notes\") },\n  handler: async (ctx, args) => {\n    return ctx.db.get(args.id);\n  },\n});"
    },
    "expected": []
  },
  {
    "name": "node-runtime-transaction: flags a query defined in a use-node file",
    "seed": {
      "convex/reindex.ts": "import { query, mutation, action, internalQuery, internalMutation, internalAction } from \"../_generated/server\";\n\"use node\";\nimport fs from \"node:fs\";\nexport const reindex = query({\n  args: {},\n  handler: async (ctx) => {\n    return fs.readFileSync(\"idx.bin\").length;\n  },\n});"
    },
    "expected": [
      {
        "rule": "node-runtime-transaction",
        "file": "convex/reindex.ts",
        "line": 4
      }
    ]
  },
  {
    "name": "node-runtime-transaction: accepts an action in a use-node file",
    "seed": {
      "convex/reindex.ts": "import { query, mutation, action, internalQuery, internalMutation, internalAction } from \"../_generated/server\";\n\"use node\";\nimport fs from \"node:fs\";\nexport const reindex = action({\n  args: {},\n  handler: async (ctx) => {\n    return fs.readFileSync(\"idx.bin\").length;\n  },\n});"
    },
    "expected": []
  },
  {
    "name": "sequential-run-in-loop: flags awaited runMutation inside a for loop",
    "seed": {
      "convex/touchAll.ts": "import { query, mutation, action, internalQuery, internalMutation, internalAction } from \"../_generated/server\";\nexport const touchAll = action({\n  args: { ids: v.array(v.id(\"things\")) },\n  handler: async (ctx, args) => {\n    for (const id of args.ids) {\n      await ctx.runMutation(internal.things.touch, { id });\n    }\n  },\n});"
    },
    "expected": [
      {
        "rule": "sequential-run-in-loop",
        "file": "convex/touchAll.ts",
        "line": 6
      }
    ]
  },
  {
    "name": "sequential-run-in-loop: accepts ctx.db writes looped inside one mutation",
    "seed": {
      "convex/touchAll.ts": "import { query, mutation, action, internalQuery, internalMutation, internalAction } from \"../_generated/server\";\nexport const touchAll = mutation({\n  args: { ids: v.array(v.id(\"things\")) },\n  handler: async (ctx, args) => {\n    for (const id of args.ids) {\n      await ctx.db.patch(id, { touched: true });\n    }\n  },\n});"
    },
    "expected": []
  },
  {
    "name": "spread-into-patch: flags a client-controlled spread merged into patch",
    "seed": {
      "convex/profile.ts": "import { query, mutation, action, internalQuery, internalMutation, internalAction } from \"../_generated/server\";\nexport const updateProfile = mutation({\n  args: { id: v.id(\"users\"), name: v.string(), role: v.string() },\n  handler: async (ctx, args) => {\n    await ctx.db.patch(args.id, { ...args });\n  },\n});"
    },
    "expected": [
      {
        "rule": "spread-into-patch",
        "file": "convex/profile.ts",
        "line": 5
      }
    ]
  },
  {
    "name": "spread-into-patch: accepts explicitly named fields",
    "seed": {
      "convex/profile.ts": "import { query, mutation, action, internalQuery, internalMutation, internalAction } from \"../_generated/server\";\nexport const updateProfile = mutation({\n  args: { id: v.id(\"users\"), name: v.string() },\n  handler: async (ctx, args) => {\n    await ctx.db.patch(args.id, { name: args.name });\n  },\n});"
    },
    "expected": []
  },
  {
    "name": "audit: runAction members of an awaited Promise.all are consumed",
    "seed": {
      "convex/analysis.ts": "import { query, mutation, action, internalQuery, internalMutation, internalAction } from \"../_generated/server\";\nexport const step = internalAction({\n  args: {},\n  handler: async (ctx) => {\n    const [a, b] = await Promise.all([\n      ctx.runAction(internal.x.a, {}),\n      ctx.runAction(internal.x.b, {}),\n    ]);\n    return [a, b];\n  },\n});"
    },
    "expected": []
  },
  {
    "name": "audit: patch promises pushed to an array then awaited together",
    "seed": {
      "convex/batch.ts": "import { query, mutation, action, internalQuery, internalMutation, internalAction } from \"../_generated/server\";\nexport const backfill = internalMutation({\n  args: {},\n  handler: async (ctx) => {\n    const jobs = [];\n    jobs.push(ctx.db.patch(id1, { done: true }));\n    jobs.push(ctx.db.patch(id2, { done: true }));\n    await Promise.all(jobs);\n  },\n});"
    },
    "expected": []
  },
  {
    "name": "audit: clock math inside an internalAction is exempt (actions have a live clock)",
    "seed": {
      "convex/extract.ts": "import { query, mutation, action, internalQuery, internalMutation, internalAction } from \"../_generated/server\";\nexport const extract = internalAction({\n  args: {},\n  handler: async (ctx) => {\n    const started = Date.now();\n    const elapsed = Date.now() - started;\n    return elapsed;\n  },\n});"
    },
    "expected": []
  },
  {
    "name": "audit: ctx.runQuery inside a query is legal (same read snapshot)",
    "seed": {
      "convex/chat.ts": "import { query, mutation, action, internalQuery, internalMutation, internalAction } from \"../_generated/server\";\nexport const read = query({\n  args: {},\n  handler: async (ctx) => {\n    return await ctx.runQuery(internal.chat.load, {});\n  },\n});"
    },
    "expected": []
  },
  {
    "name": "audit: a real range callback with internal statements bounds the read",
    "seed": {
      "convex/dashboard.ts": "import { query, mutation, action, internalQuery, internalMutation, internalAction } from \"../_generated/server\";\nexport const window = query({\n  args: {},\n  handler: async (ctx) => {\n    let range = ctx.db\n      .query(\"applications\")\n      .withIndex(\"by_orgId_submittedAt\", (q) => {\n        let r = q.eq(\"orgId\", orgId).gte(\"submittedAt\", cutoff);\n        if (end) {\n          r = r.lt(\"submittedAt\", end);\n        }\n        return r;\n      })\n      .collect();\n    return range;\n  },\n});"
    },
    "expected": []
  },
  {
    "name": "audit: chrome.tabs.query is not a Convex function",
    "seed": {
      "extensions/popup.ts": "import { chromeApi } from \"./chromeApi\";\nexport function activeTab(resolve) {\n  chromeApi.tabs.query({ active: true, currentWindow: true }, (tabs) => {\n    resolve(tabs[0] ?? null);\n  });\n}"
    },
    "expected": []
  },
  {
    "name": "audit: one multi-line chain is one unbounded-collect finding",
    "seed": {
      "convex/rate.ts": "import { query, mutation, action, internalQuery, internalMutation, internalAction } from \"../_generated/server\";\nexport const cleanup = internalMutation({\n  args: {},\n  handler: async (ctx) => {\n    const expired = await ctx.db\n      .query(\"rateLimits\")\n      .withIndex(\"by_createdAt\")\n      .filter(q => q.lt(q.field(\"createdAt\"), cutoff))\n      .collect();\n    for (const row of expired) {\n      await ctx.db.delete(row._id);\n    }\n  },\n});"
    },
    "expected": [
      {
        "rule": "index-without-range",
        "file": "convex/rate.ts",
        "line": 7
      }
    ]
  }
];
