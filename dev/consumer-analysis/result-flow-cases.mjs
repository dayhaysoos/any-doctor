// Independent isolation seeds and expectations retained exactly.
export const resultFlowCases = [
  {
    "name": "result-flow-conditional-direct",
    "seed": {
      "src/target.ts": "export function helper(){return 42;}",
      "other/dead.ts": "export const dead=13;",
      "src/index.ts": "import {createRequire} from \"node:module\";const r=createRequire(import.meta.url);const load=Date.now()>0?r:((v:string)=>v);console.log(load(\"./target.ts\"));"
    },
    "exports": [
      "other/dead.ts:dead"
    ],
    "uncertainFiles": [
      "src/target.ts"
    ],
    "coverageContains": "conditional"
  },
  {
    "name": "result-flow-conditional-member",
    "seed": {
      "src/target.ts": "export function helper(){return 42;}",
      "other/dead.ts": "export const dead=13;",
      "src/index.ts": "import {createRequire} from \"node:module\";const r=createRequire(import.meta.url);const load=Date.now()>0?r:((v:string)=>v);console.log((load(\"./target.ts\") as any).helper());"
    },
    "exports": [
      "other/dead.ts:dead"
    ],
    "uncertainFiles": [
      "src/target.ts"
    ],
    "coverageContains": "conditional"
  },
  {
    "name": "result-flow-conditional-stored-member",
    "seed": {
      "src/target.ts": "export function helper(){return 42;}",
      "other/dead.ts": "export const dead=13;",
      "src/index.ts": "import {createRequire} from \"node:module\";const r=createRequire(import.meta.url);const load=Date.now()>0?r:((v:string)=>v);const mod=load(\"./target.ts\") as any;console.log(mod.helper());"
    },
    "exports": [
      "other/dead.ts:dead"
    ],
    "uncertainFiles": [
      "src/target.ts"
    ],
    "coverageContains": "conditional"
  },
  {
    "name": "result-flow-known-loader-member",
    "seed": {
      "src/target.ts": "export function helper(){return 42;}",
      "other/dead.ts": "export const dead=13;",
      "src/index.ts": "import {createRequire} from \"node:module\";const r=createRequire(import.meta.url);console.log(r(\"./target.ts\").helper());"
    },
    "exports": [
      "other/dead.ts:dead"
    ],
    "uncertainFiles": [
      "src/target.ts"
    ],
    "coverageContains": "CommonJS"
  }
];
const target = "export function helper(){return 42;}";
const dead = "export const dead=13;";
const prefix = 'import {createRequire as make} from "node:module"; const r=make(import.meta.url);';
const selection = 'const load=flag ? r : ((v:any)=>v);';
function add(name, code, exports = ["other/dead.ts:dead"], uncertainFiles = ["src/target.ts"], coverageContains = "conditional") {
  resultFlowCases.push({name:"result-flow-"+name, seed:{"src/target.ts":target,"other/dead.ts":dead,"src/index.ts":code}, exports, uncertainFiles, coverageContains});
}
add("stored-alias-wrapper", prefix+selection+'const first=((load as any)("./target.ts") as any)!; const second=(first satisfies any); second["helper"]();');
add("direct-computed-other-method", prefix+selection+'(load("./target.ts") as any)["anythingElse"]();');
add("stored-destructured-method", prefix+selection+'const {helper}=load("./target.ts") as any; helper();');
add("logical-loader-result", prefix+'const load=r || ((v:any)=>v); (load("./target.ts") as any).helper();');
add("nested-selection-result", prefix+'const first=flag?r:((v:any)=>v); const load=anotherFlag?first:r; const mod=load("./target.ts") as any; mod.helper();');
add("conditional-factory-creates-loader", 'import {createRequire as a} from "node:module"; import mod from "module"; const factory=flag?a:mod["createRequire"]; const load=factory(import.meta.url); load("./target.ts").helper();');
add("conditional-factory-alias-wrapper", 'import {createRequire as a} from "node:module"; import * as mod from "module"; const selected=flag?a:mod.createRequire; const factory=(selected as typeof a)!; const load=factory((import.meta.url as string)); const value=load("./target.ts"); const alias=value; alias.helper();');
add("conditional-factory-not-invoked-as-loader", 'import {createRequire as a} from "node:module"; const factory=flag?a:a; const load=factory(import.meta.url);', ["other/dead.ts:dead","src/target.ts:helper"], [], "");
add("conditional-loader-unknown-base", 'import {createRequire as a} from "node:module"; const r=a(otherBase); const load=flag?r:r; (load("./target.ts") as any).helper();', [], ["other/dead.ts","src/target.ts"], "conditional");
add("conditional-factory-unknown-base", 'import {createRequire as a} from "node:module"; const factory=flag?a:a; const load=factory(otherBase); load("./target.ts").helper();', [], ["other/dead.ts","src/target.ts"], "base is unsupported");
add("unknown-factory-alternative", prefix+'const factory=flag?make:unknown; const load=factory(import.meta.url); load("./target.ts").helper();', [], ["other/dead.ts","src/target.ts"], "conditional");
add("unknown-loader-alternative-result", prefix+'const load=flag?r:unknown; const value=load("./target.ts"); value.helper();', [], ["other/dead.ts","src/target.ts"], "conditional");
add("unknown-loader-wrapper-result", prefix+'const load=wrap(r); const value=load("./target.ts"); value.helper();', [], ["other/dead.ts","src/target.ts"], "unsupported CallExpression");
add("ordinary-local-method-result", 'function load(v:any){return {helper(){return v;}};} const value=load("./target.ts"); value.helper();', ["other/dead.ts:dead","src/target.ts:helper"], [], "");
add("ordinary-unknown-method-result", 'const value=ordinary("./target.ts"); value.helper();', ["other/dead.ts:dead","src/target.ts:helper"], [], "");
