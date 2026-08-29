# Research notes

Landscape as of 2026-08-28. Refresh before making claims public.

## React Doctor (millionco/react-doctor) — verified teardown

The inspiration. Monorepo (pnpm/Turborepo, TypeScript) with a telling
structure:

- `core` — shared rule engine (rules authored once)
- `eslint-plugin-react-doctor` + `oxlint-plugin-react-doctor` — **two
  first-class executors**; rules delivered through both ESLint and oxlint
- `evals` + `fuzz` — rule-quality measurement as first-class packages
- `react-doctor` CLI — what neither linter can do: project-level analysis,
  CI mode (PR-diff-scoped reporting: "only issues your change introduced"),
  and runtime tracing (`scan <url>` launches isolated-profile Chrome, records
  a DevTools perf trace with per-render component outlines, `--cdp` attach
  for authed sessions)

**Lessons for us:** (1) multi-executor endgame is validated — shared rule
semantics, adapters per engine; (2) eval infrastructure is where the value
lives — they built `evals`/`fuzz` packages; (3) diff-scoped CI reporting is
the adoption trick for opinionated rules despite legacy backlogs.

Docs: https://www.react.doctor/docs/configuration/eslint-and-oxlint-plugins

## Competitive landscape

- **Semgrep** — AI rule writing; [Multimodal](https://semgrep.dev/products/semgrep-multimodal)
  combines LLM reasoning with rule-based scanning. Market has already
  converged on "deterministic rules + AI assist" rather than "LLM judges
  everything." Validates the inversion; security-oriented.
- **ast-grep** — has an [agent skill for NL→YAML rules](https://mcpservers.org/agent-skills/ast-grep/ast-grep).
  We build ON it, not against it. https://github.com/ast-grep/ast-grep
- **Codemod.com** — NL→codemods (transformation). We do detection-only, which
  is far easier and nobody has productized "temporary migration linters."
- **Copilot code review / custom instructions** — NL rules applied
  non-deterministically on every PR. The zero-infra baseline.
- **The free baseline to beat:** ask Claude Code/Cursor to write the rule and
  commit it. What's missing end-to-end today: sentence → *auditable rule with
  fixtures* → CI forever. The harness, the fixture discipline, and the trust
  artifacts are the product; generation is commoditizing.

## ast-grep vs oxc (decision D3/D4 summary)

| | ast-grep | oxc/oxlint |
|---|---|---|
| Rule artifact | YAML, declarative, ~10–30 lines | JS visitor code, free-form |
| Analysis | per-file patterns + `inside`/`has`/`precedes` | scope tree, symbols, CFG, types (tsgolint) |
| Alias/import resolution | no | yes |
| Native tests | `ast-grep test` snapshots | roll your own |
| Languages | dozens (tree-sitter) | JS/TS |
| Generated-artifact safety | data | arbitrary code in repo/CI |

oxc plugins docs: https://oxc.rs/docs/guide/usage/linter/plugins.html

## Key technical facts

- ast-grep relational operators (`inside`, `has`, `precedes`, `follows`) make
  "X inside Y" and even auth-*ordering* rules declarative.
- `ast-grep test` + YAML test cases = the fixture harness, mostly free.
- Effect is a deceptively *friendly* first domain: very regular idioms
  (gen/yield*/Tag), strong model priors — good for demo, stacks the deck;
  validate on a messier domain before generalizing.
- Precision/recall tolerance flips by mode: audit scanner wants recall, CI
  guard wants ~95%+ precision (muted rules die).
