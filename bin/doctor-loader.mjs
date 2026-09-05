import { pathToFileURL, fileURLToPath } from "url";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const [prog, second, third] = process.argv.slice(2);
if (!prog) {
  console.error("usage: doctor-loader.mjs <program.(m)js> <root> | <program.(m)js> --verify <fixtures.(m)js> | <program.(m)js> --meta");
  process.exit(2);
}
const verifyMode = second === "--verify";
const metaMode = second === "--meta";
if (!verifyMode && !metaMode && !second) {
  console.error("usage: doctor-loader.mjs <program.(m)js> <root>");
  process.exit(2);
}

const { buildCtx } = await import("./sdk.js");
const contract = await import("./contract.js");

const SEVERITIES = new Set(["error", "warning", "info"]);

function validateMeta(mod) {
  const m = mod.meta;
  const problems = [];
  if (!m || typeof m !== "object") problems.push("missing meta export");
  if (m && typeof m.id !== "string") problems.push("meta.id must be a string");
  if (m && typeof m.description !== "string") problems.push("meta.description must be a string");
  if (m && !SEVERITIES.has(m.severity)) problems.push(`meta.severity must be one of error|warning|info — got ${JSON.stringify(m.severity)}`);
  if (problems.length) {
    console.error("invalid doctor meta: " + problems.join("; "));
    process.exit(3);
  }
}

function runOnce(root, mod) {
  const started = Date.now();
  const { ctx, getFindings } = buildCtx(root);
  const fileCount = ctx.files.list().length;
  const result = mod.doctor(ctx);
  if (!result || typeof result.then !== "function") {
    throw new Error("doctor() must be async — declare it `export async function doctor(ctx)`");
  }
  return result.then(() => ({
    protocolVersion: contract.PROTOCOL_VERSION,
    root,
    fileCount,
    durationMs: Date.now() - started,
    meta: mod.meta,
    findings: getFindings(),
  }));
}

function materializeSeed(tmp, rel, content) {
  const abs = path.resolve(tmp, rel);
  if (abs !== tmp && !abs.startsWith(tmp + path.sep)) {
    throw new Error(`fixture seed path escapes the sandbox: ${rel}`);
  }
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
}

try {
  const mod = await import(pathToFileURL(prog).href);
  if (typeof mod.doctor !== "function") {
    console.error("doctor program must export `doctor(ctx)` — got: " + Object.keys(mod).join(", "));
    process.exit(3);
  }
  validateMeta(mod);

  const originalLog = console.log;
  console.log = (...args) => process.stderr.write(args.map(a => String(a)).join(" ") + "\n");

  try {
    if (metaMode) {
      process.stdout.write("\n" + contract.RESULT_SENTINEL + JSON.stringify({
        protocolVersion: contract.PROTOCOL_VERSION,
        kind: "meta",
        meta: mod.meta,
      }) + "\n");
    } else if (!verifyMode) {
      const result = await runOnce(second, mod);
      process.stdout.write("\n" + contract.RESULT_SENTINEL + JSON.stringify(result) + "\n");
    } else {
      const fixturesMod = await import(pathToFileURL(third).href);
      const fixtures = fixturesMod.fixtures;
      if (!Array.isArray(fixtures)) {
        console.error("fixture module must export `fixtures` (array) — got: " + Object.keys(fixturesMod).join(", "));
        process.exit(3);
      }
      const results = [];
      for (const fixture of fixtures) {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "any-doctor-verify-"));
        try {
          for (const [rel, content] of Object.entries(fixture.seed)) {
            materializeSeed(tmp, rel, content);
          }
          const result = await runOnce(tmp, mod);
          const diff = contract.compareFindings(fixture.expected, result.findings);
          results.push({ name: fixture.name, ok: diff.missing.length === 0 && diff.unexpected.length === 0, ...diff });
        } catch (e) {
          results.push({ name: fixture.name, ok: false, missing: [], unexpected: [], error: e && e.message ? e.message : String(e) });
        } finally {
          fs.rmSync(tmp, { recursive: true, force: true });
        }
      }
      process.stdout.write("\n" + contract.RESULT_SENTINEL + JSON.stringify({
        protocolVersion: contract.PROTOCOL_VERSION,
        kind: "verify",
        meta: mod.meta,
        results,
      }) + "\n");
    }
  } finally {
    console.log = originalLog;
  }
} catch (e) {
  console.error(e && e.stack ? e.stack : String(e));
  process.exit(1);
}
