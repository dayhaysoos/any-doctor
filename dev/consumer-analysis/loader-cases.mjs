// Original independently demonstrated regressions, with unrelated positives retained.
export const loaderCases = [
  {
    "name": "real-factory-default-import",
    "seed": {
      "src/target.ts": "export function helper(){return 42;}",
      "other/dead.ts": "export const dead=13;",
      "src/index.mjs": "import mod from \"node:module\";const require=mod.createRequire(import.meta.url);console.log(require(\"./target.ts\").helper());"
    },
    "exports": [
      "other/dead.ts:dead"
    ],
    "uncertainty": true,
    "coverageContains": "CommonJS"
  },
  {
    "name": "real-factory-computed-namespace",
    "seed": {
      "src/target.ts": "export function helper(){return 42;}",
      "other/dead.ts": "export const dead=13;",
      "src/index.mjs": "import * as mod from \"node:module\";const require=mod[\"createRequire\"](import.meta.url);console.log(require(\"./target.ts\").helper());"
    },
    "exports": [
      "other/dead.ts:dead"
    ],
    "uncertainty": true,
    "coverageContains": "CommonJS"
  },
  {
    "name": "real-factory-parenthesized-ts",
    "seed": {
      "src/target.ts": "export function helper(){return 42;}",
      "other/dead.ts": "export const dead=13;",
      "src/index.ts": "import {createRequire} from \"node:module\";const require=(createRequire(import.meta.url) as ReturnType<typeof createRequire>);console.log(require(\"./target.ts\").helper());"
    },
    "exports": [
      "other/dead.ts:dead"
    ],
    "uncertainty": true,
    "coverageContains": "CommonJS"
  }
];
for (const c of loaderCases) c.uncertainFiles = ["src/target.ts"];
const target = "export function helper(){return 42;}";
const dead = "export const dead=13;";
const expectedDead = ["other/dead.ts:dead"];
const expectedBoth = ["other/dead.ts:dead", "src/target.ts:helper"];
function add(name, source, exports = expectedDead, coverageContains = "CommonJS", uncertainFiles = ["src/target.ts"]) {
  loaderCases.push({name: "loader-" + name, seed: {
    "src/target.ts": target, "other/dead.ts": dead, "src/index.ts": source,
  }, exports, coverageContains, uncertainFiles});
}
// Apply equivalent value syntax at the factory, initializer, and loader call.
for (const [name, wrap] of [
  ["parentheses", (s) => `(${s})`],
  ["as", (s) => `(${s} as any)`],
  ["assertion", (s) => `(<any>${s})`],
  ["nonnull", (s) => `(${s})!`],
  ["satisfies", (s) => `(${s} satisfies any)`],
  ["nested", (s) => `((${s} as any)!)`],
]) for (const position of ["factory", "initializer", "callee", "argument", "base"]) {
  const factory = position === "factory" ? wrap("make") : "make";
  const base = position === "base" ? wrap('import.meta["url"]') : "import.meta.url";
  const init = `${factory}(${base})`;
  const callee = position === "callee" ? wrap("load") : "load";
  const argument = position === "argument" ? wrap('"./target.ts"') : '"./target.ts"';
  add(`${name}-${position}`, `import {createRequire as make} from "node:module"; const load=${position === "initializer" ? wrap(init) : init}; console.log(${callee}(${argument}).helper());`);
}
for (const [name, source] of [
  ["default-computed", 'import mod from "module"; const load=mod["createRequire"](import.meta.url); load("./target.ts");'],
  ["namespace-wrapped", 'import * as mod from "node:module"; const load=(mod as any)[("createRequire" as const)](import.meta.url); load("./target.ts");'],
  ["factory-alias", 'import {createRequire as make} from "module"; const factory=make; const load=factory(import.meta.url); load("./target.ts");'],
  ["local-loader-alias", 'import {createRequire} from "module"; const first=createRequire(import.meta.url); const second=first; second("./target.ts");'],
  ["immediate", 'import mod from "node:module"; (mod.createRequire(import.meta.url) as any)("./target.ts");'],
  ["shadowed-other-scope", 'import mod from "node:module"; const load=mod.createRequire(import.meta.url); function f(load:any){return load("../other/dead.ts");} console.log(f); load("./target.ts");'],
]) add(name,source);
for (const [name, source] of [
  ["ordinary-function", 'function require(v:any){return v;} (require as any)("./target.ts");'],
  ["ordinary-arrow", 'const load=((v:any)=>v) as any; load("./target.ts");'],
  ["ordinary-factory", 'function createRequire(v:any){return (x:any)=>x;} const require=(createRequire(import.meta.url) as any); require("./target.ts");'],
  ["shadowed-module", 'import mod from "node:module"; function f(mod:any){const load=mod["createRequire"](import.meta.url); load("./target.ts");} console.log(f);'],
  ["shadowed-named", 'import {createRequire as make} from "node:module"; function f(make:any){const load=make(import.meta.url); load("./target.ts");} console.log(f);'],
  ["unrelated-unknown", 'const load=unknownFunction(); load("./target.ts");'],
  ["ordinary-object", 'const mod={createRequire(v:any){return (x:any)=>x;}}; const load=mod["createRequire"](import.meta.url); load("./target.ts");'],
]) add(name,source,expectedBoth,"",[]);
// Incomplete value selection retains a justified common base; unknown alternatives do not.
add("conditional-known-base", 'import {createRequire} from "node:module"; const load=flag ? createRequire(import.meta.url) : ((x:any)=>x); load("./target.ts");', expectedDead, "conditional");
for (const [name, source, reason] of [
  ["conditional-unknown", 'import {createRequire} from "node:module"; const load=flag ? createRequire(import.meta.url) : unknown; load("./target.ts");', "conditional"],
  ["unsupported-wrapper", 'import {createRequire} from "node:module"; const load=wrap(createRequire(import.meta.url)); load("./target.ts");', "unsupported CallExpression"],
  ["unknown-property", 'import mod from "node:module"; const load=mod[key](import.meta.url); load("./target.ts");', "computed builtin-module"],
  ["mutated-factory", 'import mod from "node:module"; mod.createRequire=other; const load=mod.createRequire(import.meta.url); load("./target.ts");', "mutated"],
  ["mutated-computed", 'import mod from "node:module"; (mod as any)["createRequire"]=other; const load=mod.createRequire(import.meta.url); load("./target.ts");', "mutated"],
  ["escaped-module", 'import mod from "node:module"; mutate(mod); const load=mod.createRequire(import.meta.url); load("./target.ts");', "escapes"],
  ["reassigned", 'import {createRequire} from "node:module"; let load=createRequire(import.meta.url); load=unknown; load("./target.ts");', "reassigned"],
  ["assigned-later", 'import {createRequire} from "node:module"; let load:any; load=createRequire(import.meta.url); load("./target.ts");', "reassigned"],
  ["unsupported-base", 'import {createRequire} from "node:module"; const load=createRequire(base); load("./target.ts");', "base is unsupported"],
]) add(name,source,[],reason,["other/dead.ts","src/target.ts"]);
add("mutated-wrapped-member", 'import mod from "node:module"; (mod.createRequire as any)=other; const load=mod.createRequire(import.meta.url); load("./target.ts");', [], "mutated", ["other/dead.ts","src/target.ts"]);
add("instantiated-factory", 'import {createRequire} from "node:module"; const make=createRequire<any>; const load=make(import.meta.url); load("./target.ts");');

add("shared-initializer-graph", 'import {createRequire as make} from "node:module"; const l0=make(import.meta.url);' + Array.from({length:24},(_,i)=>`const l${i+1}=flag?l${i}:l${i};`).join('') + 'l24("./target.ts");', expectedDead, "conditional");
add("cyclic-loader-flow", 'import {createRequire} from "node:module"; let a:any,b:any; a=b; b=flag?a:createRequire(import.meta.url); a("./target.ts");', [], "reassigned", ["other/dead.ts","src/target.ts"]);

add("resolve-is-not-load", 'import {createRequire} from "node:module"; const load=createRequire(import.meta.url); load.resolve("./target.ts"); load["resolve"](external);', expectedBoth, "", []);
add("aliased-resolve-is-not-load", 'import {createRequire} from "node:module"; const load=createRequire(import.meta.url); const resolve=load["resolve"]; resolve("./target.ts");', expectedBoth, "", []);

add("ordinary-require-object-key", 'const x={require(v:any){return v;}}; console.log(x.require("./target.ts"));', expectedBoth, "", []);
add("ordinary-require-destructured-key", 'const {require}={require:(v:any)=>v}; console.log(require(process.argv[2]));', expectedBoth, "", []);

add("type-arguments-are-not-loader-provenance", 'import {createRequire as make} from "node:module"; const ordinary=identity<typeof make>((v:any)=>v); ordinary("./target.ts");', expectedBoth, "", []);

import {resultFlowCases} from "./result-flow-cases.mjs";
loaderCases.push(...resultFlowCases);
