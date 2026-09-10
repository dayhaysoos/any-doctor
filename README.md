# any-doctor

> Your agent writes the doctor. Inspect its findings. Remember what matters.

Any Doctor helps you and your agent find recurring problems in AI-written code
beyond ordinary lint configurations. **Doctors** are small deterministic analysis
programs that surface concrete concerns and codebase-specific conventions.

When none of them covers the convention you keep explaining in code review,
your own agent writes a doctor for it against a typed `ctx` API, with positive
examples and valid lookalikes. Run it after coding, inspect the evidence, and
rescan after changes. Saved doctors run without model inference.

Analysis runs locally without an account, API key, or telemetry. Package/tool
installation can require downloads; the doctor runtime has no network access.
Remembered decisions and finding history are [planned](docs/plans/finding-lifecycle/proposal.md),
not available yet.

[![npm version](https://img.shields.io/npm/v/any-doctor.svg)](https://www.npmjs.com/package/any-doctor)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](#)

## Quick start

```bash
npx any-doctor@latest
```

That's it — a selector lists every doctor (bundled plus anything in your
repo's `doctors/`), you pick with the space bar, `a` takes all, and the
findings land in an interactive review tree: doctors → checks → findings,
each with impact, why, fix, and the honest blind spots. `enter` copies a
fix prompt for your agent.

```bash
npx any-doctor@latest run slop-doctor   # one doctor, straight to the report
```

Non-terminals and CI never see a prompt — output is stable and pipeable
(`--format json`, or `ANY_DOCTOR_HEADLESS=1`).

## The bundled pack

| Doctor | Discipline | Checks |
|---|---|---:|
| **slop-doctor** | The recurring failures of LLM-written code: identical helpers copied across modules, dead exports, unread bindings, hostname-sniffed environments, careless substring matching, collapsed boolean states | 8 |
| **convex-doctor** | Convex discipline: indexed reads, bounded collects, validated args, awaited writes, honest runtime boundaries | 15 |
| **effect-v4-doctor** | Effect v4 discipline — the mechanical rules of the [kitlangton Effect skill](https://www.ui-skills.com/skills/kitlangton/effect), enforced | 10 |
| **openrouter-doctor** | OpenRouter discipline: stream errors surfaced, keep-alives skipped, cancellations that stop billing | 5 |
| **async-doctor** | Async and concurrency: dropped promise results, uncleared timers, fetch hygiene | 3 |

Checks ship positive and innocent-lookalike fixtures. `verify` compares an
exact multiset of rule/file/line and optional column, then runs shared innocent
and sensitivity corpora. Convex checks also declare per-check location coverage;
legacy undeclared coverage is reported as not exercised. Passing fixtures show
agreement on those cases, not a general accuracy guarantee. See
[the reliability protocol](docs/doctor-reliability.md).

## Write your own

```bash
npx any-doctor@latest generate "find .map(async ...) results that are never awaited"
```

`generate` plants the authoring skill as `AGENTS.md` (agents load it
natively) and copies a prompt. Paste it into any agent session. The agent
writes two files:

- `doctors/your-doctor.mjs` — the analyzer: `meta` (checks, blind spots,
  severity) + `doctor(ctx)`. One self-contained file; `ctx` is its entire
  world (files, structural search via ast-grep, binding analysis, findings).
- `doctors/your-doctor.fixtures.mjs` — regression evidence: seed codebases plus the
  findings the doctor must produce, and the lookalikes it must ignore.

Then the loop agents love:

```bash
npx any-doctor@latest verify doctors/your-doctor.mjs
#   ✖ flags a bare discarded map result
#     missing expected finding src/a.ts:3        ← your error list
#   ✔ accepts an awaited result
```

`missing` and `unexpected` identify failures against the labeled fixture cases;
the exit code stays non-zero until every fixture passes. The skill teaches the sharp edges
(scope-analysis semantics, fixture-seed worlds, the adversarial
counter-fixture pass). Passing these cases does not measure general accuracy.
No project install needed; `verify` sandboxes the doctor runs.

## CI: the gate

```bash
npx any-doctor@latest run --all --fail-on warning --base origin/main
```

- `--fail-on none|error|warning|info` — the severity bar
- `--base <git ref>` — a stateless diff baseline: **only findings your
  change introduced fail the build**, not your existing backlog
- `--format json` — machine output for pipelines

```yaml
# .github/workflows/doctor.yml
- run: npx any-doctor@latest run --all --fail-on warning --base origin/main
```

## Why trust a finding

- **Repeatable analysis.** Hold source contents, doctor implementation, engine
  versions, configuration, and capabilities fixed when comparing runs. No model
  runs at scan time.
- **Executable evidence.** Run `verify` to test declared cases and shared
  counterexamples. Discovery is not proof that a doctor passed verification;
  independent real-code evaluation is still needed.
- **Specific claims.** A finding can establish a defect, flag a project convention,
  or identify a review candidate. Its evidence should support that interpretation;
  a suggested change can still require judgment.
- **Blind spots are data.** Every doctor declares what it cannot see, and
  the report renders those declarations beside the findings.
- **Doctors are confined.** The runtime capability gate refuses to execute
  a doctor that imports, writes, spawns, or touches the network — a
  malicious doctor is refused before it runs, with no override.
- **The score summarizes files without reported findings**, per doctor and overall.
  It is not a probability of correctness or proof that unexamined code is safe.

## Docs

| Doc | What it holds |
|---|---|
| [skill/any-doctor.skill.md](skill/any-doctor.skill.md) | The authoring contract — what your agent reads to write doctors |
| [CONTEXT.md](CONTEXT.md) | Domain glossary — canonical terms |
| [docs/vision.md](docs/vision.md) | Current goals and product direction |
| [docs/features.md](docs/features.md) | Available features versus planned work |
| [docs/plans/analysis-improvements.md](docs/plans/analysis-improvements.md) | Next slice: source evidence, identity, and reliable Git-base comparisons |
| [docs/plans/finding-lifecycle/proposal.md](docs/plans/finding-lifecycle/proposal.md) | Planned decisions, history, and team workflows |
| [docs/plans/finding-lifecycle/design.md](docs/plans/finding-lifecycle/design.md) | State ownership, SQLite, Git convergence, and open choices |
| [docs/plans/finding-lifecycle/milestones.md](docs/plans/finding-lifecycle/milestones.md) | Implementation slices and acceptance evidence |
| [docs/HANDOFF.md](docs/HANDOFF.md) | Current handoff and next bounded task |
| [docs/decisions.md](docs/decisions.md) | Historical choices and explicit supersessions |
| [docs/kill-test.md](docs/kill-test.md) + [docs/RESULTS.md](docs/RESULTS.md) | The validation experiment and its numbers |
| [docs/REPAIR-LOG.md](docs/REPAIR-LOG.md) | Generation-bug categories — feeds the authoring skill |
| [docs/example-catalog.md](docs/example-catalog.md) | Rule intents across the JS ecosystem |

## Status

Pre-1.0. The next direction is reliable finding identity, remembered decisions,
team sharing, and bounded local history. Scanning stays available through npx
without mandatory initialization. See the [feature map](docs/features.md) for
current availability. MIT.
