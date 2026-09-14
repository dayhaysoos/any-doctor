# Checkpoint 6 verification report

Verdict: reusable semantic recipes checkpoint green.

The SDK now exposes serializable `unhandledValue`, `resourceWithoutRelease`, and
`requiredOrRecommendedOption` recipes. Each recipe validates configured identity,
composes the corresponding semantic query, carries standard evidence, preserves
unknown reasons, and owns exact occurrence reporting. A doctor may explicitly
name which unknown reasons remain contextual findings; analysis unavailability
still narrows silently and visibly.

Async now supplies only technology selectors, diagnostic meaning and copy. It no
longer implements a private resolver, identity model, option lookup, resource
matcher or value-flow model. A confined synthetic reference doctor reuses all
three interfaces with async `flatMap`, animation-frame ownership, a `send` retry
option, and independent copy. Its fixture and multiple-location witnesses pass.

| Gate | Local passed / failed / skipped | Packed passed / failed / skipped |
| --- | --- | --- |
| Full automated suite | 571 / 0 / 0 | source tests are not shipped |
| All bundled doctors | 244 / 0 / 15 | 244 / 0 / 15 |
| Original independent behavior | 55 / 0 / 0 | 55 / 0 / 0 |
| Original location probes | 2 / 0 / 0 | 2 / 0 / 0 |
| Fresh independent cases | 20 / 0 / 0 | 20 / 0 / 0 |
| Unavailable-analysis reporting | 5 / 0 / 0 | 5 / 0 / 0 |

The separate 70-case Async transformation corpus also passes 70 / 0 / 0. There
is no extraction-only finding delta. Frozen Sift remains the same 9 adjudicated
findings over 671 eligible files; all 1,530 frozen files match the manifest.

Candidate digest: `a8a4f3b8bb8ae3ec44e795fd91d2eaa5492206ab89583bc55b383d5cb849c3cb`.
Async doctor SHA-256: `04b038d2ef6840baa705e24a891cb2eccaf0a653379f1692d7d993c8f326c7cc`.
Tarball SHA-256: `6ae9a3dab93857604d36f102cd181c7f795e64d1d5b2e8110f46c4fe4962dd25`
(5,432,814 bytes). The package version remains 0.1.2.
