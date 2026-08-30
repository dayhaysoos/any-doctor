export const fixtures = [
  {
    name: "reports a fetch call without options",
    seed: { "src/request.ts": "fetch('/api/users');\n" },
    expected: [{ file: "src/request.ts", line: 1 }],
  },
  {
    name: "reports options that omit signal",
    seed: {
      "src/request.ts": "fetch(\"/api/users\", { method: 'POST' });\n",
    },
    expected: [{ file: "src/request.ts", line: 1 }],
  },
  {
    name: "accepts an explicit signal property among other options",
    seed: {
      "src/request.ts": "fetch('/api/users', { method: 'GET', signal: controller.signal });\n",
    },
    expected: [],
  },
  {
    name: "accepts a shorthand signal property",
    seed: {
      "src/request.ts": "fetch('/api/users', { signal, headers: {} });\n",
    },
    expected: [],
  },
  {
    name: "reports a nested signal that is not a RequestInit signal",
    seed: {
      "src/request.ts": "fetch('/api/users', { headers: { signal: 'not-an-abort-signal' } });\n",
    },
    expected: [{ file: "src/request.ts", line: 1 }],
  },
  {
    name: "reports an options variable whose signal cannot be determined",
    seed: {
      "src/request.ts": "const options = { signal: controller.signal };\nfetch('/api/users', options);\n",
    },
    expected: [{ file: "src/request.ts", line: 2 }],
  },
];
