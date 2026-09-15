# Convex SDK migration boundary probes

These are executable **red contract counterexamples**, not a completed migration or a replacement for inherited fixtures. Run from the repository root with the analysis provider installed:

```sh
node dev/convex-sdk-migration/run-guardrails.mjs . /tmp/convex-guardrails-new
node dev/convex-sdk-migration/probe-recipes.mjs .
node dev/convex-sdk-migration/repro-unavailable.mjs
```

Use a fresh output directory for each guardrail invocation. Substitute the absolute installed `node_modules/any-doctor` path for `.` to test a packed consumer. The runner uses that candidate's CLI and Convex Doctor, never a published package or project code execution.

Foundation `0ace1b694077c04eb9e7d958d40cbdaf50d42883` produces:

- Guardrails: 45 passed / 18 failed / 0 skipped; exit 1.
- Recipe compatibility: 2 passed / 0 failed; exit 0. These assertions confirm incompatibility, not successful recipe migration.
- Unavailable-provider metadata probes: 0 passed / 2 failed; exit 1. Both declared `onUnknown` policies fail the desired custom-check coverage contract. This probe uses the local SDK's controlled provider-off seam; the fresh optional-dependency consumer supplies separate real installation evidence.

The 63 guardrails cover each check's positive, local registration lookalike, conditional registration beside a positive, and same-line occurrences, plus opaque config/range/API cases. Locations come from source anchors, not scanner output. Each unknown requires exactly one check/file/reason occurrence. These controls are not the full requested adversarial matrix. Existing Convex fixtures and `dev/convex-analysis` seeds remain unchanged.

All production files remain at the foundation. See `docs/evidence/convex-sdk-migration/report.md` for the blocked verdict, baseline source adjudications and limitations. Do not change expectations to make the counterexamples green.
