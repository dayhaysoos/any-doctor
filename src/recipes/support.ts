import type { ExpectedFinding, IdentityQuery } from "../contract.js";
import type { ChallengeFixture } from "./types.js";

export function occurrence(source: string, rule: string, needle: string, nth = 0, file = "profile.ts"): ExpectedFinding {
  const offset = [...source.matchAll(new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"))][nth]?.index;
  if (offset === undefined) throw new Error(`profile occurrence missing: ${needle}`);
  const before = source.slice(0, offset);
  const line = before.split("\n").length;
  const column = offset - (before.lastIndexOf("\n") + 1);
  return { rule, file, line, column };
}

export function profile(name: string, source: string, expected: ExpectedFinding[], semantic: "complete" | "narrowed" | "unavailable"): ChallengeFixture {
  return profileAt("profile.ts", name, source, expected, semantic);
}

export function profileAt(file: string, name: string, source: string, expected: ExpectedFinding[], semantic: "complete" | "narrowed" | "unavailable"): ChallengeFixture {
  const fixture = { name, seed: { [file]: source }, expected };
  return semantic === "unavailable"
    ? { ...fixture, analysis: "off" }
    : { ...fixture, analysis: "on", expectedSemantic: semantic };
}

export interface IdentityFixture { label: string; head: string; callee: string; shadow: string }

export function identityFixtures(query: IdentityQuery, alias: string): IdentityFixture[] {
  const fixtures: IdentityFixture[] = [];
  for (const global of query.globals ?? []) {
    const root = global.split(".")[0];
    fixtures.push({ label: `global ${global}`, head: "", callee: global, shadow: `function probe(${root}){${global}(__ARGS__)}` });
  }
  for (const spec of query.imports ?? []) {
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
  if (unique.length) return unique;
  throw new Error("identity query cannot generate a challenge target; declare a global, named import, default import, or namespace member");
}
