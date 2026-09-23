# Feature map

Updated September 22, 2026. This is the current availability map for the
published `0.2.0` line. Historical choices remain in [decisions.md](decisions.md);
implementation evidence remains under [evidence](evidence/).

## Available

### Run and review

- Local, user-global and bundled doctor discovery; local doctors win slug
  collisions.
- Interactive selection and review, direct doctor runs, all-doctor runs, stable
  JSON, and investigation-first prompts for a user's own agent.
- Optional CI severity gates. Crashes, broken doctors and unsafe skips always
  fail independently of the severity bar.
- Test files excluded by default and included explicitly with `--include-tests`.

### Identity and decisions (M1 + M2)

- Identity-aware `--base` comparison: added, continuing and no-longer-detected
  occurrences, with ambiguous, content-fallback, line-scoped and stale evidence
  reported rather than hidden.
- Remembered local accepted/not-applicable decisions with required reasons,
  created from the dashboard or `decide`, inspected and reversed with
  `decisions`.
- Exact-evidence application: changed source or incompatible doctor provenance
  resurfaces a decision for reassessment; duplicate identities do not receive an
  unsafe suppression.
- Active review lists can hide applicable decisions, while raw findings remain
  available and CI gates continue to judge raw findings.
- Lazy state creation at `<target>/.any-doctor/decisions.local.json`; ordinary
  scans require no initialization and create no state.

### Authoring and analysis

- Agent authoring instructions, scaffolding, fixture verification, shared
  innocent/sensitivity corpora, per-check coverage and maintained recipe
  challenge profiles.
- Bounded structural and semantic facts for bindings, spans, calls, identity,
  value disposition, resource lifetime, option presence, project consumers and
  structural fingerprints.
- Value Path (`ctx.analysis.valueAtPath`) for a static property path at a source
  observation. It returns present, absent or explicit uncertainty and is used by
  the bundled Deepgram and OpenRouter doctors.
- Locally complete recipes registered once for runtime evaluation, authoring
  metadata and certification challenges.
- Bundled Async, Convex, Deepgram, Effect, OpenRouter and Slop doctors.
- A completed bundled-doctor modernization audit: every check declares its
  shared analysis needs and unknown policy; [the doctor matrix](doctor-modernization.md)
  records which mechanics are shared and which technology policy remains local.

## Adoption phase

The immediate product work is real-repository testing: usefulness, false
positives, narrowed cases, first-attempt custom doctor yield and decision use.
Small `0.2.x` documentation, reliability and usability repairs should be driven by
those observations rather than by an open-ended analysis expansion.

## Next planned lifecycle slice: M3

M3 shares selected project decisions through reviewable Git-tracked records and
applies them consistently in fresh checkouts and CI. Local decisions remain
private. The slice must define conflict handling, branch switching, doctor
identity across authors, read-only CI behavior and the relationship between
reviewed state and score presentation.

See the [proposal](plans/finding-lifecycle/proposal.md),
[design](plans/finding-lifecycle/design.md), and
[milestones](plans/finding-lifecycle/milestones.md). M3 is planned, not shipped.

## Later, separately scoped

- M4 bounded finding observations and history: first/last seen, reappeared and
  comparable no-longer-detected views with explicit retention limits.
- Additional Doctor SDK or Value Path coverage, triggered by reproduced real
  false positives or missed findings rather than speculative JavaScript semantics.
- A second language provider and adapter boundary, triggered by an actual second
  language implementation.
- Hosted team history, public registry expansion, issue-tracker integration and
  automatic code modification. None is required for local scanning or decisions.

Historical plans and evidence may name older branches, package versions and
counts. Their status headers identify them as completed records; they are not the
current feature map.
