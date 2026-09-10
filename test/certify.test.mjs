import { test } from 'node:test';
import assert from 'node:assert/strict';
import { certify, ClaimContractViolation } from '../bin/certify.js';

function todoDoctor(unit = 'occurrence') {
  return {
    meta: { id:'certify-test-todo', description:'TODO comments', severity:'warning', checks:[{
      id:'todo', description:'TODO found', claim:'a TODO comment is present', lookalikes:['the word todorok'],
      ...(unit ? {reportingUnit:unit} : {}),
    }] },
    async doctor(ctx) {
      for (const file of ctx.files.list()) ctx.files.read(file).split('\n').forEach((line,i) => {
        if (line.includes('// TODO')) ctx.report.finding({rule:'todo',file,line:i+1});
      });
    },
  };
}
const twice = {name:'two identical occurrences', seed:{'src/a.ts':'// TODO fix\n// TODO fix\n'}, expected:[1,2].map(line=>({rule:'todo',file:'src/a.ts',line}))};

test('certify runs fixtures, innocent corpus, and per-check location coverage', async () => {
  const results=await certify(todoDoctor(), [twice,{name:'innocent',seed:{'src/b.ts':'const a=1;'},expected:[]}]);
  assert.ok(results.every(r=>r.ok), JSON.stringify(results));
  assert.ok(results.some(r=>r.name.startsWith('shared innocent corpus')));
  assert.ok(results.some(r=>r.name==='location coverage: todo' && !r.skipped));
});

test('a text-deduplicating checker fails the explicit same-file witness', async () => {
  const mod=todoDoctor();
  mod.doctor=async ctx=>{
    for(const file of ctx.files.list()) {
      const seen=new Set();
      ctx.files.read(file).split('\n').forEach((line,i)=>{
        if(line.includes('// TODO') && !seen.has(line)) {seen.add(line);ctx.report.finding({rule:'todo',file,line:i+1});}
      });
    }
  };
  const results=await certify(mod,[twice]);
  assert.equal(results[0].ok,false);
  assert.deepEqual(results[0].missing,[{rule:'todo',file:'src/a.ts',line:2}]);
  assert.equal(results.find(r=>r.name==='location coverage: todo').ok,false);
});

test('two copies reported at the same position cannot establish coverage', async () => {
  const fixture={...twice,expected:[twice.expected[0],twice.expected[0]]};
  const mod=todoDoctor();
  mod.doctor=async ctx=>{if(ctx.files.list().includes('src/a.ts')) for(let i=0;i<2;i++)ctx.report.finding(twice.expected[0]);};
  const results=await certify(mod,[fixture]);
  assert.equal(results[0].ok,true);
  assert.equal(results.find(r=>r.name==='location coverage: todo').ok,false);
});

test('missing coverage in a second rule cannot borrow a sibling witness', async () => {
  const mod=todoDoctor();
  mod.meta.checks.push({id:'second',description:'second',claim:'second',lookalikes:['none'],reportingUnit:'occurrence'});
  const results=await certify(mod,[twice]);
  assert.equal(results.find(r=>r.name==='location coverage: todo').ok,true);
  const missing=results.find(r=>r.name==='location coverage: second');
  assert.equal(missing.ok,false);
  assert.match(missing.error,/two distinct locations/);
});

test('undeclared units are not exercised; file units need a positive witness', async () => {
  const unknown=await certify(todoDoctor(null),[twice]);
  assert.ok(unknown.find(r=>r.name==='location coverage: todo').skipped);
  const mod=todoDoctor('file');
  mod.doctor=async ctx=>{for(const file of ctx.files.list()) if(ctx.files.read(file).includes('// TODO'))ctx.report.finding({rule:'todo',file,line:1});};
  const result=await certify(mod,[{...twice,expected:[twice.expected[0]]}]);
  assert.equal(result.find(r=>r.name==='location coverage: todo').ok,true);
});

test('certify refuses invalid claims and reporting units before sandbox runs', async () => {
  for(const change of [{claim:''},{reportingUnit:'guess'}]){
    const mod=todoDoctor();Object.assign(mod.meta.checks[0],change);
    await assert.rejects(()=>certify(mod,[]),ClaimContractViolation);
  }
});

test('crashed fixtures remain failures and cannot certify coverage', async () => {
  const mod=todoDoctor();mod.doctor=async ()=>{throw new Error('kaboom');};
  const results=await certify(mod,[twice]);
  assert.equal(results[0].ok,false);assert.match(results[0].error,/kaboom/);
  assert.equal(results.find(r=>r.name==='location coverage: todo').ok,false);
});

test('a wildcard line and an exact column cannot prove two distinct occurrences', async () => {
  const mod=todoDoctor();
  const location={rule:'todo',file:'src/a.ts',line:1,column:0};
  mod.doctor=async ctx=>{if(ctx.files.list().includes('src/a.ts')){ctx.report.finding(location);ctx.report.finding(location);}};
  const results=await certify(mod,[{name:'overlapping expectations',seed:{'src/a.ts':'x();'},expected:[{rule:'todo',file:'src/a.ts',line:1},location]}]);
  assert.equal(results[0].ok,true);
  assert.equal(results.find(r=>r.name==='location coverage: todo').ok,false);
});
