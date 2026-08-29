# any-doctor

> Your agent writes the analyzer. Fixtures prove it. CI reruns it forever.

Any Doctor turns a one-sentence convention ("find `.map(async ...)` results
that are never awaited") into a **doctor program** — a small piece of
analysis code your LLM writes against our typed `ctx` API. The CLI runs it
and renders a React-Doctor-style report: file:line evidence, grouped
findings, declared blind spots. The saved program reruns deterministically
in CI with zero inference.

Everything runs locally. No Cloudflare, no API keys, no server.

## Usage

```bash
any-doctor run doctors/unawaited-async-map.mjs path/to/repo   # scan + report (+ interactive browser on a TTY)
any-doctor verify doctors/unawaited-async-map.mjs             # fixture gate
```

Pipe the output (or set `ANY_DOCTOR_HEADLESS=1`) and the interactive browser
disables itself — headless output is stable for CI and `--json`-style
consumers. Requires Node ≥ 18.

A doctor program is `<name>.mjs` (exports `meta` + `doctor(ctx)`) next to
its fixture module `<name>.fixtures.mjs` (seeds + expected findings,
exact-set matched). See [CONTEXT.md](CONTEXT.md) for the vocabulary and
[doctors/unawaited-async-map.mjs](doctors/unawaited-async-map.mjs) for a
working example.

## Docs

| Doc | What it holds |
|---|---|
| [CONTEXT.md](CONTEXT.md) | Domain glossary — canonical terms |
| [docs/decisions.md](docs/decisions.md) | Decision log (D1–D10). Read first; don't relitigate |
| [docs/vision.md](docs/vision.md) | Product idea and the lifecycle novelty |
| [docs/research.md](docs/research.md) | Landscape, React Doctor teardown |
| [docs/kill-test.md](docs/kill-test.md) + [docs/RESULTS.md](docs/RESULTS.md) | The validation experiment and its numbers |
| [docs/REPAIR-LOG.md](docs/REPAIR-LOG.md) | Generation-bug categories — feeds the future generation prompt |
| [docs/example-catalog.md](docs/example-catalog.md) | Rule intents across the JS ecosystem |

## Where we are (2026-08-28)

1. ✅ Vision, decisions D1–D10, kill test (precision/recall measured), React Doctor UX bar experienced first-hand
2. ✅ **Doctor contract v0**: typed `ctx` ([src/contract.ts](src/contract.ts), [src/sdk.ts](src/sdk.ts)), framed runner protocol ([bin/doctor-loader.mjs](bin/doctor-loader.mjs)), pure report renderer ([src/report.ts](src/report.ts)), `verify` fixture harness with exact-set matching
3. ✅ Pilot doctor proves the pivot: same intent, program beats the YAML rule at its measured failure point (cross-statement dataflow)
4. ⬜ Program-generation skill (rewrite from REPAIR-LOG lessons) + agent adapter; first-shot yield is the core metric
5. ⬜ Grow `ctx`: symbols/imports resolution, JS-family languages
6. ⬜ Front doors: vision.md refresh to D9/D10 language; launch post

## Principles

- The report comes from the generated program's evidence, not the LLM's opinion.
- Fixtures gate everything: a doctor that hasn't passed `verify` doesn't exist.
- Programs declare their blind spots as data.
- Everything runs locally. The runner seam (today a node child process) is where any future sandbox plugs in.
