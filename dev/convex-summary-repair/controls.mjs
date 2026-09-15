// Independent source anchors and outcomes: no scanner-derived expectations.
export const controls=[];
function add(name,body,narrowed=[]){
 const expected=[];let source='',rest=body;
 for(;;){const match=/\/\*@([a-z-]+)\*\//.exec(rest);if(!match)break;source+=rest.slice(0,match.index);rest=rest.slice(match.index+match[0].length);expected.push({rule:match[1],line:source.split('\n').length,column:source.length-source.lastIndexOf('\n')-1});}
 controls.push({name,source:source+rest,expected,narrowed:narrowed.map(([check,reason])=>({check,reason,occurrences:1}))});
}
const query=body=>`import {query} from './_generated/server';query({args:{},handler:async (ctx,args)=>{${body}}});`;
const patch=object=>`import {mutation} from './_generated/server';mutation({args:{},handler:async (ctx,args)=>{await ${object}}});`;
const rangeUnknown=[['index-without-range','unsupported-expression']];
add('opaque-range-filter',query(`return ctx.db.query('rows').withIndex('by_x',q=>args.bound(q))./*@index-filter-combo*/filter(q=>q.eq(q.field('active'),true)).collect();`),rangeUnknown);
add('definite-range-filter',query(`return ctx.db.query('rows').withIndex('by_x',q=>q.eq('x',1))./*@index-filter-combo*/filter(q=>q.eq(q.field('active'),true)).collect();`));
add('no-range-no-filter',query(`return ctx.db.query('rows')./*@unbounded-collect*/collect();`));
add('filter-no-index',query(`return ctx.db.query('rows')./*@filter-table-scan*/filter(q=>q.eq(q.field('x'),1)).collect();`));
add('index-no-range',query(`return ctx.db.query('rows')./*@index-without-range*/withIndex('by_x').collect();`));
add('index-no-range-filter',query(`return ctx.db.query('rows')./*@index-without-range*/withIndex('by_x')./*@index-filter-combo*/filter(q=>q.eq(q.field('x'),1)).collect();`));
add('bounded-index',query(`return ctx.db.query('rows').withIndex('by_x').take(5);`));
add('two-executions-one-line',query(`await ctx.db.query('rows')./*@unbounded-collect*/collect();return ctx.db.query('rows')./*@unbounded-collect*/collect();`));
add('uncertain-neighbor',query(`const builder=flag?ctx.db.query('rows'):external;await builder.collect();return ctx.db.query('rows')./*@unbounded-collect*/collect();`),[['unbounded-collect','unresolved-identity']]);
add('reconverging-builder',query(`const base=ctx.db.query('rows');const left=base;const right=base;const builder=flag?left:right;return builder./*@unbounded-collect*/collect();`));
add('cyclic-builder',query(`let builder=ctx.db.query('rows');const alias=builder;builder=alias;await builder.collect();return ctx.db.query('rows')./*@unbounded-collect*/collect();`),[['unbounded-collect','unresolved-identity']]);
add('unexecuted-builders',query(`let builder=ctx.db.query('rows');builder=builder.filter(q=>q.eq(q.field('x'),1));return builder;`));
add('ordinary-builder-cycle',`let builder=external;const alias=builder;builder=alias;builder.collect();`);
add('ordinary-query-shape',`const ctx={db:{query:()=>external}};ctx.db.query('rows').filter(q=>q.eq(q.field('x'),1)).collect();`);
add('presence-explicit',patch(`/*@presence-patch-on-shared-document*/ctx.db.patch('id',{lastSeen:args.value});`));
add('presence-known-negative',patch(`ctx.db.patch('id',{name:args.value});`));
add('presence-computed',patch(`ctx.db.patch('id',{[args.field]:args.value});`),[['presence-patch-on-shared-document','unsupported-expression']]);
add('presence-spread',patch(`/*@spread-into-patch*/ctx.db.patch('id',{...args});`),[['presence-patch-on-shared-document','unsupported-expression']]);
add('presence-explicit-computed',patch(`/*@presence-patch-on-shared-document*/ctx.db.patch('id',{lastSeen:args.value,[args.field]:other});`),[['presence-patch-on-shared-document','unsupported-expression']]);
add('presence-explicit-spread',patch(`/*@spread-into-patch*//*@presence-patch-on-shared-document*/ctx.db.patch('id',{lastSeen:args.value,...other});`),[['presence-patch-on-shared-document','unsupported-expression']]);
add('presence-known-spread',patch(`/*@spread-into-patch*/ctx.db.patch('id',{...{name:args.value}});`));
add('presence-segmented-explicit',patch(`ctx.db.patch('presence','id',{lastSeen:args.value});`));
add('presence-segmented-dynamic',patch(`ctx.db.patch('presence','id',{[args.field]:args.value});`));
add('presence-validator-segmented',`import {mutation} from './_generated/server';import {v} from 'convex/values';mutation({args:{id:v.id('presence')},handler:async (ctx,args)=>{await ctx.db.patch(args.id,{lastSeen:1});}});`);
add('presence-validator-shared',`import {mutation} from './_generated/server';import {v} from 'convex/values';mutation({args:{id:v.id('users')},handler:async (ctx,args)=>{await /*@presence-patch-on-shared-document*/ctx.db.patch(args.id,{lastSeen:1});}});`);
