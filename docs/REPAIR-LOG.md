# Repair log

Every bug in the generated rules, in order. This log IS the generation-
reliability data: the product's claim is that an agent can repair these from
fixture failures, and every repair below was driven by a fixture or scan
failure, never by hand-tuning against the target repo.

## Inline-fixture-caught (rule fails to parse or fixture fails)

| # | Rule | Bug | Fix | Category |
|---|------|-----|-----|----------|
| 1 | fetch-without-signal | YAML: unquoted `pattern: signal: $SIG` (colon in value) | quote the pattern | YAML quoting |
| 2 | fetch-without-signal | `constraints` nested inside an `any` branch | `constraints` is a TOP-LEVEL rule-config field | API shape |
| 3 | no-empty-catch | multi-node pattern `try $T catch ($E) { }` rejected | kind-based rule on `catch_clause` | pattern vs kind choice |
| 4 | fetch-without-signal | `pattern: "signal: $SIG"` can't match an object pair key | match `property_identifier` kind + regex | tree-sitter kind names |
| 5 | map-async | `async $$$ARGS` — rest metavariable after a keyword doesn't parse | explicit arrow shapes: `async $A => $B`, `async ($$$A) => $B` | metavariable rules |
| 6 | no-empty-catch | `kind: statement` is not a real tree-sitter node → every catch flagged | regex on the block text `^\{\s*\}` | tree-sitter kind names |
| 7 | fetch-without-signal | `has` defaulted to `stopBy: neighbor` — key is a grandchild of the options object | `stopBy: end` | **stopBy defaults** |
| 8 | map-async | `inside` same neighbor problem (`map` → `arguments` → `Promise.all`) | `stopBy: end` | **stopBy defaults** |
| 9 | fetch-without-signal | `await fetch(...)` variants double-reported (inner call already matches) | drop await variants | dedup / node identity |

## Scan-level-fixture-caught (inline tests CANNOT catch these)

| # | Rule | Bug | Fix | Category |
|---|------|-----|-----|----------|
| 10 | no-direct-ai-imports | rule-level `globs:` with `!` negation silently does NOTHING | rule-level `files:` / `ignores:` are the real fields; sgconfig has no `ignores` | silent schema acceptance |
| 11 | harness design | inline test cases have no file path → glob scoping untestable inline | scan-level ground truth (sample-app) is REQUIRED as a second fixture layer | harness design finding |

## Meta-findings for the skill file (the product)

1. Nearly all bugs cluster into ~6 mechanical categories — none needed
   creativity to fix. Encoding this list in the generation skill should
   dramatically improve first-shot yield. **Generation reliability is a
   teachable problem, not a research problem.**
2. `stopBy: end` should be the DEFAULT in generated relational rules
   (ast-grep's `neighbor` default is almost never what you want).
3. ast-grep silently accepts unknown fields in both sgconfig.yml and rules
   (bogus probe fields raised no error). A misspelled `ignores` produces a
   rule that looks right and excludes nothing. **The harness must verify
   behavior (scan-level fixtures), not just schema.**
4. Two fixture layers are mandatory: inline tests (node-level truth) +
   scan-level seeded ground truth (file-scope truth, glob/ignore behavior,
   double-report detection).
5. `sg test` discards generated snapshots on failed runs; baselines are
   written with `sg test -U` and only trustworthy after a clean verify run.
