import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {cases} from './cases.mjs';
const base=fs.realpathSync(process.argv[2]??process.cwd()), output=path.resolve(process.argv[3]);
if(fs.existsSync(output))throw Error('Use a fresh output directory');fs.mkdirSync(output,{recursive:true});
const root=path.join(output,'seeds');fs.mkdirSync(root);
for(const c of cases){const p=path.join(root,c.name,c.file??'example.ts');fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,c.source);}
fs.writeFileSync(path.join(output,'expectations.json'),JSON.stringify(cases,null,2));
const command=[path.join(base,'bin/cli.js'),'run',path.join(base,'doctors/async.mjs'),root,'--format','json'];
const run=spawnSync(process.execPath,command,{cwd:base,encoding:'utf8',maxBuffer:30e6});
fs.writeFileSync(path.join(output,'scan.json'),run.stdout??'');fs.writeFileSync(path.join(output,'scan.stderr'),run.stderr??'');
if(run.status!==0)throw Error(`scan failed: ${run.stderr}`);
const data=JSON.parse(run.stdout),findings=data.groups.flatMap(g=>g.checks.flatMap(k=>k.findings.map(f=>({...f,rule:k.rule,severity:f.severity??k.severity}))));
const rows=cases.map(c=>{const all=findings.filter(f=>f.file===`${c.name}/${c.file??'example.ts'}`),actual=all.filter(f=>f.rule===c.rule);const passed=data.analysisAvailable===true&&!data.crashed.length&&actual.length===c.expected&&(!c.severity||actual.every(f=>f.severity===c.severity))&&(!c.messageIncludes||actual.every(f=>f.message?.includes(c.messageIncludes)))&&(!c.distinctColumns||new Set(actual.map(f=>`${f.line}:${f.column}`)).size===c.expected);return {name:c.name,rule:c.rule,expected:c.expected,passed,actual,allFindings:all};});
const result={base,command:[process.execPath,...command],exit:run.status,passed:rows.filter(r=>r.passed).length,failed:rows.filter(r=>!r.passed).length,skipped:0,rows};
fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({passed:result.passed,failed:result.failed,skipped:0,failures:rows.filter(r=>!r.passed).map(r=>r.name)}));process.exitCode=result.failed?1:0;
