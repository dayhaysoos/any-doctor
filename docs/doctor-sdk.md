# Doctor SDK foundations

The Doctor SDK lets a confined doctor ask bounded semantic questions without
shipping its own parser, scope resolver or flow engine. A doctor still owns its
technology selectors, claim, severity, policy meaning and remediation copy. The
host owns source coordinates, lexical identity, supported value relationships,
evidence and uncertainty.

Every semantic answer is either `known` with source-digested evidence or
`unknown` with a named reason. Unknown is not absence. Recipe methods return that
answer and report an occurrence only when their result and declared unknown
policy permit it.

Recipes establish candidate membership before recording uncertainty. Unknown means
“this could be a candidate, but the provider could not decide”; it does not mean
an arbitrary expression outside the check's candidate space. A visibly synchronous
map callback is clear without proving the receiver is an array. Unrelated complete
callee spellings, unrelated imports and proven local functions/parameters are
clear. Stable bound aliases are resolved regardless of their local names;
conditional identities, mutable aliases and opaque options on real candidates
remain unknown. This is bounded syntax analysis, not execution or type inference.

The host also records every unknown independently of the doctor's finding policy.
Machine output exposes `semantic.incomplete`, aggregates affected occurrences by
check or capability, recipe, reason and file, and withholds the numeric score and
grade whenever semantic coverage narrowed. Human output names the narrowed check
and reason. This means `reportUnknown` may opt into a contextual review finding,
but omitting it can never turn an uncertain run into a fully clean report.

## Using a recipe

A recipe declaration implies its required analysis capabilities. `needs` may add
requirements but does not have to repeat them. Unhandled value implies `calls`
and `value-disposition`; the option recipe implies `calls`, `identity` and
`option-presence`; the resource recipe implies `calls`, `identity` and
`resource-lifetime`; the forbidden-call recipe implies `calls` and `identity`.
Runtime capability provenance, narrowed check IDs and
certification share this derivation. Declare `onUnknown` for these implied
requirements just as for explicit `needs`.

Doctors remain single-file confined programs: do not import SDK modules. Read
call facts from `ctx.analysis.calls`, create an expression reference from a flow
value, and invoke `ctx.recipes`. Declare the same recipe and serializable query on
the check's metadata so certification automatically selects its maintained
challenge profile.

### Identity selectors

Recipe identity queries use explicit source spellings. Local aliases resolve
automatically, so declare the exported name rather than guessing the local name.
List every supported spelling that the check claims. Verification creates a
focused witness for each declared alternative.

```js
{
  globals: [
    "fetch",                 // fetch(...)
    "process.exit",          // process.exit(...)
    "window.setInterval",    // window.setInterval(...)
  ],
  imports: [
    {
      source: "react",
      names: [
        "useEffect",         // import { useEffect } from "react"
                             // import { useEffect as lifecycle } from "react"
        "*.useEffect",       // import * as React from "react"; React.useEffect(...)
      ],
    },
    {
      source: "client",
      names: [
        "default",           // import client from "client"; client(...)
        "default.request",   // import client from "client"; client.request(...)
      ],
    },
  ],
}
```

The selector prefixes are literal: `*.member` means a namespace-import member,
while `default.member` means a member of a default import. A bare name means a
named import, including any local alias. Unsupported selector forms fail
verification instead of silently receiving no challenge.

```js
const ref = value => ({ id: value.id, start: value.start, end: value.end });

for (const file of ctx.files.list()) {
  const calls = ctx.analysis.calls(file).structure.flow.values
    .filter(value => value.kind === "call" && !value.dead);
  for (const call of calls) {
    // Pass ref(call) to the selected recipe. The recipe establishes whether
    // this call belongs to its configured candidate family.
  }
}
```

### Forbidden call

```js
recipe: {
  name: "forbidden-call",
  query: {
    target: { globals: ["process.exit"] },
    scope: {
      under: ["src"],
      extensions: [".ts", ".tsx", ".mts", ".cts"],
      exclude: ["src/doctor-loader.mts"],
    },
  },
}

for (const file of ctx.files.list([".ts", ".tsx", ".mts", ".cts"])) {
  const calls = ctx.analysis.calls(file).structure.flow.values
    .filter(value => value.kind === "call" && !value.dead);
  for (const call of calls) {
    ctx.recipes.forbiddenCall(
      file,
      ref(call),
      {
        target: { globals: ["process.exit"] },
        scope: {
          under: ["src"],
          extensions: [".ts", ".tsx", ".mts", ".cts"],
          exclude: ["src/doctor-loader.mts"],
        },
      },
      { rule: "direct-process-exit", message: "Return an exit code instead." },
    );
  }
}
```

The doctor declares project scope and explicit exemptions once in the recipe
query. The recipe owns that filtering, lexical identity, immutable aliases,
source locations, transparent parentheses and
TypeScript wrappers, and uncertainty. Its maintained challenge profile verifies
parenthesized receivers and callees, type assertions, non-null assertions,
comments and line breaks, local shadows, immutable and mutable aliases, unrelated
neighbors, same-line occurrences and unavailable analysis. These checks run for
every doctor that declares the recipe; authors do not have to remember each form.

### Unhandled value

```js
// Check metadata
recipe: {
  name: "unhandled-value",
  query: {
    producer: { member: "map", asyncArgument: 0, receiver: "array" },
    consumers: ["Promise.all", "Promise.allSettled"],
  },
}

// doctor(ctx), for a call whose structural member is "map"
ctx.recipes.unhandledValue(file, ref(call), {
  producer: { member: "map", asyncArgument: 0, receiver: "array" },
  consumers: ["Promise.all", "Promise.allSettled"],
}, {
  rule: "unhandled-map-work",
  message: "The configured promise-producing value is discarded.",
});
```

The recipe validates a supported native-array receiver and async callback, then
distinguishes consumption, ownership transfer and discard. Returning a value is
a transfer, not proof that a caller eventually settles it.

### Resource without release

```js
recipe: {
  name: "resource-without-release",
  query: {
    acquisition: { globals: ["setTimeout", "window.setTimeout"] },
    owner: {
      identity: { imports: [{ source: "react", names: ["useEffect", "*.useEffect"] }] },
      argument: 0,
    },
    release: ["clearTimeout", "window.clearTimeout"],
    reportUnknown: ["unsupported-expression"],
  },
}

ctx.recipes.resourceWithoutRelease(file, ref(timerCall), {
  acquisition: { globals: ["setTimeout", "window.setTimeout"] },
  owner: {
    identity: { imports: [{ source: "react", names: ["useEffect", "*.useEffect"] }] },
    argument: 0,
  },
  release: ["clearTimeout", "window.clearTimeout"],
  reportUnknown: ["unsupported-expression"],
}, {
  rule: "timer-without-effect-cleanup",
  message: "No supported matching release was established; review uncertain cleanup flow.",
});
```

The recipe matches the exact acquisition handle inside a supported owner and its
returned cleanup. `reportUnknown` is an explicit policy for contextual review;
omit it to abstain. Never include `analysis-unavailable` merely to turn missing
analysis into a finding.

### Required or recommended option

```js
recipe: {
  name: "required-or-recommended-option",
  query: {
    call: { globals: ["fetch", "globalThis.fetch"] },
    option: { option: "signal", sources: ["RequestInit", "Request"] },
  },
}

ctx.recipes.requiredOrRecommendedOption(file, ref(call), {
  call: { globals: ["fetch", "globalThis.fetch"] },
  option: { option: "signal", sources: ["RequestInit", "Request"] },
}, {
  rule: "fetch-without-caller-signal",
  message: "No caller cancellation signal was established; review the request policy.",
});
```

The recipe resolves the actual call identity and ordered options through
supported aliases, spreads and constructors. It establishes code evidence only;
the doctor decides whether absence is an error, a recommendation or irrelevant.

## Custom checks: inspect existing facts before writing a resolver

When no recipe fits, use the same host-owned facts through `ctx`. The public
TypeScript declarations are shipped with the CLI: [contract.d.ts](../bin/contract.d.ts)
contains `AnalysisCalls`, `ExpressionRef`, `SemanticResult`, `IdentityValue`, and
`Fixture`; [value-flow.d.ts](../bin/value-flow.d.ts) contains `FlowValue` and
`ValueFlow`. Read those declarations as reference material; do not import them
or analysis implementation modules into a confined doctor.

Consumer agents use public facts and recipes. Do not patch an installed Any Doctor package or build a private parser/resolver to force a result. When public facts are insufficient, narrow the affected check and produce a capability-gap report. Any Doctor maintainers may extend the shared provider only with a framework-neutral change and definite-positive, negative, uncertain, and mixed-neighbor regressions. A capability-gap report is evidence for future product work, not permission to guess or claim a clean result.

### Call identity: executable doctor example

This example reports native fetch and timer calls, including transparent parentheses,
TypeScript wrappers and stable aliases, while sparing local shadows. It is an
identity demonstration, not a recommendation to flag every fetch or timer.

```js
export const meta = {
  id: "fetch-identity-example", description: "Demonstrate fetch identity",
  severity: "info",
  checks: [{
    id: "native-fetch", description: "Native fetch identity demonstration",
    severity: "info", needs: ["calls", "identity"], onUnknown: "narrow",
  }, {
    id: "native-timer", description: "Native timer identity demonstration",
    severity: "info", needs: ["calls", "identity"], onUnknown: "narrow",
  }],
};

export async function doctor(ctx) {
  if (!ctx.analysis.available) return;
  for (const file of ctx.files.list()) {
    const facts = ctx.analysis.calls(file);
    for (const call of facts.structure.flow.values) {
      if (call.kind !== "call" || call.dead) continue;
      for (const [rule, globals] of [
        ["native-fetch", ["fetch", "globalThis.fetch", "window.fetch", "self.fetch"]],
        ["native-timer", ["setTimeout", "globalThis.setTimeout", "window.setTimeout"]],
      ]) {
        const result = ctx.analysis.callIdentity(file, {
          id: call.id, start: call.start, end: call.end,
        }, { globals });
        // Unknown is already recorded by the host; never convert it to clear.
        if (result.status === "unknown") continue;
        if (!result.value.matches) continue;
        ctx.report.finding({
          rule, file, line: call.line, column: call.column,
        });
      }
    }
  }
}
```

`callIdentity` takes a **whole call reference** and returns
`{ version: 1, status: "known", value: { matches: true | false }, evidence }`
or an `unknown` result with a reason. It uses the same candidate classification
as the shared recipes, without emitting a policy finding. Known unrelated globals,
imports and local functions/parameters stay quiet; unsupported possible matches
narrow automatically under capability `identity`. Declare `needs: ["calls", "identity"]`.
Existing `identity` takes a **callee expression reference**, additionally returns
its origin, and can be unknown for globals outside the query. Prefer `callIdentity`
for custom call selection. Neither result proves runtime behavior of an arbitrary
wrapper or factory. Receiver aliases such as `const host = globalThis; host.fetch()`
are currently unknown, not known nonmatches; retain them in capability-gap stakes.
Restrict queries to the accepted structural/ownership scope.

Explicit selectors remain policy: use `["fetch", "globalThis.fetch", "window.fetch", "self.fetch"]` and
`["setTimeout", "globalThis.setTimeout", "window.setTimeout"]` for those native families. Static computed
members, parentheses, supported TypeScript wrappers and stable aliases resolve
through shared facts; no `target.root === "fetch"` or text-pattern prefilter belongs
in front of this query. Such filters discard a valid candidate before identity runs.
Local bindings named globalThis, window, self, fetch or setTimeout remain local lookalikes.

### The value graph and its limits

`ctx.analysis.calls(file)` returns two related projections:

- `facts.calls`: source ranges, `target`, `usage`, `functionStart`, and argument
  **ranges** for each call.
- `facts.structure.flow.values`: expression graph nodes. Each has `id`, `kind`,
  a source range, `functionStart`, and `dead`. A call's `callee` and `arguments`
  are **value IDs**, not source offsets. A member's `receiver` is also a value ID.
- `facts.structure.flow.jsxElements`: JSX opening elements with their resolved
  import target and attributes. An attribute's `value` is a value ID in the same
  graph. Spread attributes carry `name: null` and `spread: true`.

Build `new Map(flow.values.map(v => [v.id, v]))` to follow those links.
Transparent parentheses and TypeScript wrappers share their runtime value's
identity. Never select candidates solely by an exact source spelling if an
identity query can establish the same call.

The shipped `FlowValue` declaration describes the optional fields: `literal`,
`receiver`, `member`, `callee`, `arguments`, `value`, `alternatives`, `selection`, `operation`
(operator plus operand IDs), and `guards` (test IDs plus truthy/falsy entry).
Not every kind has every field. An unknown node is not proof of absence.

JavaScript files may contain JSX even when their extension is `.js`. A file that
the shared parser still cannot analyze contributes `provider-failure`
uncertainty for that file; neighboring analyzable files remain available to the
doctor. An incomplete scan never receives a score or grade.

For a reference with `target.binding`, `flow.bindings` maps that lexical binding
to its initializer value ID. `facts.structure.bindings` supplies `reassigned`,
`mutated`, writes and escape facts. Follow aliases only when those facts support
stability. Track visited **value IDs** when traversing; stop and narrow relevant
candidates on unsupported shapes or cycles rather than guessing.

`flow.uses` records returned, awaited, discarded and written values with
function ownership and deadness. `flow.branches` records test IDs, true/false
branch ranges and direct exits. `guards` and `operation` are syntax facts, not a
promise that an arbitrary predicate or expression has been evaluated.

There are two loop projections. `facts.structure.loops` contains loop ranges,
function ownership and direct terminal exits. `flow.loops` describes **for-of**
iterables and element bindings; it is not a counter-loop iteration-count API.
For counter-based loops, combine structural queries with these ranges, or
report a specific capability gap. A loop existing in source does not prove a
retry: a literal one-iteration bound or an unconditional return may prevent any
second request. Keep calls in unrelated functions and nested callbacks separate.

### Conditional values: preserve the selected path

A ternary's `selection: { test, whenTrue, whenFalse }` contains value IDs for
all three syntax edges, even when a literal boolean lets `alternatives` omit a
never-selected arm. Existing `alternatives` remain possible value edges, not a
compliance certificate. Logical operators retain `operation` and alternatives;
they do not acquire ternary selection facts.

For `valid ? 500 : seconds * 1000`, the true arm is fixed. The false arm's header
dependency cannot establish that the delay honors a valid positive header. Reversing
the arms changes this conclusion. `Number.isFinite(seconds) && seconds > 0` is an
operator/call graph, not a host proof about arbitrary numeric ranges or policy.
A custom check may combine explicit bounded facts it can justify. If proving its
claim requires predicate interpretation or path-conditioned numeric dependence
that no public query establishes, narrow that candidate and file the report below.
Do not replace this missing proof with `alternatives.some(dependsOnHeader)`.

### Capability-gap report

Produce this authoring report when an accepted claim lacks a justified proof.
It does not submit a runtime finding, add a provider, or authorize consumer edits.
The `customChecks.gapReport` catalog exposes the required fields, classifications,
and four mandatory `acceptanceCases` stakes. Author tooling can import
`validateCapabilityGapReport` from the shipped `bin/authoring.js` using its absolute
file path (outside the confined doctor). It returns `{ valid, errors }`, validates
report structure and score/narrowing consistency, and does not execute seeds or
check path existence. Normal `verify` does not consume gap reports. Run the stakes
separately and compare exact findings, narrowing reasons and score/grade presence.
Use one report per missing relationship, linking multiple seeds when equivalent.

```json
{
  "intent": "The awaited retry delay must use the corresponding positive numeric header",
  "classification": "reusable-sdk-gap",
  "minimalSeed": "const delay = valid ? 500 : seconds * 1000;",
  "expected": "The valid-header path must not be certified compliant",
  "actual": "An any-alternative dependency check clears it; attach isolated scan JSON",
  "reproductionCommand": "node /absolute/candidate/bin/cli.js run /absolute/doctor.mjs /absolute/seed --format json",
  "availableFacts": [
    "callIdentity",
    "binding IDs and stability",
    "selection test and arms",
    "operation operands"
  ],
  "missingProof": "Path-conditioned numeric dependence after validating this response's header",
  "affectedScope": "The selected retry wait; preserve independent definite waits",
  "proposedNextStep": "Evaluate a bounded framework-neutral selected-value query; keep this claim partial until established",
  "acceptanceCases": {
    "currentFailure": {
      "seed": {
        "entry.ts": "async function inverted(url) {\n  for (let i = 0; i < 3; i++) {\n    const response = await fetch(url);\n    if (response.status !== 429) return response;\n    const seconds = Number(response.headers.get(\"Retry-After\"));\n    const delay = Number.isFinite(seconds) && seconds > 0 ? 500 : seconds * 1000;\n    await new Promise(resolve => setTimeout(resolve, delay));\n  }\n}\n"
      },
      "findings": [],
      "narrowing": {
        "state": "narrowed",
        "reasons": [
          "unsupported-expression"
        ]
      },
      "score": "null",
      "grade": "null"
    },
    "definitePositive": {
      "seed": {
        "entry.ts": "async function fixed(url) {\n  for (let i = 0; i < 3; i++) {\n    const response = await fetch(url);\n    if (response.status !== 429) return response;\n    const seconds = Number(response.headers.get(\"Retry-After\"));\n    const delay = 500;\n    await new Promise(resolve => setTimeout(resolve, delay));\n  }\n}\nasync function inverted(url) {\n  for (let i = 0; i < 3; i++) {\n    const response = await fetch(url);\n    if (response.status !== 429) return response;\n    const seconds = Number(response.headers.get(\"Retry-After\"));\n    const delay = Number.isFinite(seconds) && seconds > 0 ? 500 : seconds * 1000;\n    await new Promise(resolve => setTimeout(resolve, delay));\n  }\n}\n"
      },
      "findings": [
        {
          "rule": "fixed-retry-after-wait",
          "file": "entry.ts",
          "line": 7,
          "column": 53
        }
      ],
      "narrowing": {
        "state": "narrowed",
        "reasons": [
          "unsupported-expression"
        ]
      },
      "score": "null",
      "grade": "null"
    },
    "negativeControl": {
      "seed": {
        "entry.ts": "function fetch() {}\nfunction setTimeout() {}\nasync function local(url) {\n  for (let i = 0; i < 3; i++) {\n    const response = await fetch(url);\n    if (response.status !== 429) return response;\n    const seconds = Number(response.headers.get(\"Retry-After\"));\n    const delay = 500;\n    await new Promise(resolve => setTimeout(resolve, delay));\n  }\n}\n"
      },
      "findings": [],
      "narrowing": {
        "state": "complete",
        "reasons": []
      },
      "score": "present",
      "grade": "present"
    },
    "uncertainControl": {
      "seed": {
        "entry.ts": "async function inverted(url) {\n  for (let i = 0; i < 3; i++) {\n    const response = await fetch(url);\n    if (response.status !== 429) return response;\n    const seconds = Number(response.headers.get(\"Retry-After\"));\n    const delay = Number.isFinite(seconds) && seconds > 0 ? 500 : seconds * 1000;\n    await new Promise(resolve => setTimeout(resolve, delay));\n  }\n}\n"
      },
      "findings": [],
      "narrowing": {
        "state": "narrowed",
        "reasons": [
          "unsupported-expression"
        ]
      },
      "score": "null",
      "grade": "null"
    }
  }
}
```

Each `seed` maps relative filenames to complete source; materialize it in an isolated
directory and run the migrated doctor against it. A `fixturePath` may replace `seed`.
The positive stake deliberately includes an uncertain neighbor. Attach
candidate path/digest, exact output and source positions. State the smallest missing
relationship, not "needs better analysis." Separate multiple blockers:

| Classification | Decision |
|---|---|
| authoring-error | Existing shared identity already recognizes declared globalThis selectors; repair selection and retain the equivalent-syntax stake. |
| reusable-sdk-gap | Deterministic local syntax/identity/selected-value evidence is absent. Propose a bounded host fact/query, reuse cases beyond this policy, and definite/negative/unknown tests. |
| project-policy | The allowed cap, units, minimum wait, exception or severity requires a project decision; this is not a parser feature. |
| runtime-dynamic | External code, runtime inputs or arbitrary helper execution determines the answer. Name required evidence and abstain within the bounded analyzer. |

For mixed requests, complete independently supported checks and label the affected
claim partial or blocked. Keep per-candidate runtime narrowing separate from this
authoring report. Neither a gap report nor green author fixtures establishes that
an unchanged flawed doctor has been repaired. No private parser, resolver, general
evaluator or whole-program engine should be added to bridge the gap.

### Test custom uncertainty explicitly

Author fixtures currently support `name`, `seed`, `expected`, `analysis`, and
`includeTests`. They compare findings; `expected: []` does **not** assert
semantic coverage or a null score. `expectedSemantic` belongs to host-maintained
recipe profiles and is not supported in ordinary author fixtures.

For a custom uncertain case, also run its isolated seed through
`run doctor.mjs path/to/seed --format json` and assert the named check and file
appear in `groups[].semantic.narrowed`, with `score.score` and `score.grade`
both null. For a demonstrably unrelated negative control, require zero findings
**and no narrowing**. Run the uncertain case next to a genuine positive and
require that positive to survive. A narrow candidate search that silently misses
an equivalent violation can still earn a clean score; broad candidate discovery
and held-out syntax examples are necessary to test that blind spot.

## Direct semantic queries

`ctx.analysis.identity`, `valueDisposition`, `resourceLifetime`, and
`optionPresence` expose the underlying versioned results when a recipe does not
fit. Prefer a recipe when the claim matches: its shared challenge profile covers
identity lookalikes, transfers or aliases, unknown flow beside a positive,
multiple occurrences, and unavailable analysis.

Run human and machine certification with:

```sh
node bin/cli.js verify path/to/doctor.mjs
node bin/cli.js verify path/to/doctor.mjs --format json
```

Every maintained analysis-on profile explicitly requires complete or narrowed
semantic coverage for the challenged check, independently of findings. Positive,
lookalike, alias, supported transfer and occurrence profiles require complete
coverage. Unsupported receiver, option and cleanup-transfer profiles require
narrowed coverage and preserve their exact neighboring positives. Missing semantic
expectations fail profile validation. JSON rows expose expected and actual status;
matching findings alone cannot satisfy a wrong semantic answer.

The JSON `results` array names every exercised challenge and each unavailable
path. When the optional analysis provider is absent, analysis-on profiles are
explicit skips, matching author fixtures and location checks, including checks
whose analysis needs are implied only by a recipe. Analysis-off author fixtures
cannot witness location coverage for these checks. Each explicit
`analysis: "off"` profile still executes to certify the unavailable path. With
the provider installed, every profile runs. Author fixtures remain required; profiles do not replace held-out cases or
real-source adjudication.

Certification accepts global, named-import, default-import and namespace-member
identities used by the recipe declarations above. The full maintained behavior
suite runs against the first declared identity, then focused witnesses exercise
every additional acquisition, owner, target, call and release spelling. This is
linear in the number of declarations rather than a cross-product. Every accepted
recipe declaration must produce a nonempty challenge profile. If any declaration
cannot be materialized, verification fails the claim contract with the check,
recipe and unsupported identity shape instead of silently skipping it.

## Run provenance

JSON run groups include a `semantic` object for doctors that declare or invoke
semantic capabilities. It records:

- semantic result protocol version;
- provider identity and version plus the resolved parser and scope-provider
  package versions;
- availability and unavailable reason for every declared capability;
- availability per declared check recipe;
- every narrowed reason and affected file/occurrence count;
- per-run model-request and cache-reuse counters.

Doctors without semantic declarations remain compatible and do not receive a
synthetic semantic report. The SDK reuses the per-file call model already fetched
through `ctx.analysis.calls`; repeated recipe questions do not reparse the file
or make another synchronous host round trip.

## Current boundary

The first adapter is intentionally local and syntax-based. It does not interpret
arbitrary external functions, prove what a transferred value's caller does,
construct a whole-program call graph, or infer runtime intent. Mutation,
reassignment, getters, dynamic properties, opaque calls, unsupported owners and
cross-file wrappers can remain unknown. Type-aware analysis is a later measured
adapter, not something these APIs silently approximate.

## Custom-check uncertainty

Framework-specific checks can use shared facts and report a conclusion the
maintained recipes do not model:

```js
ctx.report.narrowing({
  check: "framework-contract",
  file,
  reason: "unresolved-identity",
  capability: "calls",
});
```

Declare that check and its `needs` in metadata. `capability` is optional; when
present it must be among that check's declared or recipe-implied requirements.
The host validates check membership before serializing the run. Each submission
records one uncertain occurrence; repeated submissions aggregate by check,
capability and reason, with counts for every affected file. A narrowed occurrence
is coverage information, not a warning or a penalty. Independent findings remain.

Use a normalized relative path to an existing file inside the target. Absolute
paths, traversal, malformed fields/reasons, out-of-root symlinks and undeclared
check/capability IDs are rejected. Reasons use the existing `UnknownReason`
vocabulary. This API records the custom check's bounded conclusion; it does not
prove that its candidate selection is correct. Do not narrow arbitrary unrelated
calls just because they could not be interpreted.

Without analysis, declared custom `needs` now produce the same incomplete-scan
state as recipe needs. Declaration-level unavailability has zero occurrences and
no files because the population was not measured. Both `onUnknown: "skip"` and
`"narrow"` retain that coverage receipt; neither can earn a confident score for an
unmeasured scan. Provider-independent checks continue to run.

A check that submits custom narrowing must declare at least one semantic `needs` capability or a recipe-implied need, including when it omits `capability` from the report. A supplied capability must match one of those needs. Violations fail with `invalid custom narrowing` before serialization.
