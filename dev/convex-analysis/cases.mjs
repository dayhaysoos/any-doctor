export const cases=[];
const imp='import {query,mutation,action,internalMutation} from "./_generated/server"; import {v} from "convex/values";';
const fn=(kind,body,param='context')=>`${imp} export const f=${kind}({args:{},handler:async(${param},args)=>{${body}}});`;
const add=(name,rule,expected,source,more={})=>cases.push({name,rule,expected,source,...more});
const chains=[['unbounded-collect','.collect()'],['filter-table-scan','.filter(q=>q.eq(q.field("x"),1)).take(10)'],['index-without-range','.withIndex("by_x").collect()'],['index-filter-combo','.withIndex("by_x",q=>q.eq("x",1)).filter(q=>q.eq(q.field("y"),2)).collect()']];
for(const [rule,chain] of chains){
 for(const [name,body,param] of [
 ['context-alias',`const alias=context; return alias.db.query("rows")${chain};`,'context'],
 ['database-alias',`const database=context.db; return database.query("rows")${chain};`,'context'],
 ['destructure',`const {db:database}=context; return database.query("rows")${chain};`,'context'],
 ['parameter-destructure',`return database.query("rows")${chain};`,'{db:database}'],
 ['computed',`return (context as any)["db"]["query"]("rows")${chain};`,'context'],
 ['nearby-unresolved',`unknown(other); return context.db.query("rows")${chain};`,'context'],
 ])add(`${rule}-${name}`,rule,1,fn('query',body,param));
 add(`${rule}-typed-helper`,rule,1,`import type { QueryCtx as ReadContext } from "./_generated/server"; export function helper(database:ReadContext){ return database.db.query("rows")${chain}; }`);
 add(`${rule}-called-helper`,rule,1,fn('query',`return helper(context);`)+`function helper(database){return database.db.query("rows")${chain};}`);
 add(`${rule}-shadowed-helper`,rule,0,fn('query',`function helper(context){return context.db.query("rows")${chain};} return helper(ordinary);`));
}
add('renamed-registration','missing-args-validator',1,'import {query as read} from "./_generated/server"; const reg=(read as any); const handler=async(context)=>1; reg({handler});');
add('namespace-registration','missing-args-validator',1,'import * as server from "./_generated/server"; server["query"](async(context)=>1);');
add('config-alias-shorthand','missing-args-validator',0,imp+'const args={title:v.string()}; const handler=async(context)=>1; const options={handler,args};query(options);');
add('dynamic-config-positive-neighbor','missing-args-validator',1,imp+'query(unknown);query({handler:async(context)=>1});');
add('internal-validator-convention','missing-args-validator',1,imp+'internalMutation({handler:async(context)=>1});',{severity:'info',messageIncludes:'not client exposure'});
add('returned-stored-passed-promises','unawaited-convex-call',1,fn('mutation','const p=context.db.patch("x",{}); sink(context.db.patch("x",{})); await Promise.all([context.db.patch("x",{})]); context.db.patch("x",{}); await Promise.all([]);return context.db.patch("x",{});'));
add('reassigned-context-spared','unawaited-convex-call',0,fn('mutation','context=ordinary; context.db.patch("x",{});'));
add('local-object-named-query','missing-args-validator',0,imp+'{const query=x=>x;query({handler:async(ctx)=>1});}');
add('two-on-one-line','unbounded-collect',2,fn('query','await context.db.query("x").collect(); await context.db.query("x").collect();'),{distinctColumns:true});
add('direct-registered-handler','write-in-query',1,imp+'query(async context=>{ await context.db.patch("x",{}); });');
add('stored-handler','db-in-action',1,imp+'const handle=async context=>{await context.db.get("x");}; action({args:{},handler:handle});');
add('range-return-alias','index-without-range',0,fn('query','return context.db.query("x").withIndex("by_x",q=>{const a=q.eq("x",1);return a;}).collect();'));
add('range-monotonic-assignment','index-without-range',0,fn('query','return context.db.query("x").withIndex("by_x",q=>{let a=q.eq("x",1);if(flag)a=a.lt("y",2);return a;}).collect();'));
add('range-overwritten-unrelated','index-without-range',1,fn('query','return context.db.query("x").withIndex("by_x",q=>{let a=q.eq("x",1);a=other;return a;}).collect();'),{severity:'info',messageIncludes:'unresolved'});
add('range-unknown-neighbor','unbounded-collect',1,fn('query','await context.db.query("x").withIndex("by_x",q=>unknown(q)).collect();return context.db.query("y").collect();'));
add('range-mixed-returns','index-without-range',1,fn('query','return context.db.query("x").withIndex("by_x",q=>flag?q.eq("x",1):q).collect();'),{severity:'info',messageIncludes:'unresolved'});
add('true-node-directive','node-runtime-transaction',2,'/*license*/\n"use node"\n'+imp+' query({args:{},handler:async context=>1}); mutation({args:{},handler:async context=>1});',{distinctColumns:true});
add('not-a-directive','node-runtime-transaction',0,imp+'const example="use node";query({args:{},handler:async context=>1});');
add('table-qualified-presence','presence-patch-on-shared-document',0,fn('mutation','await context.db.patch("heartbeats",args.id,{lastSeen:Date.now()});'));
add('table-qualified-spread','spread-into-patch',1,fn('mutation','await context.db.patch("users",args.id,{updatedAt:Date.now(),...fields});'));
add('array-and-nested-spreads','spread-into-patch',0,fn('mutation','await context.db.patch("id",{tags:[...tags],nested:{...data}});'));
add('selected-server-fields','spread-into-patch',1,fn('mutation','const fields={title:"server",role:"member"};await context.db.patch("id",{...fields});'),{messageIncludes:'explicitly named fields'});
add('validated-copy','spread-into-patch',1,imp+'mutation({args:{id:v.id("users"),title:v.string()},handler:async(context,args)=>{await context.db.patch(args.id,{...args});}});',{messageIncludes:'validators'});
add('nested-deferred-run','sequential-run-in-loop',0,fn('action','for(const id of ids){const work=async()=>await context.runMutation(internal.x.f,{id}); store(work);}'));
add('deliberate-backoff','sequential-run-in-loop',1,fn('action','for(let attempt=0;attempt<3;attempt++){try{await context.runMutation(internal.x.f,{});break;}catch(e){await delay(attempt);}}'));
add('cursor-dependent','sequential-run-in-loop',1,fn('action','let cursor=null;for(;;){const page=await context.runQuery(internal.x.f,{cursor});if(page.done)break;cursor=page.cursor;}'));
add('public-import-alias','public-api-in-server-call',1,'import {api as publicApi} from "./_generated/api";'+fn('action','await context.runQuery(publicApi.rows.list,{});'),{messageIncludes:'preserve required client access'});
add('local-api-shadow','public-api-in-server-call',0,fn('action','const api={rows:{list:1}};await context.runQuery(api.rows.list,{});'));
add('unrelated-shadowed-date','query-clock-reactivity',0,fn('query','const Date={now:()=>1};return Date.now();'));
add('fixture-file-excluded','unbounded-collect',0,fn('query','return context.db.query("x").collect();'),{file:'example.fixtures.mjs'});
for(const extension of ['mts','cts','cjs'])add(`diagnostic-${extension}-limit`,'unbounded-collect',0,fn('query','return context.db.query("x").collect();'),{file:`example.${extension}`});
add('mutated-config-positive-neighbor','missing-args-validator',1,imp+'const config={handler:async(context)=>1};config.args={};query(config);query({handler:async(context)=>1});');
add('mutation-invalidates-range','index-without-range',1,fn('query','return context.db.query("x").withIndex("by_x",q=>{let a=q.eq("x",1);function later(){a=unknown;}return a;}).collect();'),{severity:'info',messageIncludes:'unresolved'});
add('alias-of-database-method','unawaited-convex-call',1,fn('mutation','const database=context.db;const patch=database.patch;patch("id",{});'));
add('type-projected-helper','index-filter-combo',1,'import type {QueryCtx,MutationCtx} from "./_generated/server";type DB=Pick<QueryCtx|MutationCtx,"db">;function run(database:DB){return database.db.query("rows").withIndex("by_x",q=>q.eq("x",1)).filter(q=>q.eq(q.field("y"),2)).collect();}');
add('aliased-projected-runner','sequential-run-in-loop',1,'import type {ActionCtx} from "./_generated/server";type Runner=Pick<ActionCtx,"runMutation">;async function run(context:Runner){for(const id of ids){await context.runMutation(internal.rows.update,{id});}}');
add('asserted-generated-api-alias','public-api-in-server-call',1,'import {api as generatedApi} from "./_generated/api";const api=generatedApi as any;'+fn('action','await context.runQuery(api.rows.list,{});'));
add('escaped-config-positive-neighbor','missing-args-validator',1,imp+'const config={handler:async(context)=>1};configure(config);query(config);query({handler:async(context)=>1});');
add('mutated-namespace-registration','missing-args-validator',0,'import * as server from "./_generated/server";server.query=ordinary;server.query({handler:async(context)=>1});');
add('segmented-destructured-id','presence-patch-on-shared-document',0,imp+'mutation({args:{heartbeatId:v.id("heartbeats")},handler:async(context,{heartbeatId})=>{await context.db.patch(heartbeatId,{lastSeen:Date.now()});}});');
add('stored-patch-object','spread-into-patch',1,fn('mutation','const fields={...args};await context.db.patch("id",fields);'));
add('alias-mutated-config-positive-neighbor','missing-args-validator',1,imp+'const config={handler:async(context)=>1};const alias=config;alias.args={};query(config);query({handler:async(context)=>1});');
add('foreign-package-spares-neighbor','unbounded-collect',1,'import {query as fake} from "@other/convex/server";fake({args:{},handler:async(context)=>context.db.query("rows").collect()});'+fn('query','return context.db.query("real").collect();'));
add('foreign-package-type','unbounded-collect',0,'import type {QueryCtx} from "@other/convex/server";function helper(context:QueryCtx){return context.db.query("rows").collect();}');
add('official-generic-registration','unbounded-collect',1,'import {queryGeneric as read} from "convex/server";read({args:{},handler:async(context)=>context.db.query("rows").collect()});');
