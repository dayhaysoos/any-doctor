import fs from "node:fs";
import path from "node:path";
import { projectConsumers } from "../../bin/project-consumers.js";
import { functionStructures } from "../../bin/function-structure.js";
const root = process.argv[2] || "/tmp/any-doctor-frozen-sift";
const evidence = "docs/evidence/consumer-analysis";
const before = JSON.parse(
  fs.readFileSync(path.join(evidence, "sift-before.json")),
);
const after = JSON.parse(
  fs.readFileSync(process.argv[3] || "/tmp/any-doctor-sift-after.json"),
);
if (before.crashed.length || after.crashed.length)
  throw Error("cannot compare incomplete runs");
const graph = projectConsumers(root);
const flatten = (data) =>
  data.groups.flatMap((g) =>
    g.checks.flatMap((c) => c.findings.map((f) => ({ ...f, rule: c.rule }))),
  );
const key = (f) => [f.rule, f.file, f.line].join(":");
const old = new Map(flatten(before).map((f) => [key(f), f])),
  current = new Map(flatten(after).map((f) => [key(f), f]));
const rows = [];
for (const k of new Set([...old.keys(), ...current.keys()])) {
  const a = old.get(k),
    b = current.get(k),
    f = b ?? a;
  const source = fs.readFileSync(path.join(root, f.file), "utf8");
  let classification, reason, facts;
  if (f.rule === "export-without-any-consumer") {
    const name = f.message.match(/no consumer found for (\w+)/)?.[1];
    facts = graph.files[f.file]?.find((e) => e.name === name);
    if (a && b) {
      classification = "preserved positive";
      reason =
        "No consumer in supported captured graph; remains a contextual review candidate, not proven dead code.";
    } else if (b) {
      classification = "new review candidate";
      reason =
        "Module-identity analysis reports no supported consumer; requires source review for external/framework usage.";
    } else if (
      facts?.evidence.some((e) =>
        ["runtime", "test", "type", "import", "reexport"].includes(e.kind),
      )
    ) {
      classification = "corrected false positive";
      reason =
        "The baseline no-consumer claim conflicts with a resolved reference or dependency edge.";
    } else if (facts?.evidence.length) {
      classification = "intentional narrowing";
      reason =
        "Public exposure or explicit uncertainty prevents a no-consumer candidate.";
    } else if (
      graph.coverage.inventory.files.find((e) => e.file === f.file)?.role ===
      "generated"
    ) {
      classification = "corrected false positive";
      reason = "Generated declarations are not authored cleanup targets.";
    } else {
      classification = "regression";
      reason = "Unexplained missing export candidate.";
    }
  } else {
    facts = functionStructures(f.file, source).find((s) => s.line === f.line);
    if (a && b) {
      classification = "preserved positive";
      reason =
        "Matching substantial source structure remains a consolidation review candidate.";
    } else if (b) {
      classification = "new review candidate";
      reason =
        "AST comparison ignores declaration name and comments while retaining parameter/body structure; inspect captured bindings and contracts.";
    } else if (facts && (facts.statements < 3 || facts.nodes < 25)) {
      classification = "intentional narrowing";
      reason = `Body has ${facts.statements} executable statements and ${facts.nodes} nodes; below documented three-statement/25-node threshold.`;
    } else {
      classification = "regression";
      reason = "Unexplained missing duplicate candidate.";
    }
  }
  rows.push({
    key: k,
    change: a && b ? "retained" : b ? "added" : "removed",
    classification,
    reason,
    before: a,
    after: b,
    evidence: facts,
    sourceExcerpt: source
      .split("\n")
      .slice(Math.max(0, f.line - 2), f.line + 5)
      .join("\n"),
  });
}
fs.writeFileSync(
  path.join(evidence, "sift-classifications.json"),
  JSON.stringify(
    {
      evaluation:
        "implementation-authored source review aid, not independent sign-off",
      snapshot: graph.coverage.snapshot,
      counts: rows.reduce(
        (s, r) => ((s[r.classification] = (s[r.classification] ?? 0) + 1), s),
        {},
      ),
      rows,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  rows
    .filter((r) => r.change === "added" || r.classification === "regression")
    .map((r) => ({
      key: r.key,
      classification: r.classification,
      source: r.sourceExcerpt,
      evidence: r.evidence,
    })),
);
