import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeCalls} from '../bin/analysis.js';
test('guards retain lexical branch predicates and exclude late, unrelated and cross-function checks',()=>{
 const source=`for(const line of lines){if(line.startsWith(':'))continue;JSON.parse(line);function inner(){JSON.parse(line)}if(line.startsWith('data:')){JSON.parse(line)}JSON.parse(line);if(other)continue;}`;
 const result=analyzeCalls('entry.ts',source);assert.equal(result.ok,true);
 const flow=JSON.parse(JSON.stringify(result.file.structure.flow));
 const parses=flow.values.filter(v=>v.kind==='call'&&v.target?.root==='JSON');
 assert.deepEqual(parses.map(v=>(v.guards??[]).map(g=>g.truthy)),[[false],[],[true,false],[false]]);
 for(const v of parses)for(const guard of v.guards??[])assert.equal(flow.values[guard.test].member,'startsWith');
});
test('boolean operator facts remain serializable without pretending to evaluate arbitrary predicates',()=>{
 const result=analyzeCalls('entry.ts',`if(!event.error || event.choices[0].finish_reason === 'error'){consume(event)}`);
 assert.equal(result.ok,true);const flow=JSON.parse(JSON.stringify(result.file.structure.flow));
 const call=flow.values.find(v=>v.kind==='call'&&v.target.root==='consume');
 const test=flow.values[call.guards[0].test];assert.equal(test.operation.operator,'||');
 assert.deepEqual(test.operation.operands.map(id=>flow.values[id].operation.operator),['!','===']);
});
test('array destructuring retains lexical slot paths including holes',()=>{
 const result=analyzeCalls('entry.ts','const [, {delta: payload}]=choices; use(payload.content)');assert.equal(result.ok,true);
 const binding=result.file.structure.bindings.find(b=>b.path?.join('.')==='1.delta');assert.ok(binding);
 const use=result.file.calls.find(c=>c.target.root==='use');assert.ok(use);
 assert.equal(result.file.structure.flow.values.find(v=>v.kind==='member'&&v.member==='content').target.binding,binding.binding);
});
test('for-of projection retains nested destructured element bindings',()=>{
 const result=analyzeCalls('entry.ts','for await(const {choices:[{delta}]} of stream){use(delta.content)}');assert.equal(result.ok,true);
 const flow=JSON.parse(JSON.stringify(result.file.structure.flow));
 assert.equal(flow.loops[0].binding,null);assert.deepEqual(flow.loops[0].bindings.map(b=>b.path),[['choices','0','delta']]);
 assert.equal(flow.values.find(v=>v.member==='content').target.binding,flow.loops[0].bindings[0].binding);
});
