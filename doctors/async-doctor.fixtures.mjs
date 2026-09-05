export const fixtures = [
  {
    "name": "reports a fetch call without options",
    "seed": {
      "src/request.ts": "fetch('/api/users');\n"
    },
    "expected": [
      {
        "file": "src/request.ts",
        "line": 1
      }
    ]
  },
  {
    "name": "reports options that omit signal",
    "seed": {
      "src/request.ts": "fetch(\"/api/users\", { method: 'POST' });\n"
    },
    "expected": [
      {
        "file": "src/request.ts",
        "line": 1
      }
    ]
  },
  {
    "name": "accepts an explicit signal property among other options",
    "seed": {
      "src/request.ts": "fetch('/api/users', { method: 'GET', signal: controller.signal });\n"
    },
    "expected": []
  },
  {
    "name": "accepts a shorthand signal property",
    "seed": {
      "src/request.ts": "fetch('/api/users', { signal, headers: {} });\n"
    },
    "expected": []
  },
  {
    "name": "reports a nested signal that is not a RequestInit signal",
    "seed": {
      "src/request.ts": "fetch('/api/users', { headers: { signal: 'not-an-abort-signal' } });\n"
    },
    "expected": [
      {
        "file": "src/request.ts",
        "line": 1
      }
    ]
  },
  {
    "name": "reports an options variable whose signal cannot be determined",
    "seed": {
      "src/request.ts": "const options = { signal: controller.signal };\nfetch('/api/users', options);\n"
    },
    "expected": [
      {
        "file": "src/request.ts",
        "line": 2
      }
    ]
  },
  {
    "name": "unawaited map(async) is flagged",
    "seed": {
      "src/a.ts": "export function work(ids: string[]) {\n  const results = ids.map(async id => load(id))\n  return results.length\n}"
    },
    "expected": [
      {
        "file": "src/a.ts",
        "line": 2
      }
    ]
  },
  {
    "name": "Promise.all-consumed result is not flagged",
    "seed": {
      "src/b.ts": "export async function work(ids: string[]) {\n  const results = ids.map(async id => load(id))\n  return Promise.all(results)\n}"
    },
    "expected": []
  },
  {
    "name": "directly awaited result is not flagged",
    "seed": {
      "src/c.ts": "export async function work(ids: string[]) {\n  const results = ids.map(async id => load(id))\n  await results\n}"
    },
    "expected": []
  },
  {
    "name": "allSettled-consumed result in a later batch loop is not flagged",
    "seed": {
      "src/d.ts": "export async function work(items: string[]) {\n  const allPromises = items.map(async item => load(item))\n  const allResults = await Promise.allSettled(allPromises)\n  return allResults\n}"
    },
    "expected": []
  },
  {
    "name": "reports an assigned timeout without cleanup",
    "seed": {
      "src/example.tsx": "useEffect(() => {\n  const timer = setTimeout(() => save(), 1000);\n}, []);\n"
    },
    "expected": [
      {
        "file": "src/example.tsx",
        "line": 2
      }
    ]
  },
  {
    "name": "allows cleanup of the assigned timeout",
    "seed": {
      "src/example.tsx": "useEffect(() => {\n  const timer = setTimeout(() => save(), 1000);\n  return () => clearTimeout(timer);\n}, []);\n"
    },
    "expected": []
  },
  {
    "name": "reports only the timer missing from multi-timer cleanup",
    "seed": {
      "src/example.jsx": "useEffect(() => {\n  const fast = setTimeout(work, 50);\n  let slow = setTimeout(work, 500);\n  return () => clearTimeout(fast);\n}, []);\n"
    },
    "expected": [
      {
        "file": "src/example.jsx",
        "line": 3
      }
    ]
  },
  {
    "name": "reports an unassigned timer despite unrelated cleanup",
    "seed": {
      "src/example.js": "useEffect(() => {\n  setTimeout(notify, 100);\n  return () => clearTimeout(existingTimer);\n}, []);\n"
    },
    "expected": [
      {
        "file": "src/example.js",
        "line": 2
      }
    ]
  },
  {
    "name": "ignores timeout lookalikes outside effects and in comments",
    "seed": {
      "src/example.ts": "const message = 'setTimeout(callback, 10)';\n// useEffect(() => setTimeout(callback, 10))\nfunction later() {\n  setTimeout(callback, 10);\n}\n"
    },
    "expected": []
  }
];
