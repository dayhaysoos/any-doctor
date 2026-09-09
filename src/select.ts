import { brokenDoctors, BrokenDoctor, discoverDoctors, resolveDoctorPath, unsafeSlugs, scopeLabel } from "./discover.js";
import { canRunTui, TtyEnv } from "./tty.js";
import { pickItemOn } from "./picker.js";

// Doctor selection policy: how a command decides WHICH doctor program it
// targets — an explicit path or slug, or a pick from discovery. This module
// computes; the command layer renders the result and decides exit codes.

export interface SelectionRow {
  scope: string;
  slug: string;
  description: string;
}

export type Selection =
  | { kind: "doctor"; doctorPath: string; skipped: BrokenDoctor[]; unsafe: string[] }
  | { kind: "not-found"; arg: string }
  | { kind: "none-discovered"; broken: BrokenDoctor[]; unsafe: string[] }
  | { kind: "non-interactive"; rows: SelectionRow[]; skipped: BrokenDoctor[]; unsafe: string[] }
  | { kind: "cancelled" };

export interface SelectOptions {
  cwd: string;
  globalDir?: string;
  bundledDir?: string;
  useColor: boolean;
  // false forces the non-interactive listing even on a real terminal
  // (ANY_DOCTOR_HEADLESS).
  allowPicker?: boolean;
  env: TtyEnv;
}

export async function selectDoctor(doctorArg: string | undefined, options: SelectOptions): Promise<Selection> {
  if (doctorArg !== undefined) {
    const resolved = resolveDoctorPath(doctorArg, options.cwd, {
      ...(options.globalDir !== undefined ? { globalDir: options.globalDir } : {}),
      ...(options.bundledDir !== undefined ? { bundledDir: options.bundledDir } : {}),
    });
    return resolved !== null
      ? { kind: "doctor", doctorPath: resolved, skipped: [], unsafe: [] }
      : { kind: "not-found", arg: doctorArg };
  }

  const discovered = await discoverDoctors(options.cwd, {
    ...(options.globalDir !== undefined ? { globalDir: options.globalDir } : {}),
    ...(options.bundledDir !== undefined ? { bundledDir: options.bundledDir } : {}),
  });
  const valid = discovered.filter(d => d.meta !== null);
  const unsafe = unsafeSlugs(discovered);
  const broken = brokenDoctors(discovered);

  if (valid.length === 0) return { kind: "none-discovered", broken, unsafe };

  // The gate runs before a picker ever starts, so "cancelled" can only mean
  // the user ended the pick — never "this isn't a terminal".
  if (!canRunTui(options.env) || options.allowPicker === false) {
    return {
      kind: "non-interactive",
      skipped: broken,
      unsafe,
      rows: valid.map(d => ({
        scope: d.scope,
        slug: d.slug,
        description: d.meta!.description,
      })),
    };
  }

  const chosen = await pickItemOn(options.env, valid.map(d => ({
    id: d.slug,
    label: d.meta!.description,
    sub: scopeLabel(d.scope),
    severity: d.meta!.severity,
  })), options.useColor, "Select a doctor");

  if (chosen === null) return { kind: "cancelled" };
  return {
    kind: "doctor",
    doctorPath: valid.find(d => d.slug === chosen.id)!.path,
    skipped: broken,
    unsafe,
  };
}
