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
`resource-lifetime`. Runtime capability provenance, narrowed check IDs and
certification share this derivation. Declare `onUnknown` for these implied
requirements just as for explicit `needs`.

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
identities used by the recipe declarations above. Every accepted recipe
declaration must produce a nonempty challenge profile. If a declaration cannot
be materialized, verification fails the claim contract with the check, recipe
and unsupported identity shape instead of silently running zero challenges.

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
