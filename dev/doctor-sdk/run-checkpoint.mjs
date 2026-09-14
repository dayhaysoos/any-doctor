import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync,spawnSync} from 'node:child_process';

const repo=fs.realpathSync(process.cwd());
const out=path.resolve(process.argv[2]??'');
const checkpoint=Number(process.argv[3]);
if(!out||!Number.isInteger(checkpoint))throw Error('usage: node dev/doctor-sdk/run-checkpoint.mjs <fresh-output-dir> <checkpoint>');
if(fs.existsSync(out))throw Error('output directory must be fresh');
fs.mkdirSync(out,{recursive:true});
const baseline=path.join(repo,'docs/evidence/doctor-sdk-foundations/5a1aed2/00-baseline');
const inputs=path.join(out,'inputs');fs.mkdirSync(inputs);
for(const file of ['challenges.py','degraded.py','degraded-identifiers.py'])fs.copyFileSync(path.join(baseline,'original',file),path.join(inputs,file));
fs.copyFileSync(path.join(baseline,'fresh/fresh.py'),path.join(inputs,'fresh.py'));

const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const candidateFiles=()=>execFileSync('git',['ls-files','--cached','--others','--exclude-standard'],{cwd:repo,encoding:'utf8'}).trim().split('\n').filter(file=>file&&/^(src\/|bin\/|doctors\/|test\/|dev\/|fixtures\/|package(?:-lock)?\.json$|tsconfig\.json$)/.test(file)).sort().map(file=>({file,bytes:fs.statSync(path.join(repo,file)).size,sha256:sha(path.join(repo,file))}));
const before=candidateFiles();
const commands=[];
function run(name,command,args,cwd=repo,{allowFailure=false}={}){
  const started=Date.now(),result=spawnSync(command,args,{cwd,encoding:'utf8',maxBuffer:80e6});
  fs.writeFileSync(path.join(out,`${name}.stdout`),result.stdout??'');fs.writeFileSync(path.join(out,`${name}.stderr`),result.stderr??'');
  commands.push({name,command:[command,...args],cwd:cwd===repo?'<repo>':'<checkpoint-temp>',exit:result.status,durationMs:Date.now()-started});
  fs.writeFileSync(path.join(out,'commands.json'),JSON.stringify(commands,null,2));
  if(result.status!==0&&!allowFailure)throw Error(`${name} failed; inspect ${out}`);
  return result;
}
run('npm-test','npm',['test']);
run('local-verify-all',process.execPath,['bin/cli.js','verify','--all']);
run('local-original','python3',[path.join(inputs,'challenges.py'),'local',repo]);
run('local-fresh','python3',[path.join(inputs,'fresh.py'),'local',repo]);
run('local-unavailable',process.execPath,['dev/async-analysis/check-unavailable.mjs',repo,path.join(out,'local-unavailable')]);
run('local-sift',process.execPath,['bin/cli.js','run','doctors/async.mjs','/tmp/any-doctor-frozen-sift','--format','json']);

const packageDir=path.join(out,'package');fs.mkdirSync(packageDir);
const packed=run('pack','npm',['pack','--ignore-scripts','--pack-destination',packageDir,'--json']);
const artifact=path.join(packageDir,JSON.parse(packed.stdout)[0].filename);
const consumer=path.join(out,'consumer');fs.mkdirSync(consumer);fs.writeFileSync(path.join(consumer,'package.json'),'\n{"name":"doctor-sdk-checkpoint-consumer","private":true}\n');
run('install','npm',['install','--ignore-scripts','--no-audit','--no-fund',fs.realpathSync(artifact)],consumer);
const installed=path.join(consumer,'node_modules/any-doctor');
run('packed-verify-all',process.execPath,[path.join(installed,'bin/cli.js'),'verify','--all'],installed);
run('packed-original','python3',[path.join(inputs,'challenges.py'),'packed',installed],installed);
run('packed-fresh','python3',[path.join(inputs,'fresh.py'),'packed',installed],installed);
run('packed-unavailable',process.execPath,[path.join(repo,'dev/async-analysis/check-unavailable.mjs'),installed,path.join(out,'packed-unavailable')],installed);
run('packed-sift',process.execPath,[path.join(installed,'bin/cli.js'),'run',path.join(installed,'doctors/async.mjs'),'/tmp/any-doctor-frozen-sift','--format','json'],installed);

const manifest=JSON.parse(fs.readFileSync(path.join(repo,'docs/evidence/consumer-analysis/sift-manifest.json')));
const changed=[],missing=[];
for(const item of manifest.files){const file=path.join('/tmp/any-doctor-frozen-sift',item.file);if(!fs.existsSync(file)){missing.push(item.file);continue}const bytes=fs.readFileSync(file);if(bytes.length!==item.bytes||crypto.createHash('sha256').update(bytes).digest('hex')!==item.sha256)changed.push(item.file);}
const frozen={expectedFiles:manifest.files.length,matched:manifest.files.length-missing.length-changed.length,missing,changed,manifestDigest:manifest.manifestDigest,passed:!missing.length&&!changed.length};
fs.writeFileSync(path.join(out,'frozen-integrity.json'),JSON.stringify(frozen,null,2));if(!frozen.passed)throw Error('frozen Sift drift');
const after=candidateFiles();if(JSON.stringify(before)!==JSON.stringify(after))throw Error('candidate files drifted during gate');
const read=file=>JSON.parse(fs.readFileSync(file));
const counts=text=>({passed:(text.match(/  ✔ /g)||[]).length,failed:(text.match(/  ✘ /g)||[]).length,skipped:(text.match(/  – /g)||[]).length});
const testCounts=text=>({passed:Number(text.match(/ℹ pass (\d+)/)?.[1]??0),failed:Number(text.match(/ℹ fail (\d+)/)?.[1]??0),skipped:Number(text.match(/ℹ skipped (\d+)/)?.[1]??0)});
const side=label=>{const original=read(path.join(inputs,`${label}-challenges-results.json`)),fresh=read(path.join(inputs,`${label}-fresh-results.json`)),unavailable=read(path.join(out,`${label}-unavailable/results.json`)),sift=read(path.join(out,`${label}-sift.stdout`));return {allDoctors:counts(fs.readFileSync(path.join(out,`${label}-verify-all.stdout`),'utf8')),original:{passed:original.passed,failed:original.failed,skipped:0},locations:{passed:original.locations.filter(x=>x.passed).length,failed:original.locations.filter(x=>!x.passed).length,skipped:0},fresh:{passed:fresh.passed,failed:fresh.failed,skipped:fresh.skipped,failures:fresh.rows.filter(x=>!x.passed).map(x=>x.name)},unavailable:{passed:unavailable.passed,failed:unavailable.failed,skipped:unavailable.skipped},sift:{analysisAvailable:sift.analysisAvailable,files:sift.fileCount,findings:sift.counts.total,counts:sift.counts}}};
const summary={schemaVersion:1,checkpoint,branch:execFileSync('git',['branch','--show-current'],{cwd:repo,encoding:'utf8'}).trim(),head:execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim(),node:process.version,npm:execFileSync('npm',['--version'],{encoding:'utf8'}).trim(),candidateDigest:crypto.createHash('sha256').update(JSON.stringify(after)).digest('hex'),candidateFiles:after,doctorSha256:sha(path.join(repo,'doctors/async.mjs')),tarball:{filename:path.basename(artifact),bytes:fs.statSync(artifact).size,sha256:sha(artifact)},counts:{npmTest:testCounts(fs.readFileSync(path.join(out,'npm-test.stdout'),'utf8')),local:side('local'),packed:side('packed')},frozen,commands};
fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify(summary,null,2));
for(const label of ['local','packed']){const side=summary.counts[label];if(side.original.passed!==55||side.original.failed||side.locations.passed!==2||side.locations.failed||side.allDoctors.failed||side.unavailable.passed!==5||side.unavailable.failed)throw Error(`${label} JSON gate failed`);}
if(summary.counts.npmTest.failed)throw Error('npm test JSON gate failed');
console.log(JSON.stringify({checkpoint,head:summary.head,candidateDigest:summary.candidateDigest,doctorSha256:summary.doctorSha256,tarball:summary.tarball,counts:summary.counts,frozen},null,2));
