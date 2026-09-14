# Checkpoint 1 verification report

Verdict: semantic-result and identity checkpoint green.

## Delivered behavior

`DoctorCtx.analysis.identity` now crosses the existing confined analysis channel.
The host resolves exact expression coordinates through immutable aliases and returns
semantic result version 1: either a known global, import, or local identity with
bounded source-digest evidence, or a named unknown reason. Local and shadowed
lookalikes are known non-matches. Unresolved names and unsupported expressions are
unknown; they cannot enter Async's absence-reporting path.

Async's native-fetch decision is the first real consumer. The check declares its
identity need, and the existing machine `narrowed` list and prose notice name it
when analysis is unavailable. The forced-unavailable gate emits no findings and
passes 5/0/0. Existing custom doctors remain additive-compatible and all bundled
doctors still load and verify.

## Gate

| Gate | Local passed / failed / skipped | Packed passed / failed / skipped |
| --- | --- | --- |
| Full automated suite | 567 / 0 / 0 | source tests are not shipped |
| All bundled doctors | 244 / 0 / 15 | 244 / 0 / 15 |
| Original independent behavior | 55 / 0 / 0 | 55 / 0 / 0 |
| Original location probes | 2 / 0 / 0 | 2 / 0 / 0 |
| Fresh independent cases | 9 / 11 / 0 | 9 / 11 / 0 |
| Unavailable-analysis reporting | 5 / 0 / 0 | 5 / 0 / 0 |

The eleven fresh failures are unchanged checkpoint inputs; this checkpoint does
not claim their repair. Every fresh positive neighbor remains detected. Local and
packed results match exactly. Frozen Sift remains 9 findings over 671 eligible
files, and all 1,530 snapshot files still match the canonical manifest.

Candidate digest: `585c03d0d61aced2a51c990cfbbb5df05731d4090e7ce1f2d6bd0920665fee13`.
Async doctor SHA-256: `bec4a9bd293993bf19c5444809fb9d104872c9e1024e6405730c5d218d0dadd0`.
Tarball SHA-256: `e890aafda81e1ebe9bd2af11c6da87244e006f4294e0f47539f231f40bee43b6`
(5,236,530 bytes). The package version remains 0.1.2.

`summary.json` binds the candidate files, generated runtime, tarball, counts and
commands. Installed dependencies and the tarball remain outside the repository.
