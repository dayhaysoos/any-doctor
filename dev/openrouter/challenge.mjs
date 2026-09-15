// Held separately from doctor fixtures and slice matrices. Markers label expected
// public finding coordinates; they are removed before the candidate sees source.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const candidate=fs.realpathSync(process.argv[2]??fileURLToPath(new URL('../../',import.meta.url)));
const output=process.argv[3];
const rules={A:'missing-abort-signal',B:'hardcoded-dated-model-slug',C:'sse-comment-parse-crash',D:'midstream-error-ignored',E:'retry-after-ignored'};
const U='https://openrouter.ai/api/v1/chat/completions';
const neighbor=`\n/*AB*/fetch('${U}',{body:JSON.stringify({model:'google/gemini-2.5-flash'})});`;
const sdk=`import {OpenRouter as Gateway} from '@openrouter/sdk';const aborter=new AbortController();const service=new Gateway();`;
const streaming=`${sdk}const events=await service.chat.send({stream:true},{signal:aborter.signal});`;
const reader=`const aborter=new AbortController();const incoming=await fetch('${U}',{body:JSON.stringify({stream:true}),signal:aborter.signal});const channel=incoming.body.getReader();const packet=await channel.read();const decoded=new TextDecoder().decode(packet.value);`;
const cases=[
 ['conditional-client-method',`${sdk}const invoke=enabled?service.chat.send:external;invoke({model:'google/gemini-2.5-flash'});`+neighbor,{A:1,B:1}],
 ['namespace-sdk',`import * as sdk from '@openrouter/sdk';const ac=new AbortController();const c=new sdk.OpenRouter();/*B*/c.chat.send({model:'google/gemini-2.5-flash'},{signal:ac.signal});`],
 ['namespace-provider',`import * as providers from '@openrouter/ai-sdk-provider';const choose=providers.createOpenRouter();/*B*/choose('google/gemini-2.5-flash');`],
 ['constant-selection',`const endpoint='${U}';const selection={model:'google/gemini-2.5-flash'};/*AB*/fetch(endpoint,{body:JSON.stringify(selection)});`],
 ['bounded-pieces',"const scheme='https://';const host='openrouter.ai';const route='/api/v1/chat/completions';/*A*/fetch(`${scheme}${host}${route}`)"],
 ['unknown-url-neighbor','fetch(destination);'+neighbor,{A:1}],
 ['shadow-and-native',`function local(fetch){fetch('${U}')}const fake=()=>{};fake('${U}');`+neighbor],
 ['request-carries-body',`const request=new Request('${U}',{body:JSON.stringify({model:'google/gemini-2.5-flash'})});/*AB*/fetch(request)`],
 ['request-signal',`const ac=new AbortController();const wrapped=new Request('${U}',{signal:ac.signal});fetch(wrapped);`],
 ['ordered-signal-null',`const ac=new AbortController();const carry={signal:ac.signal};/*A*/fetch('${U}',{...carry,['signal']:null});`],
 ['ordered-signal-added',`const ac=new AbortController();fetch('${U}',{...settings,signal:ac.signal});`,{B:1}],
 ['opaque-options-neighbor',`fetch('${U}',settings);`+neighbor,{A:1,B:1}],
 ['sdk-and-other-fetch',`${sdk}/*B*/service.chat.send({model:'google/gemini-2.5-flash'},{signal:aborter.signal});fetch('https://example.org/data')`],
 ['separate-framing-loops',`${reader}for(const row of decoded.split('\\n')){if(row.startsWith(':'))continue;JSON.parse(row.slice(6));}for(const row of decoded.split('\\n')){/*C*/JSON.parse(row.slice(6));}`],
 ['separate-stream-handling',`${streaming}const second=await service.chat.send({stream:true},{signal:aborter.signal});for await(const item of events){if(item.error)throw item.error;emit(item.choices[0].delta.content)}for await(const item of second){emit(/*D*/item.choices[0].delta.content)}`],
 ['late-versus-early',`${streaming}for await(const item of events){const piece=item.choices[0].delta.content;if(item.error)throw item.error;emit(piece)}for await(const item of events){emit(/*D*/item.choices[0].delta.content);if(item.error)throw item.error;}`],
 ['destructured-event',`${streaming}for await(const {choices:[{delta:part}]} of events){emit(/*D*/part.content)}`],
 ['helper-parser-neighbor',`function parseRow(row){return JSON.parse(row.slice(6))}${reader}for(const row of decoded.split('\\n')){parseRow(row)}`+neighbor,{C:1,D:1}],
 ['unrelated-json-guard',`${reader}function ignored(row){if(row.startsWith(':'))return;}JSON.parse('{"message":"data: "}');for(const row of decoded.split('\\n')){/*C*/JSON.parse(row.slice(6))}`],
 ['raw-retry',`async function request(){const ac=new AbortController();for(let budget=4;budget>0;budget--){const r=await /*E*/fetch('${U}',{signal:ac.signal});if(r.status===429||r.status===503)continue;return r;}}`],
 ['sdk-managed-retry',`${sdk}try{await service.chat.send({},{signal:aborter.signal,retries:{strategy:'backoff'}})}catch(err){log(err)}`],
 ['unrelated-catch',`const ac=new AbortController();await fetch('${U}',{signal:ac.signal});try{other()}catch(err){log('retry',err)}`],
 ['wrong-response-header',`async function go(){const ac=new AbortController();for(let left=4;left;left--){const r=await /*E*/fetch('${U}',{signal:ac.signal});const unrelated=await fetch('https://example.org');unrelated.headers.get('Retry-After');if(r.ok)return r;}}`],
 ['same-literal-contexts',`${sdk}const labels=['google/gemini-2.5-flash','fixtures/model-2.ts','https://example.org/google/gemini-2.5-flash'];console.log('google/gemini-2.5-flash');const test={name:'google/gemini-2.5-flash'};const pricing={'google/gemini-2.5-flash':1};/*B*/service.chat.send({model:'google/gemini-2.5-flash'},{signal:aborter.signal});`],
 ['computed-model-neighbor',`${sdk}service.chat.send({model:configuration.model},{signal:aborter.signal});`+neighbor,{B:1}],
 ['unknown-stream-handler-neighbor',`${streaming}for await(const item of events){externalConsumer(item)}`+neighbor,{D:1}],
 ['unknown-retry-wrapper-neighbor',`const ac=new AbortController();schedule(async()=>{return fetch('${U}',{signal:ac.signal})});`+neighbor,{E:1}],
 ['conditional-fetch-neighbor',`const send=enabled?globalThis.fetch:external;send('${U}');`+neighbor,{A:1}],
 ['conditional-provider-neighbor',`import {createOpenRouter as provider} from '@openrouter/ai-sdk-provider';const choose=enabled?provider():external;choose('google/gemini-2.5-flash');`+neighbor,{B:1}],
 ['unknown-function-is-ordinary','unrecognized();const label="openrouter";'],
 ['receiver-transform-neighbor',`${reader}incoming.body.pipeThrough(transform);`+neighbor,{C:1,D:1}],
 ['whole-stream-transfer-neighbor',`${streaming}consumeAll(events);`+neighbor,{D:1}],
];
const sort=rows=>rows.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
function unmark(marked){let source='',last=0;const expected=[];for(const match of marked.matchAll(/\/\*([ABCDE]+)\*\//g)){source+=marked.slice(last,match.index);const lines=source.split('\n');for(const id of match[1])expected.push({rule:rules[id],file:'entry.ts',line:lines.length,column:lines.at(-1).length,severity:['C','D'].includes(id)?'warning':'info'});last=match.index+match[0].length;}return {source:source+marked.slice(last),expected:sort(expected)};}
const root=fs.mkdtempSync(path.join(os.tmpdir(),'openrouter-independent-')),results=[];
try{for(const [name,marked,unknown={}] of cases){
 const {source,expected}=unmark(marked);fs.writeFileSync(path.join(root,'entry.ts'),source);
 const run=spawnSync(process.execPath,[path.join(candidate,'bin/cli.js'),'run',path.join(candidate,'doctors/openrouter.mjs'),root,'--format','json'],{encoding:'utf8',timeout:30000,maxBuffer:20e6});
 let scan;try{scan=JSON.parse(run.stdout)}catch{}
 const actual=sort((scan?.groups??[]).flatMap(g=>g.checks.flatMap(c=>c.findings.map(f=>({rule:c.rule,file:f.file,line:f.line,column:f.column,severity:c.severity,message:f.message})))));
 const narrowing=sort((scan?.groups??[]).flatMap(g=>g.semantic.narrowed.map(n=>({check:n.check,reason:n.reason,occurrences:n.occurrences,files:n.files}))));
 const expectedNarrowing=sort(Object.entries(unknown).map(([id,n])=>({check:rules[id],reason:'unsupported-expression',occurrences:n,files:[{file:'entry.ts',occurrences:n}]})));
 const scored=Object.keys(unknown).length===0;
 const ok=run.status===0&&JSON.stringify(actual)===JSON.stringify(expected)&&JSON.stringify(narrowing)===JSON.stringify(expectedNarrowing)&&Boolean(scan?.groups[0].semantic.incomplete)===!scored&&(scored?scan.score.score!==null:scan.score.score===null&&scan.score.grade===null);
 results.push({name,ok,exit:run.status,source,expected,actual,expectedNarrowing,narrowing,score:scan?.score,stderr:run.stderr});
 }}finally{fs.rmSync(root,{recursive:true,force:true})}
const oracleNotes={'ordered-signal-added':'The unknown spread can supply body/model despite a definite later signal; cancellation is clear but model coverage is unknown. Initial all-check-clean oracle was incorrect.','receiver-transform-neighbor':'Corrected the seed to call pipeThrough on ReadableStream body rather than its reader; the unknown-transfer expectation is unchanged.'};
const report={candidate,oracleNotes,passed:results.filter(r=>r.ok).length,failed:results.filter(r=>!r.ok).length,skipped:0,results};
if(output)fs.writeFileSync(output,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));process.exitCode=report.failed?1:0;
