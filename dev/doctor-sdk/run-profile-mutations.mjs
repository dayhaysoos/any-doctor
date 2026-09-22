import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const repo=fs.realpathSync(process.cwd()),output=path.resolve(process.argv[2]??'');
if(!process.argv[2]||fs.existsSync(output))throw Error('usage: node dev/doctor-sdk/run-profile-mutations.mjs <fresh-output-dir>');
fs.mkdirSync(output,{recursive:true});
const mutations=[
  {id:'broken-identity',file:'bin/recipes/required-option.js',from:'const candidate = runtime.identityCandidate(prepared, callee, query.call);\n        if (candidate === "clear")\n            return runtime.known("clear", []);',to:'const candidate = runtime.identityCandidate(prepared, callee, query.call);\n        if (candidate === "clear")\n            return runtime.known("report", []);',expect:'shadowed call identity'},
  {id:'unknown-as-absent',file:'bin/doctor-sdk.js',from:'return result === "unknown" || result === "ignored" || result === "missing" ? unknown("unsupported-expression", evidence) : { version: SEMANTIC_RESULT_VERSION, status: "known", value: result, evidence };',to:'return result === "ignored" || result === "missing" ? unknown("unsupported-expression", evidence) : { version: SEMANTIC_RESULT_VERSION, status: "known", value: result === "unknown" ? "absent" : result, evidence };',expect:'unknown options with positive neighbor'},
  {id:'suppressed-reporting',file:'bin/sdk.js',from:"if (result.status === 'known' && result.value === 'report' || result.status === 'unknown'",to:"if (false && result.status === 'known' && result.value === 'report' || result.status === 'unknown'",expect:'genuine absence positive'},
];
// Fresh consumers hoist dependencies beside any-doctor, while source installs
// keep them under the repository. Reproduce the candidate's dependency root.
let dependencyOwner=repo;
while(!fs.existsSync(path.join(dependencyOwner,'node_modules/effect/package.json'))){
  const parent=path.dirname(dependencyOwner);
  if(parent===dependencyOwner)throw Error('candidate dependency root not found');
  dependencyOwner=parent;
}
const rows=[];
for(const mutation of mutations){
  const root=path.join(output,mutation.id);fs.mkdirSync(root);for(const entry of ['bin','doctors','fixtures'])fs.cpSync(path.join(repo,entry),path.join(root,entry),{recursive:true});fs.copyFileSync(path.join(repo,'package.json'),path.join(root,'package.json'));fs.symlinkSync(path.join(dependencyOwner,'node_modules'),path.join(root,'node_modules'),'dir');
  const target=path.join(root,mutation.file),before=fs.readFileSync(target,'utf8');if(!before.includes(mutation.from))throw Error(`${mutation.id}: mutation anchor missing`);const after=before.replace(mutation.from,mutation.to);fs.writeFileSync(target,after);
  const run=spawnSync(process.execPath,[path.join(root,'bin/cli.js'),'verify',path.join(root,'doctors/async.mjs'),'--format','json'],{cwd:root,encoding:'utf8',timeout:30000,maxBuffer:20e6});
  fs.writeFileSync(path.join(root,'verify.stdout'),run.stdout??'');fs.writeFileSync(path.join(root,'verify.stderr'),run.stderr??'');
  let result;try{result=JSON.parse(run.stdout);}catch{throw Error(`${mutation.id}: non-JSON verification: ${run.stdout}\n${run.stderr}`);}
  const failedProfiles=result.results.filter(item=>item.name.startsWith('challenge profile:')&&!item.ok).map(item=>item.name);
  if(run.status===0||!failedProfiles.some(name=>name.includes(mutation.expect)))throw Error(`${mutation.id}: intended profile did not fail: ${JSON.stringify(failedProfiles)}`);
  rows.push({mutation:mutation.id,exit:run.status,intendedProfile:mutation.expect,failedProfiles});
}
fs.writeFileSync(path.join(output,'mutation-results.json'),JSON.stringify({schemaVersion:1,mutations:rows},null,2));
console.log(JSON.stringify({mutations:rows.map(row=>({mutation:row.mutation,exit:row.exit,intendedProfile:row.intendedProfile,failedProfiles:row.failedProfiles.length}))},null,2));
