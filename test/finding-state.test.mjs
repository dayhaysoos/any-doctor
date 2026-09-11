import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

// M2's remembered decisions: the state module's laws — lazy creation,
// atomic writes, loud corruption, reversal, and exact-key application
// with visible reassessment when evidence changes.

const {
  decisionsPath, loadDecisions, recordDecision, reverseDecision, saveDecisions, applyDecisions,
} = await import("../bin/finding-state.js");

const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), "any-doctor-state-"));
const key1 = "doc/rule\u0000src/a.ts\u0000digest1\u0000ctx\u00000\u0000line";
const occOf = (keys) => ({
  keys,
  presentPairs: new Set(keys.map((k) => `${k.checkKey}\u0000${k.file}`)),
});

test("decisions: no file, no init — reads are empty, never an error", () => {
  const dir = tmpDir();
  const r = loadDecisions(dir);
  assert.deepEqual(r, { ok: true, decisions: [] });
  assert.ok(!fs.existsSync(decisionsPath(dir)), "nothing is created by reading");
});

test("decisions: the first record creates state lazily and atomically", () => {
  const dir = tmpDir();
  const r = recordDecision(dir, { key: key1, checkKey: "doc/rule", file: "src/a.ts", line: 3, disposition: "accepted", reason: "intentional placeholder", actor: "cli" });
  assert.equal(r.ok, true);
  const file = JSON.parse(fs.readFileSync(decisionsPath(dir), "utf8"));
  assert.equal(file.schema, 1);
  assert.equal(file.decisions.length, 1);
  assert.equal(file.decisions[0].disposition, "accepted");
  assert.equal(file.decisions[0].reason, "intentional placeholder");
  assert.equal(file.decisions[0].scope, "local");
  // revision: same key again updates, does not duplicate
  recordDecision(dir, { key: key1, checkKey: "doc/rule", file: "src/a.ts", line: 3, disposition: "not-applicable", reason: "wrong for this code", actor: "dashboard" });
  const after = loadDecisions(dir);
  assert.equal(after.ok && after.decisions.length, 1);
  assert.equal(after.ok && after.decisions[0].disposition, "not-applicable");
});

test("decisions: a reason is required — empty is refused, whitespace is trimmed", () => {
  const dir = tmpDir();
  assert.equal(recordDecision(dir, { key: key1, checkKey: "c", file: "f", line: 1, disposition: "accepted", reason: "   ", actor: "cli" }).ok, false);
});

test("decisions: corrupt state is a LOUD named error — never a silent reset", () => {
  const dir = tmpDir();
  fs.mkdirSync(path.dirname(decisionsPath(dir)), { recursive: true });
  fs.writeFileSync(decisionsPath(dir), "{ not json");
  const r = loadDecisions(dir);
  assert.equal(r.ok, false);
  assert.match(r.error, /not valid JSON/);
  assert.match(r.error, /NOT reset/);
  // and recording onto corrupt state refuses rather than overwriting
  assert.equal(recordDecision(dir, { key: key1, checkKey: "c", file: "f", line: 1, disposition: "accepted", reason: "x", actor: "cli" }).ok, false);
  assert.equal(fs.readFileSync(decisionsPath(dir), "utf8"), "{ not json", "the corrupt file is preserved for hand repair");
});

test("decisions: malformed records are named and refused", () => {
  const dir = tmpDir();
  fs.mkdirSync(path.dirname(decisionsPath(dir)), { recursive: true });
  fs.writeFileSync(decisionsPath(dir), JSON.stringify({ schema: 1, decisions: [{ key: "k", checkKey: "c", file: "f", line: 1, disposition: "accepted", reason: "", scope: "local", actor: "a", createdAt: "x", updatedAt: "x" }] }));
  const r = loadDecisions(dir);
  assert.equal(r.ok, false);
  assert.match(r.error, /malformed decision record/);
});

test("decisions: reversal removes exactly the named key", () => {
  const dir = tmpDir();
  recordDecision(dir, { key: key1, checkKey: "doc/rule", file: "src/a.ts", line: 3, disposition: "accepted", reason: "r1", actor: "cli" });
  const key2 = "doc/rule\u0000src/a.ts\u0000digest2\u0000ctx\u00000\u0000line";
  recordDecision(dir, { key: key2, checkKey: "doc/rule", file: "src/a.ts", line: 9, disposition: "not-applicable", reason: "r2", actor: "cli" });
  assert.equal(reverseDecision(dir, key1).ok, true);
  const after = loadDecisions(dir);
  assert.equal(after.ok && after.decisions.length, 1);
  assert.equal(after.ok && after.decisions[0].key, key2);
  assert.equal(reverseDecision(dir, key1).ok, false, "reversing a missing key refuses");
});

test("decisions: application is exact-key; changed evidence is reassessment, never carried", () => {
  const dir = tmpDir();
  const d1 = { key: key1, checkKey: "doc/rule", file: "src/a.ts", line: 3, disposition: "accepted", reason: "r", actor: "cli", scope: "local", createdAt: "t", updatedAt: "t" };
  // same evidence → suppressed
  let a = applyDecisions([d1], occOf([{ key: key1, checkKey: "doc/rule", file: "src/a.ts", line: 3 }]));
  assert.equal(a.byKey.size, 1);
  assert.equal(a.reassessing.length, 0);
  // the line's content changed → the decision does not apply, the finding resurfaces
  const changedKey = "doc/rule\u0000src/a.ts\u0000digestCHANGED\u0000ctx\u00000\u0000line";
  a = applyDecisions([d1], occOf([{ key: changedKey, checkKey: "doc/rule", file: "src/a.ts", line: 3 }]));
  assert.equal(a.byKey.size, 0, "a changed-evidence finding is NOT suppressed");
  assert.equal(a.reassessing.length, 1, "and the decision surfaces for reassessment");
  assert.deepEqual(a.reassessing[0].currentKeys, [changedKey]);
  // finding gone entirely → dormant, kept for when it returns
  a = applyDecisions([d1], occOf([]));
  assert.equal(a.dormant.length, 1);
  assert.equal(a.reassessing.length, 0);
});

test("decisions: concurrent writers merge per key — no silent loss", () => {
  const dir = tmpDir();
  const mem = new Map();
  const readFile = (p) => (mem.has(p) ? { ok: true, text: mem.get(p) } : { ok: false, code: "absent" });
  const writeFile = (p, text) => mem.set(p, text);
  saveDecisions(dir, [{ key: "k1", checkKey: "c", file: "f", line: 1, disposition: "accepted", reason: "a", scope: "local", actor: "one", createdAt: "t", updatedAt: "t" }], readFile, writeFile);
  // a second writer that never saw the first record
  saveDecisions(dir, [{ key: "k2", checkKey: "c", file: "f", line: 2, disposition: "not-applicable", reason: "b", scope: "local", actor: "two", createdAt: "t", updatedAt: "t" }], readFile, writeFile);
  const merged = JSON.parse(mem.get(decisionsPath(dir)));
  assert.equal(merged.decisions.length, 2, "both writers' records survive the merge");
});

test("decisions: identical occurrences sharing one identity are NEVER suppressed by one decision", () => {
  // Two findings of the same check, different lines, identical line
  // content: the identity key is shared (same digest/context/scope), and
  // "identical text in two places is not one finding" — the decision is
  // held back as ambiguous instead of suppressing both copies.
  const dupKey = "doc/rule\u0000f.ts\u0000digestX\u0000none\u0000null\u0000line";
  const d = { key: dupKey, checkKey: "doc/rule", file: "f.ts", line: 1, disposition: "accepted", reason: "r", scope: "local", actor: "cli", createdAt: "t", updatedAt: "t" };
  const occ = occOf([
    { key: dupKey, checkKey: "doc/rule", file: "f.ts", line: 1 },
    { key: dupKey, checkKey: "doc/rule", file: "f.ts", line: 5 },
  ]);
  const a = applyDecisions([d], occ);
  assert.equal(a.byKey.size, 0, "no suppression on an ambiguous identity");
  assert.equal(a.ambiguous.length, 1);
  assert.equal(a.ambiguous[0].occurrences, 2, "the hold-back names the copy count");
  // The copies diverge (one line's content changes): the decision applies
  // to the exact surviving key only.
  const divergedKey = "doc/rule\u0000f.ts\u0000digestY\u0000none\u0000null\u0000line";
  const a2 = applyDecisions([d], occOf([{ key: divergedKey, checkKey: "doc/rule", file: "f.ts", line: 5 }]));
  assert.equal(a2.byKey.size, 0, "the changed copy is reassessment, not suppression");
  const a3 = applyDecisions([d], occOf([{ key: dupKey, checkKey: "doc/rule", file: "f.ts", line: 1 }]));
  assert.equal(a3.byKey.size, 1, "the single exact match suppresses");
});

test("decisions: wrong schema version is a loud named error", () => {
  const dir = tmpDir();
  fs.mkdirSync(path.dirname(decisionsPath(dir)), { recursive: true });
  fs.writeFileSync(decisionsPath(dir), JSON.stringify({ schema: 99, decisions: [] }));
  const r = loadDecisions(dir);
  assert.equal(r.ok, false);
  assert.match(r.error, /does not match the decisions schema/);
});

test("decisions: an interrupted write leaves the original intact (atomicity)", () => {
  const dir = tmpDir();
  const mem = new Map();
  const readFile = (p) => (mem.has(p) ? { ok: true, text: mem.get(p) } : { ok: false, code: "absent" });
  const writeFile = (p, text) => {
    if (text.includes("BOOM")) throw new Error("simulated interruption mid-write");
    mem.set(p, text);
  };
  saveDecisions(dir, [{ key: "k1", checkKey: "c", file: "f", line: 1, disposition: "accepted", reason: "first", scope: "local", actor: "a", createdAt: "t", updatedAt: "t" }], readFile, writeFile);
  const before = mem.get(decisionsPath(dir));
  assert.throws(() => saveDecisions(dir, [{ key: "k2", checkKey: "c", file: "f", line: 2, disposition: "accepted", reason: "BOOM", scope: "local", actor: "a", createdAt: "t", updatedAt: "t" }], readFile, writeFile));
  assert.equal(mem.get(decisionsPath(dir)), before, "the failed write changed nothing on record");
});

test("decisions: a present-but-unreadable file refuses loudly and is never replaced", () => {
  const dir = tmpDir();
  fs.mkdirSync(path.dirname(decisionsPath(dir)), { recursive: true });
  fs.writeFileSync(decisionsPath(dir), JSON.stringify({ schema: 1, decisions: [] }));
  fs.chmodSync(decisionsPath(dir), 0o000);
  try {
    const r = loadDecisions(dir);
    assert.equal(r.ok, false, "unreadable is NOT absent");
    assert.match(r.error, /exists but could not be read/);
    assert.match(r.error, /NOT reset/);
    // recording refuses; the file's bytes are untouched
    assert.equal(recordDecision(dir, { key: "k", checkKey: "c", file: "f", line: 1, disposition: "accepted", reason: "x", actor: "cli" }).ok, false);
    fs.chmodSync(decisionsPath(dir), 0o644);
    assert.equal(JSON.parse(fs.readFileSync(decisionsPath(dir), "utf8")).decisions.length, 0, "original preserved");
  } finally {
    fs.chmodSync(decisionsPath(dir), 0o644);
  }
});

test("decisions: a stale-evidence finding carries no decidable key (review probe)", async () => {
  const { reviewOf } = await import("../bin/review.js");
  const { encodeDecisionKey } = await import("../bin/finding-state.js");
  const { captureScan } = await import("../bin/scan-capture.js");
  // The file does not exist at the target: evidence is stale.
  const dir = tmpDir();
  const groups = [{ programName: "d.mjs", meta: { id: "d", description: "x", severity: "warning" }, findings: [{ file: "gone.ts", line: 1 }] }];
  const capture = captureScan(dir, groups, false, []);
  const view = reviewOf(capture, [], encodeDecisionKey);
  const row = view.rows.get("d/d@gone.ts:1");
  assert.equal(row?.stale, true, "the row is marked stale");
  assert.equal(row?.key, undefined, "no key — a location-derived key would repeat and authorize hiding");
  assert.equal(view.rawKeyByReadKey.size, 0, "nothing is decidable from stale evidence");
});

// ---- reviewer probes as permanent fixtures (the memory-review round) ----

test("probe: one decision never hides two same-line findings (columns distinguish)", async () => {
  const { reviewOf } = await import("../bin/review.js");
  const { encodeDecisionKey } = await import("../bin/finding-state.js");
  const { captureScan } = await import("../bin/scan-capture.js");
  const dir = tmpDir();
  fs.writeFileSync(path.join(dir, "a.ts"), "flag(1, BAD, BAD);\n");
  // Two findings, one line, distinct columns.
  const groups = [{
    programName: "d.mjs",
    meta: { id: "d", description: "x", severity: "warning" },
    findings: [{ rule: "r", file: "a.ts", line: 1, column: 7 }, { rule: "r", file: "a.ts", line: 1, column: 12 }],
  }];
  const capture = captureScan(dir, groups, false, []);
  const prov = { revisions: new Map(), programDigests: new Map([["d", "digest-d"]]) };
  const view0 = reviewOf(capture, [], encodeDecisionKey, prov);
  const key1 = view0.rows.get("d/r@a.ts:1:7")?.key;
  const key2 = view0.rows.get("d/r@a.ts:1:12")?.key;
  assert.ok(key1 !== undefined && key2 !== undefined && key1 !== key2, "distinct columns, distinct keys");
  // Decide the FIRST only — carrying provenance, as every production
  // record does (records without provenance are conservatively
  // incompatible and resurface).
  const decision = { key: view0.rawKeyByReadKey.get("d/r@a.ts:1:7"), checkKey: "d/r", file: "a.ts", line: 1, disposition: "accepted", reason: "one of two", scope: "local", actor: "cli", createdAt: "t", updatedAt: "t", provenance: { programDigest: "digest-d" } };
  const view = reviewOf(capture, [decision], encodeDecisionKey, prov);
  assert.equal(view.suppressedReadKeys.size, 1, "exactly ONE occurrence suppressed");
  assert.ok(view.suppressedReadKeys.has("d/r@a.ts:1:7"));
  assert.ok(!view.suppressedReadKeys.has("d/r@a.ts:1:12"), "the second same-line finding stays active");
});

test("probe: a changed doctor resurfaces its decisions (provenance)", async () => {
  const { reviewOf } = await import("../bin/review.js");
  const { encodeDecisionKey } = await import("../bin/finding-state.js");
  const { doctorDigests } = await import("../bin/identity.js");
  const { captureScan } = await import("../bin/scan-capture.js");
  const dir = tmpDir();
  fs.writeFileSync(path.join(dir, "a.ts"), "const BAD = 1;\n");
  const groups = [{ programName: "d.mjs", meta: { id: "d", description: "x", severity: "warning" }, findings: [{ rule: "r", file: "a.ts", line: 1 }] }];
  const capture = captureScan(dir, groups, false, []);
  const progV1 = "program v1";
  const provV1 = { revisions: new Map(), programDigests: new Map([["d", doctorDigests([{ id: "d", programPath: "/x" }], () => progV1)[0].digest]]) };
  const view0 = reviewOf(capture, [], encodeDecisionKey, provV1);
  const rawKey = view0.rawKeyByReadKey.get("d/r@a.ts:1");
  const decision = { key: rawKey, checkKey: "d/r", file: "a.ts", line: 1, disposition: "accepted", reason: "fine as-is", scope: "local", actor: "cli", createdAt: "t", updatedAt: "t", provenance: { programDigest: provV1.programDigests.get("d") } };
  const applied = reviewOf(capture, [decision], encodeDecisionKey, provV1);
  assert.equal(applied.suppressedReadKeys.size, 1, "same doctor: the decision applies");
  const progV2 = "program v2 — different meaning";
  const provV2 = { revisions: new Map(), programDigests: new Map([["d", doctorDigests([{ id: "d", programPath: "/x" }], () => progV2)[0].digest]]) };
  const changed = reviewOf(capture, [decision], encodeDecisionKey, provV2);
  assert.equal(changed.suppressedReadKeys.size, 0, "changed doctor: the decision does NOT silently carry");
  assert.ok(changed.reassessing.some((ra) => ra.file === "a.ts" && /doctor changed/.test(ra.reason)), "surfaced as reassessment");
  // A declared revision overrides digest churn: cosmetic edit + same revision → compatible
  const revProv = { revisions: new Map([["d/r", 3]]), programDigests: new Map([["d", "different-bytes"]]) };
  const revDecision = { ...decision, provenance: { revision: 3 } };
  assert.equal(reviewOf(capture, [revDecision], encodeDecisionKey, revProv).suppressedReadKeys.size, 1, "revision match survives digest churn");
  const bumped = { revisions: new Map([["d/r", 4]]), programDigests: new Map([["d", "different-bytes"]]) };
  assert.equal(reviewOf(capture, [revDecision], encodeDecisionKey, bumped).suppressedReadKeys.size, 0, "revision bump resurfaces");
});

test("probe: a continuation-line edit under a line-scoped decision resurfaces it", async () => {
  const { reviewOf } = await import("../bin/review.js");
  const { encodeDecisionKey } = await import("../bin/finding-state.js");
  const { captureScan } = await import("../bin/scan-capture.js");
  const dir = tmpDir();
  fs.writeFileSync(path.join(dir, "a.ts"), "flag(BAD,\n  option(1));\n");
  const groups = [{ programName: "d.mjs", meta: { id: "d", description: "x", severity: "warning" }, findings: [{ rule: "r", file: "a.ts", line: 1 }] }];
  const capture1 = captureScan(dir, groups, false, []);
  const view1 = reviewOf(capture1, [], encodeDecisionKey);
  const decision = { key: view1.rawKeyByReadKey.get("d/r@a.ts:1"), checkKey: "d/r", file: "a.ts", line: 1, disposition: "accepted", reason: "fine", scope: "local", actor: "cli", createdAt: "t", updatedAt: "t" };
  // The ARGUMENT changes on the following line — same flagged line.
  fs.writeFileSync(path.join(dir, "a.ts"), "flag(BAD,\n  option(2));\n");
  const capture2 = captureScan(dir, groups, false, []);
  const prov2 = { revisions: new Map(), programDigests: new Map([["d", "digest-d"]]) };
  const withProv = { ...decision, provenance: { programDigest: "digest-d" } };
  const view2 = reviewOf(capture2, [withProv], encodeDecisionKey, prov2);
  assert.equal(view2.suppressedReadKeys.size, 0, "the conservative span catches the continuation edit");
  assert.equal(view2.reassessing.length, 1, "and surfaces reassessment");
});

test("decisions: a null record in the store is a loud schema error, never a TypeError", () => {
  const dir = tmpDir();
  fs.mkdirSync(path.dirname(decisionsPath(dir)), { recursive: true });
  fs.writeFileSync(decisionsPath(dir), JSON.stringify({ schema: 1, decisions: [null] }));
  const r = loadDecisions(dir);
  assert.equal(r.ok, false);
  assert.match(r.error, /malformed decision record/);
  assert.match(r.error, /NOT reset/);
});

test("decisions: revision-declaring checks accept their own byte-identical program (--key flow)", async () => {
  const { provenanceCompatible, emptyProvenance } = await import("../bin/review.js");
  const scan = { revisions: new Map([["doc/rule", 1]]), programDigests: new Map([["doc", "digest-abc"]]) };
  // --key records only the digest; the program is unchanged → compatible
  assert.equal(provenanceCompatible({ programDigest: "digest-abc" }, scan, "doc/rule"), true,
    "a digest match is compatible even when the scan declares a revision");
  // digest differs, revision not recorded → incompatible (churn protection holds for stale digests)
  assert.equal(provenanceCompatible({ programDigest: "digest-old" }, scan, "doc/rule"), false);
  // revision match survives digest churn
  assert.equal(provenanceCompatible({ revision: 1 }, { revisions: new Map([["doc/rule", 1]]), programDigests: new Map([["doc", "different-bytes"]]) }, "doc/rule"), true);
  assert.equal(provenanceCompatible({ revision: 1 }, { revisions: new Map([["doc/rule", 2]]), programDigests: new Map([["doc", "different-bytes"]]) }, "doc/rule"), false);
  void emptyProvenance;
});
