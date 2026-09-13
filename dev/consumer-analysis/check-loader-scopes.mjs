// Verify the host's actual per-export uncertainty against independently stated scopes.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { loaderCases } from "./loader-cases.mjs";
const graphFile = path.resolve(process.argv[2] ?? "bin/project-consumers.js");
const { projectConsumers } = await import(pathToFileURL(graphFile).href);
const rows = [];
for (const c of loaderCases) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "loader-scope-")));
  try {
    for (const [file, source] of Object.entries(c.seed)) {
      fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      fs.writeFileSync(path.join(root, file), source);
    }
    const graph = projectConsumers(root);
    const affected = Object.entries(graph.files).filter(([, bindings]) =>
      bindings.some((binding) => binding.evidence.some((ev) => ev.kind === "uncertain")),
    ).map(([file]) => file).sort();
    const explanationMatches = c.coverageContains === ""
      ? graph.coverage.issues.length === 0
      : graph.coverage.issues.some((issue) => issue.includes(c.coverageContains));
    rows.push({ name: c.name, passed: JSON.stringify(affected) === JSON.stringify(c.uncertainFiles.toSorted()) && explanationMatches,
      expectedScope: c.uncertainFiles, actualScope: affected, expectedExplanation: c.coverageContains,
      issues: graph.coverage.issues, exports: graph.files });
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}
const result = { graphFile, passed: rows.filter((r) => r.passed).length, failed: rows.filter((r) => !r.passed).length, skipped: 0, rows };
fs.writeFileSync(process.argv[3], JSON.stringify(result, null, 2) + "\n");
console.log({ passed: result.passed, failed: result.failed, skipped: result.skipped });
process.exitCode = result.failed ? 1 : 0;
