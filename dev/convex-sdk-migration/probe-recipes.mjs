// Compatibility probes, not production doctor certification. Never execute seeds.
import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const root=path.resolve(process.argv[2]??'.');
const {analyzeCalls}=await import(pathToFileURL(path.join(root,'bin/analysis.js')));
const {unhandledValueRecipeResult,optionPresenceResult}=await import(pathToFileURL(path.join(root,'bin/doctor-sdk.js')));
const rows=[];
for(const [name,source,member] of [
 ['discarded-convex-call','import {mutation} from "./_generated/server";mutation({args:{},handler:async ctx=>{ctx.db.patch("id",{});}});','patch'],
 ['present-convex-args','import {query} from "./_generated/server";query({args:{},handler:()=>1});',undefined],
]){
 const parsed=analyzeCalls('seed.ts',source);assert.equal(parsed.ok,true);
 const facts=parsed.file;
 const subject=facts.structure.flow.values.find(v=>v.kind==='call'&&(member?v.member===member:v.target?.root==='query'));
 assert.ok(subject);
 const result=member?unhandledValueRecipeResult('seed.ts',source,facts,subject,{producer:{member,asyncArgument:0,receiver:'array'},consumers:['Promise.all']}):optionPresenceResult('seed.ts',source,facts,subject,{option:'args',sources:[]});
 // Both unsupported: neither recipe establishes the required Convex conclusion.
 assert.equal(result.status,'unknown');assert.equal(result.reason,'unsupported-expression');
 rows.push({name,source,result});
}
console.log(JSON.stringify({candidate:root,passed:rows.length,failed:0,rows},null,2));
