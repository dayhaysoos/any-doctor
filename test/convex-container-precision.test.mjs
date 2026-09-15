import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {cases} from '../dev/receiver-flow/cases.mjs';
const candidate=process.env.DOCTOR_CANDIDATE_ROOT??fileURLToPath(new URL('../',import.meta.url));
const sort=rows=>rows.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
for(const c of cases.filter(c=>c.name.startsWith('container-')))test(`container receiver precision: ${c.name}`,()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'convex-container-'));
 try{
  fs.writeFileSync(path.join(root,'entry.ts'),c.source);
  const run=spawnSync(process.execPath,[path.join(candidate,'bin/cli.js'),'run',path.join(candidate,'doctors/convex.mjs'),root,'--format','json'],{encoding:'utf8',timeout:20000,maxBuffer:10e6});
  assert.equal(run.status,0,run.stderr);
  const scan=JSON.parse(run.stdout),group=scan.groups[0];assert.equal(scan.analysisAvailable,true);
  const actual=group.checks.flatMap(check=>check.findings.map(f=>({rule:check.rule,line:f.line,column:f.column})));
  const narrowed=group.semantic.narrowed.map(n=>({check:n.check,reason:n.reason,occurrences:n.occurrences}));
  assert.deepEqual(sort(actual),sort([...c.expected]));assert.deepEqual(sort(narrowed),sort([...c.narrowed]));
  assert.ok(group.semantic.narrowed.every(n=>n.capability==='calls'&&n.files.length===1&&n.files[0].file==='entry.ts'&&n.files[0].occurrences===n.occurrences));
  assert.equal(group.semantic.incomplete,c.narrowed.length>0);
  if(c.narrowed.length){assert.equal(scan.score.score,null);assert.equal(scan.score.grade,null);}
  else if(!c.expected.length){assert.equal(scan.score.score,100);assert.equal(scan.score.grade,'Excellent');}
  else assert.notEqual(scan.score.score,null,'Ordinary sibling cannot make a definite positive unscored');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
