export const fixtures = [
  {
    "name": "reports a fetch call without options",
    "seed": {
      "src/request.ts": "fetch('/api/users');\n"
    },
    "expected": [
      {
        "rule": "fetch-calls-without-abortsignal",
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
        "rule": "fetch-calls-without-abortsignal",
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
        "rule": "fetch-calls-without-abortsignal",
        "file": "src/request.ts",
        "line": 1
      }
    ]
  },
  {
    "name": "accepts known options carrying a signal property",
    "seed": {
      "src/request.ts": "const options = { signal: controller.signal };\nfetch('/api/users', options);\n"
    },
    "expected": []
  },
  {
    "name": "commented-out map(async) lookalike is not flagged",
    "seed": {
      "src/commented.ts": "export function work(ids: string[]) {\n  // const results = ids.map(async id => load(id))\n  return ids.length\n}"
    },
    "expected": []
  },
  {
    "name": "string-literal map(async) lookalike is not flagged",
    "seed": {
      "src/in-docs.ts": "export const snippet = \"const results = ids.map(async id => load(id))\";\nexport function work(ids: string[]) {\n  return ids.length\n}"
    },
    "expected": []
  },
  {
    "name": "unawaited map(async) is flagged",
    "seed": {
      "src/a.ts": "export function work(ids: string[]) {\n  const results = ids.map(async id => load(id))\n  return results.length\n}"
    },
    "expected": [
      {
        "rule": "unawaited-async-map",
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
    "name": "await on the promise array does not settle it \u2014 flagged",
    "seed": {
      "src/c.ts": "export async function work(ids: string[]) {\n  const results = ids.map(async id => load(id))\n  await results\n}"
    },
    "expected": [
      {
        "rule": "unawaited-async-map",
        "file": "src/c.ts",
        "line": 2
      }
    ]
  },
  {
    "name": "per-element for-of consumption is recognized \u2014 not flagged",
    "seed": {
      "src/for-of-on.ts": "export async function work(ids: string[]) {\n  const jobs = ids.map(async id => load(id))\n  for (const p of jobs) {\n    await p\n  }\n}"
    },
    "expected": []
  },
  {
    "name": "unavailable analysis abstains: src/for-of.ts",
    "analysis": "off",
    "seed": {
      "src/for-of.ts": "export async function work(ids: string[]) {\n  const jobs = ids.map(async id => load(id))\n  for (const job of jobs) {\n    await job\n  }\n}"
    },
    "expected": []
  },
  {
    "name": "an inline for-of over the mapped array with awaited elements is not flagged",
    "seed": {
      "src/for-of-inline.ts": "export async function work(ids: string[]) {\n  for (const p of ids.map(async id => load(id))) {\n    await p\n  }\n}"
    },
    "expected": []
  },
  {
    "name": "a same-named binding in another scope cannot silence this one",
    "seed": {
      "src/shadow.ts": "export function main(ids: string[]) {\n  const jobs = ids.map(async id => load(id))\n  return jobs.length\n}\n\nfunction other(otherIds: string[]) {\n  const jobs = otherIds.map(async x => save(x))\n  return Promise.all(jobs)\n}"
    },
    "expected": [
      {
        "rule": "unawaited-async-map",
        "file": "src/shadow.ts",
        "line": 2
      }
    ]
  },
  {
    "name": "unavailable analysis abstains: src/shadow-off.ts",
    "analysis": "off",
    "seed": {
      "src/shadow-off.ts": "export function main(ids: string[]) {\n  const jobs = ids.map(async id => load(id))\n  return jobs.length\n}\n\nfunction other(otherIds: string[]) {\n  const jobs = otherIds.map(async x => save(x))\n  return Promise.all(jobs)\n}"
    },
    "expected": []
  },
  {
    "name": "a never-reassigned let binding is checked like a const \u2014 flagged",
    "seed": {
      "src/let-never.ts": "export function work(ids: string[]) {\n  let jobs = ids.map(async id => load(id))\n  return jobs.length\n}"
    },
    "expected": [
      {
        "rule": "unawaited-async-map",
        "file": "src/let-never.ts",
        "line": 2
      }
    ]
  },
  {
    "name": "a reassigned binding is inconclusive and skipped",
    "seed": {
      "src/let-reassigned.ts": "export function work(ids: string[], fresh: string[]) {\n  let jobs = ids.map(async id => load(id))\n  jobs = fresh.map(async x => save(x))\n  return jobs.length\n}"
    },
    "expected": []
  },
  {
    "name": "unavailable analysis abstains: src/off-a.ts",
    "analysis": "off",
    "seed": {
      "src/off-a.ts": "export function work(ids: string[]) {\n  const results = ids.map(async id => load(id))\n  return results.length\n}"
    },
    "expected": []
  },
  {
    "name": "unavailable analysis abstains: src/off-b.ts",
    "analysis": "off",
    "seed": {
      "src/off-b.ts": "export async function work(ids: string[]) {\n  const results = ids.map(async id => load(id))\n  return Promise.all(results)\n}"
    },
    "expected": []
  },
  {
    "name": "unavailable analysis abstains: src/off-bare.ts",
    "analysis": "off",
    "seed": {
      "src/off-bare.ts": "export function warm(ids: string[]) {\n  ids.map(async id => prime(id));\n  return ids.length;\n}\n"
    },
    "expected": []
  },
  {
    "name": "unavailable analysis abstains: src/off-await-array.ts",
    "analysis": "off",
    "seed": {
      "src/off-await-array.ts": "export async function warm(ids: string[]) {\n  await ids.map(async id => prime(id));\n  return ids.length;\n}\n"
    },
    "expected": []
  },
  {
    "name": "unavailable analysis abstains: src/off-one-line.ts",
    "analysis": "off",
    "seed": {
      "src/off-one-line.ts": "export const saveAll = (items: string[]) => { const jobs = items.map(async item => save(item)); return Promise.all(jobs); };"
    },
    "expected": []
  },
  {
    "name": "unavailable analysis abstains: src/off-opt-bound.ts",
    "analysis": "off",
    "seed": {
      "src/off-opt-bound.ts": "export function work(ids?: string[]) {\n  const jobs = ids?.map(async id => load(id))\n  return jobs?.length ?? 0\n}"
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
    "name": "consumption on the declaration's own line is seen",
    "seed": {
      "src/one-line.ts": "export const saveAll = (items: string[]) => { const jobs = items.map(async item => save(item)); return Promise.all(jobs); };"
    },
    "expected": []
  },
  {
    "name": "a map(async) wrapped in Promise.all at the declaration is not flagged",
    "seed": {
      "src/wrapped.ts": "export const loadAll = (ids: string[]) => Promise.all(ids.map(async id => load(id)));"
    },
    "expected": []
  },
  {
    "name": "a bare discarded map(async) with no binding is flagged",
    "seed": {
      "src/bare.ts": "export function warm(ids: string[]) {\n  ids.map(async id => prime(id));\n  return ids.length;\n}\n"
    },
    "expected": [
      {
        "rule": "unawaited-async-map",
        "file": "src/bare.ts",
        "line": 2
      }
    ]
  },
  {
    "name": "a bare map(async) in an else branch is flagged",
    "seed": {
      "src/else-branch.ts": "export function warm(ids: string[], fast: boolean) {\n  if (fast) return ids.length;\n  else ids.map(async id => prime(id));\n}\n"
    },
    "expected": [
      {
        "rule": "unawaited-async-map",
        "file": "src/else-branch.ts",
        "line": 3
      }
    ]
  },
  {
    "name": "an optional-chained bare map(async) is flagged",
    "seed": {
      "src/opt-bare.ts": "export function warm(ids?: string[]) {\n  ids?.map(async id => prime(id));\n  return 0;\n}\n"
    },
    "expected": [
      {
        "rule": "unawaited-async-map",
        "file": "src/opt-bare.ts",
        "line": 2
      }
    ]
  },
  {
    "name": "an optional-chained bound map(async) with no consumer is flagged",
    "seed": {
      "src/opt-bound.ts": "export function work(ids?: string[]) {\n  const jobs = ids?.map(async id => load(id))\n  return jobs?.length ?? 0\n}"
    },
    "expected": [
      {
        "rule": "unawaited-async-map",
        "file": "src/opt-bound.ts",
        "line": 2
      }
    ]
  },
  {
    "name": "await directly on the mapped array does not settle it \u2014 flagged",
    "seed": {
      "src/await-array.ts": "export async function warm(ids: string[]) {\n  await ids.map(async id => prime(id));\n  return ids.length;\n}\n"
    },
    "expected": [
      {
        "rule": "unawaited-async-map",
        "file": "src/await-array.ts",
        "line": 2
      }
    ]
  },
  {
    "name": "an async-function callback in a dropped binding is flagged",
    "seed": {
      "src/fn-bound.ts": "export function work(ids: string[]) {\n  const jobs = ids.map(async function (id) { return load(id); });\n  return jobs.length;\n}"
    },
    "expected": [
      {
        "rule": "unawaited-async-map",
        "file": "src/fn-bound.ts",
        "line": 2
      }
    ]
  },
  {
    "name": "a bare async-function map statement is flagged",
    "seed": {
      "src/fn-bare.ts": "export function warm(ids: string[]) {\n  ids.map(async function named(id) { prime(id); });\n  return ids.length;\n}"
    },
    "expected": [
      {
        "rule": "unawaited-async-map",
        "file": "src/fn-bare.ts",
        "line": 2
      }
    ]
  },
  {
    "name": "an async-function map consumed by a combiner is not flagged",
    "seed": {
      "src/fn-consumed.ts": "export async function work(ids: string[]) {\n  const jobs = ids.map(async function named(id) { return load(id); });\n  return Promise.all(jobs);\n}"
    },
    "expected": []
  },
  {
    "name": "reports an assigned timeout without cleanup",
    "seed": {
      "src/example.tsx": "import {useEffect} from \"react\";\nuseEffect(() => {\n  const timer = setTimeout(() => save(), 1000);\n}, []);\n"
    },
    "expected": [
      {
        "rule": "uncleared-settimeout-in-effect",
        "file": "src/example.tsx",
        "line": 3
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
      "src/example.jsx": "import {useEffect} from \"react\";\nuseEffect(() => {\n  const fast = setTimeout(work, 50);\n  let slow = setTimeout(work, 500);\n  return () => clearTimeout(fast);\n}, []);\n"
    },
    "expected": [
      {
        "rule": "uncleared-settimeout-in-effect",
        "file": "src/example.jsx",
        "line": 4
      }
    ]
  },
  {
    "name": "reports an unassigned timer despite unrelated cleanup",
    "seed": {
      "src/example.js": "import {useEffect} from \"react\";\nuseEffect(() => {\n  setTimeout(notify, 100);\n  return () => clearTimeout(existingTimer);\n}, []);\n"
    },
    "expected": [
      {
        "rule": "uncleared-settimeout-in-effect",
        "file": "src/example.js",
        "line": 3
      }
    ]
  },
  {
    "name": "ignores timeout lookalikes outside effects and in comments",
    "seed": {
      "src/example.ts": "const message = 'setTimeout(callback, 10)';\n// useEffect(() => setTimeout(callback, 10))\nfunction later() {\n  setTimeout(callback, 10);\n}\n"
    },
    "expected": []
  },
  {
    "name": "unresolved effect identity: reports an assigned timeout without cleanup",
    "seed": {
      "src/example.tsx": "useEffect(() => {\n  const timer = setTimeout(() => save(), 1000);\n}, []);\n"
    },
    "expected": []
  },
  {
    "name": "unresolved effect identity: reports only the timer missing from multi-timer cleanup",
    "seed": {
      "src/example.jsx": "useEffect(() => {\n  const fast = setTimeout(work, 50);\n  let slow = setTimeout(work, 500);\n  return () => clearTimeout(fast);\n}, []);\n"
    },
    "expected": []
  },
  {
    "name": "unresolved effect identity: reports an unassigned timer despite unrelated cleanup",
    "seed": {
      "src/example.js": "useEffect(() => {\n  setTimeout(notify, 100);\n  return () => clearTimeout(existingTimer);\n}, []);\n"
    },
    "expected": []
  },
  {
    "name": "locations: fetch-calls-without-abortsignal",
    "seed": {
      "example.ts": "fetch(\"/\");fetch(\"/\");"
    },
    "expected": [
      {
        "rule": "fetch-calls-without-abortsignal",
        "file": "example.ts",
        "line": 1,
        "column": 0
      },
      {
        "rule": "fetch-calls-without-abortsignal",
        "file": "example.ts",
        "line": 1,
        "column": 11
      }
    ]
  },
  {
    "name": "locations: unawaited-async-map",
    "seed": {
      "example.ts": "[1].map(async x=>x);[1].map(async x=>x);"
    },
    "expected": [
      {
        "rule": "unawaited-async-map",
        "file": "example.ts",
        "line": 1,
        "column": 0
      },
      {
        "rule": "unawaited-async-map",
        "file": "example.ts",
        "line": 1,
        "column": 20
      }
    ]
  },
  {
    "name": "locations: uncleared-settimeout-in-effect",
    "seed": {
      "example.ts": "import {useEffect} from \"react\";\nuseEffect(()=>{setTimeout(()=>{},1);setTimeout(()=>{},1)},[]);"
    },
    "expected": [
      {
        "rule": "uncleared-settimeout-in-effect",
        "file": "example.ts",
        "line": 2,
        "column": 15
      },
      {
        "rule": "uncleared-settimeout-in-effect",
        "file": "example.ts",
        "line": 2,
        "column": 36
      }
    ]
  }
];
