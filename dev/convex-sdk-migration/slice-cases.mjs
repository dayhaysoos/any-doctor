import {cases as retained} from './guardrail-cases.mjs';
const marker='/*@finding*/';
const slices={A:['filter-table-scan','index-without-range','unbounded-collect','index-filter-combo'],B:['query-clock-reactivity','transaction-clock-duration','node-runtime-transaction'],C:['missing-args-validator','public-api-in-server-call','write-in-query','db-in-action'],D:['presence-patch-on-shared-document','unawaited-convex-call','sequential-run-in-loop','spread-into-patch']};
export const cases=[];
export function add(slice,name,rule,marked,reason){
 const expectedLocations=[];let source='',rest=marked;
 while(rest.includes(marker)){
  const at=rest.indexOf(marker);source+=rest.slice(0,at);rest=rest.slice(at+marker.length);
  expectedLocations.push({line:source.split('\n').length,column:source.length-source.lastIndexOf('\n')-1});
 }
 source+=rest;
 cases.push({slice,name,rule,source,expected:expectedLocations.length,expectedLocations,narrowed:!!reason,reason});
}
for(const [slice,rules] of Object.entries(slices))for(const rule of rules){
 const original=retained.find(c=>c.name===`${rule}-positive`),lines=original.source.split('\n'),loc=original.expectedLocations[0];
 lines[loc.line-1]=lines[loc.line-1].slice(0,loc.column)+marker+lines[loc.line-1].slice(loc.column);
 const marked=lines.join('\n'),kind=marked.match(/\n(?:\/\*@finding\*\/)?(query|mutation|action)\(/)[1];
 const replaceRegistration=(s,callee)=>s.replace(new RegExp(`(\\n(?:/\\*@finding\\*/)?)(?:${kind})\\(`),`$1${callee}(`);
 add(slice,`${rule}-renamed-import`,rule,replaceRegistration(marked.replace(`{query,mutation,action}`,`{query as read,mutation as write,action as act}`),{query:'read',mutation:'write',action:'act'}[kind]));
 add(slice,`${rule}-immutable-factory-alias`,rule,replaceRegistration(marked,'registered').replace('from "./_generated/server";','from "./_generated/server";const registered='+kind+';'));
 add(slice,`${rule}-renamed-context`,rule,marked.replace(/\bctx\b/g,'context'));
 add(slice,`${rule}-transparent-wrapper`,rule,replaceRegistration(marked,`((${kind} as typeof ${kind})!)`));
 const body=original.source.slice(original.source.lastIndexOf('\n')+1);
 add(slice,`${rule}-shadowed-factory`,rule,original.source.slice(0,original.source.lastIndexOf('\n')+1)+`{const ${kind}=value=>value;${body}}`);
 const handler=body.slice(body.indexOf('handler:')+8,body.lastIndexOf('});'));
 const args=rule==='missing-args-validator'?'':'args:{},';
 add(slice,`${rule}-stored-conditional-handler`,rule,marked.slice(0,marked.lastIndexOf('\n')+1)+`const handler=${handler};const selected=flag?${kind}:external;selected({${args}handler});\n`+marked.slice(marked.lastIndexOf('\n')+1),'unresolved-identity');
}
// Builder values are ordinary local data flow; construction alone is not execution.
for(const [rule,chain] of [['unbounded-collect','.collect()'],['filter-table-scan','.filter(q=>q.eq(q.field("x"),1)).collect()'],['index-without-range','.withIndex("by_x").collect()'],['index-filter-combo','.withIndex("by_x",q=>q.eq("x",1)).filter(q=>q.eq(q.field("y"),2)).collect()']]){
 const anchor=rule==='unbounded-collect'?'collect':rule==='index-without-range'?'withIndex':'filter';
 const markedChain=chain.replace(`.${anchor}`,`.${marker}${anchor}`);
 add('A',`${rule}-stored-builder`,rule,`import {query} from './_generated/server';query({args:{},handler:async ctx=>{const builder=ctx.db.query('rows');return builder${markedChain};}});`);
}
add('A','stored-builder-reassignment-neighbor','unbounded-collect',`import {query} from './_generated/server';query({args:{},handler:async ctx=>{let builder=ctx.db.query('rows');builder=external;await builder.collect();return ctx.db.query('rows').${marker}collect();}});`,'unresolved-identity');
add('A','stored-bounded-builder','unbounded-collect',`import {query} from './_generated/server';query({args:{},handler:async ctx=>{const builder=ctx.db.query('rows').withIndex('by_x',q=>q.eq('x',1));return builder.collect();}});`);
add('A','stored-unexecuted-builder','unbounded-collect',`import {query} from './_generated/server';query({args:{},handler:async ctx=>{const builder=ctx.db.query('rows');return builder;}});`);
add('A','ordinary-stored-builder','unbounded-collect',`const ctx={db:{query:()=>({collect(){}})}};const builder=ctx.db.query('rows');builder.collect();`);
add('B','aliased-query-clock','query-clock-reactivity',`import {query} from './_generated/server';query({args:{},handler:()=>{const clock=Date.now;return ${marker}clock();}});`);
add('B','aliased-transaction-duration','transaction-clock-duration',`import {mutation} from './_generated/server';mutation({args:{},handler:()=>{const clock=Date.now;return ${marker}clock()-clock();}});`);
add('B','reassigned-clock-positive-neighbor','query-clock-reactivity',`import {query} from './_generated/server';query({args:{},handler:()=>{let clock=Date.now;clock=external;clock();return ${marker}Date.now();}});`,'unresolved-identity');
add('B','action-clock-alias-clear','query-clock-reactivity',`import {action} from './_generated/server';action({args:{},handler:()=>{const clock=Date.now;return clock();}});`);
add('B','ordinary-clock-alias-clear','query-clock-reactivity',`import {query} from './_generated/server';query({args:{},handler:()=>{const Date={now:()=>1};const clock=Date.now;return clock();}});`);
add('B','uncertain-duration-positive-neighbor','transaction-clock-duration',`import {mutation} from './_generated/server';mutation({args:{},handler:()=>{let clock=Date.now;clock=external;const unknown=clock()-clock();return ${marker}Date.now()-Date.now();}});`,'unresolved-identity');
add('B','mixed-runtime-clock-positive-neighbor','query-clock-reactivity',`import {query,mutation} from './_generated/server';const selected=flag?mutation:query;selected({args:{},handler:()=>Date.now()});query({args:{},handler:()=>${marker}Date.now()});`,'unresolved-identity');
add('B','mixed-node-registration-positive-neighbor','node-runtime-transaction',`"use node";import {query,action} from './_generated/server';const selected=flag?action:query;selected({args:{},handler:()=>1});${marker}query({args:{},handler:()=>1});`,'unresolved-identity');
add('C','conditional-api-positive-neighbor','public-api-in-server-call',`import {action} from './_generated/server';import {api} from './_generated/api';action({args:{},handler:async ctx=>{const ref=flag?api.rows.list:external;await ctx.runQuery(ref,{});return ${marker}ctx.runQuery(api.rows.list,{});}});`,'unresolved-identity');
add('C','reassigned-query-context-positive-neighbor','write-in-query',`import {query} from './_generated/server';query({args:{},handler:async ctx=>{let alias=ctx;alias=external;await alias.db.patch('id',{});await ${marker}ctx.db.patch('id',{});}});`,'unresolved-identity');
add('C','reassigned-action-context-positive-neighbor','db-in-action',`import {action} from './_generated/server';action({args:{},handler:async ctx=>{let alias=ctx;alias=external;await alias.db.get('id');return ${marker}ctx.db.get('id');}});`,'unresolved-identity');
add('C','shared-handler-known-query','write-in-query',`import {query} from './_generated/server';const handler=async ctx=>{await ${marker}ctx.db.patch('id',{});};query({args:{},handler});const selected=flag?query:external;selected({args:{},handler});`);
add('C','inline-conditional-api-positive-neighbor','public-api-in-server-call',`import {action} from './_generated/server';import {api} from './_generated/api';action({args:{},handler:async ctx=>{await ctx.runQuery((flag?api.rows.list:external) as any,{});return ${marker}ctx.runQuery(api.rows.list,{});}});`,'unresolved-identity');
for(const [rule,body,positive] of [
 ['unawaited-convex-call',"alias.db.patch('id',{});",`${marker}ctx.db.patch('id',{});`],
 ['presence-patch-on-shared-document',"await alias.db.patch('id',{lastSeen:1});",`await ${marker}ctx.db.patch('id',{lastSeen:1});`],
 ['spread-into-patch',"await alias.db.patch('id',{...fields});",`await ${marker}ctx.db.patch('id',{...fields});`],
 ['sequential-run-in-loop',"for(const id of ids){await alias.runMutation(internal.rows.save,{id});}",`for(const id of ids){await ${marker}ctx.runMutation(internal.rows.save,{id});}`],
])add('D',`${rule}-reassigned-context-neighbor`,rule,`import {mutation} from './_generated/server';import {internal} from './_generated/api';mutation({args:{},handler:async ctx=>{let alias=ctx;alias=external;${body}${positive}}});`,'unresolved-identity');
for(const rule of ['presence-patch-on-shared-document','spread-into-patch'])add('D',`${rule}-opaque-patch-neighbor`,rule,`import {mutation} from './_generated/server';mutation({args:{},handler:async ctx=>{await ctx.db.patch('id',makeFields());await ${marker}ctx.db.patch('id',{${rule.startsWith('presence')?'lastSeen:1':'...fields'}});}});`,'unsupported-expression');
add('D','invalid-query-method-is-not-promise','unawaited-convex-call',`import {query} from './_generated/server';query({args:{},handler:ctx=>{ctx.db.patch('id',{});}});`);
// Independent review: candidate context and stored-builder origins must not vanish.
for(const [rule,chain,anchor] of [
 ['unbounded-collect','.collect()','collect'],
 ['filter-table-scan','.filter(q=>q.eq(q.field("x"),1)).collect()','filter'],
 ['index-without-range','.withIndex("by_x").collect()','withIndex'],
 ['index-filter-combo','.withIndex("by_x",q=>q.eq("x",1)).filter(q=>q.eq(q.field("y"),2)).collect()','filter'],
]){
 const neighbor=`return ctx.db.query('rows')${chain.replace(`.${anchor}`,`.${marker}${anchor}`)};`;
 for(const [form,setup,receiver] of [
  ['conditional-context','const alias=flag?ctx:external;',"alias.db.query('rows')"],
  ['reassigned-context','let alias=ctx;alias=external;',"alias.db.query('rows')"],
  ['conditional-builder',"const builder=flag?ctx.db.query('rows'):external;",'builder'],
  ['reassigned-builder',"let builder=external;builder=ctx.db.query('rows');",'builder'],
  ['assigned-builder',"let builder;builder=ctx.db.query('rows');",'builder'],
 ])add('A',`${rule}-${form}-review`,rule,`import {query} from './_generated/server';query({args:{},handler:async ctx=>{${setup}await ${receiver}${chain};${neighbor}}});`,'unresolved-identity');
 add('A',`${rule}-mixed-helper-review`,rule,`import {query} from './_generated/server';async function helper(ctx){return ctx.db.query('rows')${chain};}query({args:{},handler:async ctx=>helper(ctx)});helper(external);`,'unresolved-identity');
 add('A',`${rule}-ordinary-choice-review`,rule,`const ctx={db:{query:()=>external}};const builder=flag?ctx.db.query('rows'):external;builder${chain};`);
}
add('A','conditional-builder-alternatives-review','filter-table-scan',`import {query} from './_generated/server';query({args:{},handler:async ctx=>{const builder=flag?ctx.db.query('rows').withIndex('by_x',q=>q.eq('x',1)):ctx.db.query('rows').filter(q=>q.eq(q.field('x'),1));return builder.collect();}});`,'unresolved-identity');

add('D','typed-union-sequential-review','sequential-run-in-loop',`import type {QueryCtx,MutationCtx} from './_generated/server';async function helper(ctx:QueryCtx|MutationCtx){for(const id of ids){await ${marker}ctx.runQuery(external,{id});}}`);
add('D','typed-union-unawaited-review','unawaited-convex-call',`import type {QueryCtx,MutationCtx} from './_generated/server';function helper(ctx:QueryCtx|MutationCtx){${marker}ctx.runQuery(external,{});}`);
add('C','typed-union-write-review','write-in-query',`import type {QueryCtx,MutationCtx} from './_generated/server';async function helper(ctx:QueryCtx|MutationCtx){await ctx.db.patch('id',{});}`,'unresolved-identity');
add('D','typed-union-possible-promise-review','unawaited-convex-call',`import type {QueryCtx,MutationCtx} from './_generated/server';function helper(ctx:QueryCtx|MutationCtx){ctx.db.patch('id',{});}`,'unresolved-identity');
