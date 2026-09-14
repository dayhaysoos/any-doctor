import {test} from 'node:test';
import assert from 'node:assert/strict';
import {analyzeCalls} from '../bin/analysis.js';
function flow(source){const r=analyzeCalls('sample.ts',source);assert.equal(r.ok,true);assert.ok(r.file.structure.flow);return r.file.structure.flow;}
test('value flow distinguishes nested expressions sharing a source start',()=>{
 const f=flow('[1].filter(Boolean).map(async x=>x);');
 const calls=f.values.filter(v=>v.kind==='call');const map=calls.find(v=>v.target.members.at(-1)==='map');
 const filter=f.values.find(v=>v.id===map.receiver);const array=f.values.find(v=>v.id===filter.receiver);
 assert.equal(filter.kind,'call');assert.equal(array.kind,'array');assert.equal(map.start,filter.start);assert.notEqual(map.id,filter.id);
});
test('value flow preserves ordered properties, constructors and array spread roles',()=>{
 const f=flow('const a=new Request("/",{signal:null,...opts});Promise.all([a,...tasks]);');
 assert.equal(f.values.find(v=>v.kind==='construct').target.root,'Request');
 assert.deepEqual(f.values.find(v=>v.kind==='object').properties.map(p=>[p.name,p.spread]),[['signal',false],[null,true]]);
 assert.deepEqual(f.values.find(v=>v.kind==='array').elements.map(p=>p.spread),[false,true]);
 assert.equal(f.values.find(v=>v.kind==='literal'&&v.literal===null).literal,null);
});
test('value flow records exact returned/awaited values and loop bindings',()=>{
 const f=flow('async function run(xs:string[]){const tasks=xs.map(async x=>x);for(const task of tasks){await {task};}return tasks;}');
 const loop=f.loops[0];assert.equal(loop.await,false);assert.ok(Number.isInteger(loop.binding));
 const awaitUse=f.uses.find(u=>u.kind==='await');assert.equal(f.values.find(v=>v.id===awaitUse.value).kind,'object');
 assert.ok(f.uses.some(u=>u.kind==='return'));assert.ok(f.bindings.some(b=>b.array));
});
test('value flow excludes literal dead calls and separates nested function ownership',()=>{
 const f=flow('function f(){if(false)clearTimeout(x);const unused=()=>clearTimeout(x);setTimeout(()=>{},1);}');
 const calls=f.values.filter(v=>v.kind==='call');assert.equal(calls.filter(v=>v.dead).length,1);
 assert.notEqual(calls[1].functionStart,calls[2].functionStart);
});
test('value flow is JSON-safe for bigint and regular expression literals',()=>{
 const f=flow('const a=1n;const b=/x/;consume(a,b);');assert.doesNotThrow(()=>JSON.stringify(f));
 assert.equal(f.values.filter(v=>v.kind==='literal').length,0);
});
test('value flow retains declared strings and obvious string concatenations',()=>{
 const f=flow('function f(url:string){fetch(url);fetch("/"+id)}');
 assert.ok(f.bindings.some(b=>b.primitive==='string'));assert.ok(f.values.some(v=>v.primitive==='string'));
});
