import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
const candidate=fs.realpathSync(process.argv[2]??fileURLToPath(new URL('../../',import.meta.url)));
const {analyzeCalls}=await import(pathToFileURL(path.join(candidate,'bin/analysis.js')));
const root=fs.mkdtempSync(path.join(os.tmpdir(),'openrouter-scaling-')),results=[];
const url='https://openrouter.ai/api/v1/chat/completions';
try{for(const sites of [8,32,128]){
 const repeatedWrites=`let innocent=externalText;${'innocent=innocent.replace(pattern,replacement);'.repeat(sites)}innocent.match(pattern);\n`;
 const source=repeatedWrites+`import {OpenRouter} from '@openrouter/sdk';const client=new OpenRouter();\n`+Array.from({length:sites},(_,n)=>`async function site${n}(){
 const controller=new AbortController();
 fetch('${url}',{body:JSON.stringify({model:'openai/gpt-4.1'})});
 fetch(externalUrl);
 const events=await client.chat.send({stream:true},{signal:controller.signal});
 for await(const chunk of events){out+=chunk.choices[0].delta.content;}
 const response=await fetch('${url}',{signal:controller.signal,body:JSON.stringify({stream:true})});
 const reader=response.body.getReader();const packet=await reader.read();const text=new TextDecoder().decode(packet.value);
 for(const line of text.split('\\n')){const chunk=JSON.parse(line.slice(6));out+=chunk.choices[0].delta.content;}
 for(let attempt=0;attempt<3;attempt++){const res=await fetch('${url}',{signal:controller.signal});if(res.ok)break;}
}`).join('\n');
 fs.writeFileSync(path.join(root,'entry.ts'),source);
 const facts=analyzeCalls('entry.ts',source);if(!facts.ok)throw new Error(facts.error);
 const start=performance.now();const p=spawnSync(process.execPath,[path.join(candidate,'bin/cli.js'),'run',path.join(candidate,'doctors/openrouter.mjs'),root,'--format','json'],{encoding:'utf8',timeout:60000,maxBuffer:30e6});const wallMs=Math.round(performance.now()-start);const scan=JSON.parse(p.stdout),g=scan.groups[0];
 const counts=Object.fromEntries(g.checks.map(c=>[c.rule,c.findings.length]));const expected={'missing-abort-signal':sites,'hardcoded-dated-model-slug':sites,'sse-comment-parse-crash':sites,'midstream-error-ignored':2*sites,'retry-after-ignored':sites};
 const narrowed=g.semantic.narrowed.map(n=>({check:n.check,reason:n.reason,occurrences:n.occurrences,files:n.files}));
 const ok=p.status===0&&Object.entries(expected).every(([rule,n])=>counts[rule]===n)&&narrowed.length===1&&narrowed[0].check==='missing-abort-signal'&&narrowed[0].occurrences===sites&&scan.score.score===null&&scan.score.grade===null;
 results.push({sites,ok,exit:p.status,inputBytes:Buffer.byteLength(source),flowValues:facts.file.structure.flow.values.length,bindings:facts.file.structure.bindings.length,branches:facts.file.structure.flow.branches.length,wallMs,counts,expected,narrowed,score:scan.score});
}}finally{fs.rmSync(root,{recursive:true,force:true})}
const report={candidate,passed:results.filter(r=>r.ok).length,failed:results.filter(r=>!r.ok).length,skipped:0,results};console.log(JSON.stringify(report,null,2));process.exitCode=report.failed?1:0;
