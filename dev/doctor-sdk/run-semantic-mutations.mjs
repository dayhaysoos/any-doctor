// Mutate only temporary candidate copies. The finding projection stays intact
// in semantic controls, so a failed row must come from the semantic comparison.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const [candidateArg,outputArg]=process.argv.slice(2);
const candidate=fs.realpathSync(candidateArg),output=path.resolve(outputArg);
fs.mkdirSync(output,{recursive:true});
let owner=candidate;
while(!fs.existsSync(path.join(owner,'node_modules/effect/package.json'))){
 const parent=path.dirname(owner);assert.notEqual(parent,owner,'dependency root missing');owner=parent;
}
const controls=[
 {id:'lookalike-unknown',kind:'recipe-unhandled-value',condition:"result.status === 'known' && result.value === 'clear' && readSource(file).includes('const object=')",value:"{version:1,status:'unknown',reason:'unsupported-expression'}",profile:'valid lookalike',expected:'complete',actual:'narrowed'},
 {id:'receiver-complete',kind:'recipe-unhandled-value',condition:"result.status === 'unknown'",value:"{version:1,status:'known',value:'clear',evidence:[]}",profile:'unsupported receiver',expected:'narrowed',actual:'complete'},
 {id:'options-complete',kind:'recipe-required-option',condition:"result.status === 'unknown'",value:"{version:1,status:'known',value:'clear',evidence:[]}",profile:'unknown options',expected:'narrowed',actual:'complete'},
 {id:'resource-complete',kind:'recipe-resource-without-release',condition:"result.status === 'unknown'",value:"{version:1,status:'known',value:'clear',evidence:[]}",profile:'unsupported cleanup transfer',expected:'narrowed',actual:'complete',doctor:'fixtures/doctor-sdk-reference.mjs'},
 {id:'resource-known-report',kind:'recipe-resource-without-release',condition:"result.status === 'unknown'",value:"{version:1,status:'known',value:'report',evidence:[]}",profile:'unsupported cleanup transfer',expected:'narrowed',actual:'complete'},
 {id:'suppressed-findings',suppress:true,profile:'genuine absence positive'},
 {id:'missing-expectation',omit:true},
];
const rows=[];
for(const mutation of controls){
 const root=path.join(output,mutation.id);assert.ok(!fs.existsSync(root),'fresh mutation copy required');fs.mkdirSync(root);
 for(const entry of ['bin','doctors','fixtures'])fs.cpSync(path.join(candidate,entry),path.join(root,entry),{recursive:true});
 fs.copyFileSync(path.join(candidate,'package.json'),path.join(root,'package.json'));fs.symlinkSync(path.join(owner,'node_modules'),path.join(root,'node_modules'),'dir');
 const file=path.join(root,mutation.omit?'bin/certify.js':'bin/sdk.js');let text=fs.readFileSync(file,'utf8');
 let from,to;
 if(mutation.omit){from='if (!fixtures.length)';to='fixtures[0].expectedSemantic = undefined;\n    '+from;}
 else if(mutation.suppress){from="if (result.status === 'known' && result.value === 'report' || result.status === 'unknown'";to="if (false && result.status === 'known' && result.value === 'report' || result.status === 'unknown'";}
 else {from='return recordUnknown(result, file, context);';to=`if (kind === ${JSON.stringify(mutation.kind)} && (${mutation.condition})) result = ${mutation.value};\n        ${from}`;}
 assert.equal(text.split(from).length,2,`${mutation.id}: unique mutation anchor`);fs.writeFileSync(file,text.replace(from,to));
 const command=[path.join(root,'bin/cli.js'),'verify',path.join(root,mutation.doctor??'doctors/async.mjs'),'--format','json'];
 const run=spawnSync(process.execPath,command,{encoding:'utf8',maxBuffer:20e6});
 fs.writeFileSync(path.join(root,'verify.stdout'),run.stdout??'');fs.writeFileSync(path.join(root,'verify.stderr'),run.stderr??'');
 let passed=false,observed;
 if(mutation.omit){observed=run.stdout+run.stderr;passed=run.status!==0&&/semantic expectation.*required|requires.*semantic expectation/i.test(observed);}
 else {
  const json=JSON.parse(run.stdout);observed=json.results.find(r=>r.name.startsWith('challenge profile:')&&r.name.includes(mutation.profile));
  passed=run.status===1&&observed?.ok===false;
  if(mutation.suppress)passed&&=observed.missing.length>0;
  else passed&&=observed.missing.length===0&&observed.unexpected.length===0&&observed.semantic?.expected===mutation.expected&&observed.semantic?.actual===mutation.actual&&/semantic coverage/.test(observed.error);
 }
 rows.push({mutation:mutation.id,exit:run.status,passed,observed});
 // Raw logs remain; copies of broken runtime are disposable.
 for(const entry of ['bin','doctors','fixtures','node_modules'])fs.rmSync(path.join(root,entry),{recursive:true,force:true});
}
const result={passed:rows.filter(r=>r.passed).length,failed:rows.filter(r=>!r.passed).length,skipped:0,rows};
fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
assert.equal(result.failed,0,'all mutation controls must reject their intended defect');
