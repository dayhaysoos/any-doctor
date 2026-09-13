# Labeled CLI regression results

These are implementation-authored labels, including retained review counterexamples.
A PASS on parse-failure means the expected loud failure occurred. Unknown cases
pass only through documented abstention/coverage, not a claim that code is clean.

| Case | Published 0.1.2 | Candidate | Observed candidate exports / duplicates |
| --- | --- | --- | --- |
| test-consumer-default | FAIL | PASS | ; duplicates=0 |
| test-consumer-included | PASS | PASS | ; duplicates=0 |
| renamed-barrel | FAIL | PASS | ; duplicates=0 |
| reexport-without-final-caller | FAIL | PASS | ; duplicates=0 |
| same-name-positive | FAIL | PASS | a.ts:helper; duplicates=0 |
| same-basename-dynamic | FAIL | PASS | a/helper.ts:helper; duplicates=0 |
| generated-target | FAIL | PASS | ; duplicates=0 |
| generated-consumer | PASS | PASS | ; duplicates=0 |
| type-only-consumer | PASS | PASS | ; duplicates=0 |
| type-only-named | FAIL | PASS | ; duplicates=0 |
| default-alias | FAIL | PASS | ; duplicates=0 |
| star-cycle | PASS | PASS | ; duplicates=0 |
| namespace-member | PASS | PASS | a.ts:unused; duplicates=0 |
| namespace-escape | FAIL | PASS | ; duplicates=0 |
| shadowed-namespace | FAIL | PASS | a.ts:helper; duplicates=0 |
| tsconfig-alias | PASS | PASS | ; duplicates=0 |
| package-entry | FAIL | PASS | ; duplicates=0 |
| declared-framework-entry | FAIL | PASS | ; duplicates=0 |
| extension-index | PASS | PASS | ; duplicates=0 |
| genuine-positive | PASS | PASS | a.ts:helper; duplicates=0 |
| unknown-dynamic | FAIL | PASS | ; duplicates=0 |
| unresolved-relative | FAIL | PASS | a.ts:helper; duplicates=0 |
| parse-failure | FAIL | PASS | ; duplicates=0 |
| literal-whitespace | FAIL | PASS | ; duplicates=0 |
| template-whitespace | FAIL | PASS | ; duplicates=0 |
| regex-whitespace | FAIL | PASS | ; duplicates=0 |
| substantial-duplicate | PASS | PASS | ; duplicates=2 |
| trivial-long-signature | FAIL | PASS | ; duplicates=0 |
| workspace-package-entry | PASS | PASS | ; duplicates=0 |
| excluded-test-consumer | PASS | PASS | a.ts:helper; duplicates=0 |
| same-line-surrounding-code | FAIL | PASS | ; duplicates=2 |
| format-and-comments | FAIL | PASS | ; duplicates=2 |
| different-captured-bindings | FAIL | PASS | ; duplicates=2 |
| unsupported-config | FAIL | PASS | ; duplicates=0 |
| dynamic-namespace-binding | FAIL | PASS | a.ts:unused; duplicates=0 |
| dynamic-destructuring | FAIL | PASS | a.ts:unused; duplicates=0 |
| default-reexport-chain | PASS | PASS | ; duplicates=0 |
| local-export-specifier-positive | FAIL | PASS | a.ts:helper; duplicates=0 |
| dynamic-then-member | FAIL | PASS | a.ts:unused; duplicates=0 |
| vitest-config-entry | PASS | PASS | ; duplicates=0 |
| nitro-plugin-entry | PASS | PASS | ; duplicates=0 |
| plugin-name-lookalike | FAIL | PASS | a.ts:default; duplicates=0 |
| review-tagged-template-raw | FAIL | PASS | ; duplicates=0 |
| review-destructured-export-shadow | FAIL | PASS | a.ts:helper; duplicates=0 |
| review-array-export-shadow | FAIL | PASS | a.ts:helper; duplicates=0 |
| review-stored-import-promise | PASS | PASS | ; duplicates=0 |
| review-nested-import-type | PASS | PASS | ; duplicates=0 |
| import-equals-uncertainty | FAIL | PASS | ; duplicates=0 |
