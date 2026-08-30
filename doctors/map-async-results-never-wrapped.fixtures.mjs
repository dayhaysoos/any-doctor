export const fixtures = [
  {
    name: "reports an async arrow map whose result is assigned directly",
    seed: {
      "src/tasks.ts": "const tasks = users.map(async user => fetch(user.url));\n",
    },
    expected: [{ file: "src/tasks.ts", line: 1 }],
  },
  {
    name: "reports async function callbacks and keeps each map location",
    seed: {
      "src/tasks.ts": "const tasks = users.map(async function (user) {\n  return fetch(user.url);\n});\n\nconst other = ids.map(async (id, index) => Promise.resolve({ id, index }));\n",
    },
    expected: [
      { file: "src/tasks.ts", line: 1 },
      { file: "src/tasks.ts", line: 5 },
    ],
  },
  {
    name: "allows an async map directly consumed by Promise.all",
    seed: {
      "src/tasks.ts": "const responses = await Promise.all(users.map(async user => fetch(user.url)));\n",
    },
    expected: [],
  },
  {
    name: "does not mistake a synchronous promise-producing map for an async map",
    seed: {
      "src/tasks.ts": "const tasks = users.map(user => fetch(user.url));\n",
    },
    expected: [],
  },
  {
    name: "reports an identical unwrapped map beside a wrapped one",
    seed: {
      "src/tasks.ts": "const first = Promise.all(users.map(async user => fetch(user.url)));\nconst second = users.map(async user => fetch(user.url));\n",
    },
    expected: [{ file: "src/tasks.ts", line: 2 }],
  },
];
