import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const repo=fileURLToPath(new URL('../',import.meta.url));
const candidate=process.env.DOCTOR_CANDIDATE_ROOT??repo;
for(const [script,count] of [['run-guardrails.mjs',63],['run-slices.mjs',118]])test(`Convex ${script} preserves findings, exact locations and scoped uncertainty`,()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'convex-sdk-suite-'));
 try {
  const output=path.join(temp,'result');
  const run=spawnSync(process.execPath,[path.join(repo,'dev/convex-sdk-migration',script),candidate,output],{encoding:'utf8',timeout:120000});
  assert.equal(run.status,0,run.stdout+run.stderr);
  const result=JSON.parse(fs.readFileSync(path.join(output,'results.json'),'utf8'));
  assert.equal(result.passed,count);assert.equal(result.failed,0);assert.equal(result.skipped,0);
 } finally {fs.rmSync(temp,{recursive:true,force:true});}
});
