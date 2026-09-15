import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const repo=fileURLToPath(new URL('../',import.meta.url));
const candidate=process.env.DOCTOR_CANDIDATE_ROOT??repo;
for(const [script,count] of [['run-guardrails.mjs',63],['run-slices.mjs',151]])test(`Convex ${script} preserves findings, exact locations and scoped uncertainty`,()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'convex-sdk-suite-'));
 try {
  const output=path.join(temp,'result');
  const run=spawnSync(process.execPath,[path.join(repo,'dev/convex-sdk-migration',script),candidate,output],{encoding:'utf8',timeout:120000});
  assert.equal(run.status,0,run.stdout+run.stderr);
  const result=JSON.parse(fs.readFileSync(path.join(output,'results.json'),'utf8'));
  assert.equal(result.passed,count);assert.equal(result.failed,0);assert.equal(result.skipped,0);
 } finally {fs.rmSync(temp,{recursive:true,force:true});}
});

test('Uncertain query reads alone remain unmeasured',()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'convex-unmeasured-'));
 try {
  for(const expression of ["const alias=flag?ctx:external;return alias.db.query('rows').collect();","const builder=flag?ctx.db.query('rows'):external;return builder.collect();"]){
   fs.writeFileSync(path.join(temp,'entry.ts'),`import {query} from './_generated/server';query({args:{},handler:async ctx=>{${expression}}});`);
   const run=spawnSync(process.execPath,[path.join(candidate,'bin/cli.js'),'run',path.join(candidate,'doctors/convex.mjs'),temp,'--format','json'],{encoding:'utf8'});
   assert.equal(run.status,0,run.stderr);
   const scan=JSON.parse(run.stdout);
   assert.equal(scan.counts.total,0);assert.equal(scan.score.score,null);
   assert.equal(scan.groups[0].semantic.incomplete,true);
   const narrowed=scan.groups[0].semantic.narrowed;
   assert.equal(narrowed.length,1);assert.equal(narrowed[0].check,'unbounded-collect');
   assert.equal(narrowed[0].reason,'unresolved-identity');assert.equal(narrowed[0].occurrences,1);
   assert.deepEqual(narrowed[0].files,[{file:'entry.ts',occurrences:1}]);
  }
 } finally {fs.rmSync(temp,{recursive:true,force:true});}
});

test('Repeated builder assignment converges without losing scoped coverage or its neighbor',()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'convex-builder-flow-'));
 try {
  const before="import {query} from './_generated/server';query({args:{},handler:async ctx=>{let builder=ctx.db.query('rows');"+"builder=builder.filter(q=>q.eq(q.field('x'),1));".repeat(9)+"await builder.collect();return ctx.db.query('rows').";
  fs.writeFileSync(path.join(temp,'entry.ts'),before+"filter(q=>q.eq(q.field('x'),1)).collect();}});");
  const run=spawnSync(process.execPath,[path.join(candidate,'bin/cli.js'),'run',path.join(candidate,'doctors/convex.mjs'),temp,'--format','json'],{encoding:'utf8',timeout:20000,env:{...process.env,NODE_OPTIONS:'--max-old-space-size=128'}});
  assert.equal(run.status,0,run.stdout+run.stderr);
  const scan=JSON.parse(run.stdout),group=scan.groups[0];
  assert.deepEqual(scan.crashed,[]);assert.equal(scan.score.score,null);
  const findings=group.checks.filter(c=>c.rule==='filter-table-scan').flatMap(c=>c.findings);
  assert.deepEqual(findings.map(({file,line,column})=>({file,line,column})),[{file:'entry.ts',line:1,column:before.length}]);
  assert.deepEqual([...new Set(group.semantic.narrowed.map(n=>n.check))].sort(),['filter-table-scan','unbounded-collect']);
  for(const narrowing of group.semantic.narrowed){
   assert.equal(narrowing.reason,'unresolved-identity');assert.equal(narrowing.capability,'calls');
   assert.equal(narrowing.files.length,1);assert.equal(narrowing.files[0].file,'entry.ts');
   assert.ok(narrowing.occurrences>0);assert.equal(narrowing.files[0].occurrences,narrowing.occurrences);
  }
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
});
