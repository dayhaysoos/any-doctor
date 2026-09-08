export const fixtures = [
  {
    name: "reports a TODO comment",
    seed: { "src/app.ts": "// TODO: ship it\n" },
    expected: [{ rule: "todo-comment-left-in-code", file: "src/app.ts", line: 1 }],
  },
  {
    name: "clean code is not flagged",
    seed: { "src/app.ts": "const done = true;\n" },
    expected: [],
  },
];
