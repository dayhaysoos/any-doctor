import * as path from "path";
import { cohortFileCount, ReportGroup, RunOutcome } from "./contract.js";
import { CohortProgress, describeRunnerError, runDoctorCohort } from "./runner.js";

// The Cohort: doctor programs + target → RunOutcome, in one deep module.
// A single doctor is a cohort of one — the command layer chooses the
// doctors (path, picker, --all) and picks the surface (report or
// dashboard); everything from first spawn to last settle lives here: the
// bounded pool, the crash fold, the process-wide analysis fold, the
// per-doctor paths, the file-count policy, and the timing. Progress
// events are the only side channel — presentation renders them, it never
// joins this fold.
//
// The crash fold is the module's contract with the CI chapter: a crash
// is data (id + the full describeRunnerError rendering ride the
// outcome), never a throw — a machine consumer reads failures from the
// RunOutcome, not from which promise rejected.

export interface CohortDoctor {
  // The discovery id (or, for a path-selected doctor, the program's
  // file name without .mjs) — the name a crash is reported under when
  // the run itself produced no meta.
  id: string;
  programPath: string;
}

export interface CohortSpec {
  doctors: readonly CohortDoctor[];
  targetDir: string;
  includeTests: boolean;
  // Skips are a discovery fact, not a run fact: the command layer, which
  // owns discovery, hands them in with the spec so the outcome it gets
  // back is complete — no post-hoc patching of a placeholder field.
  skippedUnsafe?: readonly string[];
  // Discovery facts that gate the run even when nothing scanned: a
  // broken doctor (unreadable program) fails ALWAYS, like a crash.
  broken?: readonly { slug: string; cause?: { _tag?: string } }[];
}

// The doctor executor: the seam the Cohort assembles outcomes from. The
// real adapter spawns doctor children through the runner; tests supply an
// in-process adapter with canned results — two adapters, a real seam, and
// the fold's laws (crash-as-data, the file-count max, the capability fold,
// order preservation) get exercised without a single spawn. Confinement
// claims keep their real-spawn tests; this seam is for the fold, not for
// safety.
export type DoctorExecutor = typeof runDoctorCohort;

export async function runCohort(
  spec: CohortSpec,
  onProgress?: (p: CohortProgress) => void,
  exec: DoctorExecutor = runDoctorCohort,
): Promise<RunOutcome> {
  const runStarted = Date.now();
  // The executor preserves options order; the fold pairs runs with
  // their doctor by index.
  const runs = await exec(spec.doctors.map(d => ({
    programPath: d.programPath,
    targetDir: spec.targetDir,
    includeTests: spec.includeTests,
  })), onProgress);

  const groups: ReportGroup[] = [];
  const crashed: RunOutcome["crashed"] = [];
  const doctorPaths = new Map<string, string>();
  const fileCounts: number[] = [];
  let analysisAvailable: boolean | undefined;
  for (const [i, run] of runs.entries()) {
    const doctor = spec.doctors[i];
    if (!run.ok) {
      crashed.push({ id: doctor.id, detail: describeRunnerError(run.cause) });
      continue;
    }
    fileCounts.push(run.result.fileCount);
    // Process-wide capability: any run's answer is every run's answer.
    analysisAvailable ??= run.result.capabilities?.analysis;
    doctorPaths.set(run.result.meta.id, doctor.programPath);
    groups.push({ programName: path.basename(doctor.programPath), meta: run.result.meta, findings: run.result.findings });
  }

  return {
    groups,
    crashed,
    skippedUnsafe: spec.skippedUnsafe ? [...spec.skippedUnsafe] : [],
    doctorPaths,
    fileCount: cohortFileCount(fileCounts),
    durationMs: Date.now() - runStarted,
    targetDir: spec.targetDir,
    analysisAvailable: analysisAvailable ?? false,
  };
}
