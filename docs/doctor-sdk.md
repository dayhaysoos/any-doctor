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

## Using a recipe

Doctors remain single-file confined programs: do not import SDK modules. Read
call facts from `ctx.analysis.calls`, create an expression reference from a flow
value, and invoke `ctx.recipes`. Declare the same recipe and serializable query on
the check's metadata so certification automatically selects its maintained
challenge profile.

```js
const ref = value => ({ id: value.id, start: value.start, end: value.end });
```

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
      identity: { imports: [{ source: "react", names: ["useEffect"] }] },
      argument: 0,
    },
    release: ["clearTimeout", "window.clearTimeout"],
    reportUnknown: ["unsupported-expression"],
  },
}

ctx.recipes.resourceWithoutRelease(file, ref(timerCall), {
  acquisition: { globals: ["setTimeout", "window.setTimeout"] },
  owner: {
    identity: { imports: [{ source: "react", names: ["useEffect"] }] },
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

The JSON `results` array names every exercised challenge and each unavailable
path. Author fixtures remain required; profiles do not replace held-out cases or
real-source adjudication.

## Current boundary

The first adapter is intentionally local and syntax-based. It does not interpret
arbitrary external functions, prove what a transferred value's caller does,
construct a whole-program call graph, or infer runtime intent. Mutation,
reassignment, getters, dynamic properties, opaque calls, unsupported owners and
cross-file wrappers can remain unknown. Type-aware analysis is a later measured
adapter, not something these APIs silently approximate.
