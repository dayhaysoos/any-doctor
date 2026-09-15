import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {cases} from '../dev/openrouter/sse-cases.mjs';
const candidate=process.env.DOCTOR_CANDIDATE_ROOT??fileURLToPath(new URL('../',import.meta.url));
for(const c of cases)test(`OpenRouter SSE: ${c.name}`,()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'openrouter-abort-'));
 try{
  fs.writeFileSync(path.join(root,'entry.ts'),c.source);
  const run=spawnSync(process.execPath,[path.join(candidate,'bin/cli.js'),'run',path.join(candidate,'doctors/openrouter.mjs'),root,'--format','json'],{encoding:'utf8',timeout:20000,maxBuffer:10e6});
  assert.equal(run.status,0,run.stderr);const scan=JSON.parse(run.stdout),g=scan.groups[0];
  assert.equal(g.checks.find(x=>x.rule==='sse-comment-parse-crash')?.findings.length??0,c.count);
  const narrowed=g.semantic?.narrowed.filter(x=>x.check==='sse-comment-parse-crash')??[];
  assert.equal(narrowed.reduce((n,x)=>n+x.occurrences,0),c.unknown);
  assert.ok(narrowed.every(x=>x.reason==='unsupported-expression'&&x.files.length===1&&x.files[0].file==='entry.ts'));
  if(c.unknown){assert.equal(scan.score.score,null);assert.equal(scan.score.grade,null)}
 }finally{fs.rmSync(root,{recursive:true,force:true})}
});
