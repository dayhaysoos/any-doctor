// Run from the repository. The evidence directory already contains an unchanged audit runner.
import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';import {spawnSync,execFileSync} from 'node:child_process';
const repo=fs.realpathSync(process.cwd()),out=fs.realpathSync(process.argv[2]);
if(fs.existsSync(path.join(out,'candidate-package')))throw Error('Final candidate output already exists');
const runs=[],sha=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
function run(name,command,args,cwd=repo){
 const r=spawnSync(command,args,{cwd,encoding:'utf8',maxBuffer:60e6});
 fs.writeFileSync(path.join(out,name+'.stdout'),r.stdout??'');fs.writeFileSync(path.join(out,name+'.stderr'),r.stderr??'');
 runs.push({name,command:[command,...args],cwd,status:r.status});fs.writeFileSync(path.join(out,'final-commands.json'),JSON.stringify(runs,null,2));
 if(r.status!==0)throw Error(name+' failed; inspect retained logs');console.log(name+' completed');
}
function read(p){return JSON.parse(fs.readFileSync(p));}
function counts(p,expected){const d=read(p);if(JSON.stringify([d.passed,d.failed,d.skipped])!==JSON.stringify(expected))throw Error('JSON count gate: '+p);return {passed:d.passed,failed:d.failed,skipped:d.skipped};}
run('final-tests','npm',['test']);
run('local-bundled',process.execPath,['bin/cli.js','verify','--all']);
run('local-challenges','python3',[path.join(out,'challenges.py'),'repaired-local',repo]);
const localChallenges=counts(path.join(out,'repaired-local-challenges-results.json'),[62,0,0]);
run('local-extra',process.execPath,['dev/convex-analysis/run-cases.mjs',repo,path.join(out,'local-extra')]);
const localExtra=read(path.join(out,'local-extra/results.json'));if(localExtra.failed||localExtra.skipped)throw Error('local extra JSON failures');
run('local-convex-sift',process.execPath,['bin/cli.js','run',path.join(repo,'doctors/convex.mjs'),'/tmp/any-doctor-frozen-sift','--format','json']);
run('local-consumer-labeled',process.execPath,['dev/consumer-analysis/run-cases.mjs',path.join(repo,'bin/cli.js'),path.join(out,'local-consumer-labeled.json')]);
run('local-consumer-scopes',process.execPath,['dev/consumer-analysis/check-loader-scopes.mjs',path.join(repo,'bin/project-consumers.js'),path.join(out,'local-consumer-scopes.json')]);
run('local-consumer-original','python3',['dev/consumer-analysis/independent-challenges.py','local',path.join(out,'local-consumer-original')]);
run('local-consumer-repair','python3',['dev/consumer-analysis/independent-repair-challenges.py','local',path.join(repo,'bin/cli.js'),path.join(out,'local-consumer-repair')]);
run('local-consumer-combination','python3',['dev/consumer-analysis/independent-combination-challenges.py','local',path.join(repo,'bin/cli.js'),path.join(out,'local-consumer-combination')]);
run('local-slop-sift',process.execPath,['bin/cli.js','run',path.join(repo,'doctors/slop.mjs'),'/tmp/any-doctor-frozen-sift','--format','json']);
run('package-consumer-gates',process.execPath,['dev/consumer-analysis/pack-working-candidate.mjs',path.join(out,'candidate-package')]);
const pack=read(path.join(out,'candidate-package/verification.json'));
const consumer=path.join(out,'candidate-package/consumer'),installed=path.join(consumer,'node_modules/any-doctor');
run('packed-challenges','python3',[path.join(out,'challenges.py'),'packed',installed],consumer);
const packedChallenges=counts(path.join(out,'packed-challenges-results.json'),[62,0,0]);
run('packed-extra',process.execPath,[path.join(repo,'dev/convex-analysis/run-cases.mjs'),installed,path.join(out,'packed-extra')],consumer);
const packedExtra=counts(path.join(out,'packed-extra/results.json'),[localExtra.passed,0,0]);
run('packed-convex-sift',process.execPath,[path.join(installed,'bin/cli.js'),'run',path.join(installed,'doctors/convex.mjs'),'/tmp/any-doctor-frozen-sift','--format','json'],consumer);
// Include new Convex verification scripts and authored contracts as well as package runtime inputs.
const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard'],{encoding:'utf8'}).trim().split('\n').filter(f=>/^(src\/|bin\/|doctors\/|test\/|dev\/|package(?:-lock)?\.json$|tsconfig\.json$|docs\/call-structure\.md$|docs-site\/src\/content\/docs\/doctors\/convex\.mdx$|docs\/doctor-reliability\.md$)/.test(f)).sort();
const manifest=files.map(file=>({file,sha256:sha(path.join(repo,file))}));const workingDigest=createHash('sha256').update(JSON.stringify(manifest)).digest('hex');
fs.writeFileSync(path.join(out,'working-files.json'),JSON.stringify({repository:repo,headContextOnly:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),workingDigest,files:manifest},null,2));
const report={artifact:pack.artifact,artifactSha256:sha(pack.artifact),workingDigest,manifestEntries:manifest.length,localChallenges,packedChallenges,localExtra:{passed:localExtra.passed,failed:localExtra.failed,skipped:localExtra.skipped},packedExtra,packVerification:path.join(out,'candidate-package/verification.json'),runs};
fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
