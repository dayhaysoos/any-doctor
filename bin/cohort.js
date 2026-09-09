import * as path from "path";
import { cohortFileCount } from "./report.js";
import { describeRunnerError, runDoctorCohort } from "./runner.js";
export async function runCohort(spec, onProgress) {
    var _a;
    const runStarted = Date.now();
    // runDoctorCohort preserves options order; the fold pairs runs with
    // their doctor by index.
    const runs = await runDoctorCohort(spec.doctors.map(d => ({
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
        // Skips are a discovery fact, not a run fact — the command layer,
        // which owns discovery, patches this field onto the outcome.
        skippedUnsafe: [],
        doctorPaths,
        fileCount: cohortFileCount(fileCounts),
        durationMs: Date.now() - runStarted,
        targetDir: spec.targetDir,
        analysisAvailable: analysisAvailable !== null && analysisAvailable !== void 0 ? analysisAvailable : false,
    };
}
