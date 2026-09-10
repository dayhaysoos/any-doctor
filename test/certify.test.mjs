import { test } from "node:test";
import assert from "node:assert/strict";

// The Certification harness's own seam: certify() runs in-process, no
// loader spawn — the interface is the test surface for every verify-mode
// policy (the loader tests cover the choreography around it).

const { certify, ClaimContractViolation } = (await import("../bin/certify.js"));

function todoDoctor() {
  return {
    meta: {
      id: "certify-test-todo",
      description: "flags TODO comments",
      severity: "info",
      checks: [{ id: "todo", description: "TODO found", claim: "a TODO comment is present", lookalikes: ["the word todorok"] }],
    },
    async doctor(ctx) {
      for (const f of ctx.files.list()) {
        const lines = ctx.files.read(f).split("\n");
        lines.forEach((l, i) => {
          if (l.includes("// TODO")) ctx.report.finding({ rule: "todo", file: f, line: i + 1 });
        });
      }
    },
  };
}

test("certify runs every policy in-process and names the rows", async () => {
  const results = await certify(todoDoctor(), [
    { name: "flagged", seed: { "src/a.ts": "const a = 1; // TODO fix\n" }, expected: [{ rule: "todo", file: "src/a.ts", line: 1 }] },
    { name: "clean", seed: { "src/b.ts": "const b = 2;\n" }, expected: [] },
  ]);
  const byName = new Map(results.map((r) => [r.name, r]));
  assert.equal(byName.get("flagged").ok, true);
  assert.equal(byName.get("clean").ok, true);
  assert.ok(byName.get("shared innocent corpus (12 files)").ok, "innocent corpus row");
  const probeRow = results.find((r) => r.name.startsWith("duplicate-location sensitivity"));
  assert.ok(probeRow, "probe row present");
  assert.ok(probeRow.ok, probeRow.error);
  assert.match(probeRow.name, /no two-in-one-file witness/, "single-violation witness is named as unpolicied");
  assert.equal(results.filter((r) => r.name.startsWith("sensitivity:")).length, 0, "no stakes, no sensitivity rows");
});

test("certify surfaces a planted dedup collapse as a failing probe row", async () => {
  const mod = todoDoctor();
  // Simulate the billing.ts bug class: dedup keyed on normalized statement text.
  mod.doctor = async (ctx) => {
    const seen = new Set();
    for (const f of ctx.files.list()) {
      const lines = ctx.files.read(f).split("\n");
      lines.forEach((l, i) => {
        const norm = l.trim();
        if (l.includes("// TODO") && !seen.has(norm)) {
          seen.add(norm);
          ctx.report.finding({ rule: "todo", file: f, line: i + 1 });
        }
      });
    }
  };
  const results = await certify(mod, [
    { name: "flagged", seed: { "src/a.ts": "const a = 1; // TODO fix\n" }, expected: [{ rule: "todo", file: "src/a.ts", line: 1 }] },
  ]);
  const probe = results.find((r) => r.name.startsWith("duplicate-location sensitivity"));
  assert.equal(probe.ok, false);
  assert.match(probe.error, /dedup keyed on statement text/);
});

test("certify refuses a claimless check before any sandbox runs", async () => {
  const mod = todoDoctor();
  mod.meta = { id: "claimless", description: "x", severity: "info", checks: [{ id: "vague", description: "bad code" }] };
  await assert.rejects(
    () => certify(mod, []),
    (e) => e instanceof ClaimContractViolation && /claim is required/.test(e.message),
  );
});

test("certify isolates a crashing fixture as a named failing row", async () => {
  const mod = todoDoctor();
  mod.doctor = async (ctx) => {
    if (ctx.files.list().includes("boom.ts")) throw new Error("kaboom");
  };
  const results = await certify(mod, [
    { name: "bomb", seed: { "boom.ts": "const x = 1;\n" }, expected: [] },
    { name: "fine", seed: { "ok.ts": "const y = 2;\n" }, expected: [] },
  ]);
  const bomb = results.find((r) => r.name === "bomb");
  assert.equal(bomb.ok, false);
  assert.match(bomb.error, /kaboom/);
  assert.equal(results.find((r) => r.name === "fine").ok, true);
});

test("certify's probe catches same-file collapse when the witness seeds two violations in one file", async () => {
  const mod = todoDoctor();
  // The billing.ts bug class: dedup keyed on normalized statement text,
  // globally. The witness seeds TWO distinct violations in one file (and
  // the doctor reports both — per-violation semantics, so the pair rule
  // applies); the pair file doubles each and the doctor still reports 2.
  mod.doctor = async (ctx) => {
    const seen = new Set();
    for (const f of ctx.files.list()) {
      const lines = ctx.files.read(f).split("\n");
      lines.forEach((l, i) => {
        const norm = l.trim();
        if (l.includes("// TODO") && !seen.has(norm)) {
          seen.add(norm);
          ctx.report.finding({ rule: "todo", file: f, line: i + 1 });
        }
      });
    }
  };
  const results = await certify(mod, [
    {
      name: "two-in-one-file",
      seed: { "src/a.ts": "const a = 1; // TODO alpha\nconst b = 2; // TODO beta\n" },
      expected: [
        { rule: "todo", file: "src/a.ts", line: 1 },
        { rule: "todo", file: "src/a.ts", line: 2 },
      ],
    },
  ]);
  const probe = results.find((r) => r.name.startsWith("duplicate-location sensitivity"));
  assert.equal(probe.ok, false);
  assert.match(probe.error, /collapse signature/);
});

test("certify's probe respects file-scoped checks (one verdict per file is a legitimate claim)", async () => {
  const mod = todoDoctor();
  // One finding per file, by claim ("a file containing an unfinished TODO"):
  // the pair file's two copies are one verdict, and the probe must not
  // read that as collapse — the witness seeds only one violation per file.
  mod.doctor = async (ctx) => {
    for (const f of ctx.files.list()) {
      if (ctx.files.read(f).includes("// TODO")) {
        ctx.report.finding({ rule: "todo", file: f, line: 1 });
      }
    }
  };
  const results = await certify(mod, [
    { name: "flagged", seed: { "src/a.ts": "const a = 1; // TODO fix\n" }, expected: [{ rule: "todo", file: "src/a.ts", line: 1 }] },
  ]);
  const probe = results.find((r) => r.name.startsWith("duplicate-location sensitivity"));
  assert.equal(probe.ok, true);
});
