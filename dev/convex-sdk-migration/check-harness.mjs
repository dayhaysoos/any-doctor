// Oracle controls only: these do not certify or mutate production semantics.
import assert from 'node:assert/strict';
import {assessCase} from './assess-case.mjs';
const c={name:'a',expected:1,narrowed:true,reason:'unresolved-identity',expectedLocations:[{line:2,column:4}]};
const findings=[{line:2,column:4}];
const narrowed=[{reason:c.reason,occurrences:2,files:[{file:'a.ts',occurrences:1},{file:'b.ts',occurrences:1}]}];
assert.equal(assessCase(c,findings,narrowed).passed,true);
assert.equal(assessCase(c,[],narrowed).passed,false);
assert.equal(assessCase(c,findings,[]).passed,false);
assert.equal(assessCase(c,[{line:2,column:5}],narrowed).passed,false);
assert.equal(assessCase(c,findings,[{...narrowed[0],reason:'unsupported-expression'}]).passed,false);
assert.equal(assessCase(c,findings,[{...narrowed[0],occurrences:1}]).passed,false);
console.log(JSON.stringify({passed:6,failed:0,kind:'oracle self-test; not production mutation certification'}));
