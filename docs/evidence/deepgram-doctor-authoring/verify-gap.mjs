import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { certifyCapabilityGapReport } from "../../../bin/authoring.js";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../../..");
const report = JSON.parse(readFileSync(join(here, "browser-env-capability-gap.json"), "utf8"));
const result = certifyCapabilityGapReport(report, {
  doctorPath: join(repo, "doctors/deepgram.mjs"),
  reportDir: here,
});
assert.equal(result.valid, true, result.validationErrors.join("\n"));
assert.equal(result.failed, 0, JSON.stringify(result.cases, null, 2));
console.log(JSON.stringify({ passed: result.passed, failed: result.failed, skipped: 0 }));
