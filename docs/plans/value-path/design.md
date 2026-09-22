# Value Path

Status: implemented for the shared JS/TS provider and adopted by Deepgram and
OpenRouter. D32 is authoritative.

## Interface

```ts
ctx.analysis.valueAtPath(file, subject, {
  at: useSite,
  path: ["auth", "apiKey"],
});
```

The result is known present, known absent, or unknown. Present returns the
terminal `ExpressionRef` and an optional primitive `constant`. Explicit
`undefined` is present without a constant. There is no batch query, normalized
shape, origin, automatic narrowing, or public language-adapter abstraction.

## Proof boundary

The JS/TS implementation follows supported stable aliases, static object paths,
ordered spreads and primitive templates. It answers at the source observation:
prior writes, member mutation or opaque transfer are unknown; the consuming use
and later changes do not taint the earlier answer. Dynamic keys, accessors,
unresolved spreads, cycles, conflicting alternatives, helper execution and
cross-module flow remain unknown.

The host owns validation, source-digest integrity, caching, metrics and failure
classification. Doctors own candidate selection, technology policy, findings
and explicit narrowing. Raw `ctx.analysis.calls()` remains the advanced escape
hatch for relationships outside Value Path.

## Adoption rule

Deepgram and OpenRouter replace their duplicated property-path walkers while
retaining specialized identity and control-flow logic. Their fixture behavior
must stay identical. Later Doctors migrate only where the shared query deletes
real recurring mechanics; language adapters wait until a second language exists.

## Documentation gate

The contract and shipped declarations, authoring catalog, SDK guide, author
workflow, `CONTEXT.md`, and this decision record use the Value Path name and the
same present/absent/unknown semantics.
