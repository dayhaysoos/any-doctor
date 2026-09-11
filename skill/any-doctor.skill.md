# any-doctor — doctor generation skill

You are writing a **doctor program**: a small analysis tool that detects one
codebase convention, plus fixtures that test its stated claims. The user's INTENT
and explicit project conventions define the specification. When authorized,
inspect the codebase to understand those conventions and obtain representative
cases; reason about each expected outcome independently of detector output.
Keep separate counterexamples for evaluation instead of tuning the claim until
the target report looks clean. Your own passing fixtures are not a general
precision measurement.

The purpose is to help users and their own agents find recurring AI-code concerns
beyond ordinary linting. Project-specific policies and contextual review candidates
are valid doctor intents; phrase them accurately instead of calling every finding
a proven bug. Planned review decisions and history belong to the CLI, not to
doctor implementations. Doctors continue to emit raw findings through this contract.

## The contract

Two files, exactly:

`doctors/<slug>.mjs` (slug = short kebab-case from the intent):

```js
export const meta = {
  id: "<slug>",                       // kebab-case, matches the filename
  description: "<one-line finding text, shown in reports>",
  severity: "warning",                // default: "error" | "warning" | "info"
  category: "<bugs | performance | security | style | ...>",
  blindSpots: [                       // what this approach CANNOT see — required
    "<honest limitation>",
  ],
  checks: [                           // optional: multiple related checks in ONE doctor
    {
      id: "<check-id>",               // short kebab noun phrase, [a-z0-9-], unique per doctor; name the concern
      description: "<finding text>",
      severity: "warning",
      claim: "<observable condition established>",
      lookalikes: ["<valid similar-looking case>"],
      reportingUnit: "occurrence",        // occurrence | file | project
      // needs: ["calls"], onUnknown: "skip", // when using optional analysis
      impact: "<one line: what goes wrong for the user if this ships>",
      why: "<one line: what in the code triggers this>",
      fix: "<one line: the corrective action>",
    },
  ],
};

export async function doctor(ctx) {
  // inspect the codebase, emit findings
  // ctx.report.finding({ rule: "<check-id>", file, line, column?, message?, severity? })
}
```

`doctors/<slug>.fixtures.mjs`:

```js
export const fixtures = [
  {
    name: "<what this case proves>",
    seed: { "src/example.ts": "...inline file contents..." },
    expected: [{ rule: "<check-id>", file: "src/example.ts", line: 2 }],  // exact multiset on (rule, file, line)
  },
  // include cases where expected: [] — innocent lookalikes must stay silent
];
```

`ctx` is the only capability a doctor has:

- `ctx.files.list(exts?)` → relative paths (default .ts/.tsx/.js/.jsx/.mjs; test-named code files and `test|tests|__tests__/` directories are excluded by default — `--include-tests` scans them; in verify sandboxes test-named seeds are always visible: fixtures are the doctor's own world)
- `ctx.files.read(rel)` → file contents
- `ctx.files.readMasked(rel)` → contents with comments, strings, AND regex
  literals blanked, offsets and length preserved — the one masking
  implementation; a position in the masked text addresses the same char in
  the source. Regex literals are masked because they may contain quote
  characters — an unmasked `/["']/ ` opens a phantom string that swallows
  every line after it. Never carry a private masking copy.
- `ctx.search.pattern(pattern, language?)` → `[{ file, line, column, text, endLine?, endColumn?, captures? }]`
  (ast-grep pattern syntax, e.g. `"fetch($URL)"`; requires ast-grep installed;
  respects the same test-path exclusion — `--include-tests` includes them)
- `ctx.search.rule(query, language?)` → same Match shape — a composite
  structural question: `{ pattern, inside: { pattern, stopBy? } }` (see below)
- `ctx.search.rules(queries, language?)` → same Match shape plus
  `ruleId` — MANY named rules in ONE engine invocation:
  `[{ id, pattern, inside? }, ...]`. Prefer this whenever you have more
  than one question: every ctx.search call is a process spawn, so a
  check with five shapes costs five spawns — or one.
- `ctx.analysis.available` → boolean: is the identity engine installed?
  (optional — checks that use it must narrow without it, below)
- `ctx.analysis.bindings(file)` → the file's identity model: every binding
  `{ name, kind, line, column, endLine, endColumn, references }`, each
  reference `{ line, column, endLine, endColumn, write }` in the same
  position convention as Match. One call per file; throws loudly if
  unavailable.
- `ctx.analysis.spans(file)` → every function-like span as an AST fact:
  `{ kind: "function"|"function-expression"|"method"|"arrow"|"class",
  name, async, line, column, endLine, endColumn }`. Never hand-roll
  brace-counting span scans — semicolons in multi-line callbacks and
  braces in strings truncate them (two audit bug classes). Degrade like
  bindings: declare `needs: ["spans"]`, narrow without the engine.
- `ctx.analysis.calls(file)` → generic AST facts: calls with immediate usage
  (`discarded`, `awaited`, `returned`, `stored`, `passed`, `unknown`), receiver
  binding identity, inline callback registration, linked query-call extents,
  and subtraction operands. See the exported `AnalysisCalls` contract.
  Declare `needs: ["calls"]` and a degraded policy. Stored/passed/returned
  is not proof that a promise eventually settles; a nearby combiner is not
  evidence about a particular promise.
- `ctx.report.finding({ rule, file, line, column?, message?, severity?, evidence? })`
  - `evidence: { endLine, endColumn? }` (optional): the flagged expression's
    full range when it spans lines — the host validates it and the diff's
    identity matching then catches edits on ANY line of the expression.
    Omit it and the finding matches on its flagged line only (line-scoped,
    reported as weaker). One-line findings don't need it.

Zero dependencies, zero imports — a doctor is one self-contained file;
everything reaches it through `ctx`. Node >= 18.

## Rule queries — ask structure, don't parse text

`ctx.search.rule` asks the engine a composite structural question and
hands back matches with their extent and captures — prefer it over
re-parsing `text` with brace counting:

```js
const timers = ctx.search.rule({
  pattern: "setTimeout($$$ARGS)",           // what to find
  inside: { pattern: "useEffect($$$B)" },   // ...only inside this
});
for (const m of timers) {
  const args = m.captures.ARGS; // multi-capture → ARRAY of {text, line, column, endLine, endColumn}
  ctx.report.finding({ rule: "uncleared-settimeout-in-effect", file: m.file, line: m.line });
}
```

Three traps — the interface guards the last one, the first two are yours:

- **`inside` defaults to `stopBy: "end"`** — the scan runs to the
  enclosing node's end. ast-grep's own default (`"neighbor"`) is NOT
  ours; pass `stopBy: "neighbor"` only when you truly mean "stop at the
  next sibling".
- **Multi-captures are arrays keyed by the bare name**: `$$$ARGS` →
  `captures.ARGS` is an array (separator commas are already filtered —
  it holds argument nodes, so `captures.ARGS[1]` is the second
  argument). `captures.ARGS.text` is the classic silent-undefined trap.
- **A rule query that matches nothing proves nothing.** Every rule query
  needs at least one fixture where it FIRES — a query silently matching
  nothing everywhere is broken-and-silent, not correctly-silent.

Queries are validated before anything runs: unknown keys are refused
with the allowed list (and a typo suggestion), so a misspelled `inside`
fails loudly instead of matching nothing. Named-rule batches carry the
same curation (unique non-empty ids — every match returns tagged with
the id that found it).

## Analysis queries — identities, composed with shapes by position

When the question is "which variable is this, and where is it REALLY
used," ask the identity engine — never match names by text:

```js
if (ctx.analysis.available) {
  const model = ctx.analysis.bindings(file);            // one call per file
  const binding = model.bindings.find((b) => /* span contains your Match */);
  const reads = binding.references.filter((r) => !r.write);
  // decide consumption by position: is a read inside a combiner call's span?
}
```

The composing pattern (this is the whole trick): find **shapes** with a
rule query, find **identities** with an analysis query, and join them by
position — both use 1-based lines and 0-based columns with exclusive
ends, so containment is `start <= ref < end` comparing (line, column)
pairs left to right: a reference is inside a match when it is not before
the match's start and not at-or-after its end.

Three rules of the degradation contract:

- **Declare it**: a check that uses analysis puts `needs: ["bindings"]`
  on its CheckMeta — that data is what renders "narrowed" in reports
  when the engine is absent.
- **Narrow honestly**: guard with `ctx.analysis.available` and fall back
  to your weaker path; a clean degraded run says "narrowed," never
  "clean" silently.
- **Pin both paths**: fixtures carry `analysis: "on"` (default — skips
  with a notice where the engine isn't installed) or `analysis: "off"`
  (forces the degraded path; expectations may legitimately differ — pin
  them).

### The identity model: language facts from the engine, not regexes

The engine resolves **value, JSX, and type-position references** (the
TypeScript-aware scope layer), and computes two facts doctors must take
rather than re-derive: every binding carries `exported?: boolean`
(computed from the export AST — every declarator, destructured pattern,
and specifier; no text matching) and `excluded?: boolean` (declared in
an object pattern with a rest sibling — the intentional omission
idiom; its unreadness is the point, never a finding).

The laws that follow:

- **Unknown is not unused.** The declarator (or import specifier) is
  itself a write reference; loop variables declare over the whole loop.
  Never test `references.length > 0` for "used." A binding is USED when
  anything READS it, or writes it beyond its own declaration:
  ```js
  const isUsed = (b) =>
    b.references.some((r) => !r.write) ||
    b.references.some((r) => !refInsideDecl(r, b));
  ```
  And when your detection cannot see a reference class, the honest
  verdict is "unknown" — skip — never "unused."
- **Backstop with the masked occurrence guard.** A whole-word count
  over the MASKED source catches string-built references and
  reflection: if the name occurs beyond its declaration, skip.
  Masking blanks comments, strings, and regex literals but preserves
  identifiers, JSX tags, and type annotations.
- **Never re-derive exports with regexes.** `exported` is engine data.
  Statement-scoped `/export ... ;/` matching fails on semicolons inside
  type annotations, destructured exports, and semicolon-free code —
  those exact failures shipped false positives once.
- **Excluded bindings are off-limits**, and underscore-prefixed names
  (`_secret`) are opt-out by convention.
- **Consumers are an index, not a glance.** Collect named imports,
  namespace-member usage (`NS.NAME`), and DYNAMIC import specifiers
  (from RAW source — masking blanks the path strings) across every
  file before claiming anything is unconsumed. `import("./x")`
  consumes x's whole export surface.
- **Entry-shaped files are exempt from dead-export**: doctor programs
  (`doctors/`), `bin/`, `scripts/`, generated directories, and
  entry names (cli, main, index, ...) are consumed by machinery static
  analysis cannot see.
- **Test files are invisible to the default scan**; a test-only
  consumer looks dead. Declare it and point users at
  `--include-tests`. `.d.ts` declares types, not behavior.

## One doctor, many checks

If the intent covers several related patterns (an SDK migration with
multiple outdated calls, a family of anti-patterns, "all the stripe
practices we deprecated"), build ONE doctor with multiple checks — not one
doctor per pattern:

- Declare each check in `meta.checks` (`{ id, description, severity? }`).
- Emit each finding with `rule: "<check-id>"` matching a declared check.
- The report groups findings under each check's description, under the
  doctor's umbrella.

Bundle when the checks share a theme or a codebase area. Stay separate
when the checks are unrelated concerns that would be deleted or shared
independently.

## Severity judgment

If the intent dictates criticality ("make the findings critical"), follow
it. Otherwise judge by consequence:

- `error` — will break, lose, or expose data at runtime
- `warning` — wrong or risky but non-fatal
- `info` — contextual review candidates, maintenance suggestions, or informational

Severity describes consequence, not certainty. Do not inflate a contextual
suggestion into a proven defect. State a project's policy basis when the concern
depends on that policy, and preserve the facts needed to investigate safely.

Per-check severity lives in `meta.checks`; a finding may override with its
own `severity` only for exceptions.

## Hard workflow

1. State each check's observable claim, reporting unit, required facts, and
   unsupported cases. Write both files. Use the engine's facts; if it cannot
   establish the condition, narrow the check instead of extending text windows.
   The maintainer regression protocol is in `docs/doctor-reliability.md`.
2. Run: `any-doctor verify doctors/<slug>.mjs` (or `node bin/cli.js verify doctors/<slug>.mjs`,
   or with no install at all: `npx any-doctor@latest verify doctors/<slug>.mjs`).
   The per-fixture `missing`/`unexpected` lines are your error list — treat
   them like compiler diagnostics and iterate; verify exits non-zero while
   any fixture fails, so the loop is CI-shaped from the first minute.
3. ALL fixtures must pass. Iterate until green — a failed fixture is the
   system telling you your rule or your expectations are wrong; fix the rule,
   or fix the expectation if the expectation itself was wrong.
4. Adversarial pass — attack your own doctor before it ships. Your fixtures
   and your doctor share your blind spots; a second wave of
   **counter-fixtures**, written to break what you built, is what breaks
   that shared blind spot. Author fixtures in three attack classes:
   - **Lookalikes** the first wave never tried — innocent shapes a naive
     pattern catches (masked comments and strings, near-miss identifiers).
   - **Same-line variants** — the violation and its consumption (or two
     violations) squeezed onto one line, where line-by-line scanning goes
     blind.
   - **Semantic traps** — shapes that satisfy your pattern but not the
     intent (`await promiseArray` is not settling the promises), and shapes
     the intent condemns that merely look handled.
   Reason every expectation from the intent and explicit project conventions — never from what your
   doctor currently reports (that is the self-grading trap). Verify again
   and iterate until the attack wave is green too.
5. Report: id, what it detects, declared blind spots, fixture count.

## The claim contract (verify refuses without it)

Every declared check states three things before verify will certify it:

```js
{
  id: "<check-id>",
  claim: "<one sentence: the OBSERVABLE condition detected, not the consequence>",
  lookalikes: ["<innocent shape that must stay silent>", "..."],
  onUnknown: "narrow",   // required only when needs is declared
  // ... description, severity, impact, why, fix as before
}
```

- **claim** is the testable statement. "This expression discards a
  promise" is a claim. "This asynchronous code is unsafe" is not — it is
  a consequence masquerading as an observation. If you cannot write the
  claim as something the code's shape alone establishes, the check is a
  review candidate at info severity, not a warning.
- **lookalikes** name the innocent shapes (these are corpus candidates —
  the shared innocent corpus grows from them).
- **onUnknown** declares what happens when the analysis the check needs
  is unavailable: `"narrow"` (the report says narrowed) or `"skip"`
  (silent, declared in blindSpots).

Verify also runs every doctor against the **shared innocent corpus**
(`fixtures/innocent/` — files that look guilty but aren't, grown from
the audit counterexamples). A finding there is a false positive by
definition, whoever wrote the check.

Verify also checks reliability beyond the author's individual examples:

- **Per-check location coverage.** Declare `reportingUnit` on every new check.
  An `occurrence` warning/error needs a passing fixture containing two distinct
  locations of that check in one file. Use explicit, context-preserving seeds;
  identical violations in separate functions are an important regression case.
  For two occurrences on the same line, specify both columns (zero-based).
  A line-only expectation cannot prove a separate occurrence from a column on
  that same line. `file` and `project` units require a positive witness, not a
  two-occurrence fixture. Legacy undeclared units are visibly not exercised.
- **The shared sensitivity corpus** (`fixtures/sensitivity/`): independently
  reviewed examples of useful findings, with per-doctor `expect.json` stakes.
  Existing real findings must survive attempts to suppress innocent lookalikes.

## Fixture discipline

- Matching is a multiset on (rule, file, line, optional column): each expected finding
  must be emitted by the check that carries its rule, each actual finding
  must be expected. A specified column must match; omitted columns retain
  legacy line-only matching. Duplicates count — a finding twice needs the
  expectation twice. A missing expected finding fails recall; an
  unexpected finding fails precision on those labeled cases. Get both sides right;
  independently evaluated real-code cases are needed for broader accuracy claims.
- Every doctor needs at least one `expected: []` fixture containing code that
  LOOKS like a violation but isn't — the lookalike that a naive implementation
  would wrongly flag.
- Cover the simplest violation and the sneakiest one. Vary quote styles where
  syntax allows.
- Findings are locations. Wording lives in `meta.description`; use
  per-finding `message` only when one violation needs its own explanation.
- **Fixture seeds are tiny worlds with their own physics.** A seed file
  that exports a symbol nobody consumes will trip any dead-export-style
  check you (or a sibling doctor) ships — including on the incidental
  helper your OTHER fixture tests. Give every exported seed symbol a
  consumer: an `src/index.ts` that imports and calls things (index is
  entry-shaped, exempt from dead-export) is the standard pattern.
- **Seeds must be clean relative to your own checks.** A seed carrying
  `const a = 1` (unread) gets flagged by an unread-local check, and if
  that finding lands on the same (rule-adjacent) file:line as the finding
  you meant to test, dedupe hides yours and the expectation reads as
  broken for the wrong reason. Write seeds your own doctor would call
  clean — except where testing that rule.
- **Same-line multi-rule findings each need their own expected entry**
  (exact multiset on rule:file:line — two rules firing at one location are
  two expectations).

## Authoring for the report

The report's detail pane shows, per check: category · severity · location,
then **Impact**, the code frame, and **Fix**. Write `impact`, `why`, and
`fix` on every check — one line each, plain language, no code in them.
They are what the user reads while deciding whether to care. `impact` =
consequence if it ships; `why` = the code shape that triggers the check;
`fix` = the corrective action in one sentence, or an investigation step when a
safe correction depends on context the doctor cannot establish.

## Honesty rules

- `blindSpots` is required and is data: declare what your approach cannot
  see (aliased imports, cross-file references, dynamic constructs).
- Never silently narrow the intent. If the intent is not fully statically
  checkable, implement the closest honest version and declare the gap.
- A zero-finding run means nothing was detected within the exercised scope;
  declare unsupported cases and never swallow errors into empty findings.

## Capability rules (the runtime gate enforces these)

A doctor's entire world is the target repo through `ctx`. Anything else is
out of contract: the capability gate scans the program before it ever runs
and refuses to execute it — there is no override:

- **A doctor is one self-contained file.** No imports at all — not node
  builtins, not local helpers, not npm packages. Everything reaches you
  through `ctx`; every import is refused at runtime.
- **No network calls. Ever.** No fetch, http/https, net, tls, dns, dgram.
  There is no legitimate reason for a doctor to reach the network — and the
  network globals are deleted from the process before your code runs.
- **No file writes.** Doctors read; they never write, delete, or rename.
- **No subprocesses.** Searching goes through `ctx.search` — never spawn
  anything yourself.
- Read files through `ctx.files.read` (it is repo-scoped); it is the only
  way to read — imports are refused outright.
- `process.env` is flagged too. If you need configuration, it does not
  belong in a doctor — the target repo is the input.

The scan is layered with runtime enforcement: on runtimes that support it,
doctors execute under Node's permission model, so file writes and
subprocesses are denied by the process itself — even code the scan cannot
see. Worker threads exist only as the import guard's carrier and inherit
every denial.

One helper used to recur across doctor programs by design — the
comment/string masking function, copied file to file under the
single-file law. It is a host operation now (`ctx.files.readMasked`):
use it, never re-create it.

If you cannot implement the intent without breaking a rule, the intent is
out of scope for a doctor: say so in your final report instead.

## Failure lessons (each of these shipped in a real doctor — do not repeat)

1. `String.replace(text, x)` replaces only the FIRST occurrence. When
   substituting placeholders into a regex source string, use a global regex:
   `.replace(/NAME/g, escaped)`.
2. Escape anything variable you interpolate into a RegExp
   (`s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")`).
3. Match the innermost construct once. `await fetch(x)` contains a
   `fetch(x)` node — a pattern for the inner call already matches it;
   adding wrapper variants double-reports.
4. Read each file once per pass. Don't re-read inside loops.
5. If the intent is not fully statically checkable (cross-file references,
   runtime behavior, types), implement the closest honest version and
   declare the gap in `blindSpots`. Never drop an intent condition silently.
6. Your own `console.log` goes to stderr, not the report. Don't rely on
   stdout — stdout carries only the structured result.
7. A region anchor is a point, not a line. When a rule scans for the
   consumer of a declaration, scan from the declaration's end — never from
   the next line. Same-line consumption is real consumption (a one-line
   `const jobs = xs.map(async f); return Promise.all(jobs)` was a false
   positive because the scan started on the following line).
8. `await promiseArray` does not settle the promises — an array is not a
   promise, so the await resolves immediately. Only combiners
   (Promise.all/allSettled/race/any) or per-element awaits consume;
   awaiting the array itself is the dropped-promises bug.
9. Key the trigger on the defect, not on the decorated shape you first
   wrote. A bare discarded `xs.map(async ...)` with no `const` binding is
   the same dropped-promises bug — judge by what surrounds the expression
   (statement position means discarded), not by requiring your favorite
   decoration.

## What NOT to do

- Don't touch any file other than the two contract files.
- Don't add dependencies — and don't import anything at all, not even
  `node:` builtins; every import is refused at runtime.
- Don't scan a target repository to "tune" the doctor against its code.
- Don't mark a fixture green by weakening the expectation — strengthen the doctor.
