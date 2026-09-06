export const fixtures = [
  {
    name: "reports a record with a single value schema",
    seed: { "src/schema.ts": "const labels = z.record(z.string());\n" },
    expected: [{ file: "src/schema.ts", line: 1 }],
  },
  {
    name: "reports a generic record with a multiline single argument",
    seed: {
      "src/schema.ts": "const labels = z.record<string>(\n  z.number(),\n);\n",
    },
    expected: [{ file: "src/schema.ts", line: 1 }],
  },
  {
    name: "accepts a record with explicit key and value schemas",
    seed: {
      "src/schema.ts": "const labels = z.record(z.string(), z.number());\n",
    },
    expected: [],
  },
  {
    name: "ignores similarly named calls and bracket access",
    seed: {
      "src/schema.ts": "const text = z.string();\nconst labels = z['record'](z.string());\n",
    },
    expected: [],
  },
];
