import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=process.env.DOCTOR_CANDIDATE_ROOT??fileURLToPath(new URL('../',import.meta.url));
const {dashboardFrame}=await import(path.join(root,'bin/dashboard.js'));
const {deriveSummary}=await import(path.join(root,'bin/summary.js'));
const {buildTree}=await import(path.join(root,'bin/doctor-tree.js'));
const {narrowedCheckIds,checkAnalysisNeeds}=await import(path.join(root,'bin/contract.js'));
const {meta}=await import('../fixtures/doctor-sdk-recipe-only.mjs');

test('recipe declaration implies runtime and certification analysis needs',()=>{
 assert.deepEqual(narrowedCheckIds(meta),['recipe-only-map']);
});
for(const narrowed of [false,true])test(`mixed dashboard retains ${narrowed?'narrowed':'clean'} zero-finding doctor`,()=>{
 const input={fileCount:2,durationMs:2,crashed:[],analysisAvailable:true,groups:[
  {programName:'finding.mjs',meta:{id:'finding-doctor',description:'Finding',severity:'warning'},findings:[{file:'example.ts',line:1}]},
  {programName:'quiet.mjs',meta:{id:'quiet-doctor',description:'Quiet',severity:'warning'},findings:[],...(narrowed?{semantic:{incomplete:true,protocolVersion:1,provider:{id:'syntax',version:1,available:true},narrowed:[{check:'quiet',reason:'unsupported-expression',occurrences:1,files:[{file:'example.ts',occurrences:1}]}]}}:{})}
 ]};
 const summary=deriveSummary(input),tree=buildTree(summary.groupChecks,2);
 const frame=dashboardFrame({tree,selectedRow:0,readKeys:new Set(),readSource:()=>null,filesTotal:2,durationMs:2,useColor:false,cols:140,rows:34,zeroFindingDoctors:summary.groupChecks.filter(gc=>!gc.checks.length).map(gc=>({id:gc.group.meta.id,narrowed:gc.group.semantic?.incomplete===true||gc.narrowedIds.length>0}))});
 assert.match(frame,/finding-doctor/);assert.match(frame,new RegExp(`${narrowed?'△':'✔'} quiet-doctor — ${narrowed?'narrowed':'clean'}`));
 assert.equal(tree.length,1,'navigation remains focused on finding-bearing doctors');
});
for(const broken of [false,true])test(`maintained lookalike semantic coverage ${broken?'rejects unknown':'passes complete'}`,()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'sdk-semantic-profile-'));
 try{
  let source=fs.readFileSync(new URL('../fixtures/doctor-sdk-recipe-only.mjs',import.meta.url),'utf8');
  if(broken)source=source.replace('meta.checks[0].recipe.query,{rule:',"{...meta.checks[0].recipe.query,producer:{member:'map',receiver:'array',asyncArgument:call.target?.root==='object'?99:0}},{rule:");
  fs.writeFileSync(path.join(tmp,'doctor.mjs'),source);fs.writeFileSync(path.join(tmp,'doctor.fixtures.mjs'),'export const fixtures=[];');
  const run=spawnSync(process.execPath,[path.join(root,'bin/cli.js'),'verify',path.join(tmp,'doctor.mjs'),'--format','json'],{encoding:'utf8'});
  const json=JSON.parse(run.stdout);const valid=json.results.find(r=>r.name.includes('valid lookalike'));
  assert.equal(run.status,broken?1:0,run.stdout+run.stderr);
  assert.deepEqual(valid.missing,[]);assert.deepEqual(valid.unexpected,[]);assert.equal(valid.ok,!broken);
  assert.deepEqual(valid.semantic,{expected:'complete',actual:broken?'narrowed':'complete'});
  const unknown=json.results.find(r=>r.name.includes('unsupported receiver'));
  assert.deepEqual(unknown.semantic,{expected:'narrowed',actual:'narrowed'});assert.equal(unknown.ok,true);
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});

test('canonical recipe requirements include explicit additions and all recipe families',()=>{
 const expected={'unhandled-value':['calls','value-disposition'],'required-or-recommended-option':['calls','identity','option-presence'],'resource-without-release':['calls','identity','resource-lifetime']};
 for(const [name,implied] of Object.entries(expected))assert.deepEqual(checkAnalysisNeeds({recipe:{name},needs:['extra','calls']}),['extra',...implied]);
});
test('recipe-only metadata skips analysis-on profiles when the host channel is unavailable',async()=>{
 const {certify}=await import(path.join(root,'bin/certify.js'));
 const mod=await import('../fixtures/doctor-sdk-recipe-only.mjs');
 const rows=(await certify(mod,[])).filter(row=>row.name.startsWith('challenge profile:'));
 assert.equal(rows.length,6);assert.equal(rows.filter(row=>row.skipped).length,5);
 const off=rows.find(row=>row.name.endsWith(' / analysis unavailable'));assert.equal(off.ok,true);assert.ok(!off.skipped);
});
