import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {cases} from '../dev/receiver-flow/cases.mjs';
const repo=fileURLToPath(new URL('../',import.meta.url)),candidate=process.env.DOCTOR_CANDIDATE_ROOT??repo;
test('receiver matrix preserves exact findings, affected coverage and positive neighbors',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'receiver-matrix-'));
 try{
  const output=path.join(root,'results');
  const run=spawnSync(process.execPath,[path.join(repo,'dev/receiver-flow/run-cases.mjs'),candidate,output],{encoding:'utf8',timeout:30000,maxBuffer:10e6});
  assert.equal(run.status,0,run.stdout+run.stderr);
  const result=JSON.parse(fs.readFileSync(path.join(output,'results.json'),'utf8'));
  assert.equal(result.passed,cases.length);assert.equal(result.failed,0);assert.equal(result.skipped,0);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('receiver uncertainty alone prevents a clean score, while an ordinary receiver stays quiet',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'receiver-isolated-'));
 try{for(const [name,narrowed] of [['mixed',2],['nested',2],['method-wrapper',4],['ordinary',0]]){
  // Remove only the independent positive neighbor from this isolated score check.
  const source=cases.find(c=>c.name===name).source.replace(/\nawait ctx\.db\.query\('neighbors'\).*;\n/,'\n');
  fs.writeFileSync(path.join(root,'entry.ts'),source);
  const run=spawnSync(process.execPath,[path.join(candidate,'bin/cli.js'),'run',path.join(candidate,'doctors/convex.mjs'),root,'--format','json'],{encoding:'utf8',timeout:20000});
  assert.equal(run.status,0,run.stderr);const scan=JSON.parse(run.stdout),semantic=scan.groups[0].semantic;
  assert.equal(scan.counts.total,0);assert.equal(semantic.narrowed.length,narrowed);
  assert.equal(semantic.incomplete,narrowed>0);
  assert.equal(scan.score.score,narrowed?null:100);assert.equal(scan.score.grade,narrowed?null:'Excellent');
  assert.ok(semantic.narrowed.every(n=>n.capability==='calls'&&n.reason==='unresolved-identity'&&n.occurrences===1&&n.files.length===1&&n.files[0].file==='entry.ts'));
 }}finally{fs.rmSync(root,{recursive:true,force:true});}
});
