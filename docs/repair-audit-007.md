# Unpublished repair: verification record

Verified September 10, 2026 against Any Doctor baseline
`62a91b6af2bdb3384235531476c1fcaaf6078233` (published 0.0.7).
The repair is an uncommitted working-tree candidate; the version remains 0.0.7.
Nothing was published. The packed artifact tested below predates only this audit
and its copied evidence files, with the same runtime, doctors, fixtures, and skill.

## Checks

- `npm test`: 286 passed, zero failed or skipped; builds TypeScript first.
- Packed Convex `verify`: 100/100 result rows passed, including location witnesses
  for all 15 checks and the shared sensitivity cases.
- Independently reproduced bare patch, unrelated `Promise.all([])`, and implicit
  arrow return cases all match their expected findings using the packed runner.
- Standards and Spec reviewers found two certification issues (overlapping
  wildcard/column witnesses and a misdeclared Node-runtime reporting unit).
  Both were repaired, covered by regressions, and confirmed resolved on re-review.
- `git diff --check` passed.

Package creation used `npm pack --ignore-scripts` after the successful build,
then installed the tarball under `/tmp/any-doctor-repair-installed` with npm.
SHA-256 of the tested tarball:
`17a54897dc7b5143efb9ecaac63c06b34c3ceea9caa04ca33204122b32b2562a`.

## Sift comparison

Target: `/Users/nickdejesus/Code/sift-skills`, commit
`3dda9d64f9432c8a21e51a1bb14f9f035cb53515`, 630 eligible files.
The existing modified `convex/_generated/api.d.ts` and untracked
`design-prototypes/` were preserved. These scans include the working tree, not
just committed source. Both runs had analysis available and zero crashes.

| Doctor | Published 0.0.7 | Packed repair |
| --- | ---: | ---: |
| Convex warnings | 56 | 46 |
| Convex informational | 169 | 61 |
| Convex total | 225 | 107 |
| Slop informational | 178 | 179 |

The 11 audited false unawaited-call findings disappear. Real discarded calls
still fail positive fixtures, including the formerly suppressed unrelated-combiner
case. The three billing collection sites at lines 1154, 1189, and 1214 remain, as
does the unbounded index scan in `convex/lib/rateLimiter.ts:73`.

The 108 generic subscription items were retired because useQuery alone cannot
establish a whole-table subscription. The 18 old generic clock findings were
replaced by a narrower query-clock check, producing 19 review candidates. No
transaction-duration finding appears in Sift; positive fixtures exercise it.

Query-chain differences were checked against source:

- `convex/tokenUsage.ts:467`: a second indexed/filter chain is now reported.
- `convex/orgs.ts:1006`: a second unbounded index cleanup is now reported.
- `convex/mcpApiKeys.ts:129`: removed from index/filter findings because the filter
  operates on the returned array after collection, not on the database builder.
- `convex/applications.ts:1507`: no longer reported because the builder is stored
  and conditionally extended across statements. This is intentional coverage
  narrowing; the code may still merit a performance review.

Slop retains all previous findings and adds one informational no-consumer candidate
for `clearSettings` in `extensions/sift-chrome/dist/src/storage/settings.js:52`.
This comes from normalizing JavaScript AST fields for scope analysis. Generated
output can still create informational noise; Slop policy was not redesigned here.

## Reproduce the packed scans

```sh
node /tmp/any-doctor-repair-installed/node_modules/any-doctor/bin/cli.js run /tmp/any-doctor-repair-installed/node_modules/any-doctor/doctors/convex-doctor.mjs /Users/nickdejesus/Code/sift-skills --format json
node /tmp/any-doctor-repair-installed/node_modules/any-doctor/bin/cli.js run /tmp/any-doctor-repair-installed/node_modules/any-doctor/doctors/slop-doctor.mjs /Users/nickdejesus/Code/sift-skills --format json
```

The [evidence directory](evidence/repair-after-0.0.7/) contains both versions'
reports and the test/verification output. Lower counts alone are not a precision
measurement. These checks establish the repaired counterexamples and bounded
behavior; they do not independently validate every remaining Sift suggestion.
See [the reliability protocol](doctor-reliability.md) for unsupported cases and
the authoring/release expectations for future doctors.
