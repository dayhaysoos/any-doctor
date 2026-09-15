import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {meta,doctor} from '../../doctors/convex.mjs';
import {buildCtx,setAnalysisDisabled} from '../../bin/sdk.js';
import {deriveSummary} from '../../bin/summary.js';
import {renderJson,renderReport} from '../../bin/report.js';

// Deliberately red desired contract; invoke explicitly, outside the inherited test suite.
for(const onUnknown of ['skip','narrow'])test(`Convex unavailable analysis with ${onUnknown} narrows coverage and suppresses score`,async()=>{
 const checkedMeta={...meta,checks:meta.checks.map(c=>({...c,onUnknown}))};
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'convex-coverage-'));
 try {
  fs.writeFileSync(path.join(root,'example.ts'),'import {query} from "./_generated/server";query({handler:ctx=>ctx.db.query("rows").collect()});');
  setAnalysisDisabled(true);
  const run=buildCtx(root);
  await doctor(run.ctx);
  assert.deepEqual(run.getFindings(),[]);
  const semantic=run.getSemanticReport(checkedMeta);
  assert.equal(semantic.incomplete,true);
  assert.deepEqual(semantic.narrowed.map(n=>n.check).sort(),meta.checks.map(c=>c.id).sort());
  assert.ok(semantic.narrowed.every(n=>n.reason==='analysis-unavailable'));
  const input={fileCount:1,durationMs:1,analysisAvailable:false,crashed:[],groups:[{meta:checkedMeta,programName:'convex.mjs',findings:[],semantic}]};
  const json=JSON.parse(renderJson(input,deriveSummary(input),{exitCode:0}));
  assert.equal(json.score.score,null);
  assert.notEqual(json.score.grade,'Excellent');
  const human=renderReport(input,false);
  assert.match(human,/narrowed/);
  assert.doesNotMatch(human,/Excellent|100 \/ 100|1\/1 files clean/);
 } finally {
  setAnalysisDisabled(false);
  fs.rmSync(root,{recursive:true,force:true});
 }
});
