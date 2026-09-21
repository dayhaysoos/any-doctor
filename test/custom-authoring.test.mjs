import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {analyzeCalls} from '../bin/analysis.js';
import {callIdentityResult} from '../bin/doctor-sdk.js';
import {authoringCatalog, validateCapabilityGapReport} from '../bin/authoring.js';
const root=fileURLToPath(new URL('../',import.meta.url));
const query={globals:['fetch','globalThis.fetch','window.fetch','self.fetch','setTimeout','globalThis.setTimeout','window.setTimeout']};
const ref=v=>({id:v.id,start:v.start,end:v.end});
const cases=[
 ['browser globals',`window.fetch('/');self.fetch('/');window.setTimeout(done,500)`,[true,true,true]],
 ['browser wrappers and aliases',`const send=(self['fetch'] as typeof fetch)!;const wait=(window['setTimeout'] satisfies Function);send('/');wait(done,500)`,[true,true]],
 ['browser shadows',`function run(window,self){window.fetch('/');self.fetch('/');window.setTimeout(done,500)}`,[false,false,false]],
 ['browser receiver alias',`const host=window;host.fetch('/');window.fetch('/')`,['unknown',true]],
 ['bare',`fetch('/');setTimeout(done,500)`,[true,true]],
 ['global object',`globalThis.fetch('/');globalThis.setTimeout(done,500)`,[true,true]],
 ['computed and wrappers',`((globalThis['fetch'] as typeof fetch)!)('/');(globalThis['setTimeout'])(done,500)`,[true,true]],
 ['renamed bindings',`const send=globalThis.fetch;const wait=globalThis.setTimeout;send('/');wait(done,500)`,[true,true]],
 ['own property alias',`const ops={send:fetch};ops.send('/')`,[true]],
 ['local functions',`function fetch(){};function setTimeout(){};fetch('/');setTimeout(done,500)`,[false,false]],
 ['local global object',`function run(globalThis){globalThis.fetch('/');globalThis.setTimeout(done,500)}`,[false,false]],
 ['other globals',`console.log('fetch');unrelated();`,[false,false]],
 ['reassigned neighbor',`let send=fetch;send=external;send('/');fetch('/')`,['unknown',true]],
 ['conditional neighbor',`const send=flag?fetch:external;send('/');globalThis.fetch('/')`,['unknown',true]],
 ['opaque factory',`const send=factory();send('/');fetch('/')`,[false,'unknown',true]],
 ['unsupported receiver alias',`const host=globalThis;host.fetch('/');fetch('/')`,['unknown',true]],
 ['cycle',`const send=send;send('/');fetch('/')`,['unknown',true]],
];
for(const [name,source,expected]of cases)test(`custom call identity: ${name}`,()=>{
 const parsed=analyzeCalls('entry.ts',source);assert.equal(parsed.ok,true);
 const actual=parsed.file.structure.flow.values.filter(v=>v.kind==='call').map(call=>callIdentityResult('entry.ts',source,parsed.file,ref(call),query));
 assert.deepEqual(actual.map(r=>r.status==='known'?r.value.matches:'unknown'),expected);
 for(const r of actual)assert.ok(r.evidence?.every(e=>e.file==='entry.ts'&&e.sourceDigest.length===64));
});
test('custom call identity retains imported identity and rejects a stale reference',()=>{
 const source=`import {request as send} from 'transport';send('/');`,facts=analyzeCalls('entry.ts',source).file;
 const call=facts.structure.flow.values.find(v=>v.kind==='call');
 assert.equal(callIdentityResult('entry.ts',source,facts,ref(call),{imports:[{source:'transport',names:['request']}]}).value.matches,true);
 assert.equal(callIdentityResult('entry.ts',source,facts,{id:999,start:0,end:1},query).status,'unknown');
});
for(const [name,arms]of [['inverted','500 : seconds * 1000'],['correct','seconds * 1000 : 500']])test(`ternary selection exposes ${name} policy path without evaluating it`,()=>{
 const source=`const seconds=Number(response.headers.get('Retry-After')); const delay=Number.isFinite(seconds)&&seconds>0 ? ${arms};`;
 const facts=analyzeCalls('entry.ts',source).file,values=new Map(facts.structure.flow.values.map(v=>[v.id,v]));
 const choice=[...values.values()].find(v=>v.selection);assert.ok(choice);
 assert.equal(values.get(choice.selection.test).operation.operator,'&&');
 const fixed=values.get(choice.selection[name==='inverted'?'whenTrue':'whenFalse']);assert.equal(fixed.literal,500);
 const scaled=values.get(choice.selection[name==='inverted'?'whenFalse':'whenTrue']);assert.equal(scaled.operation.operator,'*');
 assert.deepEqual(choice.alternatives,[choice.selection.whenTrue,choice.selection.whenFalse]);
 assert.deepEqual(JSON.parse(JSON.stringify(choice)).selection,choice.selection);
});
test('literal conditions keep syntax arms separate from reachable alternatives',()=>{
 const facts=analyzeCalls('entry.ts',`const x=true ? (500 as number) : external();`).file;
 const values=new Map(facts.structure.flow.values.map(v=>[v.id,v]));const choice=[...values.values()].find(v=>v.selection);
 assert.equal(values.get(choice.selection.test).literal,true);
 assert.equal(values.get(choice.selection.whenTrue).literal,500);
 assert.equal(values.get(choice.selection.whenFalse).dead,true);
 assert.deepEqual(choice.alternatives,[choice.selection.whenTrue]);
});
const docs=fs.readFileSync(path.join(root,'docs/doctor-sdk.md'),'utf8');
const example=docs.split('### Call identity: executable doctor example')[1].match(/```js\n([\s\S]*?)```/)[1];
for(const [name,source,expected,unknown]of [
 ['window and self with computed timers',`window.fetch('/');self.fetch('/');(window['setTimeout'] as typeof setTimeout)(done,500);`,3,false],
 ['stable browser aliases',`const send=(self.fetch)!;const wait=window.setTimeout;send('/');wait(done,500);`,2,false],
 ['local functions and browser parameters',`function fetch(){}function setTimeout(){}fetch('/');setTimeout(done,500);function run(window,self,globalThis){window.fetch('/');self.fetch('/');globalThis.fetch('/');window.setTimeout(done,500);}`,0,false],
 ['unsupported receiver with positive',`const host=window;host.fetch('/');window.fetch('/');`,1,true],
 ['qualified globals and wrappers',`globalThis.fetch('/');(globalThis['fetch'] as typeof fetch)('/');`,2,false],
 ['shadow and unrelated calls',`function run(globalThis){globalThis.fetch('/')}console.log('fetch');`,0,false],
 ['unknown beside definite',`const send=flag?fetch:other;send('/');fetch('/');`,1,true],
])test(`documented custom example through CLI: ${name}`,()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'custom-author-'));try{
  fs.mkdirSync(path.join(temp,'project'));fs.writeFileSync(path.join(temp,'project/entry.ts'),source);fs.writeFileSync(path.join(temp,'example.mjs'),example);
  const run=spawnSync(process.execPath,[path.join(root,'bin/cli.js'),'run',path.join(temp,'example.mjs'),path.join(temp,'project'),'--format','json'],{encoding:'utf8',timeout:20000});
  assert.equal(run.status,0,run.stderr);const scan=JSON.parse(run.stdout);assert.equal(scan.counts.total,expected);
  const narrowing=scan.groups[0].semantic.narrowed;assert.equal(narrowing.length,unknown?1:0);
  if(unknown){assert.equal(scan.score.score,null);assert.equal(scan.score.grade,null);assert.equal(narrowing[0].reason,'unresolved-identity');assert.deepEqual(narrowing[0].files,[{file:'entry.ts',occurrences:1}]);}
  for(const finding of scan.groups[0].checks.flatMap(c=>c.findings)){assert.equal(finding.file,'entry.ts');assert.equal(finding.line,1);}
 }finally{fs.rmSync(temp,{recursive:true,force:true})}
});
test('capability-gap example provides the published report contract',()=>{
 const section=docs.split('### Capability-gap report')[1];const report=JSON.parse(section.match(/```json\n([\s\S]*?)```/)[1]);
 const contract=authoringCatalog().customChecks.gapReport;
 assert.ok(Object.hasOwn(contract.classifications,report.classification));
 assert.deepEqual(validateCapabilityGapReport(report),{valid:true,errors:[]});
 assert.deepEqual(Object.keys(contract.classifications),['authoring-error','reusable-sdk-gap','project-policy','runtime-dynamic']);
});

const gapExample=JSON.parse(docs.split('### Capability-gap report')[1].match(/```json\n([\s\S]*?)```/)[1]);
for(const name of ['currentFailure','definitePositive','negativeControl','uncertainControl'])test(`gap report rejects missing ${name}`,()=>{
 const report=structuredClone(gapExample);delete report.acceptanceCases[name];
 const result=validateCapabilityGapReport(report);assert.equal(result.valid,false);assert.ok(result.errors.some(e=>e.includes(name)));
});
test('gap report requires uncertainty, score withholding and exact behavioral evidence',()=>{
 for(const patch of [
  {narrowing:{state:'complete',reasons:[]},score:'present',grade:'present'},
  {score:'present'}, {grade:'present'},
  {narrowing:{state:['narrowed'],reasons:['unsupported-expression']},score:'present',grade:'present'}, {narrowing:{state:'narrowed',reasons:[]}},
  {seed:{}}, {findings:[{rule:'x'}]},
 ]){
  const report=structuredClone(gapExample);Object.assign(report.acceptanceCases.uncertainControl,patch);
  assert.equal(validateCapabilityGapReport(report).valid,false,JSON.stringify(patch));
 }
 const report=structuredClone(gapExample);report.acceptanceCases.definitePositive.findings=[];
 assert.equal(validateCapabilityGapReport(report).valid,false,'a mixed positive cannot disappear');
});
test('author entry points retain the consumer and maintainer boundary',()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'author-boundary-'));
 try{
  for(const args of [['help','author'],['capabilities'],['generate','check retries','--stdout']]){
   const run=spawnSync(process.execPath,[path.join(root,'bin/cli.js'),...args],{cwd:temp,encoding:'utf8',timeout:20000});
   assert.equal(run.status,0,run.stderr);
   for(const phrase of ['public facts and recipes','installed Any Doctor package','private parser/resolver','narrow the affected check','capability-gap report','framework-neutral','mixed-neighbor','not permission to guess'])assert.ok(run.stdout.includes(phrase),`${args}: ${phrase}`);
  }
  const run=spawnSync(process.execPath,[path.join(root,'bin/cli.js'),'capabilities','--format','json'],{encoding:'utf8'});
  const gap=JSON.parse(run.stdout).customChecks.gapReport;
  assert.equal(gap.validation.consumedByDoctorVerify,false);
  assert.deepEqual(gap.validation.stakes,['currentFailure','definitePositive','negativeControl','uncertainControl']);
 }finally{fs.rmSync(temp,{recursive:true,force:true})}
});

test('gap report accepts fixture paths and zero-based finding columns',()=>{
 const report=structuredClone(gapExample);
 delete report.acceptanceCases.definitePositive.seed;
 report.acceptanceCases.definitePositive.fixturePath='./fixtures/mixed';
 report.acceptanceCases.definitePositive.findings[0].column=0;
 assert.equal(validateCapabilityGapReport(report).valid,true);
});

test('gap report rejects coerced narrowing states outside the uncertain control',()=>{
 const report=structuredClone(gapExample);
 Object.assign(report.acceptanceCases.currentFailure,{
  narrowing:{state:['narrowed'],reasons:['unsupported-expression']},score:'present',grade:'present',
 });
 const result=validateCapabilityGapReport(report);
 assert.equal(result.valid,false);
 assert.ok(result.errors.some(error=>error.includes('currentFailure: narrowing')));
});
