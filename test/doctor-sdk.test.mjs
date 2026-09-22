import assert from 'node:assert/strict';
import test from 'node:test';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {analyzeCalls} from '../bin/analysis.js';
import {forbiddenCallRecipeResult,identityResult,optionPresenceResult,resourceLifetimeResult,resourceWithoutReleaseRecipeResult,valueAtPathResult,valueDispositionResult} from '../bin/doctor-sdk.js';
import {challengeProfileFixtures} from '../bin/certify.js';

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

test('DoctorCtx semantic calls use host validation and preserve cache metrics',()=>{
  const repo=fileURLToPath(new URL('../',import.meta.url)),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'doctor-sdk-host-route-'));
  try{
    const target=path.join(tmp,'target');fs.mkdirSync(target);fs.writeFileSync(path.join(target,'entry.ts'),'fetch("/")');
    const doctor=path.join(tmp,'host-route.mjs');fs.writeFileSync(doctor,`
      export const meta={id:'host-route',description:'Host route probe',severity:'info',checks:[{id:'route-probe',description:'Probe the semantic host route',claim:'The host classifies an invalid semantic query.',lookalikes:['A valid query'],reportingUnit:'occurrence',needs:['identity'],onUnknown:'narrow'}]};
      export async function doctor(ctx){
        const file=ctx.files.list(['.ts'])[0];
        const call=ctx.analysis.calls(file).structure.flow.values.find(value=>value.kind==='call');
        const ref={id:call.id,start:call.start,end:call.end};
        const invalid=ctx.analysis.callIdentity(file,ref,null);
        const valid=ctx.analysis.callIdentity(file,ref,{globals:['fetch']});
        ctx.report.finding({rule:'route-probe',file,line:1,message:JSON.stringify({invalid,valid})});
      }
    `);
    const run=spawnSync(process.execPath,[path.join(repo,'bin/cli.js'),'run',doctor,target,'--format','json'],{cwd:repo,encoding:'utf8',timeout:30000});
    assert.equal(run.status,0,run.stdout+run.stderr);const json=JSON.parse(run.stdout),group=json.groups[0];
    const result=JSON.parse(group.checks[0].findings[0].message);
    assert.equal(result.invalid.reason,'unsupported-expression');
    assert.deepEqual(result.valid.value,{matches:true});
    assert.deepEqual(group.semantic.execution,{semanticQueries:2,modelRequests:1,modelCacheHits:1});
    assert.equal(group.semantic.narrowed[0].reason,'unsupported-expression');
  }finally{fs.rmSync(tmp,{recursive:true,force:true})}
});

test('DoctorCtx Value Path resolves one static path at the observation site',()=>{
  const repo=fileURLToPath(new URL('../',import.meta.url)),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'doctor-sdk-value-path-'));
  try{
    const target=path.join(tmp,'target');fs.mkdirSync(target);fs.writeFileSync(path.join(target,'entry.ts'),`
      const auth={apiKey:'secret'};
      const base={auth};
      const config={...base};
      consume(config);
      config.auth={apiKey:'later'};
      const opaque={get auth(){return getAuth()}};
      consume(opaque);
    `);
    const doctor=path.join(tmp,'value-path.mjs');fs.writeFileSync(doctor,`
      export const meta={id:'value-path',description:'Value Path probe',severity:'info',checks:[{id:'value-path-probe',description:'Probe a static property path',claim:'The host resolves the path.',lookalikes:['A missing path'],reportingUnit:'occurrence',needs:['value-path'],onUnknown:'narrow'}]};
      export async function doctor(ctx){
        const file=ctx.files.list(['.ts'])[0];
        const values=ctx.analysis.calls(file).structure.flow.values;
        const calls=values.filter(value=>value.kind==='call'&&value.target?.root==='consume');
        const call=calls[0];
        const subject=values.find(value=>value.id===call.arguments[0]);
        const opaqueCall=calls[1];
        const opaque=values.find(value=>value.id===opaqueCall.arguments[0]);
        const ref=value=>({id:value.id,start:value.start,end:value.end});
        const present=ctx.analysis.valueAtPath(file,ref(subject),{at:ref(call),path:['auth','apiKey']});
        const absent=ctx.analysis.valueAtPath(file,ref(subject),{at:ref(call),path:['auth','token']});
        const unknown=ctx.analysis.valueAtPath(file,ref(opaque),{at:ref(opaqueCall),path:['auth','apiKey']});
        ctx.report.finding({rule:'value-path-probe',file,line:1,message:JSON.stringify({present,absent,unknown})});
      }
    `);
    const run=spawnSync(process.execPath,[path.join(repo,'bin/cli.js'),'run',doctor,target,'--format','json'],{cwd:repo,encoding:'utf8',timeout:30000});
    assert.equal(run.status,0,run.stdout+run.stderr);const json=JSON.parse(run.stdout);
    const result=JSON.parse(json.groups[0].checks[0].findings[0].message);
    assert.equal(result.present.status,'known');
    assert.equal(result.present.value.state,'present');
    assert.equal(result.present.value.constant,'secret');
    assert.equal(result.absent.status,'known');
    assert.deepEqual(result.absent.value,{state:'absent'});
    assert.equal(result.unknown.status,'unknown');
    assert.deepEqual(json.groups[0].semantic.narrowed,[],'a reusable fact does not assign an unknown result to a check');
    assert.deepEqual(json.groups[0].semantic.execution,{semanticQueries:3,modelRequests:1,modelCacheHits:3});
  }finally{fs.rmSync(tmp,{recursive:true,force:true})}
});

test('Value Path distinguishes missing, explicit undefined, and prior mutation',()=>{
  const inspect=(source,path)=>{
    const parsed=analyzeCalls('example.ts',source);assert.equal(parsed.ok,true);
    const values=parsed.file.structure.flow.values;
    const call=values.find(value=>value.kind==='call'&&value.target?.root==='consume');assert.ok(call);
    const subject=values.find(value=>value.id===call.arguments[0]);assert.ok(subject);
    return valueAtPathResult('example.ts',source,parsed.file,ref(parsed.file,subject.id),{at:ref(parsed.file,call.id),path});
  };
  const explicit=inspect('const options={signal:undefined};consume(options);',['signal']);
  assert.equal(explicit.status,'known');
  assert.equal(explicit.value.state,'present');
  assert.equal('constant' in explicit.value,false);
  assert.equal(inspect('const options={};consume(options);',['signal']).value.state,'absent');
  assert.equal(inspect('const options={};options.signal=external;consume(options);',['signal']).status,'unknown');
});

test('Value Path applies ordered spreads and use-site escape timing',()=>{
  const inspect=(source,path=['key'])=>{
    const parsed=analyzeCalls('example.ts',source);assert.equal(parsed.ok,true);
    const values=parsed.file.structure.flow.values;
    const call=values.find(value=>value.kind==='call'&&value.target?.root==='consume');assert.ok(call);
    const subject=values.find(value=>value.id===call.arguments[0]);assert.ok(subject);
    return valueAtPathResult('example.ts',source,parsed.file,ref(parsed.file,subject.id),{at:ref(parsed.file,call.id),path});
  };
  const override=inspect('const base={key:"old"};const options={...base,key:"new"};consume(options);');
  assert.equal(override.status,'known');assert.equal(override.value.constant,'new');
  assert.equal(inspect('const options={key:"safe"};consume(options);configure(options);').value.constant,'safe');
  assert.equal(inspect('const options={key:"safe"};configure(options);consume(options);').status,'unknown');
  assert.equal(inspect('const options={key:"safe"};configure({options});consume(options);').status,'unknown');
  assert.equal(inspect('const options={key:"safe"};configure([options]);consume(options);').status,'unknown');
  assert.equal(inspect('const options={key:"safe"};configure(...[options]);consume(options);').status,'unknown');
  assert.equal(inspect('const options={key:"safe"};new Wrapper(options);consume(options);').status,'unknown');
  assert.equal(inspect('const options={key:"safe",mutate(){this.key=external}};options.mutate();consume(options);').status,'unknown');
  assert.equal(inspect('const options={key:"safe"};consume(options,configure(options));').status,'unknown');
  assert.equal(inspect('const options={key:"safe",mutate(){this.key=external}};consume(options,options.mutate());').status,'unknown');
  assert.equal(inspect('const options={key:"safe"};configure(options,consume(options));').value.constant,'safe');
  assert.equal(inspect('const options={Factory:class {},key:"safe"};new options.Factory();consume(options);').value.constant,'safe');
  assert.equal(inspect('const options={auth:{key:"safe"}};configure(options.auth);consume(options);',['auth','key']).status,'unknown');
  assert.equal(inspect('const options={key:"safe"};configure(options.key);consume(options);').value.constant,'safe');
  assert.equal(inspect('const options={auth:{key:"secret"},logging:{key:"safe"}};configure(options.auth);consume(options);',['logging','key']).value.constant,'safe');
  assert.equal(inspect('const options={auth:{key:"safe"}};configure({...options});consume(options);',['auth','key']).status,'unknown');
  assert.equal(inspect('const listen={provider:{key:"safe"}};configure(listen.provider);const options={agent:{listen}};consume(options);',['agent','listen','provider','key']).status,'unknown');
  assert.equal(inspect('const options={auth:{key:"safe"}};const wrapper={options};configure(wrapper);consume(options);',['auth','key']).status,'unknown');
  assert.equal(inspect('const options={auth:{key:"safe"}};const wrapper=[options];configure(wrapper);consume(options);',['auth','key']).status,'unknown');
  assert.equal(inspect('const options={auth:{key:"safe"}};const inner={options};const wrapper={inner};configure(wrapper);consume(options);',['auth','key']).status,'unknown');
  assert.equal(inspect('const options={auth:{key:"safe"}};const wrapper={};wrapper.options=options;configure(wrapper);consume(options);',['auth','key']).status,'unknown');
  assert.equal(inspect('const options={auth:{key:"safe"}};let wrapper={};wrapper={options};configure(wrapper);consume(options);',['auth','key']).status,'unknown');
  assert.equal(inspect('const auth={key:"safe"};const base={auth};configure({...base});consume(auth);').status,'unknown');
  assert.equal(inspect('const options={key:"safe"};const items=[options];configure([...items]);consume(options);').status,'unknown');
  assert.equal(inspect('const auth={key:"safe"};const base={auth};const wrapper={...base};configure(wrapper);consume(auth);').status,'unknown');
  assert.equal(inspect('const options={key:"safe"};const box={};const alias=box;alias.options=options;configure(box);consume(options);').status,'unknown');
  assert.equal(inspect('const auth={key:"safe"};const base={};base.auth=auth;configure({...base});consume(auth);').status,'unknown');
  assert.equal(inspect('const options={key:"safe"};const wrapper={};wrapper.options=options;configure({...wrapper});consume(options);').status,'unknown');
  assert.equal(inspect('const options={key:"safe"};const items=[];items[0]=options;configure([...items]);consume(options);').status,'unknown');
  assert.equal(inspect('const options={key:"safe"};let wrapper={options};wrapper={};configure(wrapper);consume(options);').value.constant,'safe');
  assert.equal(inspect('const options={key:"safe"};const box={};box.a=options;configure(box.b);consume(options);').value.constant,'safe');
  assert.equal(inspect('const options={key:"safe"};const box={};box.a=options;box.a=null;configure(box);consume(options);').value.constant,'safe');
  assert.equal(inspect('const options={key:"safe"};let wrapper={options};const alias=wrapper;wrapper={};configure(alias);consume(options);').status,'unknown');
  assert.equal(inspect('const options={key:"safe"};const base={options};const wrapper={...base};base.options=null;configure(wrapper);consume(options);').status,'unknown');
  assert.equal(inspect('const options={key:"safe"};let wrapper={options};wrapper=configure(wrapper);consume(options);').status,'unknown');
  assert.equal(inspect('const options={key:"safe"};const wrapper=flag?{options}:{};configure(wrapper);consume(options);').status,'unknown');
  assert.equal(inspect('const options={key:"safe"};const wrapper={slot:{options}};const alias=wrapper.slot;wrapper.slot={};configure(alias);consume(options);').status,'unknown');
  assert.equal(inspect('const options={key:"safe"};const base={slot:{options}};const copied={...base};base.slot={};configure(copied);consume(options);').status,'unknown');
  assert.equal(inspect('const options={key:"safe"};let wrapper={options};const a=wrapper;const b=a;wrapper={};configure(b);consume(options);').status,'unknown');
  assert.equal(inspect('const options={key:"safe"};let wrapper={options};function clear(){wrapper={}}configure(wrapper);consume(options);').status,'unknown');
  assert.equal(inspect('const base={key:"safe"};configure({...base});consume(base);').value.constant,'safe');
  assert.equal(inspect('const base={key:"safe"};const wrapper={...base};configure(wrapper);consume(base);').value.constant,'safe');
  assert.equal(inspect('const pin="safe";configure({key:pin});consume({key:pin});').value.constant,'safe');
  assert.equal(inspect('const pin=flag?"safe":"safe";configure(pin);consume({key:pin});').value.constant,'safe');
  assert.equal(inspect('const name="key";const options={[name]:"dynamic"};consume(options);').status,'unknown');
  assert.equal(inspect('const options={get key(){return "dynamic"}};consume(options);').status,'unknown');
  assert.equal(inspect('const options={__proto__:{key:"inherited"}};consume(options);').status,'unknown');
});

test('Value Path refuses values constructed after the observation',()=>{
  const source='consume(options);const options={key:"future"};';
  const parsed=analyzeCalls('example.ts',source);assert.equal(parsed.ok,true);
  const values=parsed.file.structure.flow.values;
  const call=values.find(value=>value.kind==='call'&&value.target?.root==='consume');assert.ok(call);
  const subject=values.find(value=>value.id===call.arguments[0]);assert.ok(subject);
  const result=valueAtPathResult('example.ts',source,parsed.file,ref(parsed.file,subject.id),{at:ref(parsed.file,call.id),path:['key']});
  assert.equal(result.status,'unknown');
});

test('Doctor SDK identity resolves a stable CommonJS require binding',()=>{
  const source='const WebSocket = require("ws"); new WebSocket("wss://example.com");';
  const parsed=analyzeCalls('example.js',source);assert.equal(parsed.ok,true);
  const construct=parsed.file.structure.flow.values.find(value=>value.kind==='construct');
  const result=identityResult('example.js',source,parsed.file,ref(parsed.file,construct.callee),{imports:[{source:'ws',names:['default']}]});
  assert.equal(result.status,'known');
  assert.equal(result.value.matches,true);
  assert.deepEqual(result.value.origin,{kind:'import',source:'ws',name:'default'});
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

test('resource recipe clears unrelated calls before identity uncertainty',()=>{
  const source=`
    import {useEffect} from 'react';
    useEffect(() => {
      const handle = setInterval(() => console.log('tick'), 1000);
      return () => clearInterval(handle);
    }, []);
  `;
  const parsed=analyzeCalls('example.ts',source);assert.equal(parsed.ok,true);
  const calls=parsed.file.structure.flow.values.filter(value=>value.kind==='call'&&!value.dead);
  const query={
    acquisition:{globals:['setInterval','window.setInterval']},
    owner:{identity:{imports:[{source:'react',names:['useEffect']}]},argument:0},
    release:['clearInterval','window.clearInterval'],
  };
  const results=calls.map(call=>({call,result:resourceWithoutReleaseRecipeResult('example.ts',source,parsed.file,{id:call.id,start:call.start,end:call.end},query)}));
  assert.ok(results.length>=4);
  assert.ok(results.every(({result})=>result.status==='known'),JSON.stringify(results.map(({call,result})=>({line:call.line,member:call.member,target:call.target,result})),null,2));
  assert.ok(results.every(({result})=>result.value==='clear'));
});

test('forbidden-call recipe normalizes harmless syntax wrappers and preserves lexical identity',()=>{
  const source=`
    process.exit(1);
    (process).exit(2);
    (process as NodeJS.Process).exit(3);
    process!.exit(4);
    (process.exit)(5);
    const stop = process.exit; stop(6);
    function local(process) { process.exit(7); }
    console.log('safe');
  `;
  const parsed=analyzeCalls('example.ts',source);assert.equal(parsed.ok,true);
  const calls=parsed.file.structure.flow.values.filter(value=>value.kind==='call'&&!value.dead);
  const results=calls.map(call=>({call,result:forbiddenCallRecipeResult('example.ts',source,parsed.file,{id:call.id,start:call.start,end:call.end},{target:{globals:['process.exit']}})}));
  const reports=results.filter(({result})=>result.status==='known'&&result.value==='report');
  assert.equal(reports.length,6,JSON.stringify(results,null,2));
  assert.ok(results.every(({result})=>result.status==='known'),JSON.stringify(results,null,2));
  assert.equal(results.filter(({result})=>result.value==='clear').length,2);
});

test('forbidden-call recipe narrows a mutable callable that can become the forbidden target',()=>{
  const source='let stop=console.log; stop=process.exit; stop(1); process.exit(2);';
  const parsed=analyzeCalls('example.ts',source);assert.equal(parsed.ok,true);
  const calls=parsed.file.structure.flow.values.filter(value=>value.kind==='call'&&!value.dead);
  const results=calls.map(call=>forbiddenCallRecipeResult('example.ts',source,parsed.file,{id:call.id,start:call.start,end:call.end},{target:{globals:['process.exit']}}));
  assert.deepEqual(results.map(result=>result.status==='known'?result.value:result.reason),['unresolved-identity','report']);
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
  assert.match(run.stdout,/challenge profile: forbidden-call/);
});

test('declared recipe profiles are named in JSON including unavailable paths',()=>{
  const repo=fileURLToPath(new URL('../',import.meta.url));
  const run=spawnSync(process.execPath,[`${repo}bin/cli.js`,'verify',`${repo}fixtures/doctor-sdk-reference.mjs`,'--format','json'],{cwd:repo,encoding:'utf8',timeout:30000});
  assert.equal(run.status,0,run.stdout+run.stderr);const result=JSON.parse(run.stdout),profiles=result.results.filter(item=>item.name.startsWith('challenge profile:'));
  assert.equal(profiles.length,29);assert.equal(profiles.filter(item=>!item.ok).length,0);assert.equal(profiles.filter(item=>item.skipped).length,0);assert.equal(profiles.filter(item=>item.name.endsWith('/ analysis unavailable')&&item.ok).length,4);
});

test('valid import and global identity recipe declarations always receive profiles',()=>{
  const base={claim:'x',lookalikes:['x'],reportingUnit:'occurrence',onUnknown:'skip'};
  const option={...base,id:'import-option',recipe:{name:'required-or-recommended-option',query:{call:{imports:[{source:'client',names:['request']}]},option:{option:'signal',sources:['RequestInit']}}}};
  const resource={...base,id:'mixed-resource',recipe:{name:'resource-without-release',query:{acquisition:{imports:[{source:'timers',names:['start']}]},owner:{identity:{globals:['register']},argument:0},release:['stop']}}};
  const forbidden={...base,id:'forbidden-call',recipe:{name:'forbidden-call',query:{target:{globals:['process.exit']},scope:{under:['src'],extensions:['.tsx'],exclude:['src/recipe-profile.tsx']}}}};
  assert.ok(challengeProfileFixtures(option).length>0);
  assert.ok(challengeProfileFixtures(resource).length>0);
  const forbiddenProfiles=challengeProfileFixtures(forbidden);
  assert.ok(forbiddenProfiles.some(item=>item.name==='equivalent syntax variants'));
  assert.ok(forbiddenProfiles.every(item=>Object.keys(item.seed)[0]==='src/recipe-profile-2.tsx'));
  assert.throws(()=>challengeProfileFixtures({...base,id:'unsupported',recipe:{name:'required-or-recommended-option',query:{call:{},option:{option:'signal',sources:['RequestInit']}}}}),/cannot generate a challenge target/);
});

test('unknown recipe analysis narrows JSON and human reports without suppressing an unrelated positive',()=>{
  const repo=(process.env.DOCTOR_CANDIDATE_ROOT??fileURLToPath(new URL('../',import.meta.url))).replace(/\/?$/, '/'),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'doctor-sdk-unknown-'));
  try{
    fs.writeFileSync(path.join(tmp,'example.ts'),'const options = {}; configure(options); fetch("/api/data", options);');
    const exactRun=spawnSync(process.execPath,[`${repo}bin/cli.js`,'run',`${repo}doctors/async.mjs`,tmp,'--format','json'],{cwd:repo,encoding:'utf8',timeout:30000});
    assert.equal(exactRun.status,0,exactRun.stdout+exactRun.stderr);const exact=JSON.parse(exactRun.stdout);
    assert.equal(exact.counts.total,0);assert.equal(exact.score.score,null);assert.equal(exact.groups[0].semantic.incomplete,true);
    fs.writeFileSync(path.join(tmp,'example.ts'),'const options = {}; configure(options); fetch("/unknown", options); fetch("/positive", {});');
    const jsonRun=spawnSync(process.execPath,[`${repo}bin/cli.js`,'run',`${repo}doctors/async.mjs`,tmp,'--format','json'],{cwd:repo,encoding:'utf8',timeout:30000});
    assert.equal(jsonRun.status,0,jsonRun.stdout+jsonRun.stderr);const json=JSON.parse(jsonRun.stdout),semantic=json.groups[0].semantic;
    assert.equal(json.counts.total,1,'the unrelated known absence remains a finding');
    assert.equal(json.score.score,null);assert.equal(json.score.grade,null);assert.equal(json.score.narrowedScan,true);
    assert.equal(semantic.incomplete,true);assert.equal(semantic.protocolVersion,1);assert.equal(semantic.provider.id,'any-doctor/syntax-flow');
    assert.ok(semantic.provider.dependencies.some(item=>item.id==='oxc-parser'&&item.version!=='unavailable'));
    const narrowed=semantic.narrowed.find(item=>item.check==='fetch-calls-without-abortsignal'&&item.reason==='unsupported-expression');assert.ok(narrowed);assert.equal(narrowed.occurrences,1);assert.deepEqual(narrowed.files,[{file:'example.ts',occurrences:1}]);
    assert.ok(semantic.capabilities.some(item=>item.name==='option-presence'&&item.available));assert.ok(semantic.recipes.some(item=>item.name==='required-or-recommended-option'&&item.available));
    assert.ok(semantic.execution.semanticQueries>semantic.execution.modelRequests,'semantic occurrence questions reuse file models');
    const human=spawnSync(process.execPath,[`${repo}bin/cli.js`,'run',`${repo}doctors/async.mjs`,tmp],{cwd:repo,encoding:'utf8',timeout:30000});
    assert.equal(human.status,0,human.stdout+human.stderr);assert.match(human.stdout,/Score: n\/a — narrowed semantic scan/);assert.match(human.stdout,/async\/fetch-calls-without-abortsignal — unsupported-expression/);assert.doesNotMatch(human.stdout,/Excellent/);
  }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});

test('recipe profiles reject identity, unknown-as-absence and suppression mutations',()=>{
  const repo=fileURLToPath(new URL('../',import.meta.url)),parent=fs.mkdtempSync(path.join(os.tmpdir(),'doctor-sdk-mutations-')),output=path.join(parent,'results');
  try{const run=spawnSync(process.execPath,[`${repo}dev/doctor-sdk/run-profile-mutations.mjs`,output],{cwd:repo,encoding:'utf8',timeout:30000});assert.equal(run.status,0,run.stdout+run.stderr);const result=JSON.parse(fs.readFileSync(path.join(output,'mutation-results.json'),'utf8'));assert.deepEqual(result.mutations.map(item=>item.mutation),['broken-identity','unknown-as-absent','suppressed-reporting']);assert.ok(result.mutations.every(item=>item.exit!==0&&item.failedProfiles.length));}
  finally{fs.rmSync(parent,{recursive:true,force:true});}
});

test('package contents retain public docs and exclude internal evidence',()=>{
  const repo=fileURLToPath(new URL('../',import.meta.url));
  const run=spawnSync('npm',['pack','--dry-run','--json','--ignore-scripts'],{cwd:repo,encoding:'utf8',timeout:30000});
  assert.equal(run.status,0,run.stdout+run.stderr);const files=JSON.parse(run.stdout)[0].files.map(item=>item.path);
  assert.ok(files.includes('docs/doctor-sdk.md'));
  assert.ok(!files.some(file=>file.startsWith('docs/evidence/')));
  assert.ok(!files.some(file=>file.startsWith('docs/plans/')));
});
