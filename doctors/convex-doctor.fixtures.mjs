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
        "export const all = query({ handler: async (ctx) => {",
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
        "export const all = query({ handler: async (ctx) => {",
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
        "export const since = query({ handler: async (ctx) => {",
        "  return await ctx.db.query(\"messages\").withIndex(\"by_time\", q => q.gt(\"time\", 100)).collect();",
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
    name: "flags Date.now() inside a mutation handler",
    seed: {
      "convex/timers.ts": [
        "export const touch = mutation({ handler: async (ctx) => {",
        "  const now = Date.now();",
        "  await ctx.db.patch(id, { updatedAt: now });",
        "}});",
      ].join("\n"),
    },
    expected: [{ file: "convex/timers.ts", line: 2 }],
  },
  {
    name: "flags Math.random() inside a query handler",
    seed: {
      "convex/roll.ts": [
        "export const sample = query({ handler: async (ctx) => {",
        "  const pick = Math.random();",
        "  return pick;",
        "}});",
      ].join("\n"),
    },
    expected: [{ file: "convex/roll.ts", line: 2 }],
  },
  {
    name: "flags elapsed-time math comparing two Date.now() calls in one transaction",
    seed: {
      "convex/sessions.ts": [
        "export const expire = mutation({ handler: async (ctx, s) => {",
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
        "export const touch = mutation({ handler: async (ctx) => {",
        "  // const now = Date.now();",
        "  const note = 'call Date.now() from the client';",
        "  await ctx.db.patch(id, { note });",
        "}});",
      ].join("\n"),
    },
    expected: [],
  },
];
