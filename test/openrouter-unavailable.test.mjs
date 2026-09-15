import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const candidate=process.env.DOCTOR_CANDIDATE_ROOT??fileURLToPath(new URL('../',import.meta.url));
const {runOnce}=await import(pathToFileURL(path.join(candidate,'bin/certify.js')));
const {setAnalysisDisabled}=await import(pathToFileURL(path.join(candidate,'bin/sdk.js')));
const program=await import(pathToFileURL(path.join(candidate,'doctors/openrouter.mjs')));
for(const check of program.meta.checks.filter(c=>c.needs))test(`OpenRouter provider omitted: ${check.id}`,async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'openrouter-off-'));fs.writeFileSync(path.join(root,'entry.ts'),'fetch("https://openrouter.ai/api/v1/chat/completions")');
 setAnalysisDisabled(true);
 try{const result=await runOnce(root,program,{includeTests:false});assert.equal(result.findings.filter(f=>f.rule===check.id).length,0);assert.ok(result.semantic.incomplete);assert.deepEqual(result.semantic.narrowed.find(n=>n.check===check.id),{check:check.id,reason:'analysis-unavailable',occurrences:0,files:[]});}
 finally{setAnalysisDisabled(false);fs.rmSync(root,{recursive:true,force:true});}
});
