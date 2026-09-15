import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import path from 'node:path';

const candidate=process.env.DOCTOR_CANDIDATE_ROOT;
const {analyzeCalls}=await import(candidate?pathToFileURL(path.join(candidate,'bin/analysis.js')):new URL('../bin/analysis.js',import.meta.url));
function facts(source){
  const result=analyzeCalls('receiver.ts',source);
  assert.equal(result.ok,true,result.error);
  return JSON.parse(JSON.stringify(result.file));
}
test('member calls link to distinct shared receiver identities, including conditional alternatives',()=>{
  const source='(flag ? external : db.query("rows").filter(predicate)).collect();';
  const f=facts(source),call=f.calls.find(c=>c.target.members.at(-1)==='collect');
  assert.ok(Number.isInteger(call.receiverValue));
  const values=new Map(f.structure.flow.values.map(v=>[v.id,v]));
  const receiver=values.get(call.receiverValue);
  assert.equal(receiver.kind,'choice');
  assert.deepEqual(receiver.alternatives.map(id=>values.get(id).kind),['reference','call']);
  const filter=values.get(receiver.alternatives[1]),query=values.get(filter.receiver);
  assert.equal(query.target.members.at(-1),'query');
  assert.equal(query.start,filter.start);
  assert.notEqual(query.id,filter.id);
  assert.deepEqual(facts(source),f,'IDs and JSON serialization are deterministic');
});

for(const [name,source,kind,roots] of [
 ['direct chain','db.query().filter(p).collect();','call',['db']],
 ['variable','const rows=db.query();rows.collect();','reference',['db']],
 ['parentheses','(((flag?left:right))).collect();','choice',['left','right']],
 ['as','(db.query() as any).collect();','call',['db']],
 ['satisfies','(db.query() satisfies unknown).collect();','call',['db']],
 ['non-null','(db.query()!).collect();','call',['db']],
 ['type assertion','(<any>db.query()).collect();','call',['db']],
 ['nested','(flag?(other?left:right):last).collect();','choice',['left','right','last']],
 ['nullish','(left??right).collect();','unknown',['left','right']],
 ['or','(left||right).collect();','unknown',['left','right']],
 ['and','(left&&right).collect();','unknown',['left','right']],
 ['sequence result','(discarded,db.query()).collect();','choice',['db']],
 ['assignment result','let rows;(rows=db.query()).collect();','choice',['db']],
 ['logical literal','(false||db.query()).collect();','unknown',['db']],
 ['logical assignment','let rows=external;(rows??=db.query()).collect();','unknown',['external','db']],
 ['direct call','factory().collect();','call',['factory']],
 ['ordinary','const rows=ordinary;rows.collect();','reference',['ordinary']],
 ['literal true','(true?live:dead).collect();','choice',['live']],
 ['literal false','(false?dead:live).collect();','choice',['live']],
 ['reconverging','const base=source;const left=base,right=base;(flag?left:right).collect();','choice',['source']],
 ['cycle','let left=source;const right=left;left=right;right.collect();','reference',['source']],
 ['computed member','db.query()["collect"]();','call',['db']],
 ['optional member','db.query()?.collect();','call',['db']],
])test(`shared receiver graph: ${name}`,()=>{
 const f=facts(source),flow=f.structure.flow,values=new Map(flow.values.map(v=>[v.id,v]));
 assert.equal(values.size,flow.values.length);
 const terminal=f.calls.find(c=>c.target.members.at(-1)==='collect');
 assert.ok(Number.isInteger(terminal.receiverValue));
 assert.equal(values.get(terminal.receiverValue).kind,kind);
 // Traverse only value provenance, not conditions, arguments or nested bodies.
 const pending=[terminal.receiverValue],seen=new Set(),found=new Set();
 for(let cursor=0;cursor<pending.length;cursor++){
  const id=pending[cursor];if(seen.has(id))continue;seen.add(id);
  const v=values.get(id);assert.ok(v,`dangling flow ID ${id}`);
  if(v.alternatives)pending.push(...v.alternatives);
  else if(v.receiver!==undefined)pending.push(v.receiver);
  else if(v.kind==='reference'){
   const binding=flow.bindings.find(b=>b.binding===v.target.binding);
   if(binding?.initializer!==undefined)pending.push(binding.initializer);
   else found.add(v.target.root);
   pending.push(...flow.uses.filter(u=>u.kind==='write'&&!u.dead&&u.binding===v.target.binding).map(u=>u.value));
  }else if(v.kind==='call')found.add(v.target.root);
 }
 assert.deepEqual([...found].sort(),roots.sort());
 assert.ok(seen.size<=values.size);
 for(const call of f.calls){
  const value=flow.values.find(v=>v.kind==='call'&&v.end===call.end);
  assert.equal(call.receiverValue,value.receiver);
 }
});

test('receiver containers preserve source slots without converting holes into values',()=>{
 const f=facts('[,source][0].collect();'),call=f.calls.find(c=>c.target.members.at(-1)==='collect');
 const member=f.structure.flow.values.find(v=>v.id===call.receiverValue);
 const array=f.structure.flow.values.find(v=>v.id===member.receiver);
 assert.equal(member.kind,'member');assert.equal(member.member,'0');
 assert.deepEqual(array.elements.map(e=>e.index),[1]);
});

test('shared member-write facts retain destination and assigned value IDs',()=>{
 const f=facts('const box={rows:external};box.rows=db.query();box.rows.collect();'),flow=f.structure.flow;
 const write=flow.uses.find(u=>u.kind==='write'),destination=flow.values.find(v=>v.id===write.targetValue);
 assert.equal(write.binding,undefined,'member writes do not pretend to reassign the container binding');
 assert.equal(destination.kind,'member');assert.equal(destination.member,'rows');
 assert.equal(flow.values.find(v=>v.id===destination.receiver).target.binding,flow.bindings[0].binding);
 assert.equal(flow.values.find(v=>v.id===write.value).target.members.at(-1),'query');
});
