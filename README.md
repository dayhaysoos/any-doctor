# any-doctor

> Your agent writes the analyzer. Fixtures prove it. CI reruns it forever.

Your LLM writes code fast and roughly. **Doctors** are small deterministic
programs that catch what it keeps getting wrong — and any-doctor ships with
five of them covering the disciplines LLMs fumble most.

When none of them covers the convention you keep explaining in code review,
your agent writes a new doctor for it — against a typed `ctx` API, gated by
fixtures, rerun forever in CI with zero inference. **A skill without a doctor
is a suggestion.**

Everything runs locally. No account, no API key, no telemetry, no network.

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
- `doctors/your-doctor.fixtures.mjs` — the proof: seed codebases plus the
  findings the doctor must produce, and the lookalikes it must ignore.

Then the loop agents love:

```bash
npx any-doctor@latest verify doctors/your-doctor.mjs
#   ✖ flags a bare discarded map result
#     missing expected finding src/a.ts:3        ← your error list
#   ✔ accepts an awaited result
```

`missing` fails recall, `unexpected` fails precision, the exit code stays
non-zero until every fixture passes — and the skill teaches the sharp edges
(scope-analysis semantics, fixture-seed worlds, the adversarial
counter-fixture pass) so the loop converges fast. No install needed;
`verify` sandboxes everything.

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

- **Deterministic.** The same doctor on the same commit produces the same
  report — no model runs at scan time, ever.
- **Fixtures gate everything.** A doctor that hasn't passed `verify` doesn't
  exist; discovery lists it as broken, not as a tool.
- **Blind spots are data.** Every doctor declares what it cannot see, and
  the report renders those declarations beside the findings.
- **Doctors are confined.** The runtime capability gate refuses to execute
  a doctor that imports, writes, spawns, or touches the network — a
  malicious doctor is refused before it runs, with no override.
- **The score is the share of clean files**, per doctor and overall —
  health and work are reported together, never conflated.

## Docs

| Doc | What it holds |
|---|---|
| [skill/any-doctor.skill.md](skill/any-doctor.skill.md) | The authoring contract — what your agent reads to write doctors |
| [CONTEXT.md](CONTEXT.md) | Domain glossary — canonical terms |
| [docs/decisions.md](docs/decisions.md) | Decision log (D1–D20). Read first; don't relitigate |
| [docs/vision.md](docs/vision.md) | The product idea and lifecycle novelty |
| [docs/kill-test.md](docs/kill-test.md) + [docs/RESULTS.md](docs/RESULTS.md) | The validation experiment and its numbers |
| [docs/REPAIR-LOG.md](docs/REPAIR-LOG.md) | Generation-bug categories — feeds the authoring skill |
| [docs/example-catalog.md](docs/example-catalog.md) | Rule intents across the JS ecosystem |

## Status

Pre-1.0 and moving fast — the decision log is the honest history. Next on
the ladder: the registry (`any-doctor add <slug>`), adoption (`init`), and
a growing pack. MIT.
