import { discoverDoctors, resolveDoctorPath } from "./discover.js";
import { countAll } from "./runner.js";
import { canRunTui } from "./tty.js";
import { pickItemOn } from "./picker.js";
export async function selectDoctor(doctorArg, options) {
    if (doctorArg !== undefined) {
        const resolved = resolveDoctorPath(doctorArg, options.cwd, options.globalDir !== undefined ? { globalDir: options.globalDir } : undefined);
        return resolved !== null
            ? { kind: "doctor", doctorPath: resolved, skipped: [] }
            : { kind: "not-found", arg: doctorArg };
    }
    const discovered = await discoverDoctors(options.cwd, options.globalDir !== undefined ? { globalDir: options.globalDir } : undefined);
    const valid = discovered.filter(d => d.meta !== null);
    const broken = discovered.filter(d => d.meta === null).map(d => ({ slug: d.slug, error: d.error }));
    if (valid.length === 0)
        return { kind: "none-discovered", broken };
    // A doctor whose count fails must not masquerade as the healthiest "0
    // issues" candidate: failures sort last and say so.
    let counted = valid.map(d => ({ d }));
    if (options.targetDir) {
        const results = await countAll({ programPaths: valid.map(d => d.path), targetDir: options.targetDir });
        counted = valid.map((d, i) => {
            const r = results[i];
            return { d, count: "count" in r ? { status: "counted", count: r.count } : { status: "failed" } };
        });
        counted.sort((a, b) => {
            const rank = (c) => (c === undefined || c.status === "failed" ? -1 : c.count);
            return rank(b.count) - rank(a.count);
        });
    }
    // The gate runs before a picker ever starts, so "cancelled" can only mean
    // the user ended the pick — never "this isn't a terminal".
    if (!canRunTui(options.env) || options.allowPicker === false) {
        return {
            kind: "non-interactive",
            skipped: broken,
            rows: counted.map(({ d, count }) => ({
                scope: d.scope,
                slug: d.slug,
                description: d.meta.description,
                count,
            })),
        };
    }
    const chosen = await pickItemOn(options.env, counted.map(({ d, count }) => ({
        id: d.slug,
        label: d.meta.description,
        sub: count === undefined
            ? d.scope
            : count.status === "failed"
                ? `count failed · ${d.scope}`
                : `${count.count} finding${count.count === 1 ? "" : "s"} · ${d.scope}`,
        severity: d.meta.severity,
    })), options.useColor, "Select a doctor");
    if (chosen === null)
        return { kind: "cancelled" };
    return { kind: "doctor", doctorPath: counted.find(x => x.d.slug === chosen.id).d.path, skipped: broken };
}
