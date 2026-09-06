export const fixtures = [
  {
    name: "reports a console.log left in code",
    seed: { "src/app.ts": "const a = 1;\nconsole.log(a);\n" },
    expected: [{ file: "src/app.ts", line: 2 }],
  },
  {
    name: "a leveled logger is not flagged",
    seed: { "src/app.ts": "logger.info('structured');\n" },
    expected: [],
  },
];
