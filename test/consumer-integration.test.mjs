import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { cases } from "../dev/consumer-analysis/cases.mjs";
import { projectConsumers } from "../bin/project-consumers.js";
import { functionStructures } from "../bin/function-structure.js";
const cli = resolve("bin/cli.js");
function inSeed(seed, fn) {
  const root = mkdtempSync(join(tmpdir(), "consumer-integration-"));
  try {
    for (const [file, source] of Object.entries(seed)) {
      mkdirSync(join(root, file, ".."), { recursive: true });
      writeFileSync(join(root, file), source);
    }
    return fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
for (const c of cases)
  test(`CLI consumer regression: ${c.name}`, () =>
    inSeed(c.seed, (root) => {
      const run = spawnSync(
        process.execPath,
        [
          cli,
          "run",
          "slop",
          root,
          "--format",
          "json",
          ...(c.includeTests ? ["--include-tests"] : []),
        ],
        { encoding: "utf8", maxBuffer: 20e6 },
      );
      const result = JSON.parse(run.stdout);
      if (c.failure) {
        assert.notEqual(run.status, 0);
        assert.ok(result.crashed.length);
        return;
      }
      assert.equal(run.status, 0, run.stderr + JSON.stringify(result.crashed));
      assert.equal(
        result.analysisAvailable,
        true,
        "unavailable engine is not an exercised clean result",
      );
      const findings = result.groups.flatMap((g) =>
        g.checks.flatMap((check) =>
          check.findings.map((f) => ({ ...f, rule: check.rule })),
        ),
      );
      const exports = findings
        .filter((f) => f.rule === "export-without-any-consumer")
        .map(
          (f) =>
            f.file + ":" + f.message.match(/no consumer found for (\w+)/)[1],
        )
        .sort();
      assert.deepEqual(exports, c.exports.toSorted());
      if (c.duplicates !== undefined)
        assert.equal(
          findings.filter(
            (f) => f.rule === "identical-helper-body-in-two-modules",
          ).length,
          c.duplicates,
        );
      if (c.coverageContains !== undefined) {
        const issues = result.groups.flatMap((group) => group.analysisCoverage?.issues ?? []);
        if (c.coverageContains === "") assert.deepEqual(issues, []);
        else assert.ok(issues.some((issue) => issue.includes(c.coverageContains)), JSON.stringify(issues));
      }
      if (c.uncertainFiles) {
        const graph = projectConsumers(root);
        const affected = Object.entries(graph.files).filter(([, exports]) =>
          exports.some((binding) => binding.evidence.some((e) => e.kind === "uncertain")),
        ).map(([file]) => file).sort();
        assert.deepEqual(affected, c.uncertainFiles.toSorted());
      }
      if (c.name === "test-consumer-default")
        assert.ok(findings.every((f) => !f.file.endsWith(".test.ts")));
      if (c.name === "different-captured-bindings")
        assert.ok(
          findings.every((f) =>
            /captured bindings.*require review/.test(f.message),
          ),
        );
      if (
        c.uncertainty || [
          "unsupported-config",
          "unknown-dynamic",
          "namespace-escape",
          "unresolved-relative",
        ].includes(c.name)
      )
        assert.ok(result.groups[0].analysisCoverage.issues.length > 0);
    }));

test("host separates type, test, runtime, reexport, public, and namespace uncertainty evidence", () => {
  for (const [name, kind] of [
    ["type-only-consumer", "type"],
    ["type-only-named", "type"],
    ["test-consumer-default", "test"],
    ["renamed-barrel", "reexport"],
    ["namespace-escape", "uncertain"],
    ["package-entry", "public"],
    ["default-alias", "runtime"],
  ]) {
    const c = cases.find((c) => c.name === name);
    inSeed(c.seed, (root) => {
      const fact = projectConsumers(root).files["a.ts"][0];
      assert.ok(
        fact.evidence.some((e) => e.kind === kind),
        name + JSON.stringify(fact),
      );
      if (kind === "type")
        assert.ok(fact.evidence.every((e) => e.kind !== "runtime"));
    });
  }
});
test("syntax fingerprints preserve bigint, regex and template values", () => {
  const source =
    "function f(){const n=123n; if(n) console.log(n); return /a b/.test(`a b`);}";
  const a = functionStructures("x.ts", source)[0];
  for (const variant of [
    source.replace("123n", "124n"),
    source.replace("/a b/", "/ab/"),
    source.replace("`a b`", "`ab`"),
  ])
    assert.notEqual(
      a.fingerprint,
      functionStructures("x.ts", variant)[0].fingerprint,
    );
});

test("host content cache does not reuse a same-size edit with preserved timestamps", async () => {
  const fs = await import("node:fs");
  const { handleAnalysisRequest, clearAnalysisCache } = await import(
    "../bin/analysis-host.js"
  );
  inSeed({ "a.ts": "const aa=1;" }, (root) => {
    const file = join(root, "a.ts"),
      stat = fs.statSync(file),
      mode = { kind: "run", root };
    const first = handleAnalysisRequest(
      { kind: "bindings", file: "a.ts", root },
      mode,
    );
    fs.writeFileSync(file, "const bb=1;");
    fs.utimesSync(file, stat.atime, stat.mtime);
    const next = handleAnalysisRequest(
      { kind: "bindings", file: "a.ts", root },
      mode,
    );
    assert.equal(first.file.bindings[0].name, "aa");
    assert.equal(next.file.bindings[0].name, "bb");
    clearAnalysisCache();
  });
});
test("source digest mismatch fails instead of mixing snapshots", async () => {
  const { handleAnalysisRequest } = await import("../bin/analysis-host.js");
  inSeed({ "a.ts": "export const value=1;" }, (root) => {
    const result = handleAnalysisRequest(
      { kind: "structures", file: "a.ts", root, sourceDigest: "incorrect" },
      { kind: "run", root },
    );
    assert.match(result.error, /source changed/);
  });
});
test("symlink modules are excluded, and explicit host analysis cannot escape root", async () => {
  const fs = await import("node:fs");
  const { handleAnalysisRequest } = await import("../bin/analysis-host.js");
  inSeed({ "outside.ts": "export const secret=1;" }, (outer) =>
    inSeed({ "a.ts": "export const local=1;" }, (root) => {
      fs.symlinkSync(join(outer, "outside.ts"), join(root, "link.ts"));
      const graph = projectConsumers(root);
      assert.ok(
        graph.coverage.inventory.exclusions.some((x) => x.includes("link.ts")),
      );
      assert.ok(!graph.files["link.ts"]);
      const result = handleAnalysisRequest(
        { kind: "structures", file: "link.ts", root },
        { kind: "run", root },
      );
      assert.match(result.error, /outside root/);
    }),
  );
});

test("explicit named exports override same-named export-star origins", () =>
  inSeed(
    {
      "a.ts": "export const shared=1;",
      "b.ts": "export const shared=2;",
      "barrel.ts": 'export {shared} from "./a"; export * from "./b";',
      "use.ts": 'import {shared} from "./barrel"; console.log(shared);',
    },
    (root) => {
      const graph = projectConsumers(root);
      assert.ok(
        graph.files["a.ts"][0].evidence.some((e) => e.kind === "runtime"),
      );
      assert.ok(
        !graph.files["b.ts"][0].evidence.some((e) => e.kind === "runtime"),
      );
      assert.ok(
        graph.files["b.ts"][0].evidence.some((e) => e.kind === "reexport"),
      );
    },
  ));

test("NodeNext workspace conditions follow the importer file format", () =>
  inSeed(
    {
      "tsconfig.json":
        '{"compilerOptions":{"moduleResolution":"nodenext","module":"nodenext"}}',
      "packages/lib/package.json":
        '{"name":"lib","exports":{".":{"import":"./import.ts","require":"./require.ts"}}}',
      "packages/lib/import.ts": "export const helper=1;",
      "packages/lib/require.ts": "export const helper=2;",
      "use.cts": 'import {helper} from "lib"; console.log(helper);',
    },
    (root) => {
      const graph = projectConsumers(root);
      assert.ok(
        graph.files["packages/lib/require.ts"][0].evidence.some(
          (e) => e.kind === "runtime",
        ),
      );
      assert.ok(
        !graph.files["packages/lib/import.ts"][0].evidence.some(
          (e) => e.kind === "runtime",
        ),
      );
    },
  ));
test("namespace re-export references cannot claim every origin was used at runtime", () =>
  inSeed(
    {
      "a.ts": "export const first=1; export const second=2;",
      "barrel.ts": 'export * as ns from "./a";',
      "use.ts": 'import {ns} from "./barrel"; console.log(ns.first);',
    },
    (root) => {
      const graph = projectConsumers(root);
      assert.ok(
        graph.files["a.ts"].every(
          (f) => !f.evidence.some((e) => e.kind === "runtime"),
        ),
      );
      assert.ok(
        graph.files["a.ts"].every((f) =>
          f.evidence.some((e) => e.kind === "uncertain"),
        ),
      );
    },
  ));

test("namespace and type-only uncertainty survive downstream star barrels", () => {
  for (const barrel of [
    'export * as ns from "./a";',
    'export type {first as ns} from "./a";',
  ])
    inSeed(
      {
        "a.ts": "export const first=1;",
        "barrel.ts": barrel,
        "forward.ts": 'export * from "./barrel";',
        "use.ts": 'import {ns} from "./forward"; console.log(ns.first);',
      },
      (root) => {
        const facts = projectConsumers(root).files["a.ts"][0];
        assert.ok(!facts.evidence.some((e) => e.kind === "runtime"));
        assert.ok(facts.evidence.some((e) => e.kind === "uncertain"));
      },
    );
});
