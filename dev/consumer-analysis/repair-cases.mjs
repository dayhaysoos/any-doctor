// Independent reproducers, retained with their original expectations.
export const repairCases = [
  {
    "name": "dynamic-template-parent-segment",
    "seed": {
      "src/plugins/present.ts": "export const placeholder=1;",
      "src/utility.ts": "export function helper() { return 42; }\n",
      "src/index.ts": "const name=\"../utility\"; const mod = await import(`./plugins/${name}.ts`); console.log(mod.helper());"
    },
    "exports": [],
    "duplicates": 0,
    "uncertainty": true
  },
  {
    "name": "shadowed-require-literal",
    "seed": {
      "a.ts": "export function helper() { return 42; }\n",
      "index.ts": "function require(value:string){ return value; } console.log(require(\"./a\"));"
    },
    "exports": [
      "a.ts:helper"
    ],
    "duplicates": 0
  },
  {
    "name": "shadowed-require-nonliteral",
    "seed": {
      "a.ts": "export function helper() { return 42; }\n",
      "index.ts": "function require(value:string){ return value; } const name=\"nothing\"; console.log(require(name));"
    },
    "exports": [
      "a.ts:helper"
    ],
    "duplicates": 0
  },
  {
    "name": "dynamic-template-prefix-fragment",
    "seed": {
      "plugins/apple.ts": "export function helper() { return 42; }\n",
      "unrelated.ts": "export const dead=1;",
      "index.ts": "const suffix=\"pple\"; (await import(`./plugins/a${suffix}.ts`)).helper();"
    },
    "exports": [
      "unrelated.ts:dead"
    ],
    "duplicates": 0,
    "uncertainty": true
  },
  {
    "name": "missing-config-scope",
    "seed": {
      "shared/tool.ts": "export function helper() { return 42; }\n",
      "apps/web/tsconfig.json": "{\"extends\":\"@org/tsconfig/base.json\"}",
      "apps/web/main.ts": "import {helper} from \"@shared/tool\"; helper();"
    },
    "exports": [],
    "duplicates": 0,
    "uncertainty": true
  },
  {
    "name": "external-config-real-witness",
    "seed": {
      "shared/tool.ts": "export function helper(){ return 42; }",
      "apps/web/tsconfig.json": "{\"extends\":\"@org/tsconfig/base.json\"}",
      "apps/web/main.ts": "import {helper} from \"@shared/tool\"; console.log(helper());",
      "node_modules/@org/tsconfig/base.json": "{\"compilerOptions\":{\"baseUrl\":\"../../../\",\"paths\":{\"@shared/*\":[\"shared/*\"]},\"moduleResolution\":\"bundler\",\"module\":\"esnext\"}}"
    },
    "exports": [],
    "duplicates": 0,
    "uncertainty": true
  }
];

// Neighboring controls: each expectation follows possible module targets.
const helper = "export function helper() { return 42; }";
for (const [name, binding] of [
  ["unknown", "let part = external;"],
  ["parent", 'const part = "../utility";'],
  ["encoded-parent", 'const part = "%2e%2e/utility";'],
  ["encoded-separator", 'const part = "..%2futility";'],
  ["separator", 'const part = "nested/../../utility";'],
  ["shadowed-constant", 'const part = "safe"; function load(part: string) { return import(`./plugins/${part}.ts`); } console.log(load);'],
  ["mutable", 'let part = "safe"; part = external;'],
]) repairCases.push({
  name: "repair-template-" + name,
  seed: {
    "src/utility.ts": helper,
    "src/plugins/safe.ts": "export const placeholder = 1;",
    "src/index.ts": binding + (name === "shadowed-constant" ? "" : ' import(`./plugins/${part}.ts`);'),
  }, exports: [], uncertainty: true,
});
for (const [name, code] of [
  ["literal", 'import(`./plugins/${"safe"}.ts`);'],
  ["const", 'const part = "safe"; import(`./plugins/${part}.ts`);'],
  ["shadowed-outside", 'const part = "safe"; function unrelated(part: string){return part;} console.log(unrelated); import(`./plugins/${part}.ts`);'],
]) repairCases.push({
  name: "repair-template-bounded-" + name,
  seed: {"src/utility.ts": helper, "src/plugins/safe.ts": "export const placeholder = 1;", "src/index.ts": code},
  exports: ["src/utility.ts:helper"], uncertainty: true,
});
for (const template of ['`./plugins/${part}/../../utility.ts`', '`./plugins/%2e%2e/${part}.ts`'])
  repairCases.push({name: "repair-template-static-escape-" + repairCases.length,
    seed: {"src/utility.ts": helper, "src/plugins/safe.ts": "export const placeholder = 1;", "src/index.ts": 'const part="utility"; import(' + template + ');'},
    exports: [], uncertainty: true,
  });
for (const [name, code, expected] of [
  ["global-literal", 'require("./a");', ["b.ts:unused"]],
  ["global-variable", 'require(external);', []],
  ["factory", 'import {createRequire} from "node:module"; const require = createRequire(import.meta.url); require("./a");', ["b.ts:unused"]],
  ["factory-alias", 'import {createRequire as make} from "module"; const load = make(import.meta.url); load("./a");', ["b.ts:unused"]],
  ["factory-namespace", 'import * as node from "node:module"; const load = node.createRequire(import.meta.url); load("./a");', ["b.ts:unused"]],
  ["factory-variable", 'import {createRequire} from "node:module"; const require = createRequire(import.meta.url); require(external);', []],
  ["factory-other-base", 'import {createRequire} from "node:module"; const load = createRequire(external); load("./a");', []],
  ["local-arrow", 'const require = (x:string) => x; require("./a");', ["a.ts:helper", "b.ts:unused"]],
  ["local-factory", 'function createRequire(x:any){return (v:any)=>v;} const require=createRequire(1); require("./a");', ["a.ts:helper", "b.ts:unused"]],
  ["factory-shadow", 'import {createRequire} from "node:module"; function f(createRequire:any){const require=createRequire(1); require("./a");} console.log(f);', ["a.ts:helper", "b.ts:unused"]],
]) repairCases.push({name: "repair-require-" + name,
  seed: {"a.ts": helper, "b.ts": "export const unused=0;", "index.ts": code}, exports: expected,
  uncertainty: !name.startsWith("local") && name !== "factory-shadow",
});
repairCases.push({name: "repair-config-supported-cross-root",
  seed: {"shared/tool.ts": helper, "other.ts":"export const unused=0;", "apps/web/tsconfig.json": '{"compilerOptions":{"baseUrl":"../..","paths":{"@shared/*":["shared/*"]}}}', "apps/web/main.ts": 'import {helper} from "@shared/tool"; helper();'},
  exports:["other.ts:unused"],
});
repairCases.push({name: "repair-config-relative-stays-bounded",
  seed: {"shared/tool.ts": helper, "other.ts":"export const unused=0;", "apps/web/tsconfig.json": '{"extends":"@org/tsconfig/base.json"}', "apps/web/main.ts": 'import {helper} from "../../shared/tool"; helper();'},
  exports:["other.ts:unused"], uncertainty:true,
});
repairCases.push({name: "repair-config-no-bare-import-stays-bounded",
  seed: {"shared/tool.ts": helper, "apps/web/tsconfig.json": '{"extends":"@org/tsconfig/base.json"}', "apps/web/main.ts": 'console.log("no import");'},
  exports:["shared/tool.ts:helper"], uncertainty:true,
});

repairCases.push({name: "repair-config-reexport-before-target",
  seed: {"zshared/tool.ts": helper, "apps/web/tsconfig.json": '{"extends":"@org/tsconfig/base.json"}', "apps/web/main.ts": 'export {helper} from "@shared/tool";'},
  exports:[], uncertainty:true,
});
