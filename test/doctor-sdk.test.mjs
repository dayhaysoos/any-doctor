import assert from 'node:assert/strict';
import test from 'node:test';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {analyzeCalls} from '../bin/analysis.js';
import {identityResult,optionPresenceResult,resourceLifetimeResult,valueDispositionResult} from '../bin/doctor-sdk.js';

function identities(source){
  const parsed=analyzeCalls('example.ts',source);assert.equal(parsed.ok,true);
  const calls=parsed.file.structure.flow.values.filter(v=>v.kind==='call');
  return calls.map(call=>identityResult('example.ts',source,parsed.file,ref(parsed.file,call.callee),{globals:['fetch','globalThis.fetch']}));
}
function ref(facts,id){const value=facts.structure.flow.values.find(v=>v.id===id);return {id:value.id,start:value.start,end:value.end};}

test('Doctor SDK identity distinguishes globals, aliases, locals, shadowing and unresolved targets',()=>{
  const results=identities(`
    fetch('/');
    const alias=globalThis.fetch; alias('/');
    const local=()=>{}; local('/');
    function f(fetch){ fetch('/'); }
    mystery('/');
  `);
  assert.deepEqual(results.map(r=>r.status==='known'?[r.status,r.value.matches,r.value.origin.kind]:[r.status,r.reason]),[
    ['known',true,'global'],['known',true,'global'],['known',false,'local'],['known',false,'local'],['unknown','unresolved-identity'],
  ]);
  assert.ok(results[0].evidence.every(e=>e.file==='example.ts'&&e.sourceDigest&&e.range.end>e.range.start));
});

test('Doctor SDK identity rejects stale or invented expression references',()=>{
  const source='fetch("/")',parsed=analyzeCalls('example.ts',source);assert.equal(parsed.ok,true);
  const result=identityResult('example.ts',source,parsed.file,{id:999,start:0,end:1},{globals:['fetch']});
  assert.deepEqual(result,{version:1,status:'unknown',reason:'unsupported-expression'});
});

function disposition(source){
  const parsed=analyzeCalls('example.ts',source);assert.equal(parsed.ok,true);
  const subject=parsed.file.structure.flow.values.find(value=>value.kind==='call'&&value.member==='map');assert.ok(subject);
  return valueDispositionResult('example.ts',source,parsed.file,{id:subject.id,start:subject.start,end:subject.end},{consumers:['Promise.all']});
}

test('Doctor SDK classifies expression transfers without mistaking projections or await-array for consumption',()=>{
  const cases=[
    ['async function f(){const tasks=[1].map(async x=>x);return await tasks;}','transferred'],
    ['async function f(){return await [1].map(async x=>x);}','transferred'],
    ['function f(flag){const tasks=[1].map(async x=>x);return flag?tasks:{tasks};}','transferred'],
    ['function* f(){const tasks=[1].map(async x=>x);yield tasks;}','transferred'],
    ['function f(){const tasks=[1].map(async x=>x);return void tasks;}','discarded'],
    ['function f(){const tasks=[1].map(async x=>x);return tasks.length;}','discarded'],
    ['async function f(){const tasks=[1].map(async x=>x);await tasks;}','discarded'],
    ['function f(){return [1].map(async x=>x);}','transferred'],
    ['[1].map(async x=>x);','discarded'],
    ['const tasks=[1].map(async x=>x);Promise.all([tasks]);','discarded'],
  ];
  for(const [source,expected] of cases){const result=disposition(source);assert.equal(result.status,'known',source);assert.equal(result.value,expected,source);assert.ok(result.evidence.every(item=>item.sourceDigest));}
});

function lifetime(body){
  const source=`import {useEffect} from 'react'; function stop(h){clearTimeout(h)} function make(h){return()=>clearTimeout(h)} useEffect(()=>{${body}},[])`;
  const parsed=analyzeCalls('example.ts',source);assert.equal(parsed.ok,true);const values=parsed.file.structure.flow.values;
  const timer=values.find(value=>value.kind==='call'&&value.target?.root==='setTimeout');
  const effect=values.find(value=>value.kind==='call'&&value.target?.source==='react');
  const owner=values.find(value=>value.id===effect.arguments[0]);const ref=value=>({id:value.id,start:value.start,end:value.end});
  return resourceLifetimeResult('example.ts',source,parsed.file,ref(timer),{owner:ref(owner),release:['clearTimeout']});
}

test('Doctor SDK matches exact resource handles through cleanup helpers and factories',()=>{
  for(const body of [
    'const h=setTimeout(()=>{},1);return()=>clearTimeout(h)',
    'const h=setTimeout(()=>{},1);return()=>stop(h)',
    'const h=setTimeout(()=>{},1);return make(h)',
  ])assert.equal(lifetime(body).value,'released',body);
  for(const body of [
    'const h=setTimeout(()=>{},1);return()=>clearTimeout(99)',
    'let h=setTimeout(()=>{},1);h=0;return()=>clearTimeout(h)',
    'const h=setTimeout(()=>{},1);return()=>{const helper=()=>clearTimeout(h)}',
  ])assert.equal(lifetime(body).value,'unreleased',body);
  for(const body of [
    'const h=setTimeout(()=>{},1);return()=>{if(flag)clearTimeout(h)}',
    'const h=setTimeout(()=>{},1);return()=>externalCancel(h)',
  ])assert.equal(lifetime(body).status,'unknown',body);
});

function option(source){
  const parsed=analyzeCalls('example.ts',source);assert.equal(parsed.ok,true);const values=parsed.file.structure.flow.values;
  const call=values.find(value=>value.kind==='call'&&value.target?.root==='fetch');assert.ok(call);
  return optionPresenceResult('example.ts',source,parsed.file,ref(parsed.file,call.id),{option:'signal',sources:['RequestInit','Request']});
}

test('Doctor SDK establishes ordered, inherited and Request-carried option presence',()=>{
  for(const source of [
    'const c=new AbortController();fetch("/",{__proto__:{signal:c.signal}})',
    'const c=new AbortController();const a={signal:c.signal};fetch("/",{...a})',
    'const c=new AbortController();const r=new Request("/",{signal:c.signal});fetch(new Request(r))',
    'const c=new AbortController();fetch(new Request("/",{signal:c.signal}),{signal:undefined})',
  ])assert.equal(option(source).value,'present',source);
  for(const source of [
    'fetch("/",{__proto__:{signal:null}})',
    'const c=new AbortController();fetch("/",{__proto__:{signal:c.signal},signal:null})',
    'fetch(new Request("/"))',
    'fetch("/")',
  ])assert.equal(option(source).value,'absent',source);
  for(const source of [
    'const options={};options.signal=external;fetch("/",options)',
    'const options={};configure(options);fetch("/",{...options})',
    'fetch("/",{get signal(){return external}})',
    'function f(key){fetch("/",{[key]:external})}',
  ])assert.equal(option(source).status,'unknown',source);
});

test('a confined reference doctor reuses all recipes with different APIs and copy',()=>{
  const repo=fileURLToPath(new URL('../',import.meta.url));
  const run=spawnSync(process.execPath,[`${repo}bin/cli.js`,'verify',`${repo}fixtures/doctor-sdk-reference.mjs`],{cwd:repo,encoding:'utf8',timeout:30000});
  assert.equal(run.status,0,run.stdout+run.stderr);
  assert.match(run.stdout,/three reusable recipes/);
  assert.match(run.stdout,/challenge profile: unhandled-value/);
});

test('declared recipe profiles are named in JSON including unavailable paths',()=>{
  const repo=fileURLToPath(new URL('../',import.meta.url));
  const run=spawnSync(process.execPath,[`${repo}bin/cli.js`,'verify',`${repo}fixtures/doctor-sdk-reference.mjs`,'--format','json'],{cwd:repo,encoding:'utf8',timeout:30000});
  assert.equal(run.status,0,run.stdout+run.stderr);const result=JSON.parse(run.stdout),profiles=result.results.filter(item=>item.name.startsWith('challenge profile:'));
  assert.equal(profiles.length,19);assert.equal(profiles.filter(item=>!item.ok).length,0);assert.equal(profiles.filter(item=>item.skipped).length,0);assert.equal(profiles.filter(item=>item.name.endsWith('/ analysis unavailable')&&item.ok).length,3);
});

test('recipe profiles reject identity, unknown-as-absence and suppression mutations',()=>{
  const repo=fileURLToPath(new URL('../',import.meta.url)),parent=fs.mkdtempSync(path.join(os.tmpdir(),'doctor-sdk-mutations-')),output=path.join(parent,'results');
  try{const run=spawnSync(process.execPath,[`${repo}dev/doctor-sdk/run-profile-mutations.mjs`,output],{cwd:repo,encoding:'utf8',timeout:30000});assert.equal(run.status,0,run.stdout+run.stderr);const result=JSON.parse(fs.readFileSync(path.join(output,'mutation-results.json'),'utf8'));assert.deepEqual(result.mutations.map(item=>item.mutation),['broken-identity','unknown-as-absent','suppressed-reporting']);assert.ok(result.mutations.every(item=>item.exit!==0&&item.failedProfiles.length));}
  finally{fs.rmSync(parent,{recursive:true,force:true});}
});
