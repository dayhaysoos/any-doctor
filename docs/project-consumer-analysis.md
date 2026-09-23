# Project consumer facts

The host owns module identity and cross-file evidence. Slop owns whether an
observation deserves an interruption. A static import is a dependency, a reference
is an observed use, and neither proves execution, reachability, or deletion safety.

## Interface and scope

- `ctx.files.list(exts)` is the diagnostic scope: authored files and, only with
  `--include-tests`, tests. Generated files are omitted. `ctx.search` applies the
  same role/exclusion policy. Explicit reads remain read-only and repo confined.
- `ctx.files.inventory()` includes test and generated JS/TS reference evidence
  and records exclusions. No doctor-side directory walk or resolver is needed.
- `ctx.analysis.consumers(file)` returns exported bindings, their exported names,
  declaration coordinates, evidence, and coverage. Evidence kinds are `import`
  (a static dependency without a runtime-use claim), `runtime`, `test`, `type`,
  `reexport`, `public`, and `uncertain`. A re-export protects its source even
  without a downstream caller. Types never establish runtime consumption.
- `ctx.analysis.structures(file)` returns named function declarations/expressions
  with exact UTF-16 ranges, parameter/body AST fingerprints, body statement/node
  counts, and captured names. It does not return an AST or prove equivalence.

The project graph is built lazily once per doctor scan, from captured code and
JSON configuration bytes. Resolution cannot read outside that capture or fetch
packages. The SDK checks source digests against its cached diagnostic reads and
checks the complete graph inventory/digests again before returning a run.
Per-file host caches now use content digests, including same-size timestamp-
preserving edits. This detects mixed snapshots; it is not a filesystem lock.

## Resolution supported

OXC and the existing TypeScript-aware scope manager supply syntax and reference
identity. TypeScript 5.9's configuration and module resolution APIs supply relative
extension/index mapping, `baseUrl`, `paths`, and nearest `tsconfig.json` options.
TypeScript is now a runtime dependency; no Program, type checker, project scripts,
plugins, compiler output, or target configuration code is executed.

Supported modes are Node10, Node16, NodeNext and Bundler (the default when no
configuration exists). Node16/Next choose import/require conditions from the file
extension and nearest package type. Captured relative JSON `extends` is supported.
Missing/external extends, unsupported modes and project references expose
uncertainty in their importing configuration scopes. Bare imports/re-exports
under an unsupported config may resolve anywhere in the captured project, so
uncertainty also reaches every possible target, including outside that directory.
Relative imports and `node:` builtins do not introduce this unbounded alias
uncertainty; known relative targets and unrelated outer scopes remain useful. Compiler `include`/`exclude` govern build
inputs, not diagnostic or reference scope; use the scanner configuration below
for scan exclusions.

Named/default imports and aliases resolve by source identity. Named/renamed
re-exports, star chains and cycles propagate finite origin sets; explicit exports
take precedence over same-named stars. Ambiguous stars and namespace/type-only re-export member flow conservatively
preserve dependencies and uncertainty, not a claim of runtime consumption.
Namespace member reads follow the scope-resolved namespace binding (including
JSX). Type namespace uses are type evidence. Runtime namespace escapes/computed
access are uncertainty for the resolved module's origins.

String-literal and interpolation-free template dynamic imports support direct awaited members, a directly stored
namespace, destructuring, and a direct `.then(identifier => ...)` namespace
callback. A stored import promise and further value flow are explicitly uncertain. Qualified TypeScript import-type
expressions are type evidence for the leftmost exported binding. Nonliteral dynamic imports preserve uncertainty;
a relative template directory bounds it only when every substitution is a
literal or an immutable, scope-resolved const string using the conservative
`[A-Za-z0-9_-]+` alphabet, and the fixed suffixes cannot introduce path traversal.
Percent encodings, separators, URL delimiters, mutable/unknown values and parent
segments do not establish containment; these templates make the entire captured
project uncertain. This bounded substitution policy does not claim exact dynamic
member consumption. Literal and interpolation-free import targets still resolve
by module identity.

TypeScript import-equals and actual CommonJS `require` are uncertainty on the
resolved module. Locally bound non-loader functions named `require` do not count.
Named/aliased, namespace and default imports from `node:module` or `module`
identify `createRequire`, using the same static-property lookup for `.createRequire`
and `["createRequire"]`. Value normalization removes parentheses, TypeScript `as`,
angle-bracket assertions, non-null assertions, `satisfies` and instantiation
wrappers before factory, initializer, callee, argument and base classification.
Scope-bound aliases of named factories and loader variables preserve identity.
`import.meta.url` (including static computed access and type wrappers) establishes
the importer base independently of factory identification. Literal loader targets
then receive target-level CommonJS uncertainty; unrelated exports remain eligible.

The host explicitly distinguishes known factories/modules, recognized loader
values, proven non-loader values (such as a locally declared function), unrelated
unknown values without loader provenance, and unsupported loader-related values.
An unknown call without loader provenance does not taint the project. An
unsupported expression containing a known loader/factory does not become an
ordinary function just because its shape is unrecognized. Its uncertainty carries
a reason and a possible callable role: factory, loader, or unknown. Conditional/logical selection can retain a common importer base when
all alternatives are known importer-based loaders or non-loader values; unknown
alternatives prevent that bound. A factory call creates a loader; a loader call produces a loaded value. This
call-result distinction also applies when the callable role is known but its
selection is uncertain. Conditional factory selection can still create a loader.
The original loader call records uncertainty for its justified target; direct or
stored result methods, aliases and transparent wrappers do not inherit callable
loader identity. Unknown loader-related result flow retains uncertainty rather
than being treated as a proven non-loader.
The known `require.resolve` method computes a filename without loading a module,
so calling it alone adds no module-consumer evidence. Its dot/computed forms and
aliases use the same property/value classifier.

Other factory bases, reassignment, mutation/escape of builtin-module objects,
unmodeled wrappers and nonliteral loader arguments expose unbounded uncertainty
where no target bound is justified. Namespace-object aliases can escape and mutate
the object, so those aliases conservatively preserve uncertainty. Ordinary
interprocedural returns/parameters and arbitrary external loader implementations
are not interpreted. CommonJS export assignment remains outside this ESM export
analysis. No target code is executed to classify any of these expressions. Per-module
classification caches avoid repeatedly expanding shared initializer graphs.
A result that encountered a recursive fallback is never cached as proof of
absence; cyclic related flow retains explicit uncertainty.

Captured named packages support exact root/subpath exports and nested
`types`/`import`/`require`/`default` conditions, plus module/main/index fallback
when exports are absent. Wildcard package exposure is recognized, but wildcard
workspace import mapping and custom condition-only targets can be unsupported;
they narrow the affected package explicitly. Missing generated package entries
have no inferred source correspondence and make their package scope uncertain.
Installed third-party packages and symlinked workspaces are not scanned.

## Public entries and configuration

`any-doctor.analysis.json` is declarative JSON with three optional string arrays:

```json
{
  "entryPoints": ["src/routes/**", "server/custom-handler.ts"],
  "generated": ["src/api-client/**"],
  "exclude": ["vendor/**"]
}
```

Patterns support `*`, `**`, and `?`; directory patterns include descendants.
Excluded code cannot establish absence outside the remaining coverage. Hidden
paths, node_modules and symlinks are also excluded and visible in coverage.
Generated conventions include dist/build, generated/_generated/__generated__,
`.gen.*`, `.generated.*`, and declaration files. Generated consumers still count.

Package exports/main/module/types/bin declarations establish public exposure.
Explicit supported conventions also cover root or src-root
index/main/cli/server/app/mod modules, doctor-loader modules in `doctors/`,
Vite/Vitest configuration defaults, and a default call through an actual imported
Nitro definePlugin/defineNitroPlugin binding. The Nitro wrapper establishes an
entry candidate even where registration configuration is not captured. Arbitrary
same-named functions do not qualify. Extra exports in config/plugin files remain
eligible. Other framework loaders and customized roots need `entryPoints`;
absence of internal references never rules out undeclared external consumers.

References: [Vitest configuration](https://vitest.dev/config/) and
[Nitro runtime plugins](https://nitro.build/docs/plugins). These conventions are
bounded policy, not inferred execution of target configuration.

## Slop policy and output

Slop diagnoses `.ts`, `.tsx`, `.js`, `.jsx`, and `.mjs`. The graph can inspect
`.mts`, `.cts`, and `.cjs` for references, but Slop does not diagnose their exports.
This inherited diagnostic-extension limitation remains; graph support alone does
not establish diagnostic coverage.

Type evidence preserves an export without establishing a runtime caller. In the
frozen Sift comparison, 19 old export findings disappear solely through type
evidence, including `buildEvidencePrompt` and `buildFitPrompt`. This conservative
precision/recall tradeoff can hide runtime-dead cleanup candidates.

The export check emits only for authored exports with no observed evidence and
no affected uncertainty. It includes test references by default, does not add a
test-only cleanup check, and never recommends deleting a module or initializer.
Static dependencies and re-exports are reasons to preserve the declaration even
when no actual runtime caller is observed. Human reports and the dashboard expose
bounded coverage; JSON carries full scan-specific reasons and source digests.
Parse/adapter failures crash the doctor and fail the gate. Missing engines narrow
checks visibly and cannot count as exercised certification.

Duplicate candidates require at least three executable statement nodes and 25
body AST nodes; signature length never contributes. This suppresses generic
one-expression and many two-statement helpers, while retaining validation logic.
Small guarded helpers can still pass; domain value remains a review judgment.
Parameters and bodies compare after removing coordinates/comments/raw spelling;
strings, templates, regex patterns and BigInts retain their values. Captured
bindings can differ. Named functions with different names can now match, and
same-line surrounding statements cannot affect the fingerprint. Each site retains
its coordinates and full function evidence span. There is no text fallback when
the engine is absent.

The duplicate-helper and export checks use revision 2, as do the four checks later
migrated from line matching to shared call/value facts (hostname routing, boolean
collapse, overlapping substrings and abbreviation regexes). Old revision-1
decisions for those checks must be reassessed. `unread-local-binding` also uses
revision 2 because its side-effect exemption now follows shared initializer and
call ranges across multiline formatting; the remaining binding-only check retains
its revision. All Slop checks declare their actual occurrence reporting unit.
`Fixture.includeTests: false` exercises ordinary
default scope, while omitted/true retains the legacy deliberately seeded test
scope. See the implementation verification report for measured behavior and
remaining coverage limitations; this design is not independent certification.
