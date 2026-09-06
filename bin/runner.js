import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { Cause, Effect, Exit, Schema } from "effect";
import { fixturesPathFor, RESULT_SENTINEL } from "./contract.js";
// The Runner: the single owner of the doctor-loader protocol. Everything
// that executes a doctor program — run, verify, meta, count — crosses this
// interface. The argv shapes, the sentinel framing, the timeout policy, and
// the typed failures live here and nowhere else. A future engine adapter
// (e.g. oxc behind ctx.search) or sandbox runner slots in behind this
// interface without touching the callers.
export class ProgramMissing extends Schema.TaggedError()("ProgramMissing", {
    programPath: Schema.String,
}) {
}
export class FixturesMissing extends Schema.TaggedError()("FixturesMissing", {
    programPath: Schema.String,
    fixturesPath: Schema.String,
}) {
}
export class DoctorCrashed extends Schema.TaggedError()("DoctorCrashed", {
    programPath: Schema.String,
    detail: Schema.String,
}) {
}
export class NoFramedResult extends Schema.TaggedError()("NoFramedResult", {
    programPath: Schema.String,
    stdout: Schema.String,
}) {
}
export function isRunnerError(e) {
    return e instanceof ProgramMissing || e instanceof FixturesMissing
        || e instanceof DoctorCrashed || e instanceof NoFramedResult;
}
export function describeRunnerError(e) {
    switch (e._tag) {
        case "ProgramMissing": return "no such doctor program: " + e.programPath;
        case "FixturesMissing": return "no fixtures found for this doctor — expected " + e.fixturesPath;
        case "DoctorCrashed": return "doctor crashed:\n" + e.detail;
        case "NoFramedResult": return "doctor produced no framed result — stdout was:\n" + e.stdout;
    }
}
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
const META_TIMEOUT_MS = 30 * 1000;
function spawnLoader(programPath, modeArgs, timeoutMs) {
    return new Promise((resolve) => {
        var _a, _b;
        const loader = fileURLToPath(new URL("doctor-loader.mjs", import.meta.url));
        const child = spawn(process.execPath, [loader, programPath, ...modeArgs], {
            stdio: ["ignore", "pipe", "pipe"],
            timeout: timeoutMs,
        });
        let stdout = "";
        let stderr = "";
        (_a = child.stdout) === null || _a === void 0 ? void 0 : _a.on("data", (c) => { stdout += c.toString("utf8"); });
        (_b = child.stderr) === null || _b === void 0 ? void 0 : _b.on("data", (c) => { stderr += c.toString("utf8"); });
        child.on("error", () => resolve({ status: null, stdout, stderr: stderr + "(loader failed to start)" }));
        child.on("close", (status) => resolve({ status, stdout, stderr }));
    });
}
function lastLines(s, n = 8) {
    return s.trim().split("\n").slice(-n).join("\n");
}
// Loader frames are authored by our own doctor-loader — trusted construction.
// The guards below separate "a usable frame" from "not a frame"; they are not
// schema validation of the doctor contract.
const execLoader = (programPath, modeArgs, timeoutMs = DEFAULT_TIMEOUT_MS) => Effect.gen(function* () {
    const abs = path.resolve(programPath);
    if (!fs.existsSync(abs)) {
        return yield* new ProgramMissing({ programPath: abs });
    }
    const out = yield* Effect.tryPromise({
        try: () => spawnLoader(abs, modeArgs, timeoutMs),
        catch: (e) => new DoctorCrashed({ programPath: abs, detail: String(e) }),
    });
    if (out.status !== 0) {
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
    let frame;
    try {
        frame = JSON.parse(lines[idx].slice(RESULT_SENTINEL.length));
    }
    catch {
        return yield* new NoFramedResult({ programPath: abs, stdout });
    }
    if (frame === null || typeof frame !== "object") {
        return yield* new NoFramedResult({ programPath: abs, stdout });
    }
    return frame;
});
// Frames decode by their declared kind — the contract's Frame union is the
// discriminator; the casts below are keyed to it, not blind.
const asRunResult = (frame) => Effect.gen(function* () {
    var _a;
    if (frame.kind !== "run" || !Array.isArray(frame.findings) || frame.meta === null || typeof frame.meta !== "object") {
        return yield* new NoFramedResult({ programPath: String((_a = frame.root) !== null && _a !== void 0 ? _a : ""), stdout: JSON.stringify(frame).slice(0, 500) });
    }
    return frame;
});
const asVerifyResult = (frame) => Effect.gen(function* () {
    var _a;
    if (frame.kind !== "verify" || !Array.isArray(frame.results) || frame.meta === null || typeof frame.meta !== "object") {
        return yield* new NoFramedResult({ programPath: String((_a = frame.programPath) !== null && _a !== void 0 ? _a : ""), stdout: JSON.stringify(frame).slice(0, 500) });
    }
    return frame;
});
// ---- the public interface: plain async, typed failures thrown ----
//
// Effect is an implementation detail of this module. The public functions
// throw the tagged errors above (they extend Error, so callers get _tag
// matching and a stack); concurrency and composition stay inside.
const squash = (cause) => {
    const e = Cause.squash(cause);
    // Defects (interrupt/die) never occur in this module's code paths, but a
    // defect must not escape the typed channel.
    return isRunnerError(e) ? e : new DoctorCrashed({ programPath: "", detail: String(e) });
};
async function drain(effect) {
    const exit = await Effect.runPromiseExit(effect);
    return Exit.match(exit, {
        onFailure: (cause) => { throw squash(cause); },
        onSuccess: (value) => value,
    });
}
const runDoctorE = ({ programPath, targetDir }) => Effect.flatMap(execLoader(programPath, [path.resolve(targetDir)]), asRunResult);
const verifyDoctorE = ({ programPath, fixturesPath }) => Effect.gen(function* () {
    const abs = path.resolve(programPath);
    const fixtures = path.resolve(fixturesPath !== null && fixturesPath !== void 0 ? fixturesPath : fixturesPathFor(abs));
    if (!fs.existsSync(fixtures)) {
        return yield* new FixturesMissing({ programPath: abs, fixturesPath: fixtures });
    }
    const frame = yield* execLoader(abs, ["--verify", fixtures]);
    return yield* asVerifyResult(frame);
});
const countFindingsE = (options) => Effect.map(runDoctorE(options), (r) => r.findings.length);
export async function runDoctor(options) {
    return drain(runDoctorE(options));
}
export async function verifyDoctor(options) {
    return drain(verifyDoctorE(options));
}
// Parallel counting for the picker: one capability, order preserved, a
// crashed doctor reported as data instead of aborting the fan-out.
export async function countAll({ programPaths, targetDir }) {
    const exits = await Effect.runPromise(Effect.all(programPaths.map(p => Effect.exit(countFindingsE({ programPath: p, targetDir }))), { concurrency: "unbounded" }));
    return programPaths.map((programPath, i) => Exit.match(exits[i], {
        onFailure: (cause) => ({ programPath, error: squash(cause) }),
        onSuccess: (count) => ({ programPath, count }),
    }));
}
// A doctor whose meta cannot be read is data (a broken doctor), not a
// failure: metaDoctor never throws, it returns { meta: null, error }.
export async function metaDoctor({ programPath }) {
    const frame = await Effect.runPromise(Effect.flatMap(Effect.exit(execLoader(programPath, ["--meta"], META_TIMEOUT_MS)), (exit) => Effect.succeed(Exit.match(exit, {
        onFailure: (cause) => ({ meta: null, error: describeRunnerError(squash(cause)) }),
        onSuccess: (f) => ({
            meta: f.kind === "meta" && f.meta !== null && typeof f.meta === "object" ? f.meta : null,
        }),
    }))));
    return frame;
}
