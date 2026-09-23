# Doctor SDK foundations

Status: implemented and published in `0.2.0`. This document records the intended
module and its limits; [milestones](milestones.md), [baseline](baseline.md) and
the evidence directories preserve the completed implementation sequence.

## Problem

Before the SDK, doctor authors received useful structural and identity facts but
a semantic check could still require private value tracking, resource matching,
option inspection and uncertainty policy. The Async modernization demonstrated
the cost: its doctor-local model repaired known cases, then fresh equivalent
transfers exposed more false findings.

The SDK makes a good first implementation more likely. A doctor author
should state the project-specific concern and interpretation. Any Doctor should
own recurring JavaScript and TypeScript mechanics once, behind a small interface,
and verify those mechanics with shared challenges.

## Ownership

The Doctor SDK is a deeper part of the existing `DoctorCtx` interface. It is not
initially a separate npm package and it does not give confined doctor programs
an import capability.

```text
OXC parser + scope provider + optional future providers
                         |
                         v
              host-owned semantic modules
                         |
                         v
          DoctorCtx semantic query interface
                         |
                         v
             host-owned check recipes
                         |
                         v
             project-specific doctor policy
```

The host owns parsing, lexical identity, supported value relationships, source
coordinates, evidence, serialization and unavailable-capability behavior.
Doctors own framework meaning, severity, explanation and the decision to report
when the returned evidence supports their declared claim.

The implementation may continue to use OXC, TypeScript-aware scope analysis,
ast-grep and later type providers. Those are adapters behind the seam. Doctor
programs depend on the semantic result, not the provider that produced it.

## Core result contract

Every semantic query returns a discriminated result. The final names may change
only during milestone 1, before later milestones depend on them.

```ts
type SemanticResult<T> =
  | { status: "known"; value: T; evidence: Evidence[] }
  | { status: "unknown"; reason: UnknownReason; evidence?: Evidence[] };

type Presence = SemanticResult<"present" | "absent">;
```

`unknown` means the platform did not establish the answer within declared
coverage. It is not equivalent to `absent`, `discarded`, `unreleased`, `unused`
or safe. The interface must make that distinction visible in JSON and human
reports when it narrows a check.

Evidence is host-derived and tied to the source bytes analyzed. It contains the
minimum ranges and relationships needed to support the result; doctors do not
receive or serialize entire ASTs.

## First semantic queries

The first delivery has four query families. Keep their interfaces small and
place complexity behind them.

### Identity

Answer whether a reference or call is a supported global, import, local binding
or unresolved target. This family must distinguish real APIs from shadowed and
same-named lookalikes.

Representative question:

```ts
ctx.analysis.identity(call.callee, {
  globals: ["fetch", "window.fetch", "globalThis.fetch"],
});
```

### Value disposition

Answer what the supported local flow establishes about one exact expression
value. Initial outcomes are `consumed`, `transferred`, `discarded` and `unknown`.
The implementation may use more detailed internal states, but doctors should not
reconstruct flow from raw spans or nearby names.

Representative question:

```ts
ctx.analysis.valueDisposition(mapCall, {
  consumers: ["Promise.all", "Promise.allSettled", "Promise.any", "Promise.race"],
});
```

A return, yield, supported container transfer or unresolved external handoff can
transfer ownership without proving eventual settlement. The SDK must retain that
distinction. `await tasks` does not consume the promises inside an ordinary array.

### Resource lifetime

Answer whether a resource acquisition has a supported release in its owning
lifetime. It links the exact acquisition, handle, aliases, cleanup call and
returned cleanup path. A same-named identifier or an uncalled helper is not a
release.

Representative question:

```ts
ctx.analysis.resourceLifetime(timerCall, {
  release: ["clearTimeout", "window.clearTimeout", "globalThis.clearTimeout"],
  owner: effectSetup,
});
```

The result reports `released`, `unreleased` or `unknown`. A deliberate timer that
should finish may remain a contextual review candidate even when it is unreleased.

### Option presence

Answer whether an actual call input establishes an option as present, absent or
unknown. It owns ordered properties, supported spreads, aliases, constructors,
mutation/escape uncertainty and applicable inherited values.

Representative question:

```ts
ctx.analysis.optionPresence(fetchCall, {
  option: "signal",
  sources: ["RequestInit", "Request"],
});
```

This query establishes code evidence only. The doctor decides whether absence is
a defect, an informational policy candidate or irrelevant in that framework.

## Check recipes

Recipes are host-owned compositions of proven semantic queries. The shipped
recipes are:

- Unhandled value: a producer, supported consumers, ownership transfers and the
  claim made when disposition is established as discarded.
- Resource without release: an acquisition, release operations, owning lifetime
  and the claim made when absence is established.
- Required or recommended option: a resolved call, option sources and the claim
  made when absence is established.
- Forbidden call: a resolved direct call identity and the claim made when the
  configured API is established.

A recipe supplies uncertainty behavior, evidence ranges, occurrence reporting
and a shared challenge profile. The doctor supplies technology-specific selectors,
meaning and copy. Recipe configuration must be serializable through confinement;
it must not smuggle an unrestricted import or execution surface into doctor code.

Do not extract a recipe before its semantic query is proven through Async and at
least one small second consumer or synthetic reference doctor. One consumer alone
does not establish a reusable seam.

## Challenge profiles

Certification selects shared challenges from the recipes and capabilities a
check declares. Profiles are maintained examples with reviewed semantics, not
random source rewrites.

Each applicable profile includes:

- a genuine positive;
- a valid lookalike;
- a shadowed or same-named identity case;
- an alias or transfer case;
- an unsupported case that must remain unknown;
- an unrelated positive beside the unsupported case;
- two same-check occurrences, including a same-line witness where relevant;
- analysis-unavailable behavior.

Every expectation asserts the rule, finding count and exact location. A check
cannot pass by suppressing all findings. Author fixtures remain necessary for
framework meaning. Shared challenges do not replace held-out independent
evaluation or real-source adjudication.

## Invariants

1. Unknown analysis never becomes confident absence.
2. A semantic result identifies the source snapshot and evidence used.
3. Value identity is not inferred from matching text or matching offsets.
4. Same-named bindings remain distinct across scopes.
5. Containment does not imply execution, consumption or cleanup.
6. Ownership transfer does not imply completion.
7. Type annotations are evidence from a declared provider, not runtime proof.
8. A provider failure narrows named checks visibly; it does not create a clean
   result.
9. Doctors do not implement private parser, brace-counting, scope or flow copies
   when an SDK query owns that question.
10. Findings describe only what the supporting result establishes. Remediation
    remains supervised unless a separately verified fix contract exists.

## Compatibility and versioning

Additive `DoctorCtx` fields preserve existing custom doctors. A doctor declares
the semantic capabilities and recipes it requires. The report records their
availability and provider versions. A changed check meaning increments its
semantic revision. A provider improvement alone does not silently preserve old
decisions when it changes which findings appear; existing finding-lifecycle
compatibility rules remain authoritative.

The packed artifact is part of every public-interface gate. Source tests do not
prove that generated `bin` files, package contents or optional providers work for
a consumer.

## Type-aware analysis

Type facts are a later adapter, not a prerequisite for the first delivery. The
current Async failures concern expression roles, spreads, ownership transfers and
helper arguments, which the existing parsed structure can represent.

Begin a type-provider experiment only from named failures such as resolving a
local array type alias or determining whether an unknown receiver is Promise-like.
Measure configuration discovery, monorepo behavior, compatibility, startup time,
memory, package size and unavailable-provider reporting. A parser is not a type
checker. Type information improves selected facts; it does not decide product
intent or prove that a caller eventually handles a transferred value.

## Non-goals for this delivery

- A whole-program interpreter or complete call graph.
- Arbitrary cross-package runtime behavior inference.
- A promise that every custom doctor is correct on its first attempt.
- Automatic source modification.
- Publishing a package or changing its version.
- Migrating every bundled doctor.
- Replacing ast-grep for structural checks.
- Selecting or integrating a type-aware provider without a separate measured
  experiment.

## Success

The first delivery succeeds when Async uses the SDK and recipes instead of its
private semantic model, the fixed and fresh cases pass without weakening labels,
unknown coverage remains visible, a new author can express the three check families
without writing flow logic, and the same packed artifact reproduces local results.
