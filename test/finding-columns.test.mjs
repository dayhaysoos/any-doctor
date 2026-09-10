import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareFindings } from '../bin/contract.js';
test('explicit columns distinguish same-line locations, legacy line fixtures still work', () => {
  const f = {rule:'r',file:'a.ts',line:1};
  assert.deepEqual(compareFindings([{...f,column:1}], [{...f,column:8}]), {missing:[{...f,column:1}],unexpected:[{...f,column:8}]});
  assert.deepEqual(compareFindings([f], [{...f,column:8}]), {missing:[],unexpected:[]});
  assert.deepEqual(compareFindings([f,{...f,column:8}], [{...f,column:8},{...f,column:2}]), {missing:[],unexpected:[]});
});
