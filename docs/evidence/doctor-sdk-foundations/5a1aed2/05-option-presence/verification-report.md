# Checkpoint 5 verification report

Verdict: structured option presence checkpoint green.

The host now answers whether an actual call establishes an option as present or
absent through immutable aliases, ordered own properties, supported spreads,
Request constructors and inherited `__proto__` values. Later properties and
spreads win. An explicit null establishes absence, while undefined preserves a
Request-carried value. Mutation, reassignment, unrelated escapes, getters,
dynamic keys and unsupported inputs remain unknown.

Async combines native fetch identity with this host result, retaining the
informational policy decision in the doctor. Its private fetch-option model was
removed. `fetch-prototype-signal` changed from failed to passed; inherited null,
own null override, Request copy, ordered spreads, forwarded values and the real
absence positive controls all retain their reviewed labels.

| Gate | Local passed / failed / skipped | Packed passed / failed / skipped |
| --- | --- | --- |
| Full automated suite | 570 / 0 / 0 | source tests are not shipped |
| All bundled doctors | 244 / 0 / 15 | 244 / 0 / 15 |
| Original independent behavior | 55 / 0 / 0 | 55 / 0 / 0 |
| Original location probes | 2 / 0 / 0 | 2 / 0 / 0 |
| Fresh independent cases | 20 / 0 / 0 | 20 / 0 / 0 |
| Unavailable-analysis reporting | 5 / 0 / 0 | 5 / 0 / 0 |

Local and packed results match. Frozen Sift has no fetch addition or removal: it
remains the same 9 source-adjudicated findings over 671 eligible files, and all
1,530 frozen files match the canonical manifest.

Candidate digest: `0a02f56a3ad3a04a9f45a433efb991c18ad41ec81fa0ced4c563fc1471c7293d`.
Async doctor SHA-256: `48bd3d300b83ab74a10533c55f32efee1a92268c144f4efcb68ade647a05d4eb`.
Tarball SHA-256: `f22f8009b70c68ea15b4519e1dfc525ced2cd8526654336a38351b3ce3af5ef6`
(5,395,011 bytes). The package version remains 0.1.2.
