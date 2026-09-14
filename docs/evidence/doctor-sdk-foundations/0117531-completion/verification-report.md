# Doctor SDK focused completion verification

Verdict: the bounded Doctor SDK trust and certification goal is achieved for the
four existing semantic queries, three existing recipes, confined single-file
doctors, and the evaluated Async Doctor corpus. This is not a claim of complete
JavaScript analysis and is not authorization to publish.

## Bound candidate

- Branch: `feature/doctor-sdk-foundations`
- Planning fixed point: `5a1aed20867b5bf9d884d3095d9719c9e8293625`
- Independent-review input: `e25045434bb44b89068198c83b3c0256762c6aed`
- Final source candidate: `01175319105915b93287622173330643165e8870`
- Implementation commits: `fced77d852c31087411e844348eb5ee45fcba2ac`, then `01175319105915b93287622173330643165e8870`
- Async doctor SHA-256: `1f6ea407b4783bc1f886ca4b689ee6286c05123f6cfe354dee6f7b7ee6db60ca`

## Passed

| Gate | Local passed / failed / skipped | Packed passed / failed / skipped |
| --- | --- | --- |
| Automated suite | 576 / 0 / 0 | source tests are not shipped |
| Bundled doctor verification | 265 / 0 / 15 | 265 / 0 / 15 |
| Original independent behavior | 55 / 0 / 0 | 55 / 0 / 0 |
| Exact-location witnesses | 2 / 0 / 0 | 2 / 0 / 0 |
| Fresh independent cases | 20 / 0 / 0 | 20 / 0 / 0 |
| Analysis-unavailable assertions | 5 / 0 / 0 | 5 / 0 / 0 |
| Async recipe profiles | 21 / 0 / 0 | 21 / 0 / 0 |

The bundled total increased from 263 to 265 because the resource profile now has
two additional required adversaries: different-handle release and supported
local cleanup transfer. The 15 legacy skips are unchanged.

All three mutation probes failed certification for their intended reason in both
the local and installed-package copies: broken identity, unknown mapped to
absence, and suppressed reporting. Import-only option declarations and
import-acquisition/global-owner resource declarations generate nonempty profiles;
unmaterializable identity declarations fail the claim contract explicitly.

## Unknown reporting and provenance

The escaped-options counterexample now produces no false clean grade. Its exact
unknown-only test has zero findings, `semantic.incomplete: true`, and null score
and grade. The paired probe adds an unrelated real fetch absence and preserves
that one finding while retaining the `unsupported-expression` narrowing in both
local and packed output. Human output names the check and reason.

Run provenance records semantic protocol v1, provider
`any-doctor/syntax-flow@1`, resolved `oxc-parser` and scope-provider versions,
availability for every declared capability and recipe, aggregated narrowing
reasons, affected files and occurrences, and execution/cache counters.

## Frozen Sift and performance

The frozen target matches all 1,530 manifest entries before and after evaluation.
Local and packed scans both cover 671 eligible files and return the same nine
findings: eight informational fetch cancellation candidates and one timer-lifetime
review candidate. Finding lists and semantic narrowing data are byte-equivalent
between local and packed JSON projections.

Three comparable runs against the preserved checkpoint-0 package and the final
candidate produced median wall times of 4,355 ms and 5,290 ms respectively: a
1.215x ratio, within the 2x acceptance target. The retained pre-repair candidate
was approximately 31.9 seconds. Each repaired run answered 45,453 bounded
semantic questions from 671 per-file model requests, with 45,462 cache hits.

The frozen scan is intentionally reported as narrowed rather than graded. It has
5,384 unresolved-identity occurrences across 394 files for the fetch recipe, 933
unsupported array-map receiver/flow occurrences across 239 files, and 51
unsupported fetch-option occurrences across 32 files. These are aggregated
coverage limits, not findings, and no positive is suppressed by them.

## Package provenance

- Artifact: `any-doctor-0.1.2.tgz`
- Size: 272,068 bytes
- SHA-256: `77e8ceb547eef291be3cdede63ca9874c12dc5aac8009bb74351784e53133982`
- Files: 142

The artifact was packed from final source commit `0117531…` after all shipped
source and public documentation changes were committed. A second repack of the
same commit is byte-identical. `docs/doctor-sdk.md` is present; `docs/evidence/`
and `docs/plans/` are absent. The artifact was installed into a clean consumer
and was not published.

## Remaining limits

The syntax provider remains conservative for mutation, reassignment, getters,
dynamic properties, opaque external consumers, unsupported owners, local type
aliases and cross-file wrappers. Unresolved local callees offered to the fetch
recipe remain unknown. Transfer does not prove completion. Frozen Sift contains
no retained real positive for async-map handling, so that behavior continues to
depend on independently labeled synthetic and held-out cases.

No required gate failed. The remaining unknowns are now visible and provenance-
bound; they are not represented as a clean score.
