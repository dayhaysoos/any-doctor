import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';
const candidate=fs.realpathSync(process.argv[2]??'.'),output=path.resolve(process.argv[3]);fs.mkdirSync(output);
const rows=[];
for(const assignments of [20,80,160,320,1000]){
 const root=path.join(output,String(assignments));fs.mkdirSync(root);
 const source='import {query} from "./_generated/server";\nquery({args:{},handler:async ctx=>{\nlet builder=ctx.db.query("rows");\n'+'builder=builder.filter(q=>q.eq(q.field("x"),1));\n'.repeat(assignments)+'await builder.collect();\n}});\n';fs.writeFileSync(path.join(root,'entry.ts'),source);
 const command=[path.join(candidate,'bin/cli.js'),'run',path.join(candidate,'doctors/convex.mjs'),root,'--format','json'],start=performance.now();
 const run=spawnSync(process.execPath,command,{encoding:'utf8',timeout:20000,maxBuffer:10e6,env:{...process.env,NODE_OPTIONS:'--max-old-space-size=128'}});const wallMs=Math.round(performance.now()-start);
 fs.writeFileSync(path.join(output,assignments+'.stdout'),run.stdout??'');fs.writeFileSync(path.join(output,assignments+'.stderr'),run.stderr??'');
 let scan;try{scan=JSON.parse(run.stdout);}catch{}
 const narrowed=scan?.groups.flatMap(g=>g.semantic?.narrowed??[])??[];
 const semantic=narrowed.map(n=>({check:n.check,reason:n.reason,capability:n.capability,occurrences:n.occurrences,files:n.files})).sort((a,b)=>a.check.localeCompare(b.check));
 const expected=['filter-table-scan','unbounded-collect'].map(check=>({check,reason:'unresolved-identity',capability:'calls',occurrences:1,files:[{file:'entry.ts',occurrences:1}]}));
 const passed=run.status===0&&scan.analysisAvailable&&scan.counts.total===0&&scan.score.score===null&&scan.score.grade===null&&JSON.stringify(semantic)===JSON.stringify(expected);
 rows.push({assignments,sourceBytes:Buffer.byteLength(source),heapMB:128,command:[process.execPath,...command],wallMs,exit:run.status,signal:run.signal,error:run.error?.message,findings:scan?.counts,score:scan?.score,narrowed:semantic,passed});
 console.log(JSON.stringify(rows.at(-1)));
}
const result={passed:rows.filter(r=>r.passed).length,failed:rows.filter(r=>!r.passed).length,skipped:0,rows};fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(result,null,2));process.exitCode=result.failed?1:0;
