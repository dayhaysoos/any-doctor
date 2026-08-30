export const fixtures = [
  {
    name: "reports an assigned timeout without cleanup",
    seed: {
      "src/example.tsx": "useEffect(() => {\n  const timer = setTimeout(() => save(), 1000);\n}, []);\n",
    },
    expected: [{ file: "src/example.tsx", line: 2 }],
  },
  {
    name: "allows cleanup of the assigned timeout",
    seed: {
      "src/example.tsx": "useEffect(() => {\n  const timer = setTimeout(() => save(), 1000);\n  return () => clearTimeout(timer);\n}, []);\n",
    },
    expected: [],
  },
  {
    name: "reports only the timer missing from multi-timer cleanup",
    seed: {
      "src/example.jsx": "useEffect(() => {\n  const fast = setTimeout(work, 50);\n  let slow = setTimeout(work, 500);\n  return () => clearTimeout(fast);\n}, []);\n",
    },
    expected: [{ file: "src/example.jsx", line: 3 }],
  },
  {
    name: "reports an unassigned timer despite unrelated cleanup",
    seed: {
      "src/example.js": "useEffect(() => {\n  setTimeout(notify, 100);\n  return () => clearTimeout(existingTimer);\n}, []);\n",
    },
    expected: [{ file: "src/example.js", line: 2 }],
  },
  {
    name: "ignores timeout lookalikes outside effects and in comments",
    seed: {
      "src/example.ts": "const message = 'setTimeout(callback, 10)';\n// useEffect(() => setTimeout(callback, 10))\nfunction later() {\n  setTimeout(callback, 10);\n}\n",
    },
    expected: [],
  },
];
