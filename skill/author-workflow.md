# Any Doctor author workflow

Use this sequence when an agent encounters Any Doctor for the first time.

1. Start the authoring flow:

   ```bash
   any-doctor generate "<one-line intent>" --stdout
   ```

   Read the exact bundled authoring-instructions path printed by `generate`.
   Then inspect the target repository and return confirmed examples, safe
   lookalikes, unclear examples and one proposed rule boundary. Stop until the
   user accepts it.

2. After acceptance, inspect the product's supported facts and recipes:

   ```bash
   any-doctor capabilities --format json
   ```

   Map every fact required by the accepted boundary to this output. Use a shared
   recipe when it covers the rule. Report a missing product capability instead of
   implementing a private parser or resolver inside the doctor. The JSON output
   includes the exact input schema and a copyable example for every recipe. For
   focused human help, run `any-doctor capabilities <recipe-name>`.

   **No recipe fits:** read the SDK reference's Custom checks and Capability-gap
   report sections before scaffolding. Make a fact-to-claim table. For native
   calls, enumerate structural candidates and use shared `callIdentity`; include
   declared `globalThis`, `window` and `self` paths, aliases and transparent wrappers. For conditional
   values, distinguish test, true arm and false arm; a header dependency somewhere
   does not prove compliance on the relevant path.

   Finish this step only when each required proof is supported or has a capability-gap
   report with a minimal executable seed, expected/actual result, available facts,
   missing relationship, affected scope, classification and acceptance cases.
   Separate authoring mistakes from reusable SDK gaps, project policy and runtime
   uncertainty. Continue supported independent checks; leave the affected claim
   explicitly partial/blocked rather than implementing a private analyzer.

3. Create the mechanical starting files:

   ```bash
   any-doctor scaffold <slug>
   ```

   Replace every `__ANY_DOCTOR_TODO__` marker. The scaffold is intentionally
   incomplete and cannot run or verify while any marker remains.

4. Implement the accepted rule using the shared facts or recipe selected above.
   `help author` prints the exact bundled SDK reference path when more detail is
   needed.

5. Gate the result with the exact verify command printed by `generate`:

   ```bash
   any-doctor verify doctors/<slug>.mjs
   ```

   Also run isolated JSON stakes: a complete negative has no finding or narrowing;
   an unsupported candidate has scoped narrowing and null score/grade; a definite
   neighbor survives. Include both sides of conditionals and equivalent global,
   alias and wrapper spellings. Findings-only fixtures cannot establish coverage.
   Verification and these stakes must pass before reporting the doctor complete. `verify --all`
   checks every discovered doctor.

6. Run the doctor on real projects that use the technology. Prefer official
   examples, starter applications, SDK demos and established open-source apps.
   Review every finding, crash and incomplete result against source. Then copy a
   few representative examples, intentionally introduce each promised problem,
   and verify that the unchanged version stays quiet while the broken version is
   found. Record the project commits so the evaluation can be repeated. This is
   an authoring responsibility; Any Doctor does not download or enforce a set of
   projects.

`help agents` documents how an agent consumes scan results. This page documents
authoring; the two workflows are separate.

Consumer agents use public facts and recipes. Do not patch an installed Any Doctor package or build a private parser/resolver to force a result. When public facts are insufficient, narrow the affected check and produce a capability-gap report. Any Doctor maintainers may extend the shared provider only with a framework-neutral change and definite-positive, negative, uncertain, and mixed-neighbor regressions. A capability-gap report is evidence for future product work, not permission to guess or claim a clean result.

Capability-gap acceptanceCases must name currentFailure, definitePositive, negativeControl and uncertainControl. Each includes a runnable seed or fixturePath, exact findings, narrowing state/reasons and score/grade presence. Validate with the authoring catalog’s validateCapabilityGapReport, then execute the stakes; ordinary doctor verify does not consume these reports. Keep a definite positive visible beside an uncertain neighbor.
