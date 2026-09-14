# Checkpoint 0 verification report

Verdict: fixed baseline reproduced. This checkpoint changes no product behavior.

## Candidate

- Branch: `feature/doctor-sdk-foundations`.
- HEAD: `5a1aed20867b5bf9d884d3095d9719c9e8293625`.
- Starting tree: clean.
- Node: v26.5.0; npm: 11.17.0; package version unchanged at 0.1.2.
- Async doctor SHA-256: `91373d7dfaa63d24c370078c7d4f0e8eba639adb89c8439317be8147b806b7c6`.
- Working-file manifest digest: `e1c4ef6746fd9ee9287b464c9f1a1d1aeba3ceb6b8ee16da23871e1bcad7c1ee`.
- Packed tarball SHA-256: `8ba12de8873b3b0aa47b65a8c6922585f19893dacc3cc717a319536a9ec0ecd4`; 5,162,895 bytes.

`manifest.json` records every candidate file and provider package digest. Original
and fresh runner inputs were copied unchanged before execution. Installed dependency
trees and the tarball remain outside the repository.

## Results

| Gate | Local passed / failed / skipped | Packed passed / failed / skipped |
| --- | --- | --- |
| Full automated suite | 565 / 0 / 0 | source tests are not shipped |
| All bundled doctors | 244 / 0 / 15 | 244 / 0 / 15 |
| Original independent behavior | 55 / 0 / 0 | 55 / 0 / 0 |
| Original location probes | 2 / 0 / 0 | 2 / 0 / 0 |
| Fresh independent cases | 9 / 11 / 0 | 9 / 11 / 0 |

All 20 fresh cases retain and detect their unrelated same-rule positive control.
The eleven unchanged failures are `return-await-array`, `return-await-inline`,
`return-choice-array`, `yield-array`, `spread-helper-consumption`,
`spread-opaque-consumption`, `push-spread-consumption`,
`combiner-spread-arguments`, `fetch-prototype-signal`,
`timer-cleanup-call-parameter`, and `timer-cleanup-factory`.

The fresh Python command exits zero by design. Its JSON contains 9 passed and 11
failed expectations; the failed labels are preserved and are the checkpoint gate.
Local and packed results are identical.

## Frozen Sift

All 1,530 files match the canonical manifest. Local and packed scans each cover
671 eligible files and return the same nine findings. `sift-source-adjudication.json`
retains the source excerpts and classifications: eight informational fetch policy
review candidates and one contextual timer review candidate. None is classified
as a confirmed defect. No frozen or live Sift file was modified.

The baseline timed local scan took 5.88 seconds real time, reported 651,821,056
bytes maximum resident set size and a 773,349,256-byte peak footprint. These are
single-run measurements for later comparison, not a performance guarantee.

## Preserved limits

The local array type-alias promise case and runtime-string fetch case remain missed
candidates. Cleanup-factory support remains an unnecessary warning in this candidate.
Cross-file helpers, arbitrary mutation and complete control flow remain outside the
declared coverage. Unknowns are not treated as absence.
