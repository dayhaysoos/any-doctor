import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync, execFileSync } from "node:child_process";
import { projectConsumers } from "../../bin/project-consumers.js";
import { createHash } from "node:crypto";
const root = "/tmp/any-doctor-frozen-sift";
const output = "docs/evidence/consumer-analysis";
const baseline = "/tmp/any-doctor-baseline-012/node_modules/any-doctor";
const manifest = JSON.parse(
  fs.readFileSync(path.join(output, "sift-manifest.json")),
);
for (const f of manifest.files)
  if (
    createHash("sha256")
      .update(fs.readFileSync(path.join(root, f.file)))
      .digest("hex") !== f.sha256
  )
    throw Error("snapshot changed: " + f.file);
const runs = [];
function versions(packageRoot) {
  const pkg = JSON.parse(
      fs.readFileSync(path.join(packageRoot, "package.json")),
    ),
    require = createRequire(path.join(packageRoot, "package.json"));
  return Object.fromEntries(
    [
      ...new Set([
        ...Object.keys(pkg.dependencies ?? {}),
        ...Object.keys(pkg.optionalDependencies ?? {}),
      ]),
    ].map((name) => {
      try {
        let resolved;
        try {
          resolved = require.resolve(name + "/package.json");
        } catch {
          resolved = require.resolve(name);
        }
        let dir = path.dirname(resolved);
        for (;;) {
          const file = path.join(dir, "package.json");
          if (fs.existsSync(file)) {
            const data = JSON.parse(fs.readFileSync(file));
            if (data.name === name)
              return [name, { version: data.version, resolvedPackage: file }];
          }
          const parent = path.dirname(dir);
          if (parent === dir) throw Error("no manifest");
          dir = parent;
        }
      } catch (error) {
        return [name, { unavailable: String(error) }];
      }
    }),
  );
}
for (const [label, packageRoot] of [
  ["before", baseline],
  ["after", process.cwd()],
]) {
  const cli = path.join(packageRoot, "bin/cli.js"),
    doctor = path.join(packageRoot, "doctors/slop.mjs");
  const args = [cli, "run", doctor, root, "--format", "json"];
  const start = performance.now();
  const run = spawnSync(process.execPath, args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 40e6,
  });
  const wallMs = performance.now() - start;
  if (run.status !== 0)
    throw Error(label + " failed: " + run.stderr + run.stdout.slice(0, 400));
  const data = JSON.parse(run.stdout);
  if (data.crashed.length) throw Error(label + " partial");
  fs.writeFileSync(path.join(output, `sift-${label}.json`), run.stdout);
  const dependencies = versions(packageRoot);
  runs.push({
    label,
    command: [process.execPath, ...args],
    cwd: root,
    wallMs,
    status: run.status,
    stderr: run.stderr,
    fileCount: data.fileCount,
    counts: data.counts,
    analysisAvailable: data.analysisAvailable,
    dependencies,
  });
}
const start = performance.now();
const graph = projectConsumers(root);
const wall = performance.now() - start;
fs.writeFileSync(
  path.join(output, "performance.json"),
  JSON.stringify(
    {
      sourceCommit: execFileSync("git", ["rev-parse", "HEAD"])
        .toString()
        .trim(),
      platform: process.platform,
      arch: process.arch,
      node: process.version,
      cpus: os.cpus()[0]?.model,
      totalMemoryBytes: os.totalmem(),
      runs,
      graph: {
        wallMs: wall,
        analysisMs: graph.coverage.durationMs,
        peakRssKiB: process.resourceUsage().maxRSS,
        rssAfterBytes: process.memoryUsage().rss,
        sourceBytes: graph.coverage.sourceBytes,
        inventoryFiles: graph.coverage.inventory.files.length,
        codeModules: Object.keys(graph.files).length,
        issues: graph.coverage.issues.length,
        snapshot: graph.coverage.snapshot,
      },
      limits:
        "Single sequential observation on one snapshot and one machine; RSS is this measurement host process peak, not a cross-repository capacity claim.",
    },
    null,
    2,
  ) + "\n",
);
console.log({
  runs: runs.map((r) => ({
    label: r.label,
    wallMs: r.wallMs,
    counts: r.counts,
  })),
  graphMs: wall,
  maxRSS: process.resourceUsage().maxRSS,
});
