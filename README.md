# any-doctor

> Your agent writes the analyzer. Fixtures prove it. CI reruns it forever.

Any Doctor turns a one-sentence convention ("find `.map(async ...)` results
that are never awaited") into a **doctor program** — a small piece of
analysis code your LLM writes against our typed `ctx` API. The CLI runs it
and renders a React-Doctor-style report: score, grouped findings with
file:line evidence, declared blind spots, an interactive review browser,
and a copy-paste handoff so your agent can fix what was found. The saved
program reruns deterministically in CI with zero inference.

Any Doctor equips agents; it never deploys them. Everything runs locally.
No Cloudflare, no API keys, no server.

## Usage

```bash
any-doctor generate "find fetch calls without an AbortSignal"   # copies the exact prompt for your agent
any-doctor verify doctors/fetch-without-abort-signal.mjs        # fixture gate (exact-set)
any-doctor run doctors/fetch-without-abort-signal.mjs path/to/repo   # scan + score + report + review menu
any-doctor run                                                        # every doctor (terminal: select first — all pre-chosen, space to deselect)
```

`generate` plants the skill as `AGENTS.md` in the scope dir (agents load it
natively — a planted copy refreshes on the next generate; a copy with your
own edits is never touched) and copies the generation prompt — paste it into your own agent
session, any agent, GUI or CLI. When it has written the doctor + fixtures,
`verify` gates it: missing expected findings fail recall, unexpected ones
fail precision. `run` and `verify` never touch a model or an agent — pipe
the output (or set `ANY_DOCTOR_HEADLESS=1`) for stable CI output. Requires
Node ≥ 18.

`run` excludes test files from scanning by default (test-named code files
and `test/`, `tests/`, `__tests__/` directories — for `ctx.files.list` and
`ctx.search` alike) — mocks and fixture data mimic production shapes
without being production reads. Pass `--include-tests` to scan them;
`verify` always scans everything its fixtures seed.

A doctor program is `<name>.mjs` (exports `meta` + `doctor(ctx)`) next to
its fixture module `<name>.fixtures.mjs` (seeds + expected findings).
See [CONTEXT.md](CONTEXT.md) for the vocabulary and
[doctors/async-doctor.mjs](doctors/async-doctor.mjs) for a working
example: one doctor, many checks — async hygiene as a category, with
per-check fixtures and the interactive check tree in `run`.

## Docs

| Doc | What it holds |
|---|---|
| [CONTEXT.md](CONTEXT.md) | Domain glossary — canonical terms |
| [docs/decisions.md](docs/decisions.md) | Decision log (D1–D19). Read first; don't relitigate |
| [docs/vision.md](docs/vision.md) | Product idea and the lifecycle novelty |
| [docs/features.md](docs/features.md) | Doctor discovery & registry spec + status |
| [docs/research.md](docs/research.md) | Landscape, React Doctor teardown |
| [docs/kill-test.md](docs/kill-test.md) + [docs/RESULTS.md](docs/RESULTS.md) | The validation experiment and its numbers |
| [docs/REPAIR-LOG.md](docs/REPAIR-LOG.md) | Generation-bug categories — feeds the generation skill |
| [docs/example-catalog.md](docs/example-catalog.md) | Rule intents across the JS ecosystem |

## Where we are (2026-09-03)

1. ✅ Contract v0, verify harness, pilot doctor, kill test, packaging
2. ✅ Generation: skill + prompt handoff (D14 — copy-based, agent-agnostic)
3. ✅ UI layer: score header, category rollup, review browser, post-report menu
4. ✅ Discovery & registry: fuzzy picker, repo-local + global scopes, `--all` batch modes
5. ⬜ Frozen-fixture protocol + authored eval corpus (the trust upgrade — first-shot 10/10 is currently self-graded)
6. ⬜ Grow `ctx`: symbols/imports resolution, JS-family languages
7. ⬜ Publish: npm, GitHub, CI workflow, launch post

## Principles

- The report comes from the generated program's evidence, not the LLM's opinion.
- Fixtures gate everything: a doctor that hasn't passed `verify` doesn't exist.
- Programs declare their blind spots as data.
- Any Doctor equips agents; it never launches, deploys, or speaks for them.
- Everything runs locally. The runner seam (today a node child process) is where any future sandbox plugs in.
