# Doctor SDK fixed baseline

This is the immutable evaluation contract for checkpoint 0. It preserves the
independent Async retest performed before this plan. Implementation may add cases;
it may not relabel, remove or weaken these cases to pass.

## Source candidate

- Historical branch at evaluation: `website/docs`.
- HEAD: `2b8c937554cbe22f35a7695d38504c0ca253f244`.
- Async doctor SHA-256:
  `91373d7dfaa63d24c370078c7d4f0e8eba639adb89c8439317be8147b806b7c6`.
- Independently packed tarball SHA-256:
  `31bcadbb1d789a84e4dae9ab6243fb53b611f93bde4cc845ff08a0a99f9318cf`.
- Independent evidence root:
  `/private/tmp/any-doctor-async-independent-now-2_h4quo_`.
- Independent report:
  `/private/tmp/any-doctor-async-independent-now-2_h4quo_/independent-review.md`.

The current `main` and plan branch began later at
`d4536b196dd86e8d9ae36b8774bbce06e8b9a5c2`. Checkpoint 0 must rerun the corpus
rather than assuming the historical outputs are the current result.

## Historical results to reproduce before repair

| Gate | Local passed / failed / skipped | Packed passed / failed / skipped |
| --- | --- | --- |
| Full automated suite | 565 / 0 / 0 | Source tests not shipped |
| Async bundled | 50 / 0 / 0 | 50 / 0 / 0 |
| Original independent behavior | 55 / 0 / 0 | 55 / 0 / 0 |
| Original location probes | 2 / 0 / 0 | 2 / 0 / 0 |
| Implementation-added paired cases | 70 / 0 / 0 | 70 / 0 / 0 |
| Fresh independent cases | 9 / 11 / 0 | 9 / 11 / 0 |
| Unavailable-analysis reporting | 5 / 0 / 0 | 5 / 0 / 0 |
| Original degraded literal expectations | 3 / 3 / 0 | 3 / 3 / 0 |
| Original degraded named expectations | 3 / 3 / 0 | 3 / 3 / 0 |

The independent Python runner exited zero despite failed expectations. Read its
JSON counts. Each reduced-analysis inner verification exited one. The new product
policy intentionally abstained when analysis was unavailable, but the old positive
expectations remain recorded as disagreements.

## Fresh cases

Every seed also contains an unrelated genuine positive for the same rule. The
positive must remain detected while the subject is repaired.

### Value disposition

These subjects should remain silent because ownership is transferred or the
available facts require abstention:

```ts
async function f() {
  const tasks = [1].map(async x => x);
  return await tasks;
}

async function f() {
  return await [1].map(async x => x);
}

function f(flag) {
  const tasks = [1].map(async x => x);
  return flag ? tasks : { tasks };
}

function* f() {
  const tasks = [1].map(async x => x);
  yield tasks;
}

async function settle(...items) {
  return Promise.all(items);
}
const tasks = [1].map(async x => x);
await settle(...tasks);

const tasks = [1].map(async x => x);
consume(...tasks);

const tasks = [1].map(async x => x);
const pending = [];
pending.push(...tasks);
await Promise.all(pending);

const tasks = [1].map(async x => x);
await Promise.all(...[tasks]);
```

These subjects must remain findings because their promise elements are neither
consumed nor transferred:

```ts
function f() {
  const tasks = [1].map(async x => x);
  return void tasks;
}

function f() {
  const tasks = [1].map(async x => x);
  return tasks.length;
}

async function f() {
  const tasks = [1].map(async x => x);
  await tasks;
}

function ignore(...items) {
  return undefined;
}
const tasks = [1].map(async x => x);
ignore(...tasks);
```

The first eight were false or unsupported warnings in the historical candidate;
the last four already passed and protect against broad suppression.

### Option presence

This subject must remain silent because the inherited RequestInit property carries
a valid signal:

```ts
const controller = new AbortController();
fetch("/", { __proto__: { signal: controller.signal } });
```

These subjects remain informational absence candidates:

```ts
fetch("/", { __proto__: { signal: null } });

const controller = new AbortController();
fetch("/", {
  __proto__: { signal: controller.signal },
  signal: null,
});
```

This supported Request copy remains silent:

```ts
const controller = new AbortController();
const request = new Request("https://example.invalid", {
  signal: controller.signal,
});
fetch(new Request(request));
```

The inherited signal was a historical false informational finding. The other
three cases already passed and preserve option precedence and constructor behavior.

### Resource lifetime

These subjects should remain silent because cleanup calls the correct native API
with the acquired handle:

```ts
import { useEffect } from "react";
function stop(handle) {
  clearTimeout(handle);
}
useEffect(() => {
  const handle = setTimeout(() => {}, 1);
  return () => stop(handle);
}, []);

import { useEffect } from "react";
function makeCleanup(handle) {
  return () => clearTimeout(handle);
}
useEffect(() => {
  const handle = setTimeout(() => {}, 1);
  return makeCleanup(handle);
}, []);
```

This subject must remain a contextual candidate because no timer cancellation is
performed; its guard changes callback behavior without releasing the timer:

```ts
import { useEffect } from "react";
useEffect(() => {
  let alive = true;
  setTimeout(() => {
    if (!alive) return;
    work();
  }, 1);
  return () => {
    alive = false;
  };
}, []);
```

A normal direct cleanup is the final passing control. Both helper forms were
historical unnecessary warnings; cleanup-factory support was already documented
as a known limitation.

## Runtime witnesses

The independent evaluation executed seven facts under Node v26.5.0:

- `return await tasks` preserves the ordinary array identity;
- a rest helper can settle spread promises;
- `Promise.all(...[tasks])` receives `tasks` as its iterable;
- spreading promises into a second array preserves the promises for settlement;
- generator yield transfers the same array;
- an inherited RequestInit signal propagates cancellation into Request;
- a directly called helper parameter clears the acquired timer handle.

No network request was made. The timer witness used instrumented timer functions;
it was not a mounted React/browser test.

## Frozen Sift baseline

- Snapshot: `/tmp/any-doctor-frozen-sift`.
- Canonical manifest: `docs/evidence/consumer-analysis/sift-manifest.json`.
- Files: 1,530.
- Eligible Async diagnostic files: 671.
- Historical current findings: nine — eight informational fetch candidates and
  one timer review candidate.

The three previous false timer findings were already repaired. The remaining timer
at `src/lib/theme.tsx:49` removes a theme-transition class after animation. Its
completion may be deliberate; preserve contextual wording and inspect any change.

Six earlier fetch review candidates disappeared through bounded input analysis.
They are missed candidates rather than proven signals. A finding-count reduction
does not establish better accuracy.

## Known limits retained separately

- A local array type alias remains a missed promise-array positive.
- Runtime string narrowing remains a missed fetch review candidate.
- The cleanup-factory case above remains an unnecessary timer review candidate in
  the historical candidate.
- Cross-file helpers, arbitrary mutation and complete control flow remain outside
  the first delivery.

These limits do not become correct negatives merely because the first Doctor SDK
delivery leaves them unsupported. Preserve positive neighbors and report the gaps.
