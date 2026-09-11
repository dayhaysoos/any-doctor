import * as path from "path";
import { cohortFileCount } from "./contract.js";
import { describeRunnerError, runDoctorCohort } from "./runner.js";
export async function runCohort(spec, onProgress, exec = runDoctorCohort) {
    var _a, _b;
    const runStarted = Date.now();
    // The executor preserves options order; the fold pairs runs with
    // their doctor by index.
    const runs = await exec(spec.doctors.map(d => ({
        programPath: d.programPath,
        targetDir: spec.targetDir,
        includeTests: spec.includeTests,
    })), onProgress);
    const groups = [];
    const crashed = [];
    const doctorPaths = new Map();
    const fileCounts = [];
    let analysisAvailable;
    for (const [i, run] of runs.entries()) {
        const doctor = spec.doctors[i];
        if (!run.ok) {
            crashed.push({ id: doctor.id, detail: describeRunnerError(run.cause) });
            continue;
        }
        fileCounts.push(run.result.fileCount);
        // Process-wide capability: any run's answer is every run's answer.
        analysisAvailable !== null && analysisAvailable !== void 0 ? analysisAvailable : (analysisAvailable = (_a = run.result.capabilities) === null || _a === void 0 ? void 0 : _a.analysis);
        doctorPaths.set(run.result.meta.id, doctor.programPath);
        groups.push({ programName: path.basename(doctor.programPath), meta: run.result.meta, findings: run.result.findings });
    }
    return {
        groups,
        crashed,
        broken: ((_b = spec.broken) !== null && _b !== void 0 ? _b : []).map(b => ({
            id: b.slug,
            detail: b.cause !== undefined ? describeRunnerError(b.cause) : `broken doctor ${b.slug}`,
        })),
        skippedUnsafe: spec.skippedUnsafe ? [...spec.skippedUnsafe] : [],
        doctorPaths,
        fileCount: cohortFileCount(fileCounts),
        durationMs: Date.now() - runStarted,
        targetDir: spec.targetDir,
        analysisAvailable: analysisAvailable !== null && analysisAvailable !== void 0 ? analysisAvailable : false,
    };
}
