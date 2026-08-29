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
  severity: "warning",                // "error" | "warning" | "info"
  blindSpots: [                       // what this approach CANNOT see — required
    "<honest limitation>",
  ],
};

export async function doctor(ctx) {
  // inspect the codebase, emit findings
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

- `ctx.files.list(exts?)` → relative paths (default .ts/.tsx/.js/.jsx/.mjs)
- `ctx.files.read(rel)` → file contents
- `ctx.search.pattern(pattern, language?)` → `[{ file, line, column, text }]`
  (ast-grep pattern syntax, e.g. `"fetch($URL)"`; requires ast-grep installed)
- `ctx.report.finding({ file, line, column?, message?, severity? })`

Zero dependencies. Node >= 18. The only imports allowed are `node:` builtins.

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

## Honesty rules

- `blindSpots` is required and is data: declare what your approach cannot
  see (aliased imports, cross-file references, dynamic constructs).
- Never silently narrow the intent. If the intent is not fully statically
  checkable, implement the closest honest version and declare the gap.
- A clean run must mean clean. Never swallow errors into empty findings.

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
- Don't add dependencies or imports beyond `node:` builtins.
- Don't scan a target repository to "tune" the doctor against its code.
- Don't mark a fixture green by weakening the expectation — strengthen the doctor.
