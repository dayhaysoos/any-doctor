import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const repo=fileURLToPath(new URL('../',import.meta.url));
const root=process.env.DOCTOR_CANDIDATE_ROOT??repo;
const {renderReport,renderJson}=await import(path.join(root,'bin/report.js'));
const {deriveSummary}=await import(path.join(root,'bin/summary.js'));
const {dashboardFrame}=await import(path.join(root,'bin/dashboard.js'));
const map='unawaited-async-map',fetchRule='fetch-calls-without-abortsignal';
export const cases=[
 ['local-async-map','const object = { map: async callback => callback(1) }; object.map(async value => value);',[]],
 ['native-async-map','[1].map(async value=>value);',[],1],
 ['unknown-map-receiver','getItems().map(async value=>value);',[[map,'unsupported-expression']]],
 ['sync-map','function names(items) { return items.map(item => item.name); }',[]],
 ['async-map','function work(items) { return items.map(async item => item.name); }',[[map,'unsupported-expression']]],
 ['unknown-callback','function work(items, callback) { return items.map(callback); }',[[map,'unsupported-expression']]],
 ['chain','function makeClient() { return { request() {} }; } makeClient().request();',[]],
 ['local-object','const service={fetch(){}}; service.fetch();',[]],
 ['alias','const invoke = fetch; invoke("/");',[],1],
 ['conditional-alias','const invoke = condition ? fetch : other; invoke("/");',[[fetchRule,'unresolved-identity']]],
 ['escaped-options','fetch("/", escapedOptions);',[[fetchRule,'unsupported-expression']]],
 ['unrelated-import','import {request} from "unrelated"; request("/");',[]],
 ['local-function','function fetch(){} fetch("/");',[]],
 ['parameter','function run(fetch){fetch("/");}',[]],
 ['sync-callback-alias','const cb=x=>x.name; function names(items){return items.map(cb)}',[]],
 ['member-alias','const service={fetch}; service.fetch("/");',[],1],
 ['super-constructor','class Failure extends Error {constructor(){super("failure")}}',[]],
 ['scalar-callback','function names(items){return items.map(String)}',[]],
 ['shadowed-scalar-callback','function work(items){const String=async x=>x;return items.map(String)}',[[map,'unsupported-expression']]],
 ['dynamic-global-member','const method=getMethod();globalThis[method]("/");',[[fetchRule,'unresolved-identity']]],
 ['unrelated-choice','const invoke=condition?first:second;invoke("/");',[]],
 ['unrelated-fallback','function run(deps){const now=deps.now ?? Date.now;now();}',[]],
 ['fetch-fallback','function run(deps){const invoke=deps.fetchFn ?? fetch;invoke("/");}',[[fetchRule,'unresolved-identity']]],
 ['opaque-factory','const invoke=makeClient();invoke("/");',[[fetchRule,'unresolved-identity']]],
 ['opaque-import-factory','import make from "unrelated";const invoke=make();invoke("/");',[[fetchRule,'unresolved-identity']]],
 ['reassigned-alias','let invoke=fetch; invoke=other; invoke("/");',[[fetchRule,'unresolved-identity']]],
];
for(const [name,source,narrowing,positives=0] of cases) for(const neighbor of [false,true]) test(`candidate boundary: ${name}${neighbor?' with positive neighbor':''}`,()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'sdk-boundary-'));
 try {
  fs.writeFileSync(path.join(tmp,'example.ts'),source+(neighbor?'\n[1].map(async x=>x); globalThis.fetch("/positive");':''));
  const run=spawnSync(process.execPath,[path.join(root,'bin/cli.js'),'run',path.join(root,'doctors/async.mjs'),tmp,'--format','json'],{encoding:'utf8'});
  assert.equal(run.status,0,run.stderr);const json=JSON.parse(run.stdout),semantic=json.groups[0].semantic;
  assert.equal(json.counts.total,positives+(neighbor?2:0));
  assert.deepEqual(semantic.narrowed.map(x=>[x.check,x.reason]).sort(),[...narrowing].sort());
  for(const item of semantic.narrowed){assert.equal(item.occurrences,1);assert.deepEqual(item.files,[{file:'example.ts',occurrences:1}]);}
  assert.equal(semantic.incomplete,narrowing.length>0);
  if(narrowing.length)assert.equal(json.score.score,null);
  if(neighbor)assert.ok(json.groups[0].checks.some(x=>x.rule===map&&x.findings.some(f=>f.line===2)));
 } finally {fs.rmSync(tmp,{recursive:true,force:true});}
});

test('zero-finding multi-doctor report identifies the narrowed group and the complete group',()=>{
 const semantic={provider:{id:'any-doctor/syntax-flow',version:1,available:true},protocolVersion:1,incomplete:true,narrowed:[{check:map,reason:'unsupported-expression',occurrences:1,files:[{file:'example.ts',occurrences:1}]}]};
 const meta=id=>({id,description:id,severity:'warning',checks:[{id:map,description:map,severity:'warning'}]});
 const input={fileCount:1,durationMs:1,crashed:[],analysisAvailable:true,groups:[{meta:meta('async'),programName:'async.mjs',findings:[],semantic},{meta:meta('other-doctor'),programName:'other.mjs',findings:[]}]};
 const human=renderReport(input,false);
 assert.ok(human.split('\n').includes('△ async — narrowed'),human);
 assert.ok(human.split('\n').includes('✔ other-doctor — clean'),human);
 assert.match(human,/No findings established — semantic coverage narrowed/);
 assert.doesNotMatch(human,/✔ async — clean/);
 const json=JSON.parse(renderJson(input,deriveSummary(input),{exitCode:0}));
 assert.equal(json.score.score,null);assert.equal(json.groups[0].semantic.incomplete,true);assert.deepEqual(json.groups[0].narrowed,[map]);
 const frame=dashboardFrame({tree:[],selectedRow:0,readKeys:new Set(),readSource:()=>'',filesTotal:1,durationMs:1,useColor:false,cols:140,rows:34,zeroFindingDoctors:[{id:'async',narrowed:true},{id:'other-doctor',narrowed:false}]});
 assert.match(frame,/△ async — narrowed/);assert.match(frame,/✔ other-doctor — clean/);assert.match(frame,/No findings established — semantic coverage narrowed/);
 assert.doesNotMatch(frame,/Excellent|✔ async — clean/);
});
