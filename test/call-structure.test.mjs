import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeCalls } from '../bin/analysis.js';
function facts(source) { const r=analyzeCalls('sample.ts',source); assert.equal(r.ok,true); return r.file; }
test('call structure resolves ordered properties, aliases and lexical parameters',()=>{
 const f=facts('import { query as read } from "framework"; const args={x:1}; const handler=async(context)=>context.db.get("x"); read({handler,args});');
 assert.ok(f.structure);
 const obj=f.structure.values.find(v=>v.kind==='object' && v.properties.some(p=>p.name==='handler'));
 assert.deepEqual(obj.properties.map(p=>p.name),['handler','args']);
 assert.ok(f.structure.bindings.some(b=>b.parameter?.index===0));
 assert.ok(f.structure.bindings.some(b=>b.initializer!==undefined));
});
test('returned flow excludes a literal unreachable branch and preserves unresolved paths',()=>{
 const f=facts('const a=q=>{if(false)return q.eq("x",1);return q;}; const b=q=>{if(flag)return q.eq("x",1);return q;}; const c=q=>{try{return other(q);}finally{cleanup();}};');
 const flows=f.structure.functions;
 assert.equal(flows[0].returns.length,1);assert.equal(flows[0].unknownReturn,false);
 assert.equal(flows[1].returns.length,2);assert.equal(flows[2].unknownReturn,true);
});
test('directives and loop ownership ignore comments, strings and nested function bodies',()=>{
 const f=facts('/* license */\n"use node"\nasync function f(){for(const id of ids){await ctx.runQuery(id);const later=async()=>await ctx.runMutation(id);}}');
 assert.deepEqual(f.structure.directives,['use node']);
 const loop=f.structure.loops[0];assert.equal(loop.functionStart,f.functions[0].start);
 assert.notEqual(f.calls.find(c=>c.target.members[0]==='runMutation').functionStart,loop.functionStart);
});
test('same-start type assertions retain values and projected type aliases preserve import identity',()=>{
 const f=facts('import {api} from "./_generated/api"; import type {QueryCtx} from "./_generated/server";const a=api as any;type DB=Pick<QueryCtx,"db">;function f(ctx:DB){}');
 const a=f.structure.bindings.find(b=>b.initializer!==undefined);
 assert.equal(f.structure.values.find(v=>v.start===a.initializer).kind,'reference');
 const param=f.structure.bindings.find(b=>b.parameter);
 assert.equal(param.types[0].target.importedName,'QueryCtx');assert.deepEqual(param.types[0].members,['db']);
});
test('union type constituents sharing a start offset remain distinct',()=>{
 const f=facts('import type {QueryCtx,MutationCtx} from "./_generated/server";type DB=Pick<QueryCtx|MutationCtx,"db">;function f(ctx:DB){}');
 assert.deepEqual(f.structure.bindings.find(b=>b.parameter).types.map(t=>t.target.importedName),['QueryCtx','MutationCtx']);
});
