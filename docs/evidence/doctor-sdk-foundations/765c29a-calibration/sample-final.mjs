import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const [root,target,scanPath,output]=process.argv.slice(2);
const load=file=>import(pathToFileURL(path.resolve(root,file)).href);
const {analyzeCalls}=await load('bin/analysis.js');
const {requiredOptionRecipeResult,unhandledValueRecipeResult}=await load('bin/doctor-sdk.js');
const {meta}=await load('doctors/async.mjs');
const scan=JSON.parse(fs.readFileSync(scanPath));const rows=[];
for(const category of scan.groups[0].semantic.narrowed){
 let n=0;
 for(const {file} of category.files){
  const source=fs.readFileSync(path.join(target,file),'utf8'),facts=analyzeCalls(file,source).file;
  for(const value of facts.structure.flow.values.filter(v=>v.kind==='call'&&!v.dead)){
   const query=meta.checks.find(c=>c.id===category.check).recipe.query;
   const result=(category.check.startsWith('fetch')?requiredOptionRecipeResult:unhandledValueRecipeResult)(file,source,facts,value,query);
   if(result.status==='unknown'&&result.reason===category.reason){
    const binding=facts.structure.flow.bindings.find(b=>b.binding===value.target?.binding);
    const initializer=facts.structure.flow.values.find(v=>v.id===binding?.initializer);
    rows.push({check:category.check,reason:category.reason,file,line:value.line,expression:source.slice(value.start,value.end).slice(0,600),...(initializer?{initializer:source.slice(initializer.start,initializer.end).slice(0,400)}:{}),status:result.status});
    n++;break;
   }
  }
  if(n>=5)break;
 }
}
fs.writeFileSync(output,JSON.stringify(rows,null,2));
