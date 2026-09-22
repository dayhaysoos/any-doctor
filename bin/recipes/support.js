export function occurrence(source, rule, needle, nth = 0, file = "profile.ts") {
    var _a;
    const offset = (_a = [...source.matchAll(new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"))][nth]) === null || _a === void 0 ? void 0 : _a.index;
    if (offset === undefined)
        throw new Error(`profile occurrence missing: ${needle}`);
    const before = source.slice(0, offset);
    const line = before.split("\n").length;
    const column = offset - (before.lastIndexOf("\n") + 1);
    return { rule, file, line, column };
}
export function profile(name, source, expected, semantic) {
    return profileAt("profile.ts", name, source, expected, semantic);
}
export function profileAt(file, name, source, expected, semantic) {
    const fixture = { name, seed: { [file]: source }, expected };
    return semantic === "unavailable"
        ? { ...fixture, analysis: "off" }
        : { ...fixture, analysis: "on", expectedSemantic: semantic };
}
export function identityFixtures(query, alias) {
    var _a, _b;
    const fixtures = [];
    for (const global of (_a = query.globals) !== null && _a !== void 0 ? _a : []) {
        const root = global.split(".")[0];
        fixtures.push({ label: `global ${global}`, head: "", callee: global, shadow: `function probe(${root}){${global}(__ARGS__)}` });
    }
    for (const spec of (_b = query.imports) !== null && _b !== void 0 ? _b : []) {
        for (const name of spec.names) {
            if (name.startsWith("*.") && name.length > 2) {
                const member = name.slice(2);
                fixtures.push({ label: `namespace import ${spec.source} ${name}`, head: `import * as ${alias} from ${JSON.stringify(spec.source)};\n`, callee: `${alias}.${member}`, shadow: `function probe(${alias}){${alias}.${member}(__ARGS__)}` });
                continue;
            }
            if (name.startsWith("default.") && name.length > "default.".length) {
                const member = name.slice("default.".length);
                fixtures.push({ label: `default import member ${spec.source} ${name}`, head: `import ${alias} from ${JSON.stringify(spec.source)};\n`, callee: `${alias}.${member}`, shadow: `function probe(${alias}){${alias}.${member}(__ARGS__)}` });
                continue;
            }
            if (name === "default") {
                fixtures.push({ label: `default import ${spec.source}`, head: `import ${alias} from ${JSON.stringify(spec.source)};\n`, callee: alias, shadow: `function probe(${alias}){${alias}(__ARGS__)}` });
                continue;
            }
            if (!name.includes(".")) {
                fixtures.push({ label: `named import ${spec.source} ${name}`, head: `import {${name} as ${alias}} from ${JSON.stringify(spec.source)};\n`, callee: alias, shadow: `function probe(${alias}){${alias}(__ARGS__)}` });
                continue;
            }
            throw new Error(`identity query cannot generate import challenge for ${JSON.stringify(spec.source)} ${JSON.stringify(name)}; use a named import, default, default.member, or *.member`);
        }
    }
    const unique = [...new Map(fixtures.map((fixture) => [fixture.label, fixture])).values()];
    if (unique.length)
        return unique;
    throw new Error("identity query cannot generate a challenge target; declare a global, named import, default import, or namespace member");
}
