# any-doctor — doctor generation skill

You are writing a **doctor program**: a small analysis tool that detects one
codebase convention, plus the fixtures that prove it works. The INTENT is
the entire specification. Derive everything from the intent alone — never
scan a target repository to tune your doctor against its code.

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
      id: "<check-id>",               // short kebab noun phrase, [a-z0-9-], unique per doctor; name the defect
      description: "<finding text>",
      severity: "warning",
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
    expected: [{ file: "src/example.ts", line: 2 }],   // exact set on (file, line)
  },
  // include cases where expected: [] — innocent lookalikes must stay silent
];
```

`ctx` is the only capability a doctor has:

- `ctx.files.list(exts?)` → relative paths (default .ts/.tsx/.js/.jsx/.mjs; test-named code files and `test|tests|__tests__/` directories are excluded by default — `--include-tests` scans them)
- `ctx.files.read(rel)` → file contents
- `ctx.search.pattern(pattern, language?)` → `[{ file, line, column, text }]`
  (ast-grep pattern syntax, e.g. `"fetch($URL)"`; requires ast-grep installed;
  respects the same test-path exclusion — `--include-tests` includes them)
- `ctx.report.finding({ file, line, column?, message?, severity? })`

Zero dependencies, zero imports — a doctor is one self-contained file;
everything reaches it through `ctx`. Node >= 18.

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
- `info` — stylistic or informational

Per-check severity lives in `meta.checks`; a finding may override with its
own `severity` only for exceptions.

## Hard workflow

1. Write both files.
2. Run: `any-doctor verify doctors/<slug>.mjs` (or `node bin/cli.js verify doctors/<slug>.mjs`).
3. ALL fixtures must pass. Iterate until green — a failed fixture is the
   system telling you your rule or your expectations are wrong; fix the rule,
   or fix the expectation if the expectation itself was wrong.
4. Report: id, what it detects, declared blind spots, fixture count.

## Fixture discipline

- Matching is exact-set on (file, line): a missing expected finding fails
  (recall); an unexpected extra finding fails (precision). Get both sides right.
- Every doctor needs at least one `expected: []` fixture containing code that
  LOOKS like a violation but isn't — the lookalike that a naive implementation
  would wrongly flag.
- Cover the simplest violation and the sneakiest one. Vary quote styles where
  syntax allows.
- Findings are locations. Wording lives in `meta.description`; use
  per-finding `message` only when one violation needs its own explanation.

## Authoring for the report

The report's detail pane shows, per check: category · severity · location,
then **Impact**, the code frame, and **Fix**. Write `impact`, `why`, and
`fix` on every check — one line each, plain language, no code in them.
They are what the user reads while deciding whether to care. `impact` =
consequence if it ships; `why` = the code shape that triggers the check;
`fix` = the corrective action in one sentence.

## Honesty rules

- `blindSpots` is required and is data: declare what your approach cannot
  see (aliased imports, cross-file references, dynamic constructs).
- Never silently narrow the intent. If the intent is not fully statically
  checkable, implement the closest honest version and declare the gap.
- A clean run must mean clean. Never swallow errors into empty findings.

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

One helper recurs across doctor programs by design: the comment/string
masking function that blanks non-code before pattern matching. The
single-file law forbids importing it, so copy it in — that duplication is
the contract working, not a smell to fix.

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

## What NOT to do

- Don't touch any file other than the two contract files.
- Don't add dependencies — and don't import anything at all, not even
  `node:` builtins; every import is refused at runtime.
- Don't scan a target repository to "tune" the doctor against its code.
- Don't mark a fixture green by weakening the expectation — strengthen the doctor.
