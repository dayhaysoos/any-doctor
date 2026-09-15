import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
const candidate=fs.realpathSync(process.argv[2]??'.'),output=path.resolve(process.argv[3]);fs.mkdirSync(output);
const {analyzeCalls}=await import(pathToFileURL(path.join(candidate,'bin/analysis.js'))),rows=[];
const builder=`ctx.db.query('rows').withIndex('by_x').filter(q=>q.eq(q.field('x'),1))`;
for(const shape of ['aliases','nested'])for(const depth of [10,20,40,80]){
 const root=path.join(output,`${shape}-${depth}`);fs.mkdirSync(root);
 let body;
 if(shape==='aliases'){
  body=`const a0=${builder};\n`;
  for(let i=1;i<=depth;i++)body+=`const a${i}=args.flag?a${i-1}:a${i-1};\n`;
  body+=`return a${depth}.collect();`;
 }else{
  let expression=builder;for(let i=0;i<depth;i++)expression=`(args.flag?external:${expression})`;
  body=`await ${expression}.collect();\nreturn ctx.db.query('neighbor').collect();`;
 }
 const source=`import {query} from './_generated/server';\nquery({args:{},handler:async(ctx,args)=>{\n${body}\n}});\n`;
 fs.writeFileSync(path.join(root,'entry.ts'),source);
 const command=[path.join(candidate,'bin/cli.js'),'run',path.join(candidate,'doctors/convex.mjs'),root,'--format','json'],start=performance.now();
 const run=spawnSync(process.execPath,command,{encoding:'utf8',timeout:20000,maxBuffer:10e6,env:{...process.env,NODE_OPTIONS:'--max-old-space-size=128'}}),wallMs=Math.round(performance.now()-start);
 fs.writeFileSync(path.join(root,'scan.json'),run.stdout??'');fs.writeFileSync(path.join(root,'stderr'),run.stderr??'');
 let scan;try{scan=JSON.parse(run.stdout);}catch{}
 const location=(rule,token)=>{const start=source.indexOf(token);return {rule,line:source.slice(0,start).split('\n').length,column:start-source.lastIndexOf('\n',start)-1};};
 const expected=shape==='aliases'?[location('index-without-range','withIndex'),location('index-filter-combo','filter')]:[location('unbounded-collect',"collect();\n}}")];
 const actual=scan?.groups.flatMap(g=>g.checks.flatMap(c=>c.findings.map(f=>({rule:c.rule,line:f.line,column:f.column}))))??[];
 const narrowed=scan?.groups.flatMap(g=>g.semantic.narrowed.map(n=>({check:n.check,reason:n.reason,occurrences:n.occurrences,files:n.files})))??[];
 const expectedNarrowed=shape==='aliases'?[]:['index-without-range','index-filter-combo'].map(check=>({check,reason:'unresolved-identity',occurrences:1,files:[{file:'entry.ts',occurrences:1}]}));
 const sort=items=>items.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
 const facts=analyzeCalls('entry.ts',source),flowValues=facts.ok?facts.file.structure.flow.values.length:null;
 const prior=rows.find(r=>r.shape===shape&&r.depth===depth/2);
 const passed=run.status===0&&scan.analysisAvailable&&JSON.stringify(sort(actual))===JSON.stringify(sort(expected))&&JSON.stringify(sort(narrowed))===JSON.stringify(sort(expectedNarrowed))&&flowValues!==null&&(!prior||flowValues<=2*prior.flowValues)&&(shape==='aliases'||scan.score.score===null&&scan.score.grade===null);
 rows.push({shape,depth,heapMB:128,command:[process.execPath,...command],wallMs,exit:run.status,signal:run.signal,flowValues,actual,expected,narrowed,score:scan?.score,passed});
}
const result={passed:rows.filter(r=>r.passed).length,failed:rows.filter(r=>!r.passed).length,skipped:0,rows};fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));process.exitCode=result.failed?1:0;
