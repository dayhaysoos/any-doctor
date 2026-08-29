#!/usr/bin/env node
import { spawnSync, SpawnSyncReturns } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { RunResult, VerifyRunResult, RESULT_SENTINEL } from "./contract";
import { renderReport } from "./report";
import { browseFindings } from "./browse";

const GREEN = "\x1b[32m", RED = "\x1b[31m", DIM = "\x1b[2m", BOLD = "\x1b[1m", RESET = "\x1b[0m";

interface ExecResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

function fail(msg: string): void {
  console.error(RED + msg + RESET);
}

function dim(msg: string): string {
  return DIM + msg + RESET;
}

function sh(cmd: string, args: string[], timeoutMs = 5 * 60 * 1000): ExecResult {
  const r: SpawnSyncReturns<string> = spawnSync(cmd, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: timeoutMs,
  });
  return { status: r.status, stdout: r.stdout || "", stderr: r.stderr || "" };
}

function parseResult(stdout: string): RunResult {
  const lines = stdout.split("\n");
  const idx = lines.findLastIndex(l => l.startsWith(RESULT_SENTINEL));
  if (idx === -1) {
    fail("doctor produced no framed result — stdout was:\n" + stdout.slice(0, 500));
    process.exit(1);
  }
  return JSON.parse(lines[idx].slice(RESULT_SENTINEL.length));
}

function executeLoader(programPath: string, mode: string | null, arg: string | null, targetDir?: string): RunResult {
  const abs = path.resolve(programPath);
  if (!fs.existsSync(abs)) {
    fail("no such doctor program: " + abs);
    process.exit(1);
  }
  const loader = path.join(__dirname, "doctor-loader.mjs");
  const argv: string[] = mode && arg !== null ? [loader, abs, mode, arg] : [loader, abs, targetDir ?? "."];
  const r = sh(process.execPath, argv);
  if (r.status !== 0) {
    fail("doctor crashed:\n" + (r.stderr || "exit " + r.status));
    process.exit(1);
  }
  return parseResult(r.stdout);
}

function useColor(): boolean {
  return Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
}

async function cmdRun(args: string[]): Promise<void> {
  const programPath = args[0];
  const targetDir = path.resolve(args[1] || ".");
  if (!programPath) {
    fail("usage: any-doctor run <doctor-program.(m)js> [targetDir]");
    process.exit(1);
  }
  const result = executeLoader(programPath, null, null, targetDir);
  const text = renderReport({
    programName: path.basename(programPath),
    description: result.meta.description,
    severity: result.meta.severity,
    blindSpots: result.meta.blindSpots,
    fileCount: result.fileCount,
    durationMs: result.durationMs,
    findings: result.findings,
  }, useColor());
  console.log(text);
  if (result.findings.length > 0 && process.stdin.isTTY && process.stdout.isTTY && !process.env.ANY_DOCTOR_HEADLESS) {
    console.log("");
    await browseFindings({
      root: targetDir,
      description: result.meta.description,
      severity: result.meta.severity,
      findings: result.findings,
    }, useColor());
  }
}

interface VerifyCase {
  name: string;
  ok: boolean;
  missing: { file: string; line: number }[];
  unexpected: { file: string; line: number }[];
  error?: string;
}

function cmdVerify(args: string[]): void {
  const programPath = args[0];
  const fixturesPath = programPath.replace(/\.(m|c)?js$/, "") + ".fixtures.mjs";
  if (!programPath || !fs.existsSync(path.resolve(fixturesPath))) {
    fail("usage: any-doctor verify <doctor-program.(m)js>  (expects " + fixturesPath + ")");
    process.exit(1);
  }
  const result = executeLoader(programPath, "--verify", path.resolve(fixturesPath)) as unknown as VerifyRunResult;
  const color = useColor();
  const g = (s: string): string => (color ? GREEN + s + RESET : s);
  const r = (s: string): string => (color ? RED + s + RESET : s);

  let failures = 0;
  for (const c of result.results as VerifyCase[]) {
    if (c.ok) {
      console.log(g("✔ " + c.name));
    } else if (c.error) {
      failures++;
      console.log(r("✖ " + c.name));
      console.log("  " + r("crashed: ") + c.error);
    } else {
      failures++;
      console.log(r("✖ " + c.name));
      for (const m of c.missing) console.log("  " + r("missing expected finding") + " " + m.file + ":" + m.line);
      for (const u of c.unexpected) console.log("  " + r("unexpected finding") + " " + u.file + ":" + u.line);
    }
  }
  const passed = result.results.length - failures;
  console.log("");
  console.log(dim(`${passed}/${result.results.length} fixtures passed for ${result.meta.id}`));
  if (failures > 0) process.exit(1);
}

function usage(): void {
  console.log(BOLD + "any-doctor" + RESET + dim(" — your agent writes the analyzer, fixtures prove it, CI reruns it forever"));
  console.log("");
  console.log("  run <doctor.(m)js> [dir]     execute a doctor program and render the report");
  console.log("  verify <doctor.(m)js>        run the doctor against its fixtures (exact-set diff)");
  console.log("");
  console.log(dim("doctors live next to their fixtures: <name>.mjs + <name>.fixtures.mjs"));
  console.log(dim("enforcement never touches a model — safe for CI."));
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const cmd = argv[0];
  const rest = argv.slice(1);
  if (!cmd || cmd === "help" || cmd === "--help") return usage();
  if (cmd === "run") return cmdRun(rest);
  if (cmd === "verify") return cmdVerify(rest);
  fail("unknown command: " + cmd);
  usage();
  process.exit(1);
}

main();
