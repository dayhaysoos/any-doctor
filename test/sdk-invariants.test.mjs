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
const {narrowedCheckIds,checkAnalysisNeeds,recipeAnalysisNeeds}=await import(path.join(root,'bin/contract.js'));
const {RECIPE_DEFINITIONS}=await import(path.join(root,'bin/recipe-definitions.js'));
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
  fs.writeFileSync(path.join(tmp,'doctor.mjs'),source);fs.copyFileSync(new URL('../fixtures/doctor-sdk-recipe-only.fixtures.mjs',import.meta.url),path.join(tmp,'doctor.fixtures.mjs'));
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
 const expected={'unhandled-value':['calls','value-disposition'],'required-or-recommended-option':['calls','identity','option-presence'],'resource-without-release':['calls','identity','resource-lifetime'],'forbidden-call':['calls','identity']};
 for(const [name,implied] of Object.entries(expected)){
  assert.deepEqual(recipeAnalysisNeeds(name),implied);
  assert.deepEqual(checkAnalysisNeeds({recipe:{name},needs:['extra','calls']}),['extra',...implied]);
 }
});
test('canonical recipe definitions are locally complete and own unique host kinds',()=>{
 const expected={'unhandled-value':['calls','value-disposition'],'required-or-recommended-option':['calls','identity','option-presence'],'resource-without-release':['calls','identity','resource-lifetime'],'forbidden-call':['calls','identity']};
 assert.deepEqual(Object.keys(RECIPE_DEFINITIONS).sort(),Object.keys(expected).sort());
 assert.equal(new Set(Object.values(RECIPE_DEFINITIONS).map(item=>item.kind)).size,Object.keys(expected).length);
 assert.equal(new Set(Object.values(RECIPE_DEFINITIONS).map(item=>item.method)).size,Object.keys(expected).length);
 for(const [name,definition] of Object.entries(RECIPE_DEFINITIONS)){
  assert.deepEqual(definition.needs,expected[name]);
  assert.deepEqual(recipeAnalysisNeeds(name),expected[name]);
  assert.equal(typeof definition.method,'string',`${name}.method`);
  for(const hook of ['parse','evaluate','authoring','challenges'])assert.equal(typeof definition[hook],'function',`${name}.${hook}`);
 }
});
test('recipe-only metadata skips analysis-on profiles when the host channel is unavailable',async()=>{
 const {certify}=await import(path.join(root,'bin/certify.js'));
 const mod=await import('../fixtures/doctor-sdk-recipe-only.mjs');
 const rows=(await certify(mod,[])).filter(row=>row.name.startsWith('challenge profile:'));
 assert.equal(rows.length,6);assert.equal(rows.filter(row=>row.skipped).length,5);
 const off=rows.find(row=>row.name.endsWith(' / analysis unavailable'));assert.equal(off.ok,true);assert.ok(!off.skipped);
});


test('recipe-only location coverage skips without an analysis host',async()=>{
 const {certify}=await import(path.join(root,'bin/certify.js'));
 const mod=await import('../fixtures/doctor-sdk-recipe-only.mjs');
 const {fixtures}=await import('../fixtures/doctor-sdk-recipe-only.fixtures.mjs');
 const rows=await certify(mod,fixtures);
 const author=rows.find(r=>r.name==='native map location witness');
 const location=rows.find(r=>r.name==='location coverage: recipe-only-map');
 assert.match(author.skipped,/analysis engine unavailable/);
 assert.equal(location.ok,true,location.error);
 assert.match(location.skipped,/analysis engine unavailable/);
});

test('analysis-off author fixture cannot witness recipe-implied location coverage',()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'sdk-off-witness-'));
 try {
  const source=fs.readFileSync(new URL('../fixtures/doctor-sdk-recipe-only.mjs',import.meta.url),'utf8')
   .replace('if(!ctx.analysis.available)return;',"if(ctx.files.list().includes('off.ts'))ctx.report.finding({rule:'recipe-only-map',file:'off.ts',line:1,column:0}); if(!ctx.analysis.available)return;");
  fs.writeFileSync(path.join(tmp,'doctor.mjs'),source);
  fs.writeFileSync(path.join(tmp,'doctor.fixtures.mjs'),`export const fixtures=[{name:'off-only witness',analysis:'off',seed:{'off.ts':'[1].map(async x=>x);'},expected:[{rule:'recipe-only-map',file:'off.ts',line:1,column:0}]}];`);
  const run=spawnSync(process.execPath,[path.join(root,'bin/cli.js'),'verify',path.join(tmp,'doctor.mjs'),'--format','json'],{encoding:'utf8'});
  const rows=JSON.parse(run.stdout).results;
  assert.equal(rows.find(r=>r.name==='off-only witness').ok,true);
  assert.equal(run.status,1,'off-only location witness must fail certification');
  assert.match(rows.find(r=>r.name==='location coverage: recipe-only-map').error,/requires a passing positive fixture/);
 } finally {fs.rmSync(tmp,{recursive:true,force:true});}
});

test('all maintained analysis-on profiles explicitly classify semantic coverage',async()=>{
 const {challengeProfileFixtures}=await import(path.join(root,'bin/certify.js'));
 const expected={
  'forbidden-call':['complete','complete','complete','complete','complete','narrowed','complete'],
  'unhandled-value':['complete','complete','complete','narrowed','complete'],
  'required-or-recommended-option':['complete','complete','complete','complete','narrowed','complete'],
  'resource-without-release':['complete','complete','complete','complete','complete','narrowed','complete'],
 };
 for(const file of ['doctors/async.mjs','fixtures/doctor-sdk-reference.mjs']){
  const {meta}=await import(path.join(root,file));
  for(const check of meta.checks){
   const actual=challengeProfileFixtures(check).filter(f=>f.analysis!=='off').map(f=>f.expectedSemantic);
   const maintained=expected[check.recipe.name];
   assert.deepEqual(actual.slice(0,maintained.length),maintained,check.recipe.name);
   assert.ok(actual.slice(maintained.length).every(status=>status==='complete'),`${check.recipe.name}: declared identity witnesses must require complete coverage`);
  }
 }
});

test('resource recipe profiles exercise every declared identity and release form',async()=>{
 const {challengeProfileFixtures}=await import(path.join(root,'bin/certify.js'));
 const check={
  id:'interval-cleanup',severity:'warning',reportingUnit:'occurrence',
  recipe:{name:'resource-without-release',query:{
   acquisition:{globals:['setInterval','window.setInterval']},
   owner:{identity:{imports:[{source:'react',names:['useEffect','*.useEffect']}]},argument:0},
   release:['clearInterval','window.clearInterval'],
  }},
 };
 const fixtures=challengeProfileFixtures(check);
 const names=fixtures.map(fixture=>fixture.name);
 assert.ok(names.includes('declared acquisition identity: global window.setInterval'));
 assert.ok(names.includes('declared owner identity: namespace import react *.useEffect'));
 assert.ok(names.includes('declared release identity: window.clearInterval'));
 const namespace=fixtures.find(fixture=>fixture.name==='declared owner identity: namespace import react *.useEffect');
 assert.match(Object.values(namespace.seed).join('\n'),/import \* as profileOwner from "react"/);
 assert.match(Object.values(namespace.seed).join('\n'),/profileOwner\.useEffect/);
 assert.equal(namespace.expected.length,1);
 assert.equal(namespace.expectedSemantic,'complete');
});

test('all identity-based recipe families exercise additional declared identities',async()=>{
 const {challengeProfileFixtures}=await import(path.join(root,'bin/certify.js'));
 const checks=[
  {id:'forbidden',recipe:{name:'forbidden-call',query:{target:{globals:['process.exit','Deno.exit']}}}},
  {id:'option',recipe:{name:'required-or-recommended-option',query:{call:{imports:[{source:'client',names:['request','*.request']}]},option:{option:'signal',sources:['RequestInit']}}}},
 ];
 const forbidden=challengeProfileFixtures(checks[0]);
 assert.ok(forbidden.some(fixture=>fixture.name==='declared target identity: global Deno.exit'));
 const option=challengeProfileFixtures(checks[1]);
 assert.ok(option.some(fixture=>fixture.name==='declared call identity: namespace import client *.request'));
});

test('semantic mutations are rejected independently of unchanged finding projections',()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'sdk-semantic-mutations-'));
 try {
  const run=spawnSync(process.execPath,[fileURLToPath(new URL('../dev/doctor-sdk/run-semantic-mutations.mjs',import.meta.url)),root,tmp],{encoding:'utf8',maxBuffer:20e6});
  assert.equal(run.status,0,run.stdout+run.stderr);
 } finally {fs.rmSync(tmp,{recursive:true,force:true});}
});
