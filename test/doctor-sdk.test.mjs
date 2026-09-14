import assert from 'node:assert/strict';
import test from 'node:test';
import {analyzeCalls} from '../bin/analysis.js';
import {identityResult,valueDispositionResult} from '../bin/doctor-sdk.js';

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
