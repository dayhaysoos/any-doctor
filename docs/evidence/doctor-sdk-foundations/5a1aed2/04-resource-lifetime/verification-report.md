# Checkpoint 4 verification report

Verdict: resource lifetime checkpoint green.

The host now classifies exact acquisition handles as released, unreleased, or
unknown within a supported owner function. It follows direct cleanup, local
cleanup helpers, returned cleanup factories, and mutable handle assignment. It
keeps conditional cleanup, opaque cleanup flow, and analysis outside the
declared owner visible as unknown instead of treating them as confirmed absence.

The two planned timer-helper subjects changed from failed to passed. Wrong-handle,
overwritten-handle, uncalled-helper, conditional-cleanup, and opaque-cleanup
controls retain their original labels. The frozen Sift `useTypewriter` case no
longer produces a new false positive; its function boundary is not confused with
conditional cleanup in the enclosing scope.

| Gate | Local passed / failed / skipped | Packed passed / failed / skipped |
| --- | --- | --- |
| Full automated suite | 569 / 0 / 0 | source tests are not shipped |
| All bundled doctors | 244 / 0 / 15 | 244 / 0 / 15 |
| Original independent behavior | 55 / 0 / 0 | 55 / 0 / 0 |
| Original location probes | 2 / 0 / 0 | 2 / 0 / 0 |
| Fresh independent cases | 19 / 1 / 0 | 19 / 1 / 0 |
| Unavailable-analysis reporting | 5 / 0 / 0 | 5 / 0 / 0 |

The sole remaining fresh failure is `fetch-prototype-signal`, assigned to
checkpoint 5. Local and packed results match. Frozen Sift remains 9 findings over
671 eligible files, and all 1,530 files match the canonical manifest.

Candidate digest: `37195182a53262a598ffa69304ded588338606b1e035e23c47deb9eb57e0dc07`.
Async doctor SHA-256: `afdc399e83a1127e7132ce33c06207ba8458faa14be74ae9ad1688bb0165149d`.
Tarball SHA-256: `37eea8f99ba27d1a4ca6a932ad2975b3dbdb4edd9bf1bda47af2cd572ac7be55`
(5,355,802 bytes). The package version remains 0.1.2.
