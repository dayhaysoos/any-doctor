import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
const candidate=process.env.DOCTOR_CANDIDATE_ROOT??fileURLToPath(new URL('../',import.meta.url));
const {runOnce}=await import(pathToFileURL(path.join(candidate,'bin/certify.js')));
const {setAnalysisDisabled}=await import(pathToFileURL(path.join(candidate,'bin/sdk.js')));
const meta={id:'custom',description:'Custom coverage',severity:'warning',checks:[
 {id:'custom-check',description:'Custom check',needs:['calls'],onUnknown:'skip'},
 {id:'sibling',description:'Provider-independent check'},
]};
function sandbox(body){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'custom-narrowing-'));
 fs.writeFileSync(path.join(root,'a.ts'),'work();');fs.writeFileSync(path.join(root,'b.ts'),'work();');
 return Promise.resolve().then(()=>body(root)).finally(()=>fs.rmSync(root,{recursive:true,force:true}));
}
const narrowing={check:'custom-check',file:'a.ts',reason:'unresolved-identity',capability:'calls'};
test('public custom narrowing aggregates occurrences/files and preserves a sibling positive',()=>sandbox(async root=>{
 const program=path.join(root,'doctor.mjs');
 fs.writeFileSync(program,`export const meta=${JSON.stringify(meta)};export async function doctor(ctx){
 ctx.report.narrowing(${JSON.stringify(narrowing)});
 ctx.report.narrowing(${JSON.stringify(narrowing)});
 ctx.report.narrowing(${JSON.stringify({...narrowing,file:'b.ts'})});
 ctx.report.finding({rule:'sibling',file:'b.ts',line:1,column:0});
 }`);
 const run=spawnSync(process.execPath,[path.join(candidate,'bin/cli.js'),'run',program,root,'--format','json'],{encoding:'utf8'});
 assert.equal(run.status,0,run.stderr);const json=JSON.parse(run.stdout),group=json.groups[0];
 assert.deepEqual(json.crashed,[]);assert.equal(json.counts.total,1);
 assert.deepEqual(group.semantic.narrowed,[{check:'custom-check',capability:'calls',reason:'unresolved-identity',occurrences:3,files:[{file:'a.ts',occurrences:2},{file:'b.ts',occurrences:1}]}]);
 assert.equal(group.semantic.incomplete,true);assert.equal(json.score.score,null);
 assert.deepEqual(group.narrowed,['custom-check']);
 assert.equal(group.checks[0].rule,'sibling');assert.equal(group.checks[0].findings[0].column,0);
}));
for(const [name,patch] of [
 ['undeclared check',{check:'does-not-exist'}],['empty check',{check:''}],['invalid check syntax',{check:'../custom-check'}],
 ['unknown reason',{reason:'guess'}],['missing reason',{reason:undefined}],['invalid capability',{capability:'network'}],
 ['absolute path',{file:'/tmp/a.ts'}],['parent path',{file:'../a.ts'}],['embedded parent',{file:'inside/../a.ts'}],
 ['Windows path',{file:'C:\\a.ts'}],['backslash',{file:'folder\\a.ts'}],['empty path',{file:''}],
 ['dot path',{file:'./a.ts'}],['NUL path',{file:'a\0.ts'}],['duplicate separator',{file:'folder//a.ts'}],
 ['doctor-supplied count',{occurrences:100}],
])test(`custom narrowing rejects ${name} before producing a report`,()=>sandbox(async root=>{
 await assert.rejects(runOnce(root,{meta,doctor:async ctx=>ctx.report.narrowing({...narrowing,...patch})},{includeTests:false}),/invalid custom narrowing/);
}));
test('custom narrowing rejects a relative symlink escaping the root',()=>sandbox(async root=>{
 fs.symlinkSync(os.tmpdir(),path.join(root,'escape'));
 await assert.rejects(runOnce(root,{meta,doctor:async ctx=>ctx.report.narrowing({...narrowing,file:'escape/outside.ts'})},{includeTests:false}),/escapes|ENOENT/);
}));
test('missing custom capability narrows only dependent checks; independent work continues',()=>sandbox(async root=>{
 setAnalysisDisabled(true);
 try {
  const result=await runOnce(root,{meta,doctor:async ctx=>{
   if(ctx.analysis.available)ctx.report.finding({rule:'custom-check',file:'a.ts',line:1,column:0});
   ctx.report.finding({rule:'sibling',file:'b.ts',line:1,column:0});
  }},{includeTests:false});
  assert.deepEqual(result.findings.map(f=>f.rule),['sibling']);
  assert.deepEqual(result.semantic.narrowed,[{check:'custom-check',reason:'analysis-unavailable',occurrences:0,files:[]}]);
  assert.equal(result.semantic.incomplete,true);
 } finally {setAnalysisDisabled(false);}
}));
test('recipe unavailable declaration retains its existing recipe-scoped representation',()=>sandbox(async root=>{
 setAnalysisDisabled(true);
 try {
  const recipe={name:'unhandled-value',query:{producer:{member:'map',asyncArgument:0,receiver:'array'},consumers:['Promise.all']}};
  const result=await runOnce(root,{meta:{...meta,checks:[{...meta.checks[0],recipe}]},doctor:async()=>{}},{includeTests:false});
  assert.deepEqual(result.semantic.narrowed,[{check:'custom-check',recipe:'unhandled-value',reason:'analysis-unavailable',occurrences:0,files:[]}]);
 } finally {setAnalysisDisabled(false);}
}));
test('an unavailable named capability is unmeasured even when the provider is installed',()=>sandbox(async root=>{
 const program=path.join(root,'doctor.mjs');
 fs.writeFileSync(program,`export const meta=${JSON.stringify({...meta,checks:[{...meta.checks[0],needs:['future-capability']},meta.checks[1]]})};export async function doctor(ctx){ctx.report.finding({rule:'sibling',file:'b.ts',line:1,column:0});}`);
 const run=spawnSync(process.execPath,[path.join(candidate,'bin/cli.js'),'run',program,root,'--format','json'],{encoding:'utf8'});
 assert.equal(run.status,0,run.stderr);const json=JSON.parse(run.stdout),semantic=json.groups[0].semantic;
 assert.equal(semantic.provider.available,true);assert.equal(semantic.capabilities[0].available,false);
 assert.equal(semantic.incomplete,true);assert.deepEqual(semantic.narrowed.map(n=>n.check),['custom-check']);
 assert.equal(json.counts.total,1);assert.equal(json.score.score,null);
}));
