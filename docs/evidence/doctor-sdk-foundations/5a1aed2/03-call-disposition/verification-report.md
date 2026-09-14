# Checkpoint 3 verification report

Verdict: call and helper disposition checkpoint green.

Call facts now retain each argument's spread role while preserving the compatible
argument-id list. Function flow records ordinary and rest parameters. The host
disposition query follows supported local helper parameters and returned results,
distinguishes a spread argument from a nested array, and recognizes promise values
transferred through array `push(...values)` before a native combiner. Native
consumer identity rejects a shadowed `Promise.all` lookalike.

The four planned subjects (`spread-helper-consumption`,
`spread-opaque-consumption`, `push-spread-consumption`, and
`combiner-spread-arguments`) changed from failed to passed. A helper that ignores
its rest parameter, `Promise.all([tasks])`, `Promise.all([tasks.length])`, outer
callback containment, and a shadowed combiner remain findings. Opaque external
transfer is unknown while its same-rule positive neighbor remains detected.

Async no longer contains an `arrayUse` implementation; the host query is the one
owner of disposition reasoning.

| Gate | Local passed / failed / skipped | Packed passed / failed / skipped |
| --- | --- | --- |
| Full automated suite | 568 / 0 / 0 | source tests are not shipped |
| All bundled doctors | 244 / 0 / 15 | 244 / 0 / 15 |
| Original independent behavior | 55 / 0 / 0 | 55 / 0 / 0 |
| Original location probes | 2 / 0 / 0 | 2 / 0 / 0 |
| Fresh independent cases | 17 / 3 / 0 | 17 / 3 / 0 |
| Unavailable-analysis reporting | 5 / 0 / 0 | 5 / 0 / 0 |

The remaining failures are the inherited-option case and two resource-helper
cases assigned to checkpoints 5 and 4. Local and packed results match. Frozen
Sift remains 9 findings over 671 eligible files, and all 1,530 files match the
canonical manifest.

Candidate digest: `3fa473f18fc8ef25b5bf4fec97fb2142507686251efb3fc3524224afcce99ada`.
Async doctor SHA-256: `088a226d4aed9de4809b64faa7fd49a22bbc97740750a2e5f8c1bc0a0d324e51`.
Tarball SHA-256: `17c18c6b3d246df1972f822b92292ca8c8bf2576ce7c419f6a6d7c2d8dfae95d`
(5,317,610 bytes). The package version remains 0.1.2.
