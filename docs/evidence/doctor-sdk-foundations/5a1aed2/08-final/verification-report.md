# Checkpoint 8 final verification report

Verdict: Doctor SDK foundations are green through checkpoint 8 and ready for
independent review. This is implementation-authored evidence, not universal
correctness and not authorization to publish.

## Bound candidate

- Branch: `feature/doctor-sdk-foundations`
- Planning commit: `5a1aed20867b5bf9d884d3095d9719c9e8293625`
- Gate input HEAD: `1b2288bcc5704277cbc2e64686f19eb2822d6841`
- Candidate digest: `d63384252f1bc9d6ee70bdd9458c0834a9c81978b54701c043db593363eefe6b`
- Async doctor SHA-256: `1f6ea407b4783bc1f886ca4b689ee6286c05123f6cfe354dee6f7b7ee6db60ca`
- Semantic provider SHA-256 (`bin/doctor-sdk.js`): `ffa00e7177a936b74bdc29cb47330e4927a82a6686436a9506ff982dbc9ccef3`
- Analysis host SHA-256: `4cb831a41d4c245b70c87da9e0dc35e7e40e0dd9a28ca75c39974a7476e9a0f5`
- Certification provider SHA-256: `79ef5fcb90911c04debe5709d97ddd2cf038be23c66008e2afbb28154f63082b`
- Tarball SHA-256: `bd68ff182ffbef8686d08a1876a183934e94ebf0105ffddee35c3eed65553392`
  (5,568,622 bytes, package version unchanged at 0.1.2)

The working-file manifest records 235 candidate files and their individual hashes.
Checkpoint-8 documentation and evidence are archived beside it; the digest's
scope is stated in the manifest.

## Ordered checkpoint commits

1. `0610de77c68bd9651bed5881111cb7ad01420681` — fixed baseline
2. `550c4f3291c6c40fbd177688127dc55c91ea151c` — semantic result and identity
3. `6a3fed701e934e47b9c24cab73e821283af4b802` — expression disposition
4. `6fb50ad5abf00cad14dd6d5be483749ab37d942c` — call and helper transfer
5. `9d849cd0d371f40f827344a6bcc4ed8a592d6d84` — resource lifetime
6. `d4ea99895c71abf795f39fd37557610259eb1c20` — option presence
7. `ba6adb0576315070982a974603d2ed0d8b754187` — reusable recipes
8. `1b2288bcc5704277cbc2e64686f19eb2822d6841` — automatic challenge profiles
9. This report's containing commit — final assembly and authoring guide

## Final matrix

| Gate | Local passed / failed / skipped | Packed passed / failed / skipped |
| --- | --- | --- |
| Full automated suite | 573 / 0 / 0 | source tests are not shipped |
| All bundled doctors | 263 / 0 / 15 | 263 / 0 / 15 |
| Original independent behavior | 55 / 0 / 0 | 55 / 0 / 0 |
| Original location probes | 2 / 0 / 0 | 2 / 0 / 0 |
| Fresh independent cases | 20 / 0 / 0 | 20 / 0 / 0 |
| Unavailable-analysis assertions | 5 / 0 / 0 | 5 / 0 / 0 |
| Async recipe profiles | 19 / 0 / 0 | 19 / 0 / 0 |

The 19 profile rows include three named analysis-unavailable paths that were
executed and passed; they are not skips. The all-doctor skipped count therefore
remains the original 15 unrelated coverage rows. Local and packed findings match.

The original and fresh runners are byte-identical to checkpoint 0. Their result
JSON retains every label, expected count, actual finding and unrelated positive
control. The fresh progression is preserved in checkpoints 1-5 rather than
overwritten by the final 20 / 0 result.

## Frozen Sift adjudication

All 1,530 frozen files match manifest digest
`336f413f63936775224d5f9c8c1f5ba9abe9a465c9ef300fba93fac3657797f2`.
The baseline, final local and final packed scans each report the same 9 findings
over 671 eligible files: 8 informational fetch cancellation-policy candidates
and 1 timer-lifetime review candidate. Retained: 9; removed: 0; added: 0.

All nine remain source-adjudicated review candidates. The timer deliberately
removes a theme-transition class after completion, so adding cancellation could
be wrong. The fetch calls establish no caller signal, but their desired deadline
or cancellation policy is not inferred. There is no known false assertion in the
evaluated original, fresh, profile or frozen-Sift corpora.

## Performance and size

On the fixed 671-file Sift target, baseline analysis duration / wall time was
4,871 ms / 5.88 s. Final local was 31,580 ms / 31.95 s; final packed was
31,956 ms / 32.33 s. Local wall time increased 443.4%. Maximum resident memory
was nearly flat (+0.1% local, +1.1% packed), while macOS peak footprint increased
26.3% local and 30.4% packed. The tarball increased 405,727 bytes (7.9%); the
current package allowlist ships the accumulated evidence under `docs`.

The wall-time regression is a known limit of synchronous per-occurrence host
round trips, not hidden as a green performance result. Optimizing it needs a
future batched-query seam; it does not justify weakening the semantic labels.

## Remaining limits

Unknown mutation, reassignment, getters, dynamic properties, opaque consumers,
unsupported owners and cross-file wrappers remain visible or abstain. Renamed
timer acquisitions are not independently selected as leak candidates. Unknown
array receivers and local type aliases are not promoted to native arrays. The
adapter is not a type checker or whole-program interpreter, and transfer is not
completion. Frozen Sift contains no real positive for the async-map rule, so that
rule's positive evidence is synthetic and counterexample-based rather than a
retained Sift occurrence.

Detailed missed candidates, unknowns and coverage limits are in
`limitations.json`. Exact source and packed retest commands are in
`independent-retest.md`.
