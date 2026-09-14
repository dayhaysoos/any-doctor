import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const repo=fileURLToPath(new URL('../',import.meta.url));
test('Async CLI retains transformation positives and spares paired lookalikes',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'async-transform-'));const output=path.join(root,'results');
 try{
  const r=spawnSync(process.execPath,[path.join(repo,'dev/async-analysis/run-cases.mjs'),repo,output],{encoding:'utf8',timeout:120000});
  assert.equal(r.status,0,r.stdout+r.stderr);
  const result=JSON.parse(fs.readFileSync(path.join(output,'results.json'),'utf8'));assert.equal(result.failed,0);assert.equal(result.skipped,0);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('Async unavailable analysis remains explicit in machine and human reports',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'async-unavailable-'));
 try{const r=spawnSync(process.execPath,[path.join(repo,'dev/async-analysis/check-unavailable.mjs'),repo,root],{encoding:'utf8'});assert.equal(r.status,0,r.stdout+r.stderr);}
 finally{fs.rmSync(root,{recursive:true,force:true});}
});
