// Run from the repository with a fresh evidence directory containing unchanged
// Async challenges.py, degraded.py and degraded-identifiers.py audit runners.
import fs from 'node:fs';import path from 'node:path';import {spawnSync,execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
const repo=fs.realpathSync(process.cwd()),out=fs.realpathSync(process.argv[2]);
const sha=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex'),read=p=>JSON.parse(fs.readFileSync(p));
const relevant=()=>execFileSync('git',['ls-files','--cached','--others','--exclude-standard'],{encoding:'utf8'}).trim().split('\n').filter(f=>/^(src\/|bin\/|doctors\/|test\/|dev\/|fixtures\/|package(?:-lock)?\.json$|tsconfig\.json$|docs\/call-structure\.md$|docs-site\/src\/content\/docs\/doctors\/async\.mdx$)/.test(f)).sort();
const before=relevant().map(file=>({file,sha256:sha(path.join(repo,file))}));
fs.writeFileSync(path.join(out,'working-files-before.json'),JSON.stringify(before,null,2));
const runs=[];
function run(name,command,args,cwd=repo){const r=spawnSync(command,args,{cwd,encoding:'utf8',maxBuffer:70e6});fs.writeFileSync(path.join(out,name+'.stdout'),r.stdout??'');fs.writeFileSync(path.join(out,name+'.stderr'),r.stderr??'');runs.push({name,command:[command,...args],cwd,exit:r.status});fs.writeFileSync(path.join(out,'commands.json'),JSON.stringify(runs,null,2));if(r.status!==0)throw Error(name+' command failed; inspect evidence');console.log(name+' complete');}
// Existing accepted Convex and consumer verification remains unchanged. It also
// runs npm test, all bundled doctors, builds/packs and checks installed bytes.
const platform=path.join(out,'platform');fs.mkdirSync(platform);
const convexRunner='/private/tmp/any-doctor-convex-audit-cv9bg365/challenges.py';fs.copyFileSync(convexRunner,path.join(platform,'challenges.py'));
run('platform-gates',process.execPath,['dev/convex-analysis/verify-candidate.mjs',platform]);
const pack=read(path.join(platform,'candidate-package/verification.json')),installed=path.join(platform,'candidate-package/consumer/node_modules/any-doctor');
const counts={};
for(const [label,base] of [['repaired-local',repo],['packed',installed]]){
 run(label+'-independent','python3',[path.join(out,'challenges.py'),label,base],base);
 const challenges=read(path.join(out,label+'-challenges-results.json'));
 if(challenges.passed!==55||challenges.failed||challenges.locations.some(x=>!x.passed))throw Error('independent JSON failure');
 run(label+'-extra',process.execPath,[path.join(repo,'dev/async-analysis/run-cases.mjs'),base,path.join(out,label+'-extra')],base);
 const extra=read(path.join(out,label+'-extra/results.json'));if(extra.failed||extra.skipped)throw Error('extra JSON failure');
 const degraded={};
 for(const [flavor,script] of [['literal','degraded.py'],['named','degraded-identifiers.py']]){
  run(label+'-'+flavor,'python3',[path.join(out,script),label+'-'+flavor,base],base);
  const d=read(path.join(out,label+'-'+flavor+'-degraded-results.json'));
  const expected=['map-dropped-binding','map-nested-array-combiner','map-unrelated-scope-combiner'];
  if(d.authoredPassed!==3||JSON.stringify(d.failed.sort())!==JSON.stringify(expected))throw Error('unexpected reduced-analysis disagreement');
  degraded[flavor]={passed:d.authoredPassed,failed:d.authoredFailed,skipped:0,verifyExit:d.exit,failedNames:d.failed};
 }
 run(label+'-unavailable',process.execPath,[path.join(repo,'dev/async-analysis/check-unavailable.mjs'),base,path.join(out,label+'-unavailable')],base);
 const unavailable=read(path.join(out,label+'-unavailable/results.json'));if(unavailable.failed||unavailable.passed!==5)throw Error('unavailable reporting contract');
 run(label+'-sift',process.execPath,[path.join(base,'bin/cli.js'),'run',path.join(base,'doctors/async.mjs'),'/tmp/any-doctor-frozen-sift','--format','json'],base);
 counts[label]={independent:{passed:challenges.passed,failed:challenges.failed,skipped:0},locations:{passed:challenges.locations.filter(x=>x.passed).length,failed:0,skipped:0},extra:{passed:extra.passed,failed:extra.failed,skipped:0},degraded,unavailable:{passed:unavailable.passed,failed:0,skipped:0}};
}
const after=relevant().map(file=>({file,sha256:sha(path.join(repo,file))}));if(JSON.stringify(before)!==JSON.stringify(after))throw Error('concurrent candidate drift: do not accept this package');
const workingDigest=createHash('sha256').update(JSON.stringify(after)).digest('hex');fs.writeFileSync(path.join(out,'working-files.json'),JSON.stringify({repository:repo,workingDigest,files:after},null,2));
const result={branch:execFileSync('git',['branch','--show-current'],{encoding:'utf8'}).trim(),headContextOnly:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),node:process.version,npm:execFileSync('npm',['--version'],{encoding:'utf8'}).trim(),doctorSha256:sha(path.join(repo,'doctors/async.mjs')),artifact:pack.artifact,artifactSha256:sha(pack.artifact),workingDigest,counts,platformVerification:path.join(platform,'verification.json'),packageVerification:path.join(platform,'candidate-package/verification.json'),runs};fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
