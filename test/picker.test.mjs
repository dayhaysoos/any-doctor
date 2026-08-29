import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { pickerFrame, filterPickerItems } = require("../bin/picker.js");

const items = [
  { id: "unawaited-async-map", label: ".map(async ...) result is never awaited", sub: "repo/unawaited-async-map.mjs", severity: "warning" },
  { id: "no-console-log", label: "console.log left in code", sub: "global/no-console-log.mjs", severity: "info" },
];

test("pickerFrame: header, query line, and items render", () => {
  const out = pickerFrame(items, 0, "", false);
  assert.match(out, /Select a doctor/);
  assert.match(out, /❯ ▏/);
  assert.match(out, /unawaited-async-map\.mjs/);
  assert.match(out, /no-console-log\.mjs/);
});

test("pickerFrame: selected item is marked", () => {
  const out = pickerFrame(items, 1, "", false);
  const lines = out.split("\n").filter(l => l.includes("console.log left in code"));
  assert.ok(lines[0].startsWith("❯ "));
});

test("pickerFrame: no matches shows the empty state", () => {
  const out = pickerFrame([], 0, "zzz", false);
  assert.match(out, /no matching doctors/);
});

test("filterPickerItems: fuzzy query narrows the list", () => {
  const out = filterPickerItems(items, "console");
  assert.equal(out.length, 1);
  assert.equal(out[0].id, "no-console-log");
});
