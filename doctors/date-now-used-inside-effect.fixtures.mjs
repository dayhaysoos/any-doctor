export const fixtures = [
  {
    name: "Date.now directly in an Effect.gen body is flagged",
    seed: {
      "src/direct.ts": [
        'import { Effect } from "effect"',
        "export const work = Effect.gen(function* () {",
        "  return Date.now()",
        "})",
      ].join("\n"),
    },
    expected: [{ file: "src/direct.ts", line: 3 }],
  },
  {
    name: "Date.now in a nested callback in Effect.gen is flagged",
    seed: {
      "src/nested.ts": [
        "import { Effect } from 'effect'",
        "export const work = Effect.gen(function* () {",
        "  return items.map(() => Date.now())",
        "})",
      ].join("\n"),
    },
    expected: [{ file: "src/nested.ts", line: 3 }],
  },
  {
    name: "Date.now outside an Effect.gen lookalike stays silent",
    seed: {
      "src/outside.ts": [
        "const label = 'Effect.gen(function* () { Date.now() })'",
        "export const timestamp = Date.now()",
      ].join("\n"),
    },
    expected: [],
  },
  {
    name: "a non-generator Effect.gen callback stays silent",
    seed: {
      "src/callback.ts": [
        "declare const Effect: { gen: (callback: () => number) => unknown }",
        "export const work = Effect.gen(() => Date.now())",
      ].join("\n"),
    },
    expected: [],
  },
];
