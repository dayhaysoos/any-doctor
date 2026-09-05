import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { Cause, Effect, Exit, Schema } from "effect";
import { DoctorMeta, RESULT_SENTINEL, RunResult, VerifyRunResult } from "./contract.js";

// The Runner: the single owner of the doctor-loader protocol. Everything
// that executes a doctor program — run, verify, meta, count — crosses this
// interface. The argv shapes, the sentinel framing, the timeout policy, and
// the typed failures live here and nowhere else. A future engine adapter
// (e.g. oxc behind ctx.search) or sandbox runner slots in behind this
// interface without touching the callers.

export class ProgramMissing extends Schema.TaggedError<ProgramMissing>()("ProgramMissing", {
  programPath: Schema.String,
}) {}

export class FixturesMissing extends Schema.TaggedError<FixturesMissing>()("FixturesMissing", {
  programPath: Schema.String,
  fixturesPath: Schema.String,
}) {}

export class DoctorCrashed extends Schema.TaggedError<DoctorCrashed>()("DoctorCrashed", {
  programPath: Schema.String,
  detail: Schema.String,
}) {}

export class NoFramedResult extends Schema.TaggedError<NoFramedResult>()("NoFramedResult", {
  programPath: Schema.String,
  stdout: Schema.String,
}) {}

export type RunnerError = ProgramMissing | FixturesMissing | DoctorCrashed | NoFramedResult;

export function describeRunnerError(e: RunnerError): string {
  switch (e._tag) {
    case "ProgramMissing": return "no such doctor program: " + e.programPath;
    case "FixturesMissing": return "no fixtures found for this doctor — expected " + e.fixturesPath;
    case "DoctorCrashed": return "doctor crashed:\n" + e.detail;
    case "NoFramedResult": return "doctor produced no framed result — stdout was:\n" + e.stdout;
  }
}

export interface RunOptions {
  programPath: string;
  targetDir: string;
}

export interface VerifyOptions {
  programPath: string;
  fixturesPath?: string;
}

export interface MetaRead {
  meta: DoctorMeta | null;
  error?: string;
}

export function fixturesPathFor(programPath: string): string {
  return programPath.replace(/\.(m|c)?js$/, "") + ".fixtures.mjs";
}

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
const META_TIMEOUT_MS = 30 * 1000;

interface LoaderOutput {
  status: number | null;
  stdout: string;
  stderr: string;
}

function spawnLoader(programPath: string, modeArgs: string[], timeoutMs: number): Promise<LoaderOutput> {
  return new Promise((resolve) => {
    const loader = fileURLToPath(new URL("doctor-loader.mjs", import.meta.url));
    const child = spawn(process.execPath, [loader, programPath, ...modeArgs], {
      stdio: ["ignore", "pipe", "pipe"],
      timeout: timeoutMs,
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (c: Buffer) => { stdout += c.toString("utf8"); });
    child.stderr?.on("data", (c: Buffer) => { stderr += c.toString("utf8"); });
    child.on("error", () => resolve({ status: null, stdout, stderr: stderr + "(loader failed to start)" }));
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
}

function lastLines(s: string, n = 8): string {
  return s.trim().split("\n").slice(-n).join("\n");
}

// Loader frames are authored by our own doctor-loader — trusted construction.
// The guards below separate "a usable frame" from "not a frame"; they are not
// schema validation of the doctor contract.
const execLoader = (
  programPath: string,
  modeArgs: string[],
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Effect.Effect<Record<string, unknown>, RunnerError> =>
  Effect.gen(function* () {
    const abs = path.resolve(programPath);
    if (!fs.existsSync(abs)) {
      return yield* new ProgramMissing({ programPath: abs });
    }
    const out = yield* Effect.tryPromise({
      try: () => spawnLoader(abs, modeArgs, timeoutMs),
      catch: (e): RunnerError => new DoctorCrashed({ programPath: abs, detail: String(e) }),
    });
    if (out.status !== 0) {
      return yield* new DoctorCrashed({ programPath: abs, detail: lastLines(out.stderr || "exit " + out.status) });
    }
    const lines = out.stdout.split("\n");
    const idx = lines.findLastIndex(l => l.startsWith(RESULT_SENTINEL));
    const stdout = out.stdout.slice(0, 500);
    if (idx === -1) {
      return yield* new NoFramedResult({ programPath: abs, stdout });
    }
    let frame: unknown;
    try {
      frame = JSON.parse(lines[idx].slice(RESULT_SENTINEL.length));
    } catch {
      return yield* new NoFramedResult({ programPath: abs, stdout });
    }
    if (frame === null || typeof frame !== "object") {
      return yield* new NoFramedResult({ programPath: abs, stdout });
    }
    return frame as Record<string, unknown>;
  });

const asRunResult = (frame: Record<string, unknown>): Effect.Effect<RunResult, RunnerError> =>
  Effect.gen(function* () {
    const ok = Array.isArray(frame.findings) && frame.meta !== null && typeof frame.meta === "object";
    if (!ok) {
      return yield* new NoFramedResult({ programPath: String(frame.root ?? ""), stdout: JSON.stringify(frame).slice(0, 500) });
    }
    return frame as unknown as RunResult;
  });

const asVerifyResult = (frame: Record<string, unknown>): Effect.Effect<VerifyRunResult, RunnerError> =>
  Effect.gen(function* () {
    if (!Array.isArray(frame.results)) {
      return yield* new NoFramedResult({ programPath: String(frame.programPath ?? ""), stdout: JSON.stringify(frame).slice(0, 500) });
    }
    return frame as unknown as VerifyRunResult;
  });

export const runDoctor = ({ programPath, targetDir }: RunOptions): Effect.Effect<RunResult, RunnerError> =>
  Effect.flatMap(
    execLoader(programPath, [path.resolve(targetDir)]),
    asRunResult,
  );

export const verifyDoctor = ({ programPath, fixturesPath }: VerifyOptions): Effect.Effect<VerifyRunResult, RunnerError> =>
  Effect.gen(function* () {
    const abs = path.resolve(programPath);
    const fixtures = path.resolve(fixturesPath ?? fixturesPathFor(abs));
    if (!fs.existsSync(fixtures)) {
      return yield* new FixturesMissing({ programPath: abs, fixturesPath: fixtures });
    }
    const frame = yield* execLoader(abs, ["--verify", fixtures]);
    return yield* asVerifyResult(frame);
  });

export const countIssues = (options: RunOptions): Effect.Effect<number, RunnerError> =>
  Effect.map(runDoctor(options), (r) => r.findings.length);

// A doctor whose meta cannot be read is data (a broken doctor), not a
// failure: metaDoctor never errors, it reports { meta: null, error }.
export const metaDoctor = ({ programPath }: { programPath: string }): Effect.Effect<MetaRead> =>
  Effect.gen(function* () {
    const exit = yield* Effect.exit(execLoader(programPath, ["--meta"], META_TIMEOUT_MS));
    return Exit.match(exit, {
      onFailure: (cause) => ({ meta: null, error: describeRunnerError(Cause.squash(cause) as RunnerError) }),
      onSuccess: (frame) => ({
        meta: frame.meta !== null && typeof frame.meta === "object" ? frame.meta as DoctorMeta : null,
      }),
    });
  });
