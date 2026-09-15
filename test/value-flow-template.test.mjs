import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeCalls} from '../bin/analysis.js';
test('template projection retains cooked segments and lexical expression identities without evaluating them',()=>{
 const source="const name='host'; const url=`https://${name}/${getPath()}`; fetch(url);";
 const result=analyzeCalls('entry.ts',source);assert.equal(result.ok,true);
 const flow=JSON.parse(JSON.stringify(result.file.structure.flow));
 const template=flow.values.find(v=>v.template);
 assert.equal(template.kind,'unknown');assert.equal(template.primitive,'string');
 assert.deepEqual(template.template.quasis,['https://','/','']);
 const expressions=template.template.expressions.map(id=>flow.values.find(v=>v.id===id));
 assert.equal(expressions[0].target.root,'name');assert.notEqual(expressions[0].target.binding,null);
 assert.equal(expressions[1].kind,'call');assert.equal(expressions[1].target.root,'getPath');
});
