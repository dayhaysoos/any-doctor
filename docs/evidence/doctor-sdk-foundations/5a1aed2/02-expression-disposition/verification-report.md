# Checkpoint 2 verification report

Verdict: expression-disposition checkpoint green.

The host-owned `valueDisposition` query now classifies `consumed`, `transferred`,
and `discarded` outcomes or returns an explicit unknown. Async uses this interface
for its promise-array check. The shared value graph now records generator yields.
Direct return, `return await`, every-branch conditional/container return and yield
transfer ownership. `return void`, returning `.length`, direct discard and awaiting
an ordinary array remain discarded for the promise-element concern.

The four planned subjects (`return-await-array`, `return-await-inline`,
`return-choice-array`, and `yield-array`) changed from failed to passed. Their
unrelated positives remain detected. `return-void-array`, `return-length-array`,
`await-array-only`, direct discard and `Promise.all([tasks])` remain findings.

| Gate | Local passed / failed / skipped | Packed passed / failed / skipped |
| --- | --- | --- |
| Full automated suite | 568 / 0 / 0 | source tests are not shipped |
| All bundled doctors | 244 / 0 / 15 | 244 / 0 / 15 |
| Original independent behavior | 55 / 0 / 0 | 55 / 0 / 0 |
| Original location probes | 2 / 0 / 0 | 2 / 0 / 0 |
| Fresh independent cases | 13 / 7 / 0 | 13 / 7 / 0 |
| Unavailable-analysis reporting | 5 / 0 / 0 | 5 / 0 / 0 |

The seven remaining fresh failures belong to later checkpoints: four call/spread,
one inherited option, and two resource-helper cases. Local and packed results match.
Frozen Sift remains 9 findings over 671 eligible files, with all 1,530 snapshot
files matching the canonical manifest.

Candidate digest: `0abd62b7a6a5ae3544def3fde9e33e71f9b7a639a0c49294aca986404b063279`.
Async doctor SHA-256: `33ed92f3e793924a2b3339ec011d66879844498bc51450c71315a4637a019a45`.
Tarball SHA-256: `27124efd411634961005064236769e6168fe66754a69387c3c352737636b1ef7`
(5,281,998 bytes). The package version remains 0.1.2.
