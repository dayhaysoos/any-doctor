import { brokenDoctors, discoverDoctors, resolveDoctorPath, unsafeSlugs } from "./discover.js";
import { canRunTui } from "./tty.js";
import { pickItemOn } from "./picker.js";
export async function selectDoctor(doctorArg, options) {
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
    if (valid.length === 0)
        return { kind: "none-discovered", broken, unsafe };
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
                description: d.meta.description,
            })),
        };
    }
    const chosen = await pickItemOn(options.env, valid.map(d => ({
        id: d.slug,
        label: d.meta.description,
        sub: d.scope,
        severity: d.meta.severity,
    })), options.useColor, "Select a doctor");
    if (chosen === null)
        return { kind: "cancelled" };
    return {
        kind: "doctor",
        doctorPath: valid.find(d => d.slug === chosen.id).path,
        skipped: broken,
        unsafe,
    };
}
