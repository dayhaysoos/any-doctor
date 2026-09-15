// Desired migration contract, kept separate from the inherited fixture labels.
// These seeds are analyzed, never executed. They intentionally remain red while
// custom-check uncertainty has no supported DoctorCtx reporting path.
const imports = 'import {query,mutation,action} from "./_generated/server"; import {api,internal} from "./_generated/api";\n';
const checks = [
  ['filter-table-scan','query','return ctx.db.query("rows").filter(q=>q.eq(q.field("x"),1)).collect();'],
  ['index-without-range','query','return ctx.db.query("rows").withIndex("by_x").collect();'],
  ['query-clock-reactivity','query','return Date.now();'],
  ['transaction-clock-duration','mutation','return Date.now()-Date.now();'],
  ['unbounded-collect','query','return ctx.db.query("rows").collect();'],
  ['index-filter-combo','query','return ctx.db.query("rows").withIndex("by_x",q=>q.eq("x",1)).filter(q=>q.eq(q.field("y"),2)).collect();'],
  ['presence-patch-on-shared-document','mutation','await ctx.db.patch("id",{lastSeen:1});'],
  ['missing-args-validator','query','return 1;'],
  ['public-api-in-server-call','action','return ctx.runQuery(api.rows.list,{});'],
  ['write-in-query','query','await ctx.db.patch("id",{});'],
  ['db-in-action','action','return ctx.db.get("id");'],
  ['unawaited-convex-call','mutation','ctx.db.patch("id",{});'],
  ['node-runtime-transaction','query','return 1;'],
  ['sequential-run-in-loop','action','for(const id of ids){await ctx.runQuery(internal.rows.list,{id});}'],
  ['spread-into-patch','mutation','await ctx.db.patch("id",{...fields});'],
];
export const cases=[];
for(const [rule,kind,body] of checks){
 const registration=callee=>`${callee}({${rule==='missing-args-validator'?'':'args:{},'}handler:async(ctx)=>{${body}}});`;
 const prefix=(rule==='node-runtime-transaction'?'"use node";\n':'')+imports;
 for(const [variant,content,expected,narrowed] of [
  ['positive',registration(kind),1,false],
  ['local-lookalike',`const ordinary=config=>config;${registration('ordinary')}`,0,false],
  ['unsupported-positive-neighbor',`const selected=flag?${kind}:external;${registration('selected')}\n${registration(kind)}`,1,true],
  ['two-occurrences',registration(kind)+registration(kind),2,false],
 ])cases.push({name:`${rule}-${variant}`,rule,source:prefix+content,expected,narrowed,distinctLocations:expected===2});
}
cases.push({name:'opaque-range-positive-neighbor',rule:'index-without-range',source:imports+'query({args:{},handler:async(ctx)=>{await ctx.db.query("rows").withIndex("by_x",q=>external(q)).collect();return ctx.db.query("rows").withIndex("by_x").collect();}});',expected:1,narrowed:true});
cases.push({name:'opaque-config-positive-neighbor',rule:'missing-args-validator',source:imports+'query(configure());query({handler:async(ctx)=>1});',expected:1,narrowed:true});
cases.push({name:'unresolved-api-positive-neighbor',rule:'public-api-in-server-call',source:'import {action} from "./_generated/server"; import {api as publicApi} from "./_generated/api"; action({args:{},handler:async(ctx)=>{await ctx.runQuery(api.rows.list,{});return ctx.runQuery(publicApi.rows.list,{});}});',expected:1,narrowed:true});

// Exact source anchors form the oracle; no location is copied from scanner output.
const anchors = {
 'filter-table-scan':'filter(', 'index-without-range':'withIndex(',
 'query-clock-reactivity':'Date.now()', 'transaction-clock-duration':'Date.now()-Date.now()',
 'unbounded-collect':'collect(', 'index-filter-combo':'filter(',
 'presence-patch-on-shared-document':'ctx.db.patch(', 'missing-args-validator':'query({',
 'public-api-in-server-call':'ctx.runQuery(', 'write-in-query':'ctx.db.patch(',
 'db-in-action':'ctx.db.get(', 'unawaited-convex-call':'ctx.db.patch(',
 'node-runtime-transaction':'query({', 'sequential-run-in-loop':'ctx.runQuery(',
 'spread-into-patch':'ctx.db.patch(',
};
for (const c of cases) {
 const anchor=anchors[c.rule], offsets=[];
 for(let at=c.source.indexOf(anchor);at!==-1;at=c.source.indexOf(anchor,at+anchor.length))offsets.push(at);
 c.expectedLocations=c.expected===0?[]:offsets.slice(-c.expected).map(at=>({
  line:c.source.slice(0,at).split('\n').length,
  column:at-c.source.lastIndexOf('\n',at)-1,
 }));
 if(c.expectedLocations.length!==c.expected)throw Error(`Missing source anchor: ${c.name}`);
 if(c.narrowed)c.reason=c.name.startsWith('opaque-')?'unsupported-expression':'unresolved-identity';
}
