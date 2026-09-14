# Structural call facts

`ctx.analysis.calls(file).structure` adds generic, derived relationships to the
existing calls capability. The host owns parsing and lexical bindings; doctors
own framework meaning. No AST, parser, target execution, type checker or dependency
resolution is exposed to doctors through these facts.

- `values` describes literals, references, object properties in source order,
  top-level spreads, arrays, functions, calls, transparent wrappers and conditional
  alternatives. Unknown expressions remain `unknown`. Offsets address captured
  expressions; call values link to the call's exclusive end, preserving nested
  call chains that share a start offset. Supported wrappers retain runtime value.
- `bindings` records declaration identities, initializers, destructuring paths,
  parameter positions, reassignment, direct member mutation, call-argument escapes and assignment values.
  Imported type references, local type aliases, union alternatives and global
  `Pick` projections are declared type contracts, not runtime type proof. Other
  type expressions are unresolved, never inferred from familiar spelling.
- `functions` records returned values through straight-line blocks and `if`
  statements. Boolean literal conditions remove unreachable alternatives. Loops,
  try/finally and other unsupported control flow mark return uncertainty.
  Calls are never evaluated. Consumers must not treat an incidental callback call
  as proof of what the callback returns.
- `loops` records body ranges and their owning function. A call in a nested
  function is not proof that it executes during the outer loop. Existing call
  usage distinguishes direct awaits, returns, discards, arguments and storage.
- `directives` contains the program's initial string-literal expression statements.
  Imports and other statements terminate that prologue; comments do not.

The projection supports bounded reasoning, not a whole-program interpreter.
Reassignments, alias escapes, custom wrappers and interprocedural execution may
remain unresolved. Doctors must retain uncertainty or restrict their claim and
must declare `needs: ["calls"]` with an implemented unavailable-analysis policy.
No project-wide absence or runtime reachability follows from these local facts.

## Exact expression value uses

`structure.flow` adds a bounded value-use graph for consumers that need to
distinguish an expression result from nested values. IDs are unique per expression,
not offsets: `[1].filter(f).map(g)` has distinct array, filter-result and map-result
IDs even though they start at the same source position. Existing offset-indexed
`values` and Convex facts retain their compatibility contract.

The graph records ordered object properties, array element versus spread roles,
constructors, exact awaits/returns/discards/assignments, lexical initializer links,
declared array contracts and for-of element bindings. Expression wrappers share
the wrapped value identity. Literal dead branches and statements after a direct
return are excluded; other conditional execution remains unproven. Bigint and
regexp literals remain unknown, keeping the host protocol JSON-safe.

These are generic structural facts, not a whole-program interpreter. A returned
function is different from executing its body; awaiting an object does not await
its fields. Framework and native-API identity, promise settlement policy and
cleanup interpretation remain in the doctor. The Async doctor uses this graph;
its source, installed package and unavailable-analysis contracts are tested together.
