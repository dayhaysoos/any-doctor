# Checkpoint 7 verification report

Verdict: automatic recipe challenge profiles checkpoint green.

Checks now declare a recipe name and its serializable configuration in metadata.
Certification deterministically selects a maintained profile for each declaration.
Profiles cover a genuine positive, valid lookalike or shadowed identity, alias or
transfer, an unsupported case beside an unrelated positive, two exact same-line
occurrences, and analysis-unavailable behavior. Author fixtures, shared corpora,
location witnesses and held-out evaluation remain separate rows.

Human verification names every profile. `verify --format json` now emits the
same named rows as parseable `VerifyRunResult` data; `verify --all --format json`
emits a cohort result. Both the local and freshly installed packed Async doctor
report 16 exercised profiles passed, 0 failed, and 3 explicitly named
unavailable-analysis paths.

The mutation harness copied the built candidate into disposable consumers and
retained only sanitized failures:

- broken local identity: nonzero exit; the shadowed-call profile failed;
- unknown option flow mapped to absence: nonzero exit; the unknown-options
  positive-neighbor profile failed;
- recipe reporting suppressed: nonzero exit; genuine-positive profiles failed.

The working source was never mutated by the harness. The restored candidate
passes every profile locally and packed.

| Gate | Local passed / failed / skipped | Packed passed / failed / skipped |
| --- | --- | --- |
| Full automated suite | 573 / 0 / 0 | source tests are not shipped |
| All bundled doctors | 260 / 0 / 18 | 260 / 0 / 18 |
| Original independent behavior | 55 / 0 / 0 | 55 / 0 / 0 |
| Original location probes | 2 / 0 / 0 | 2 / 0 / 0 |
| Fresh independent cases | 20 / 0 / 0 | 20 / 0 / 0 |
| Unavailable-analysis reporting | 5 / 0 / 0 | 5 / 0 / 0 |

Frozen Sift remains the same 9 source-adjudicated findings over 671 eligible
files; all 1,530 frozen files match the canonical manifest.

Candidate digest: `00be1e2faba9b7a7aa95fd36fd8055721475c422dac7edd259ac3ef3cbaad12d`.
Async doctor SHA-256: `1f6ea407b4783bc1f886ca4b689ee6286c05123f6cfe354dee6f7b7ee6db60ca`.
Tarball SHA-256: `75cd453b5e6d61243e00bbb82f36a4b7f8ea3dae0e532889cb5d27b2a9a8ccdf`
(5,472,703 bytes). The package version remains 0.1.2.
