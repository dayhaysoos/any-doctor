const helper = "export function helper() { return 42; }";
const unused = ["a.ts:helper"];
export const cases = [
  {
    name: "test-consumer-default",
    seed: {
      "a.ts": helper,
      "a.test.ts": 'import {helper} from "./a"; helper(); const unrelated = 1;',
    },
    exports: [],
  },
  {
    name: "test-consumer-included",
    includeTests: true,
    seed: {
      "a.ts": helper,
      "a.test.ts": 'import {helper} from "./a"; helper();',
    },
    exports: [],
  },
  {
    name: "renamed-barrel",
    seed: {
      "a.ts": helper,
      "index.ts": 'export {helper as publicHelper} from "./a";',
      "app.ts": 'import {publicHelper} from "./index"; publicHelper();',
    },
    exports: [],
  },
  {
    name: "reexport-without-final-caller",
    seed: { "a.ts": helper, "barrel.ts": 'export {helper} from "./a";' },
    exports: [],
  },
  {
    name: "same-name-positive",
    seed: {
      "a.ts": helper,
      "b.ts": helper,
      "use.ts": 'import {helper as other} from "./b"; other();',
    },
    exports: unused,
  },
  {
    name: "same-basename-dynamic",
    seed: {
      "a/helper.ts": helper,
      "b/helper.ts": helper,
      "use.ts": '(await import("./b/helper")).helper();',
    },
    exports: ["a/helper.ts:helper"],
  },
  {
    name: "generated-target",
    seed: { "dist/utility.js": "export const generatedOnly = 1;" },
    exports: [],
  },
  {
    name: "generated-consumer",
    seed: {
      "a.ts": helper,
      "routeTree.gen.ts": 'import {helper} from "./a"; helper();',
    },
    exports: [],
  },
  {
    name: "type-only-consumer",
    seed: {
      "a.ts": helper,
      "use.ts":
        'type T = typeof import("./a").helper; export function consume(x:T){return x;}',
      "app.ts": 'import {consume} from "./use"; console.log(consume);',
    },
    exports: [],
  },
  {
    name: "type-only-named",
    seed: {
      "a.ts": helper,
      "use.ts":
        'import type {helper} from "./a"; type T = typeof helper; console.log(null as T);',
    },
    exports: [],
  },
  {
    name: "default-alias",
    seed: {
      "a.ts": "export default function helper(){return 42;}",
      "use.ts": 'import renamed from "./a"; renamed();',
    },
    exports: [],
  },
  {
    name: "star-cycle",
    seed: {
      "a.ts": helper,
      "b.ts": 'export * from "./a"; export * from "./c";',
      "c.ts": 'export * from "./b";',
      "use.ts": 'import {helper} from "./c"; helper();',
    },
    exports: [],
  },
  {
    name: "namespace-member",
    seed: {
      "a.ts": helper + "\nexport const unused = 1;",
      "use.ts": 'import * as ns from "./a"; ns.helper();',
    },
    exports: ["a.ts:unused"],
  },
  {
    name: "namespace-escape",
    seed: {
      "a.ts": helper,
      "use.ts": 'import * as ns from "./a"; consume(ns);',
    },
    exports: [],
  },
  {
    name: "shadowed-namespace",
    seed: {
      "a.ts": helper,
      "use.ts":
        'import * as ns from "./a"; function invoke(ns:any){ns.helper();} invoke({});',
    },
    exports: unused,
  },
  {
    name: "tsconfig-alias",
    seed: {
      "a.ts": helper,
      "tsconfig.json":
        '{"compilerOptions":{"baseUrl":".","paths":{"@/*":["./*"]}}}',
      "use.ts": 'import {helper} from "@/a"; helper();',
    },
    exports: [],
  },
  {
    name: "package-entry",
    seed: { "a.ts": helper, "package.json": '{"exports":"./a.ts"}' },
    exports: [],
  },
  {
    name: "declared-framework-entry",
    seed: {
      "route.ts": helper,
      "any-doctor.analysis.json": '{"entryPoints":["route.ts"]}',
    },
    exports: [],
  },
  {
    name: "extension-index",
    seed: {
      "a/index.ts": helper,
      "use.ts": 'import {helper} from "./a/index.js"; helper();',
    },
    exports: [],
  },
  { name: "genuine-positive", seed: { "a.ts": helper }, exports: unused },
  {
    name: "unknown-dynamic",
    seed: {
      "a.ts": helper,
      "use.ts": "const name = location.hash; import(name);",
    },
    exports: [],
  },
  {
    name: "unresolved-relative",
    seed: {
      "a.ts": helper,
      "use.ts": 'import {helper} from "./missing"; helper();',
    },
    exports: unused,
  },
  {
    name: "parse-failure",
    seed: { "a.ts": helper, "bad.ts": "export function {" },
    failure: true,
  },
];
const body = (lit) =>
  `export function normalize(value:string) { const clean=value.replace(${lit}, "_"); if (!clean) throw new Error("empty"); const parts=clean.split("-"); return parts.filter(Boolean).join("/"); }`;
for (const [name, a, b, duplicates] of [
  ["literal-whitespace", '"a b"', '"ab"', 0],
  ["template-whitespace", "`a b`", "`ab`", 0],
  ["regex-whitespace", "/a b/", "/ab/", 0],
  ["substantial-duplicate", '"a b"', '"a b"', 2],
])
  cases.push({
    name,
    seed: {
      "a.ts": body(a),
      "b.ts": body(b),
      "use.ts":
        'import {normalize as a} from "./a"; import {normalize as b} from "./b"; console.log(a,b);',
    },
    exports: [],
    duplicates,
  });
cases.push({
  name: "trivial-long-signature",
  seed: {
    "a.ts":
      "export function extraordinarilyLongHelperNameForDisplay(value: string): string { return value.trim(); }",
    "b.ts":
      "export function extraordinarilyLongHelperNameForDisplay(value: string): string { return value.trim(); }",
    "use.ts":
      'import {extraordinarilyLongHelperNameForDisplay as a} from "./a"; import {extraordinarilyLongHelperNameForDisplay as b} from "./b"; console.log(a,b);',
  },
  exports: [],
  duplicates: 0,
});
cases.push({
  name: "workspace-package-entry",
  seed: {
    "package.json": '{"private":true,"workspaces":["packages/*"]}',
    "packages/lib/package.json":
      '{"name":"@scope/lib","exports":{".":{"import":"./src/core.ts","types":"./src/core.ts"}}}',
    "packages/lib/src/core.ts": helper,
    "use.ts": 'import {helper} from "@scope/lib"; helper();',
  },
  exports: [],
});
cases.push({
  name: "excluded-test-consumer",
  seed: {
    "a.ts": helper,
    "a.test.ts": 'import {helper} from "./a"; helper();',
    "any-doctor.analysis.json": '{"exclude":["**/*.test.ts"]}',
  },
  exports: unused,
});
cases.push({
  name: "same-line-surrounding-code",
  seed: {
    "a.ts": 'console.log("a"); ' + body('"a b"') + ' console.log("after a");',
    "b.ts": 'console.log("b"); ' + body('"a b"') + ' console.log("after b");',
    "use.ts":
      'import {normalize as a} from "./a"; import {normalize as b} from "./b"; console.log(a,b);',
  },
  exports: [],
  duplicates: 2,
});
cases.push({
  name: "format-and-comments",
  seed: {
    "a.ts": body('"a b"'),
    "b.ts": body('"a b"')
      .replace("const clean", "/*same logic*/\n const    clean")
      .replace("if (!clean)", "if( ! clean )"),
    "use.ts":
      'import {normalize as a} from "./a"; import {normalize as b} from "./b"; console.log(a,b);',
  },
  exports: [],
  duplicates: 2,
});
cases.push({
  name: "different-captured-bindings",
  seed: {
    "a.ts":
      "const limit=1; " +
      body('"a b"').replace("return parts", "console.log(limit); return parts"),
    "b.ts":
      "const limit=2; " +
      body('"a b"').replace("return parts", "console.log(limit); return parts"),
    "use.ts":
      'import {normalize as a} from "./a"; import {normalize as b} from "./b"; console.log(a,b);',
  },
  exports: [],
  duplicates: 2,
});
cases.push({
  name: "unsupported-config",
  seed: {
    "a.ts": helper,
    "tsconfig.json": '{"extends":"missing-package/tsconfig.json"}',
  },
  exports: [],
});
cases.push({
  name: "dynamic-namespace-binding",
  seed: {
    "a.ts": helper + "\nexport const unused=1;",
    "use.ts": 'const ns=await import("./a"); ns.helper();',
  },
  exports: ["a.ts:unused"],
});
cases.push({
  name: "dynamic-destructuring",
  seed: {
    "a.ts": helper + "\nexport const unused=1;",
    "use.ts": 'const {helper:renamed}=await import("./a"); renamed();',
  },
  exports: ["a.ts:unused"],
});
cases.push({
  name: "default-reexport-chain",
  seed: {
    "a.ts": "export default function helper(){return 42;}",
    "b.ts": 'import helper from "./a"; export default helper;',
    "use.ts": 'import other from "./b"; other();',
  },
  exports: [],
});
cases.push({
  name: "local-export-specifier-positive",
  seed: { "a.ts": "const helper=42; export {helper};" },
  exports: unused,
});
cases.push({
  name: "dynamic-then-member",
  seed: {
    "a.ts": helper + "\nexport const unused=1;",
    "use.ts": 'import("./a").then(module=>module.helper());',
  },
  exports: ["a.ts:unused"],
});
cases.push({
  name: "vitest-config-entry",
  seed: { "vitest.config.ts": "export default {test:{}};" },
  exports: [],
});
cases.push({
  name: "nitro-plugin-entry",
  seed: {
    "server/plugins/headers.ts":
      'import {definePlugin as plugin} from "nitro"; export default plugin(app=>console.log(app));',
  },
  exports: [],
});
cases.push({
  name: "plugin-name-lookalike",
  seed: {
    "a.ts":
      "function definePlugin(x:any){return x;} export default definePlugin({});",
  },
  exports: ["a.ts:default"],
});
cases.push({
  name: "review-tagged-template-raw",
  seed: {
    "a.ts":
      "export function f(){const value=String.raw`\\n`;const a=value.trim();if(a)console.log(a);return a;}",
    "b.ts":
      "export function f(){const value=String.raw`\n`;const a=value.trim();if(a)console.log(a);return a;}",
    "index.ts": 'export {f as a} from "./a"; export {f as b} from "./b";',
  },
  exports: [],
  duplicates: 0,
});
cases.push({
  name: "review-destructured-export-shadow",
  seed: {
    "a.ts":
      "export const {helper}={helper:1}; function other(helper:number){return helper;} other(1);",
  },
  exports: unused,
});
cases.push({
  name: "review-array-export-shadow",
  seed: {
    "a.ts":
      "export const [helper]=[1]; function other(helper:number){return helper;} other(1);",
  },
  exports: unused,
});
cases.push({
  name: "review-stored-import-promise",
  seed: {
    "a.ts": helper,
    "use.ts": 'const ns=import("./a"); ns.then(m=>m.helper());',
  },
  exports: [],
});
cases.push({
  name: "review-nested-import-type",
  seed: {
    "a.ts": "export namespace Shapes { export type Thing = string; }",
    "use.ts": 'type T=import("./a").Shapes.Thing; console.log(null as T);',
  },
  exports: [],
});
cases.push({
  name: "import-equals-uncertainty",
  seed: {
    "a.ts": helper,
    "use.cts": 'import ns = require("./a"); ns.helper();',
  },
  exports: [],
});

// CLI regressions for the independently reviewed consumer defects.
import { repairCases } from "./repair-cases.mjs";
cases.push(...repairCases);

import { loaderCases } from "./loader-cases.mjs";
cases.push(...loaderCases);
