// One-shot D20 fixture migration: add the emitting check's rule to every
// non-empty `expected` entry by running each doctor against each fixture
// seed and matching findings on file:line. Reports (and refuses) fixtures
// where findings and expectations do not pair up one-to-one — those hide
// duplicate findings the old set-based gate collapsed and need a human.
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { pathToFileURL } from "url";
import { runDoctor } from "../bin/runner.js";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

const doctors = process.argv.slice(2);
if (doctors.length === 0) {
  console.error("usage: node dev/migrate-fixtures-rules.mjs <slug>...");
  process.exit(2);
}

let failures = 0;

for (const slug of doctors) {
  const programPath = path.join(REPO, "doctors", slug + ".mjs");
  const fixturesPath = path.join(REPO, "doctors", slug + ".fixtures.mjs");
  const { fixtures } = await import(pathToFileURL(fixturesPath).href);
  let slugFailed = false;

  // Per fixture (module order == document order): one rule per non-empty
  // expected entry, or null when the run could not pair them.
  const queue = [];
  for (const fixture of fixtures) {
    // Empty expectations and entries already carrying a rule (hand-migrated
    // double violations) have no block for the graft regex — skipping them
    // keeps the queue aligned with the remaining rule-less blocks.
    if (fixture.expected.length === 0 || fixture.expected.every((e) => e.rule !== undefined)) continue;
    const rules = [];
    const problems = [];
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "any-doctor-migrate-"));
    try {
      for (const [rel, content] of Object.entries(fixture.seed)) {
        const abs = path.join(tmp, rel);
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, content);
      }
      const result = await runDoctor({ programPath, targetDir: tmp, includeTests: true });
      const remaining = [...result.findings];
      for (const e of fixture.expected) {
        const i = remaining.findIndex((f) => f.file === e.file && f.line === e.line);
        if (i === -1) {
          problems.push(`no finding for ${e.file}:${e.line}`);
          rules.push(null);
        } else {
          rules.push(remaining[i].rule ?? null);
          remaining.splice(i, 1);
        }
      }
      for (const extra of remaining) {
        problems.push(`unmatched finding ${(extra.rule ?? "") + " "}${extra.file}:${extra.line}`);
      }
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
    if (problems.length > 0) {
      failures += 1;
      slugFailed = true;
      console.error(`!! ${slug} / "${fixture.name}": ${problems.join("; ")}`);
    }
    queue.push(rules);
  }

  if (slugFailed) continue;

  // Textual graft: the j-th non-empty expected block takes the j-th queued
  // rule list; single-entry blocks only (the contract's shape to date).
  const text = fs.readFileSync(fixturesPath, "utf8");
  const grafted = { count: 0 };
  const out = text.replace(
    /expected: \[\{ file: ("(?:[^"\\]|\\.)*"), line: (\d+) \}\]/g,
    (whole, file, line) => {
      const rules = queue.shift();
      if (rules === undefined || rules.length !== 1 || rules[0] === null) return whole;
      grafted.count += 1;
      return `expected: [{ rule: "${rules[0]}", file: ${file}, line: ${line} }]`;
    },
  );
  if (queue.length > 0) {
    failures += 1;
    console.error(`!! ${slug}: ${queue.length} computed fixture rule list(s) had no expected block to graft`);
    continue;
  }
  fs.writeFileSync(fixturesPath, out);
  console.log(`${slug}: grafted rule onto ${grafted.count} expected entries`);
}

process.exit(failures > 0 ? 1 : 0);
