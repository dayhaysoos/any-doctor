# Doctor SDK candidate calibration and certification

The bounded trust and certification goal is achieved for the existing three
recipes and the evaluated corpus. This is not a population accuracy estimate,
complete JavaScript analysis, or automatic-fix authorization. Genuine candidate
uncertainty remains visible; the frozen scan correctly retains a null score and
grade. No new query family, type provider, recipe or doctor migration was added.

## Candidate and artifact

- Branch: `feature/doctor-sdk-foundations`.
- Reviewed input: `bd5abfbf94c3cd7be6caffe9801265552061aa0c`; initial tree clean.
- Shipped source and public documentation commit: `765c29a488a860d6e201e5339e8a39c94a3080ef`.
- Artifact SHA-256: `2e241acc6053be054ac3d2988e67eaa5c02cc159efa5782cb33e65d4c610644b`.
- Artifact size: 273,731 bytes; files: 142.
- Baseline shipped source: `01175319105915b93287622173330643165e8870`.
- Baseline artifact SHA-256: `77e8ceb547eef291be3cdede63ca9874c12dc5aac8009bb74351784e53133982`.
- Baseline installed bytes were compared with all 142 retained tar entries.
- `package-file-digests.json` records every shipped file's SHA-256 and size;
  `working-file-digests.json` records every file changed in this focused pass.

The package was made after committing shipped changes, installed into a fresh
consumer, verified, and repacked. Both tarballs and file manifests are identical.
`docs/doctor-sdk.md` is included; evidence, plans, development tools and tests are
excluded. The final evidence commit also fixes the excluded mutation harness's
hoisted-dependency lookup. It changes no shipped bytes. A final pack from that
commit must reproduce the artifact above; final HEAD and actual third-pack
verification are returned with the completion response (a commit cannot embed
its own hash).

## Behavior and explicit outcomes

The option recipe now establishes candidate membership before asking identity
and option questions. Its internal result is either a candidate expression,
`clear`, or `unknown`; uncertainty is never a known negative. Stable references
and static own data properties retain alias identity even under arbitrary local
names. Resolved local functions and supported parameters, unrelated imports and
complete nonmatching spellings are clear. Conditional/fallback expressions only
become clear when all possible alternatives are outside the candidate space.
Opaque factory results, mutation, dynamic properties and plausible unresolved
aliases remain unknown. Factory spelling is never treated as the returned
function's identity.

The map recipe checks the configured member, then callback identity and async
status, before receiver classification. Supported synchronous bodies and native
scalar conversions are clear without an array proof. Async or unresolved
callbacks still require sufficient receiver and ownership evidence. Logical
alternatives retain the existing unknown flow kind; only the recipe uses their
alternatives to establish candidate exclusion. Explicit `super` syntax is a
noncandidate constructor invocation. No project code is executed.

Zero-finding human output renders `△ async — narrowed` and a complete doctor as
`✔ other-doctor — clean`. Exact-line tests also assert JSON narrowing/null scores.
The dashboard's empty state preserves these group statuses, and its per-doctor
scores preserve semantic narrowing rather than displaying a filled clean bar.

Generated profiles share the existing provider-unavailable skip policy. Their
explicit analysis-off cases still execute. The provider remains optional.

## Gates

| Gate | Local passed / failed / skipped | Fresh packed passed / failed / skipped |
| --- | --- | --- |
| Automated tests | 623 / 0 / 0 | source tests are not shipped |
| All bundled doctors | 265 / 0 / 15 | 265 / 0 / 15 |
| All recipe profiles, JSON and human | 21 / 0 / 0 | 21 / 0 / 0 |
| Original independent cases | 55 / 0 / 0 | 55 / 0 / 0 |
| Exact-location witnesses | 2 / 0 / 0 | 2 / 0 / 0 |
| Fresh independent cases | 20 / 0 / 0 | 20 / 0 / 0 |
| Unavailable-analysis assertions | 5 / 0 / 0 | 5 / 0 / 0 |
| Candidate boundaries and rendering | 47 / 0 / 0 | 47 / 0 / 0 |

All three profile mutations fail certification for their intended defect in both
installations: broken identity, unknown mapped to absence, and suppressed
reporting. Those expected nonzero exits are successful mutation checks, not
inherited suite failures. The 15 legacy fixture skips are unchanged. There are
no inherited automated or independent test failures carried into acceptance.

The same final boundary tests reproduce the old package's defects (17 passed,
30 failed); retained
stdout in `before/retained-final-before.stdout` contains the failing assertions.
The exact synchronous-map and unrelated-chain cases produce zero findings and
zero narrowing after repair. Positive neighbors remain independently reported.
Neighbors use qualified native fetch so a same-named local function cannot
accidentally shadow the control. Findings, reasons, occurrence counts, affected
files and report states are asserted, not merely command exits.

The independent scripts and labels were preserved byte-for-byte from the accepted
baseline. Their source hashes are recorded per installation. Location assertions
are part of the original runner and are also retained as separate location JSON.

### Optional provider

The retained package reproduced 18 passed / 12 failed / 41 skipped, exit 1.
Installing the candidate with `--ignore-scripts --omit=optional` gives **12 passed /
0 failed / 59 explicit skips**, exit **0**. Exactly 3 generated analysis-off
profiles execute and pass; exactly 18 generated analysis-on profiles skip.
`optional-provider/` contains every JSON result row, the human rendering, install
logs, commands and assertions. Ordinary installation executes all 21 profiles.

One packed mutation attempt encountered a harness dependency-layout error before
certification: it assumed dependencies lived inside the installed package. That
attempt is retained under `attempts/`. The harness now locates the candidate's
actual dependency root; the full packed gate and local mutation test pass.

## Frozen Sift calibration

671 eligible files; all 9 baseline findings are unchanged, including exact check,
file, line, column, severity and message projections. There remain eight fetch
cancellation review candidates and one effect timer review candidate. Local and
packed findings and narrowing projections are identical. All 1,530 frozen file
hashes match before and after each evaluation and again after measurement.
The frozen target was read-only throughout.

| Narrowing category | Before | After |
| --- | ---: | ---: |
| Fetch / unresolved-identity | 5,384 | 2,027 |
| Async map / unsupported-expression | 933 | 21 |
| Fetch / unsupported-expression | 51 | 12 |

Counts are coverage occurrences, not findings and not calibrated error rates.
The 39 removed occurrences in the last row were inspected individually:
38 are now clear (local immediately invoked functions, `super`, or unrelated
fallback identities), while one plausible `(options.fetchImpl ?? fetch)(...)`
remains unknown under the more precise `unresolved-identity` category. See
`removed-option-narrowing.json`; this was not a suppression of 39 real fetches.

`final-samples.json` records five source samples per remaining category, including
callee initialization where supported. The adjudication is:

- Fetch identity: `deps.fetchFn ?? fetch` is a plausible native alternative.
  `titleMatches = createCaseInsensitiveMatcher(...)`, compiled templates and
  `createOpenRouter(...)` returns are opaque function values; the syntax provider
  does not model those factories. Destructured callbacks such as `doGenerate`
  lack supported initializer identity. These may be ordinary functions in the
  actual program, but their bound values could be aliases; their syntax is not
  sufficient to establish exclusion. They remain conservatively unknown.
- Fetch option presence: `fetch(fileUrl)`, `fetch(issued.uploadUrl, ...)`,
  `fetch(buildInfoUrl, ...)`, upload inputs and route inputs are real native fetch
  calls. Their nonliteral input may supply Request-level signal state. Without
  type or cross-file proof, absence is not established, so unknown is justified.
- Async map: the sampled callbacks are visibly async, but receivers come from
  database calls, awaited helpers, filtered chains or bound candidate collections.
  Their array identity is not proven by the bounded provider. These are plausible
  map producers, not synchronous callbacks mistakenly entering async analysis.

Sanitized executable controls for source-discovered boundaries are retained in
`test/sdk-candidate-boundaries.test.mjs`: unrelated and fetch-containing fallbacks,
opaque local/imported factory results, `super`, scalar callbacks and their async
shadow, dynamic member identity and unrelated conditionals, each beside positive
controls. Core synchronous-map, chained-call, local-object, import, alias,
parameter and escaped-option controls are in the same file.

## Comparable performance

Three alternating baseline/candidate runs used the retained baseline installation
and fresh candidate installation, the same Node process version, frozen bytes and
command. `paired-performance.json` retains commands, all repetitions, exits and
stage measurements. Medians are computed independently per metric.

| Metric | Baseline | Candidate |
| --- | ---: | ---: |
| CLI wall time | 5,884 ms | 5,637 ms |
| CLI reported scan duration | 5,514 ms | 5,262 ms |
| CLI maximum resident set | 636,436,480 bytes | 667,746,304 bytes |
| Parse + scope + flow construction | 2343.7 ms | 2375.5 ms |
| Shared recipe evaluation | 502.4 ms | 289.9 ms |
| Combined direct analysis | 2839.9 ms | 2665.4 ms |
| Direct analysis maximum RSS | 282,480 KiB | 277,168 KiB |
| Package size | 272,068 bytes | 273,731 bytes |

The wall-time ratio is 0.958x.
CLI maximum RSS rose about 4.9%; package size rose 1,663 bytes (0.61%). The stage
benchmark separates parser/scope/flow construction from recipe evaluation on
identical 671-file inputs. It asks 45,453 recipe questions per run; the normal
scan retains 671 model requests and amortized cached analysis. These are local
measurements with normal runtime variability, not a universal speed guarantee.

## Reproduction and evidence map

Set `REPO`, `OUT`, `FROZEN` and `PACKAGE` to your checkout, fresh output directory,
unchanged frozen target and retained tarball. Paths in committed logs use stable
placeholders; raw evidence is retained separately in the completion workspace.

```sh
cd "$REPO"
npm test
node bin/cli.js verify --all
python3 dev/doctor-sdk/run-calibration.py local "$OUT/local" "$FROZEN"
npm pack --ignore-scripts --pack-destination "$OUT/package" --json
# Install PACKAGE into a fresh consumer before running packed gates.
python3 dev/doctor-sdk/run-calibration.py packed "$OUT/packed" "$FROZEN" --candidate "$OUT/consumer/node_modules/any-doctor"
node dev/doctor-sdk/check-optional-provider.mjs "$PACKAGE" "$OUT/optional-consumer"
node dev/doctor-sdk/measure-analysis.mjs "$REPO" "$FROZEN"
```

- `local/` and `packed/`: stdout, stderr, exit/command JSON, profiles, independent
  seeds/expectations/results, locations, unavailable checks, mutation outputs,
  unknown-reporting and boundary assertions, frozen scans and integrity checks.
- `before/`: exact retained-artifact regressions and optional-provider failure.
- `optional-provider/`: installation and both verification formats with every row.
- `package-file-digests.json`, `working-file-digests.json`, `artifact.json`,
  `pack.json`, `repack.json`: exact content and reproducibility provenance.
- `results-matrix.json`, `projection-parity.json`, `final-frozen-integrity.json`:
  machine-readable gate totals, projection equality and final snapshot check.
- `final-samples.json`, `removed-option-narrowing.json`: source adjudication inputs.
- `performance/`, `paired-performance.json`, `performance-medians.json`: repeated
  timing and memory evidence. Repeated full scan bodies remain in raw temporary
  storage; complete first local, packed and baseline scans are committed.

Remaining limitations include opaque factories, unsupported destructured aliases,
mutation, dynamic properties, unresolved async receivers/transfers, nonliteral
fetch inputs and cross-file/type information. These remain explicit uncertainty.
Frozen Sift still supplies no adjudicated real async-map positive; that behavior
is additionally covered by the unchanged independent and synthetic controls.
No reset, branch switch, push, publication, deployment or pull request occurred.
