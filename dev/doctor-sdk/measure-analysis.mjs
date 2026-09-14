// A read-only, repeated stage benchmark. Analyze identical file bytes through
// each artifact's own parser/scope adapter and shared recipes; no project code runs.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const [root,target]=process.argv.slice(2);
const load=file=>import(pathToFileURL(path.resolve(root,file)).href);
const {buildCtx}=await load('bin/sdk.js');
const {analyzeCalls}=await load('bin/analysis.js');
const {requiredOptionRecipeResult,unhandledValueRecipeResult,resourceWithoutReleaseRecipeResult}=await load('bin/doctor-sdk.js');
const {meta}=await load('doctors/async.mjs');
const query=name=>meta.checks.find(c=>c.recipe.name===name).recipe.query;
const files=buildCtx(target).ctx.files.list().filter(file=>!file.endsWith('.fixtures.mjs'));
let parseAnalysisMs=0,recipeMs=0,queries=0;const unknowns=new Map();
for(const file of files){
 const source=fs.readFileSync(path.join(target,file),'utf8');let start=performance.now();
 const result=analyzeCalls(file,source);parseAnalysisMs+=performance.now()-start;
 if(!result.ok)throw Error(result.error);
 start=performance.now();
 for(const call of result.file.structure.flow.values.filter(v=>v.kind==='call'&&!v.dead)){
  const evaluate=(name,fn)=>{queries++;const answer=fn(file,source,result.file,call,query(name));if(answer.status==='unknown'){const key=`${name}/${answer.reason}`;unknowns.set(key,(unknowns.get(key)??0)+1);}};
  evaluate('required-or-recommended-option',requiredOptionRecipeResult);
  if(call.member==='map')evaluate('unhandled-value',unhandledValueRecipeResult);
  if(call.target?.root==='setTimeout'||call.target?.members?.at(-1)==='setTimeout')evaluate('resource-without-release',resourceWithoutReleaseRecipeResult);
 }
 recipeMs+=performance.now()-start;
}
console.log(JSON.stringify({files:files.length,queries,parseAnalysisMs,recipeMs,totalAnalysisMs:parseAnalysisMs+recipeMs,peakRssKiB:process.resourceUsage().maxRSS,unknowns:Object.fromEntries(unknowns)},null,2));
