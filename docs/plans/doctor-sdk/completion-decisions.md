# Doctor SDK completion decisions

Date: 2026-09-14. Fixed points: planning `5a1aed20867b5bf9d884d3095d9719c9e8293625`, reviewed candidate `e25045434bb44b89068198c83b3c0256762c6aed`.

## Architecture decision

`DoctorCtx` remains the external seam. Doctors continue asking bounded semantic questions and never receive parser access. The host-side SDK module is deepened in three related ways:

- cache the already requested per-file call model in the confined host runtime and answer repeated semantic recipe questions from that model;
- collect semantic unknowns and provider provenance as host-owned run data, then carry it through `RunResult`, `ReportGroup`, summary, JSON and human adapters;
- keep certification profile construction in the certification module, but make every accepted declaration yield a nonempty profile or fail the claim contract loudly.

This is the smallest coherent repair because the doctor already requests the complete per-file call model before invoking recipes. Reusing it removes redundant synchronous channel round trips without exposing a new interface or adding another provider. The interface remains additive for doctors that do not declare or invoke semantic capabilities.

## Grill conclusions

The recommended conservative answer was accepted for every decision frontier:

1. The host owns uncertainty accounting. Recipe calls attribute unknowns to doctor check and recipe; direct calls attribute them to the semantic capability.
2. Every semantic unknown reason narrows coverage. `reportUnknown` remains solely a doctor policy for emitting a review finding and cannot hide the platform narrowing.
3. A narrowed run receives no numeric score or grade. JSON carries an explicit incomplete state; human output names the check and reason.
4. Repeated unknowns aggregate by check or capability, recipe, reason, and affected file occurrence counts.
5. Every declared capability and recipe receives an availability row. Provider identity, semantic protocol version, provider version, and dependency versions are additive provenance.
6. Valid global, named-import, default-import, and namespace-member identity declarations receive profiles. Any remaining declaration shape fails certification with a specific explanation rather than returning an empty profile.
7. Resource certification covers immutable aliases, wrong handles, supported local cleanup transfer, unsupported transfer beside an unrelated positive, exact locations, and unavailable analysis.
8. Performance work stops at per-file reuse. If repeated frozen-Sift measurements remain above twice the baseline, record the bottleneck and propose a later bounded slice rather than adding whole-program or type-aware analysis.
9. Package contents retain top-level public Markdown documentation and exclude internal evidence and plans. The retained tarball is created only after source and documentation are final.

## Rejected expansions

No type provider, new semantic query family, new recipe, whole-program analysis, automatic fix, or second bundled-doctor migration is part of this repair.
