import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { compareFindings, RESULT_SENTINEL, PROTOCOL_VERSION } = require("../bin/contract.js");

test("compareFindings: exact set passes when actual equals expected", () => {
  const diff = compareFindings(
    [{ file: "a.ts", line: 2 }],
    [{ file: "a.ts", line: 2 }]
  );
  assert.deepEqual(diff, { missing: [], unexpected: [] });
});

test("compareFindings: a missing expected finding is reported", () => {
  const diff = compareFindings(
    [{ file: "a.ts", line: 2 }],
    []
  );
  assert.deepEqual(diff, { missing: [{ file: "a.ts", line: 2 }], unexpected: [] });
});

test("compareFindings: an unexpected finding is reported (precision gate)", () => {
  const diff = compareFindings(
    [],
    [{ file: "b.ts", line: 7 }]
  );
  assert.deepEqual(diff, { missing: [], unexpected: [{ file: "b.ts", line: 7 }] });
});

test("compareFindings: message and severity differences do not matter", () => {
  const diff = compareFindings(
    [{ file: "a.ts", line: 2 }],
    [{ file: "a.ts", line: 2, message: "anything", severity: "error" }]
  );
  assert.deepEqual(diff, { missing: [], unexpected: [] });
});

test("protocol constants exist and are versioned", () => {
  assert.equal(typeof RESULT_SENTINEL, "string");
  assert.ok(RESULT_SENTINEL.length > 0);
  assert.equal(PROTOCOL_VERSION, 1);
});
