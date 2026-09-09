import { spawn } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { fileURLToPath } from "url";
import { Cause, Effect, Exit, Schema } from "effect";
import { DoctorMeta, fixturesPathFor, Mode, modeArgs, RESULT_SENTINEL, RunResult, SEARCH_RESULT, VerifyRunResult } from "./contract.js";
import { scanDoctorFile } from "./capabilities.js";
import { analysisStatus } from "./analysis.js";
import { unsafeRefusalLine } from "./report.js";
import { handleSearchLine } from "./search-host.js";

// The Runner: the single owner of the doctor-loader protocol. Everything
// that executes a doctor program — run, verify, meta, count — crosses this
// interface: the argv shapes (built from a Mode value), the sentinel
// framing, the timeout policy, and the typed failures. The parent side of
// Confinement lives here too (permission flags, the runtime-denial
// mapping); the Engine and the search host sit behind their own modules.

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

// The doctor references capabilities no doctor legitimately has (network,
// file writes, subprocesses, imports). This is a hard refuse: every execution
// path (run, verify, meta, count) passes through it, and there is no override.
// The typed error carries the capability set, so callers render the refusal
// from it — nobody re-scans to re-derive what this already knows.
export class DoctorUnsafe extends Schema.TaggedError<DoctorUnsafe>()("DoctorUnsafe", {
  programPath: Schema.String,
  capabilities: Schema.Array(Schema.String),
  findings: Schema.Array(Schema.String),
}) {}

export type RunnerError = ProgramMissing | FixturesMissing | DoctorCrashed | NoFramedResult | DoctorUnsafe;

export function isRunnerError(e: unknown): e is RunnerError {
  return e instanceof ProgramMissing || e instanceof FixturesMissing
    || e instanceof DoctorCrashed || e instanceof NoFramedResult || e instanceof DoctorUnsafe;
}

export function describeRunnerError(e: RunnerError): string {
  switch (e._tag) {
    case "ProgramMissing": return "no such doctor program: " + e.programPath;
    case "FixturesMissing": return "no fixtures found for this doctor — expected " + e.fixturesPath;
    case "DoctorCrashed": return "doctor crashed:\n" + e.detail;
    case "NoFramedResult": return "doctor produced no framed result — stdout was:\n" + e.stdout;
    case "DoctorUnsafe": return "\ud83d\uded1 " + unsafeRefusalLine(path.basename(e.programPath), e.capabilities)
      + "\n  " + e.findings.join("\n  ");
  }
}

// One line for listings — the broken-doctor warnings and failure parts —
// where the full detail belongs to describeRunnerError's renderers. Lives
// beside the error taxonomy so rendering rules for one type stay in one
// place.
export function causeSummaryLine(e: RunnerError | undefined): string {
  if (e === undefined) return "invalid meta";
  if (e._tag === "DoctorCrashed") return e.detail.split("\n")[0];
  return describeRunnerError(e).split("\n")[0];
}

export interface RunOptions {
  programPath: string;
  targetDir: string;
  /** List test files too; the default excludes them (tests are not production reads). */
  includeTests?: boolean;
}

export interface VerifyOptions {
  programPath: string;
  fixturesPath?: string;
}

export interface MetaRead {
  meta: DoctorMeta | null;
  // The typed cause of a null meta. Callers match on _tag and render
  // through describeRunnerError — they never re-derive the cause.
  cause?: RunnerError;
}

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
const META_TIMEOUT_MS = 30 * 1000;

interface LoaderOutput {
  status: number | null;
  stdout: string;
  stderr: string;
}

// Feature probe, run once per process: does this runtime know --permission?
// Runtimes without it degrade to the static gate alone. Exported so tests
// gate on the same answer the runner uses — no copied probes.
export function supportsPermissionModel(): Promise<boolean> {
  return (probe ??= new Promise<boolean>((resolve) => {
    const child = spawn(process.execPath, ["--permission", "-e", "0"], { stdio: "ignore" });
    child.on("error", () => resolve(false));
    child.on("close", (code) => resolve(code === 0));
  }));
}
let probe: Promise<boolean> | undefined;

// Node's permission model, applied to every doctor execution: filesystem
// writes, subprocesses, and native addons are denied by the runtime itself
// — an eval'd, obfuscated, or helper-module payload is stopped by the
// process, whatever the static scan missed. Reads stay open (reading the
// repo is a doctor's job); verify mode also writes to the temp dir, where
// the loader seeds and cleans up fixture sandboxes. --allow-worker exists
// for the import guard's hook thread only — denials propagate into worker
// threads (verified: fs write and subprocess are denied inside them).
// Network is not part of the permission model on current Node; the loader
// strips the network globals instead. This never throws: an unprobeable
// runtime just gets no flags.
const PERMISSION_BASE = ["--permission", "--allow-fs-read=*", "--allow-worker", "--disable-warning=SecurityWarning"];

// Exported so the loader tests can spawn children in exactly the
// configuration production creates — no fictional flag sets.
export async function permissionArgs(allowTmpWrites: boolean): Promise<string[]> {
  try {
    if (!(await supportsPermissionModel())) return [];
    return allowTmpWrites ? [...PERMISSION_BASE, `--allow-fs-write=${os.tmpdir()}`] : [...PERMISSION_BASE];
  } catch {
    return [];
  }
}

// Exported with its table: Node's denial phrasings vary across versions,
// and what the refusal line names for an evading doctor depends on this
// mapping — it deserves direct tests, not coverage by e2e accident.
export function deniedByPermissionModel(stderr: string): boolean {
  return /ErrAccessDenied|not allowed by the permission model|access to this api has been restricted/i.test(stderr);
}

export function denialCapability(stderr: string): string {
  if (/--allow-fs-write/i.test(stderr)) return "file write";
  if (/--allow-child-process/i.test(stderr)) return "subprocess";
  if (/--allow-worker/i.test(stderr)) return "worker";
  if (/--allow-addon/i.test(stderr)) return "native addon";
  return "forbidden capability";
}

function spawnLoader(programPath: string, mode: Mode, timeoutMs: number, nodeFlags: string[]): Promise<LoaderOutput> {
  return new Promise((resolve) => {
    const loader = fileURLToPath(new URL("doctor-loader.mjs", import.meta.url));
    const child = spawn(process.execPath, [...nodeFlags, loader, ...modeArgs(mode, programPath)], {
      stdio: ["pipe", "pipe", "pipe", "pipe"],
      timeout: timeoutMs,
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (c: Buffer) => { stdout += c.toString("utf8"); });
    child.stderr?.on("data", (c: Buffer) => { stderr += c.toString("utf8"); });
    // fd 3 carries ctx.search requests; the search host answers on stdin.
    let pending = "";
    child.stdio[3]?.on("data", (c: Buffer) => {
      pending += c.toString("utf8");
      let nl: number;
      while ((nl = pending.indexOf("\n")) !== -1) {
        const line = pending.slice(0, nl);
        pending = pending.slice(nl + 1);
        const response = handleSearchLine(line, mode);
        if (response !== null) child.stdin?.write(SEARCH_RESULT + response + "\n");
      }
    });
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
  mode: Mode,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Effect.Effect<Record<string, unknown>, RunnerError> =>
  Effect.gen(function* () {
    const abs = path.resolve(programPath);
    if (!fs.existsSync(abs)) {
      return yield* new ProgramMissing({ programPath: abs });
    }
    const gate = scanDoctorFile(abs);
    if (gate.red.length > 0) {
      return yield* new DoctorUnsafe({
        programPath: abs,
        capabilities: [...new Set(gate.red.map(f => f.capability))],
        findings: gate.red.map(f => `${f.capability}: ${f.detail}`),
      });
    }
    const nodeFlags = yield* Effect.promise(() => permissionArgs(mode.kind === "verify"));
    const out = yield* Effect.tryPromise({
      try: () => spawnLoader(abs, mode, timeoutMs, nodeFlags),
      catch: (e): RunnerError => new DoctorCrashed({ programPath: abs, detail: String(e) }),
    });
    if (out.status !== 0) {
      if (deniedByPermissionModel(out.stderr)) {
        return yield* new DoctorUnsafe({
          programPath: abs,
          capabilities: [denialCapability(out.stderr)],
          findings: ["the runtime refused a forbidden capability:", ...lastLines(out.stderr, 2).split("\n")],
        });
      }
      return yield* new DoctorCrashed({ programPath: abs, detail: lastLines(out.stderr || "exit " + out.status) });
    }
    const lines = out.stdout.split("\n");
    // The last sentinel line wins. A doctor writing directly to
    // process.stdout can forge a frame — accepted under the bug-not-
    // adversary trust model (doctor programs are our own agents' output).
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

// Frames decode by their declared kind — the contract's Frame union is the
// discriminator; the casts below are keyed to it, not blind.
const asRunResult = (frame: Record<string, unknown>): Effect.Effect<RunResult, RunnerError> =>
  Effect.gen(function* () {
    if (frame.kind !== "run" || !Array.isArray(frame.findings) || frame.meta === null || typeof frame.meta !== "object") {
      return yield* new NoFramedResult({ programPath: String(frame.root ?? ""), stdout: JSON.stringify(frame).slice(0, 500) });
    }
    const result = frame as unknown as RunResult;
    // The parent IS the host, so capabilities are known here, not asked:
    // whether the identity engine could power this run — the data behind
    // "narrowed" rendering (D20 Stage 2).
    result.capabilities = { analysis: analysisStatus().available };
    return result;
  });

const asVerifyResult = (frame: Record<string, unknown>): Effect.Effect<VerifyRunResult, RunnerError> =>
  Effect.gen(function* () {
    if (frame.kind !== "verify" || !Array.isArray(frame.results) || frame.meta === null || typeof frame.meta !== "object") {
      return yield* new NoFramedResult({ programPath: String(frame.programPath ?? ""), stdout: JSON.stringify(frame).slice(0, 500) });
    }
    return frame as unknown as VerifyRunResult;
  });

// ---- the public interface: plain async, typed failures thrown ----
//
// Effect is an implementation detail of this module. The public functions
// throw the tagged errors above (they extend Error, so callers get _tag
// matching and a stack); concurrency and composition stay inside.

const squash = (cause: Cause.Cause<RunnerError>): RunnerError => {
  const e = Cause.squash(cause);
  // Defects (interrupt/die) never occur in this module's code paths, but a
  // defect must not escape the typed channel.
  return isRunnerError(e) ? e : new DoctorCrashed({ programPath: "", detail: String(e) });
};

async function drain<T>(effect: Effect.Effect<T, RunnerError>): Promise<T> {
  const exit = await Effect.runPromiseExit(effect);
  return Exit.match(exit, {
    onFailure: (cause) => { throw squash(cause); },
    onSuccess: (value) => value,
  });
}

const runDoctorE = ({ programPath, targetDir, includeTests }: RunOptions): Effect.Effect<RunResult, RunnerError> =>
  Effect.flatMap(
    execLoader(programPath, { kind: "run", root: path.resolve(targetDir), includeTests }, DEFAULT_TIMEOUT_MS),
    asRunResult,
  );

const verifyDoctorE = ({ programPath, fixturesPath }: VerifyOptions): Effect.Effect<VerifyRunResult, RunnerError> =>
  Effect.gen(function* () {
    const abs = path.resolve(programPath);
    const fixtures = path.resolve(fixturesPath ?? fixturesPathFor(abs));
    if (!fs.existsSync(fixtures)) {
      return yield* new FixturesMissing({ programPath: abs, fixturesPath: fixtures });
    }
    const frame = yield* execLoader(abs, { kind: "verify", fixtures }, DEFAULT_TIMEOUT_MS);
    return yield* asVerifyResult(frame);
  });

export async function runDoctor(options: RunOptions): Promise<RunResult> {
  return drain(runDoctorE(options));
}

// The cohort primitive: every doctor runs as its own confined child
// through a bounded pool — doctors are CPU-bound parsers, and an
// unbounded fan-out contends with the machine's real work (4 measured
// faster than 9-wide on a busy 10-core laptop). Results keep input
// order; a crash is typed data (RunnerError) and never interrupts its
// siblings. Concurrency policy is execution policy — it lives here,
// beside the Doctor-run protocol, and the command layer consumes the
// facade. onProgress fires as each doctor settles (completion order,
// not input order) — the live spinner's fuel; nothing else may depend
// on its timing.
export const DOCTOR_POOL_SIZE = 4;

export type CohortRun =
  | { ok: true; options: RunOptions; result: RunResult }
  | { ok: false; options: RunOptions; cause: RunnerError };

export interface CohortProgress {
  index: number;
  total: number;
  programPath: string;
  ok: boolean;
  durationMs: number;
}

export async function runDoctorCohort(options: RunOptions[], onProgress?: (p: CohortProgress) => void): Promise<CohortRun[]> {
  const exits = await Effect.runPromise(
    Effect.forEach(options, (o, i) =>
      Effect.tap(
        Effect.exit(runDoctorE(o)),
        (exit) => Effect.sync(() => {
          if (onProgress === undefined) return;
          onProgress({
            index: i,
            total: options.length,
            programPath: o.programPath,
            ok: Exit.isSuccess(exit),
            durationMs: Exit.isSuccess(exit) ? (exit.value.durationMs ?? 0) : 0,
          });
        }),
      ), {
      concurrency: Math.max(1, Math.min(DOCTOR_POOL_SIZE, options.length)),
    }),
  );
  return exits.map((exit, i) => Exit.match(exit, {
    onSuccess: (result) => ({ ok: true as const, options: options[i], result }),
    onFailure: (cause) => ({ ok: false as const, options: options[i], cause: squash(cause) }),
  }));
}

export async function verifyDoctor(options: VerifyOptions): Promise<VerifyRunResult> {
  return drain(verifyDoctorE(options));
}

// A doctor whose meta cannot be read is data (a broken doctor), not a
// failure: metaDoctor never throws, it returns { meta: null, error }.
export async function metaDoctor({ programPath }: { programPath: string }): Promise<MetaRead> {
  const frame = await Effect.runPromise(
    Effect.flatMap(
      Effect.exit(execLoader(programPath, { kind: "meta" }, META_TIMEOUT_MS)),
      (exit) => Effect.succeed(Exit.match(exit, {
        onFailure: (cause) => ({ meta: null, cause: squash(cause) }),
        onSuccess: (f) => ({
          meta: f.kind === "meta" && f.meta !== null && typeof f.meta === "object" ? f.meta as DoctorMeta : null,
        }),
      })),
    ),
  );
  return frame;
}
