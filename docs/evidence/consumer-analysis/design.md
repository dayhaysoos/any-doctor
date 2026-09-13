# Consumer analysis contract (recorded before detector changes)

Base: `6e4b1cb43a1bde69fdc13846a8940eb62c26a153`, clean `website/docs`.
The user's current instruction supersedes the handoff's new-branch instruction.

The host owns a scan-local immutable source inventory, file roles, module
resolution, import/export relationships, and syntax fingerprints. Slop owns
candidate selection, the duplicate complexity threshold, and review wording.

`files.inventory()` distinguishes authored, test, and generated modules. Default
diagnostics omit tests and generated code; reference analysis includes both.
`analysis.consumers(file)` returns exported bindings with evidence categorized as
runtime, test, type, reexport, public, or uncertain, and explicit coverage reasons.
No evidence is a bounded absence observation, never deletion authorization.
Reexports protect their source even without a final caller. Unknown namespace
escapes protect the resolved module, not unrelated same-named declarations.
Unbounded dynamic expressions expose uncertainty for their possible target scope.
Parse/infrastructure errors fail loudly. No target configuration is executed.

Use existing OXC and scope-manager syntax/identity machinery. Add TypeScript as a
runtime dependency for its configuration/module-resolution API (no Program or
type checker); this avoids a new private approximation of TS extension mapping,
paths and conditional resolution. Host filesystem adapters restrict resolution
to the captured repository, excluding node_modules and symlinks. Unsupported
configuration or unresolved internal imports must be visible.

Duplicate keys compare structured syntax with positions/comments removed and
literal/regex/template content retained. Compare actual AST function extents;
never strip whitespace from raw source. This establishes matching source
structure only; captured values and contracts can differ. Suppress short bodies
based on executable structure rather than declaration/signature length.

Regression labels in `dev/consumer-analysis/cases.mjs` are written before repair.
The executable CLI matrix will record baseline disagreement without changing the
labels to fit detector output. Independent review remains separate.
