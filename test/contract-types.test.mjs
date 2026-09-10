import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

test('a typed doctor can declare check claims; fixtures cannot own those claims', () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'doctor-contract-types-'));
  try {
    const file=path.join(dir,'consumer.mts');
    const contract=fileURLToPath(new URL('../bin/contract.js',import.meta.url));
    fs.writeFileSync(file,`import type {CheckMeta, Fixture} from ${JSON.stringify(contract)};
const check: CheckMeta = {id:'x',description:'x',claim:'discarded call',lookalikes:['returned call'],needs:['calls'],onUnknown:'skip',reportingUnit:'occurrence'};
const fixture: Fixture = {name:'x',seed:{},expected:[]};
// @ts-expect-error claims belong to checks
fixture.claim = 'wrong owner';
// @ts-expect-error reporting units have a closed vocabulary
check.reportingUnit = 'whatever';
`);
    const program=ts.createProgram([file],{noEmit:true,strict:true,module:ts.ModuleKind.NodeNext,moduleResolution:ts.ModuleResolutionKind.NodeNext,target:ts.ScriptTarget.ES2022,skipLibCheck:true});
    const diagnostics=ts.getPreEmitDiagnostics(program);
    assert.equal(diagnostics.length,0,diagnostics.map(d=>ts.flattenDiagnosticMessageText(d.messageText,'\n')).join('\n'));
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
