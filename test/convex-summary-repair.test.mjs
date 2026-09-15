import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
const repo=fileURLToPath(new URL('../',import.meta.url)),candidate=process.env.DOCTOR_CANDIDATE_ROOT??repo;
for(const [script,count] of [['run-controls.mjs',25],['run-scaling.mjs',5]])test(`Convex repair ${script} preserves independent findings and scoped uncertainty`,()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'convex-summary-tests-'));
 try{const out=path.join(root,'result'),run=spawnSync(process.execPath,[path.join(repo,'dev/convex-summary-repair',script),candidate,out],{encoding:'utf8',timeout:120000,maxBuffer:10e6});assert.equal(run.status,0,run.stdout+run.stderr);const result=JSON.parse(fs.readFileSync(path.join(out,'results.json'),'utf8'));assert.equal(result.passed,count);assert.equal(result.failed,0);assert.equal(result.skipped,0);}finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('Computed patch and spread patch scans alone are incomplete without speculative presence findings',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'convex-patch-unknown-'));
 try{for(const fields of ['[args.field]:args.value','...args']){
  fs.writeFileSync(path.join(root,'entry.ts'),`import {mutation} from './_generated/server';mutation({args:{},handler:async(ctx,args)=>{await ctx.db.patch('id',{${fields}});}});`);
  const run=spawnSync(process.execPath,[path.join(candidate,'bin/cli.js'),'run',path.join(candidate,'doctors/convex.mjs'),root,'--format','json'],{encoding:'utf8'});assert.equal(run.status,0,run.stderr);const scan=JSON.parse(run.stdout),group=scan.groups[0];assert.equal(scan.score.score,null);assert.equal(scan.score.grade,null);assert.equal(group.semantic.incomplete,true);assert.equal(scan.counts.total,fields==='...args'?1:0);
  assert.deepEqual(group.semantic.narrowed,[{check:'presence-patch-on-shared-document',capability:'calls',reason:'unsupported-expression',occurrences:1,files:[{file:'entry.ts',occurrences:1}]}]);
 }}finally{fs.rmSync(root,{recursive:true,force:true});}
});
