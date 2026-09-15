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
