export const fixtures = [
  {
    name: "unawaited map(async) is flagged",
    seed: {
      "src/a.ts": [
        "export function work(ids: string[]) {",
        "  const results = ids.map(async id => load(id))",
        "  return results.length",
        "}",
      ].join("\n"),
    },
    expected: [{ file: "src/a.ts", line: 2 }],
  },
  {
    name: "Promise.all-consumed result is not flagged",
    seed: {
      "src/b.ts": [
        "export async function work(ids: string[]) {",
        "  const results = ids.map(async id => load(id))",
        "  return Promise.all(results)",
        "}",
      ].join("\n"),
    },
    expected: [],
  },
  {
    name: "directly awaited result is not flagged",
    seed: {
      "src/c.ts": [
        "export async function work(ids: string[]) {",
        "  const results = ids.map(async id => load(id))",
        "  await results",
        "}",
      ].join("\n"),
    },
    expected: [],
  },
  {
    name: "allSettled-consumed result in a later batch loop is not flagged",
    seed: {
      "src/d.ts": [
        "export async function work(items: string[]) {",
        "  const allPromises = items.map(async item => load(item))",
        "  const allResults = await Promise.allSettled(allPromises)",
        "  return allResults",
        "}",
      ].join("\n"),
    },
    expected: [],
  },
];
