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
    "name": "bounded result after index filter is still an index review candidate",
    "seed": {
      "convex/messages.ts": "import { query, mutation, action, internalQuery, internalMutation, internalAction } from \"../_generated/server\";\nexport const recent = query({ args: { room: v.string() }, handler: async (ctx, { room }) => {\n  return await ctx.db.query(\"messages\")\n    .withIndex(\"by_room\", q => q.eq(\"room\", room))\n    .filter(q => q.eq(q.field(\"pinned\"), true))\n    .take(20);\n}});"
    },
    "expected": [
      {
        "rule": "index-filter-combo",
        "file": "convex/messages.ts",
        "line": 5
      }
    ]
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
    "name": "accepts useQuery without assuming backend result size",
    "seed": {
      "src/App.tsx": "import { useQuery } from \"convex/react\";\nimport { api } from \"../convex/_generated/api\";\nexport function Messages() {\n  const messages = useQuery(api.messages.list);\n  return <ul>{messages?.map(m => <li key={m._id}>{m.body}</li>)}</ul>;\n}"
    },
    "expected": []
  },
  {
    "name": "accepts usePaginatedQuery",
    "seed": {
      "src/App.tsx": "import { usePaginatedQuery } from \"convex/react\";\nimport { api } from \"../convex/_generated/api\";\nexport function Messages() {\n  const { results, loadMore } = usePaginatedQuery(api.messages.list, {}, { initialNumItems: 25 });\n  return <ul>{results.map(m => <li key={m._id}>{m.body}</li>)}</ul>;\n}"
    },
    "expected": []
  },
  {
    "name": "accepts subtraction of a historical timestamp argument",
    "seed": {
      "convex/timers.ts": "import { query, mutation, action, internalQuery, internalMutation, internalAction } from \"../_generated/server\";\nexport const touch = mutation({ args: { startedAt: v.number() }, handler: async (ctx, { startedAt }) => {\n  const elapsed = Date.now() - startedAt;\n  return elapsed;\n}});"
    },
    "expected": []
  },
  {
    "name": "accepts seeded random branching",
    "seed": {
      "convex/roll.ts": "import { query, mutation, action, internalQuery, internalMutation, internalAction } from \"../_generated/server\";\nexport const sample = query({ args: {}, handler: async (ctx) => {\n  if (Math.random() < 0.5) return null;\n  return 1;\n}});"
    },
    "expected": []
  },
  {
    "name": "accepts expiration against a stored historical timestamp",
    "seed": {
      "convex/sessions.ts": "import { query, mutation, action, internalQuery, internalMutation, internalAction } from \"../_generated/server\";\nexport const expire = mutation({ args: {}, handler: async (ctx, s) => {\n  const elapsed = Date.now() - s.startedAt;\n  if (elapsed > 5000) await ctx.db.delete(s._id);\n}});"
    },
    "expected": []
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
  },
  {
    "name": "independent control: bare patch must be reported",
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
    "name": "unrelated Promise.all must not consume an earlier patch",
    "seed": {
      "convex/notes.ts": "import { query, mutation, action, internalQuery, internalMutation, internalAction } from \"../_generated/server\";\nexport const markSeen = mutation({\n  args: { id: v.id(\"notes\") },\n  handler: async (ctx, args) => {\n    ctx.db.patch(args.id, { seen: true });\n    const unrelated = 42;\n    await Promise.all([]);\n  },\n});"
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
    "name": "two identical discarded calls on one line are distinct occurrences",
    "analysis": "on",
    "seed": {
      "convex/example.ts": "import { query, mutation as change, internalMutation, action } from \"./_generated/server\";\nexport const example = change({args: {}, handler: async (context, args) => {\n  context.db.patch(args.id, {}); context.db.patch(args.id, {});\n}});"
    },
    "expected": [
      {
        "file": "convex/example.ts",
        "rule": "unawaited-convex-call",
        "line": 3,
        "column": 2
      },
      {
        "file": "convex/example.ts",
        "rule": "unawaited-convex-call",
        "line": 3,
        "column": 33
      }
    ]
  },
  {
    "name": "unrelated await before a discard is not consumption",
    "analysis": "on",
    "seed": {
      "convex/example.ts": "import { query, mutation as change, internalMutation, action } from \"./_generated/server\";\nexport const example = change({args: {}, handler: async (context, args) => {\n  await Promise.all([]);\n  context.db.patch(args.id, {});\n}});"
    },
    "expected": [
      {
        "file": "convex/example.ts",
        "rule": "unawaited-convex-call",
        "line": 4,
        "column": 2
      }
    ]
  },
  {
    "name": "wrapped returned callbacks and promise arguments are not direct discards",
    "analysis": "on",
    "seed": {
      "convex/example.ts": "import { query, mutation as change, internalMutation, action } from \"./_generated/server\";\nexport const example = change({args: {}, handler: async (context, args) => {\n  const adapters = {\n    authenticate: (token) =>\n      context.runQuery(internal.keys.authenticate, { token }),\n    list: (token, limit) =>\n      context.runQuery(internal.keys.list, { token, limit }),\n    record: (key) =>\n      context.runMutation(internal.keys.record, { key }),\n  };\n  await consume(context.runMutation(internal.keys.record, {}));\n  await Effect.runPromise(Effect.promise(() => context.runQuery(internal.keys.list, {})));\n  const tasks = [];\n  tasks.push(context.db.patch(args.id, {}));\n  await Promise.all(tasks);\n  return adapters;\n}});"
    },
    "expected": []
  },
  {
    "name": "a callback block really discards its call",
    "analysis": "on",
    "seed": {
      "convex/example.ts": "import { query, mutation as change, internalMutation, action } from \"./_generated/server\";\nexport const example = change({args: {}, handler: async (context, args) => {\n  const later = () => { context.db.patch(args.id, {}); };\n}});"
    },
    "expected": [
      {
        "file": "convex/example.ts",
        "rule": "unawaited-convex-call",
        "line": 3,
        "column": 24
      }
    ]
  },
  {
    "name": "shadowed context and builder-only calls are not promise findings",
    "analysis": "on",
    "seed": {
      "convex/example.ts": "import { query, mutation as change, internalMutation, action } from \"./_generated/server\";\nexport const example = change({args: {}, handler: async (context, args) => {\n  function other(context) { context.db.patch(args.id, {}); }\n  context.db.query(\"notes\");\n  const saved = context.db.patch(args.id, {});\n  return saved;\n}});"
    },
    "expected": []
  },
  {
    "name": "transparent type assertion preserves a discarded call",
    "analysis": "on",
    "seed": {
      "convex/example.ts": "import { query, mutation as change, internalMutation, action } from \"./_generated/server\";\nexport const example = change({args: {}, handler: async (context, args) => {\n  (context.db.patch(args.id, {}) as Promise<void>);\n}});"
    },
    "expected": [
      {
        "file": "convex/example.ts",
        "rule": "unawaited-convex-call",
        "line": 3,
        "column": 3
      }
    ]
  },
  {
    "name": "disabled analysis does not guess at discarded calls",
    "analysis": "off",
    "seed": {
      "convex/example.ts": "import { query, mutation as change, internalMutation, action } from \"./_generated/server\";\nexport const example = change({args: {}, handler: async (context, args) => {\n  context.db.patch(args.id, {});\n}});"
    },
    "expected": []
  },
  {
    "name": "two transaction duration calculations are distinct occurrences",
    "analysis": "on",
    "seed": {
      "convex/example.ts": "import { query, mutation as change, internalMutation, action } from \"./_generated/server\";\nexport const example = change({args: {}, handler: async (context, args) => {\n  const start = Date.now();\n  const elapsed = Date.now() - start;\n  return Date.now() - start;\n}});"
    },
    "expected": [
      {
        "file": "convex/example.ts",
        "rule": "transaction-clock-duration",
        "line": 4,
        "column": 18
      },
      {
        "file": "convex/example.ts",
        "rule": "transaction-clock-duration",
        "line": 5,
        "column": 9
      }
    ]
  },
  {
    "name": "query clock reports reactivity for each direct read",
    "analysis": "on",
    "seed": {
      "convex/example.ts": "import { query, mutation as change, internalMutation, action } from \"./_generated/server\";\nexport const example = query({args: {}, handler: async (context, args) => {\n  const now = Date.now();\n  return Date.now();\n}});"
    },
    "expected": [
      {
        "file": "convex/example.ts",
        "rule": "query-clock-reactivity",
        "line": 3,
        "column": 14
      },
      {
        "file": "convex/example.ts",
        "rule": "query-clock-reactivity",
        "line": 4,
        "column": 9
      }
    ]
  },
  {
    "name": "mutation expiry cutoff and seeded randomness remain valid",
    "analysis": "on",
    "seed": {
      "convex/example.ts": "import { query, mutation as change, internalMutation, action } from \"./_generated/server\";\nexport const example = change({args: {}, handler: async (context, args) => {\n  const expires = Date.now() + 60_000;\n  const cutoff = Date.now() - 60_000;\n  if (args.expiresAt < Date.now()) return false;\n  return Math.random() < 0.5 ? expires : cutoff;\n}});"
    },
    "expected": []
  },
  {
    "name": "actions have a live clock",
    "analysis": "on",
    "seed": {
      "convex/example.ts": "import { query, mutation as change, internalMutation, action } from \"./_generated/server\";\nexport const example = action({args: {}, handler: async (context, args) => {\n  const start = Date.now();\n  return Date.now() - start;\n}});"
    },
    "expected": []
  },
  {
    "name": "shadowed Date and nested clocks do not imply query-time execution",
    "analysis": "on",
    "seed": {
      "convex/example.ts": "import { query, mutation as change, internalMutation, action } from \"./_generated/server\";\nexport const example = query({args: {}, handler: async (context, args) => {\n  const Date = { now: () => 7 };\n  const a = () => globalThis.Date.now();\n  return Date.now();\n}});"
    },
    "expected": []
  },
  {
    "name": "mutable timestamp origin is unknown",
    "analysis": "on",
    "seed": {
      "convex/example.ts": "import { query, mutation as change, internalMutation, action } from \"./_generated/server\";\nexport const example = change({args: {}, handler: async (context, args) => {\n  let start = Date.now();\n  start = args.timestamp;\n  return Date.now() - start;\n}});"
    },
    "expected": []
  },
  {
    "name": "disabled analysis does not infer query clock ownership",
    "analysis": "off",
    "seed": {
      "convex/example.ts": "import { query, mutation as change, internalMutation, action } from \"./_generated/server\";\nexport const example = query({args: {}, handler: async (context, args) => {\n  return Date.now();\n}});"
    },
    "expected": []
  },
  {
    "name": "unrelated factory and shadowed imported factory are not Convex context",
    "seed": {
      "convex/fake.ts": "import { mutation } from './_generated/server';\nfunction fake(mutation) {\n  return mutation({handler: async (ctx) => { ctx.db.patch(id, {}); }});\n}"
    },
    "expected": []
  },
  {
    "name": "locations: filter-table-scan identical chains in separate functions",
    "seed": {
      "convex/locations.ts": "export async function first(ctx) {\n  return ctx.db.query(\"notes\").filter(q => q.eq(q.field(\"active\"), true)).collect();\n}\nexport async function second(ctx) {\n  return ctx.db.query(\"notes\").filter(q => q.eq(q.field(\"active\"), true)).collect();\n}"
    },
    "expected": [
      {
        "rule": "filter-table-scan",
        "file": "convex/locations.ts",
        "line": 2
      },
      {
        "rule": "filter-table-scan",
        "file": "convex/locations.ts",
        "line": 5
      }
    ]
  },
  {
    "name": "locations: index-without-range identical chains in separate functions",
    "seed": {
      "convex/locations.ts": "export async function first(ctx) {\n  return ctx.db.query(\"notes\").withIndex(\"by_active\").collect();\n}\nexport async function second(ctx) {\n  return ctx.db.query(\"notes\").withIndex(\"by_active\").collect();\n}"
    },
    "expected": [
      {
        "rule": "index-without-range",
        "file": "convex/locations.ts",
        "line": 2
      },
      {
        "rule": "index-without-range",
        "file": "convex/locations.ts",
        "line": 5
      }
    ]
  },
  {
    "name": "locations: unbounded-collect identical chains in separate functions",
    "seed": {
      "convex/locations.ts": "export async function first(ctx) {\n  return ctx.db.query(\"notes\").collect();\n}\nexport async function second(ctx) {\n  return ctx.db.query(\"notes\").collect();\n}"
    },
    "expected": [
      {
        "rule": "unbounded-collect",
        "file": "convex/locations.ts",
        "line": 2
      },
      {
        "rule": "unbounded-collect",
        "file": "convex/locations.ts",
        "line": 5
      }
    ]
  },
  {
    "name": "locations: index-filter-combo identical chains in separate functions",
    "seed": {
      "convex/locations.ts": "export async function first(ctx) {\n  return ctx.db.query(\"notes\").withIndex(\"by_active\", q => q.eq(\"active\", true)).filter(q => q.eq(q.field(\"name\"), \"a\")).collect();\n}\nexport async function second(ctx) {\n  return ctx.db.query(\"notes\").withIndex(\"by_active\", q => q.eq(\"active\", true)).filter(q => q.eq(q.field(\"name\"), \"a\")).collect();\n}"
    },
    "expected": [
      {
        "rule": "index-filter-combo",
        "file": "convex/locations.ts",
        "line": 2
      },
      {
        "rule": "index-filter-combo",
        "file": "convex/locations.ts",
        "line": 5
      }
    ]
  },
  {
    "name": "two whole-table reads on one line remain separate findings",
    "seed": {
      "convex/locations.ts": "export async function first(ctx) { await ctx.db.query(\"a\").collect(); await ctx.db.query(\"a\").collect(); }"
    },
    "expected": [
      {
        "rule": "unbounded-collect",
        "file": "convex/locations.ts",
        "line": 1,
        "column": 59
      },
      {
        "rule": "unbounded-collect",
        "file": "convex/locations.ts",
        "line": 1,
        "column": 94
      }
    ]
  },
  {
    "name": "a query builder without execution is not a scan",
    "seed": {
      "convex/builder.ts": "export function prepare(ctx) { return ctx.db.query(\"notes\").filter(q => q.eq(q.field(\"x\"), 1)); }"
    },
    "expected": []
  },
  {
    "name": "degraded query analysis abstains rather than guessing chains",
    "analysis": "off",
    "seed": {
      "convex/builder.ts": "export async function all(ctx) { return await ctx.db.query(\"notes\").collect(); }"
    },
    "expected": []
  },
  {
    "name": "locations: presence-patch-on-shared-document two separate statements",
    "seed": {
      "convex/twice.ts": "import { query, mutation, action } from \"./_generated/server\";\nexport const test = mutation({args: {}, handler: async (ctx, args) => {\n  await ctx.db.patch(id, {lastSeen: now});\n  await ctx.db.patch(id, {lastSeen: now});\n}});"
    },
    "expected": [
      {
        "rule": "presence-patch-on-shared-document",
        "file": "convex/twice.ts",
        "line": 3
      },
      {
        "rule": "presence-patch-on-shared-document",
        "file": "convex/twice.ts",
        "line": 4
      }
    ]
  },
  {
    "name": "locations: write-in-query two separate statements",
    "seed": {
      "convex/twice.ts": "import { query, mutation, action } from \"./_generated/server\";\nexport const test = query({args: {}, handler: async (ctx, args) => {\n  await ctx.db.insert(\"notes\", {text: \"hello\"});\n  await ctx.db.insert(\"notes\", {text: \"hello\"});\n}});"
    },
    "expected": [
      {
        "rule": "write-in-query",
        "file": "convex/twice.ts",
        "line": 3
      },
      {
        "rule": "write-in-query",
        "file": "convex/twice.ts",
        "line": 4
      }
    ]
  },
  {
    "name": "locations: db-in-action two separate statements",
    "seed": {
      "convex/twice.ts": "import { query, mutation, action } from \"./_generated/server\";\nexport const test = action({args: {}, handler: async (ctx, args) => {\n  await ctx.db.get(id);\n  await ctx.db.get(id);\n}});"
    },
    "expected": [
      {
        "rule": "db-in-action",
        "file": "convex/twice.ts",
        "line": 3
      },
      {
        "rule": "db-in-action",
        "file": "convex/twice.ts",
        "line": 4
      }
    ]
  },
  {
    "name": "locations: public-api-in-server-call two separate statements",
    "seed": {
      "convex/twice.ts": "import { query, mutation, action } from \"./_generated/server\";\nexport const test = action({args: {}, handler: async (ctx, args) => {\n  await ctx.runQuery(api.notes.list, {});\n  await ctx.runQuery(api.notes.list, {});\n}});"
    },
    "expected": [
      {
        "rule": "public-api-in-server-call",
        "file": "convex/twice.ts",
        "line": 3
      },
      {
        "rule": "public-api-in-server-call",
        "file": "convex/twice.ts",
        "line": 4
      }
    ]
  },
  {
    "name": "locations: spread-into-patch two separate statements",
    "seed": {
      "convex/twice.ts": "import { query, mutation, action } from \"./_generated/server\";\nexport const test = mutation({args: {}, handler: async (ctx, args) => {\n  await ctx.db.patch(id, {...args});\n  await ctx.db.patch(id, {...args});\n}});"
    },
    "expected": [
      {
        "rule": "spread-into-patch",
        "file": "convex/twice.ts",
        "line": 3
      },
      {
        "rule": "spread-into-patch",
        "file": "convex/twice.ts",
        "line": 4
      }
    ]
  },
  {
    "name": "locations: sequential-run-in-loop two separate statements",
    "seed": {
      "convex/twice.ts": "import { query, mutation, action } from \"./_generated/server\";\nexport const test = action({args: {}, handler: async (ctx, args) => {\n  for (const id of ids) { await ctx.runMutation(internal.notes.touch, {id}); }\n  for (const id of ids) { await ctx.runMutation(internal.notes.touch, {id}); }\n}});"
    },
    "expected": [
      {
        "rule": "sequential-run-in-loop",
        "file": "convex/twice.ts",
        "line": 3
      },
      {
        "rule": "sequential-run-in-loop",
        "file": "convex/twice.ts",
        "line": 4
      }
    ]
  },
  {
    "name": "locations: missing validators on two declarations",
    "seed": {
      "convex/twice.ts": "import { query, mutation, action } from \"./_generated/server\";\nexport const first = mutation({handler: async (ctx) => { return 1; }});\nexport const second = mutation({handler: async (ctx) => { return 2; }});"
    },
    "expected": [
      {
        "rule": "missing-args-validator",
        "file": "convex/twice.ts",
        "line": 2
      },
      {
        "rule": "missing-args-validator",
        "file": "convex/twice.ts",
        "line": 3
      }
    ]
  },
  {
    "name": "locations: two transaction declarations in Node runtime",
    "seed": {
      "convex/twice.ts": "\"use node\";\nimport { query } from \"./_generated/server\";\nexport const first = query({args: {}, handler: async (ctx) => 1});\nexport const second = query({args: {}, handler: async (ctx) => 2});"
    },
    "expected": [
      {
        "rule": "node-runtime-transaction",
        "file": "convex/twice.ts",
        "line": 3
      },
      {
        "rule": "node-runtime-transaction",
        "file": "convex/twice.ts",
        "line": 4
      }
    ]
  }
];
