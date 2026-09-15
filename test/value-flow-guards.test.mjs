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
