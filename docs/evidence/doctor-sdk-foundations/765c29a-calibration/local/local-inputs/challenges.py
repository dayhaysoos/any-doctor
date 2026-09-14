from pathlib import Path
import json,subprocess,sys
OUT=Path(__file__).resolve().parent
CASES=[]
F='fetch-calls-without-abortsignal';M='unawaited-async-map';T='uncleared-settimeout-in-effect'
def add(name,rule,expected,source,reason):CASES.append(dict(name=name,rule=rule,expected=expected,source=source,reason=reason))
add('fetch-no-options',F,1,'fetch("https://example.invalid");','No cancellation signal supplied; candidate, not automatically a bug.')
add('fetch-inline-signal',F,0,'const c=new AbortController(); fetch("https://example.invalid",{signal:c.signal});','Inline signal present.')
add('fetch-shorthand-signal',F,0,'const signal=new AbortController().signal; fetch("https://example.invalid",{signal});','Shorthand signal present.')
add('fetch-options-variable',F,0,'const c=new AbortController(); const options={signal:c.signal}; fetch("https://example.invalid",options);','Known options object carries a real signal.')
add('fetch-spread-options',F,0,'const c=new AbortController(); const options={signal:c.signal}; fetch("https://example.invalid",{...options});','Spread preserves signal.')
add('fetch-request-object',F,0,'const c=new AbortController(); const request=new Request("https://example.invalid",{signal:c.signal}); fetch(request);','Request carries its own cancellation signal.')
add('fetch-inline-request',F,0,'const c=new AbortController(); fetch(new Request("https://example.invalid",{signal:c.signal}));','Inline Request also carries signal.')
add('fetch-forwarded-init',F,0,'export function forward(url, init: RequestInit){ return fetch(url,init); }','Unknown caller options cannot prove absent signal; abstain or narrower claim.')
add('fetch-local-lookalike',F,0,'function fetch(value){return value;} fetch(1);','Synchronous local function, not network fetch.')
add('fetch-parameter-lookalike',F,0,'export function f(fetch: (x:number)=>number){return fetch(1)}','Caller-provided unrelated function is not established network fetch.')
add('fetch-signal-undefined',F,1,'fetch("https://example.invalid",{signal:undefined});','No usable cancellation signal despite a property key.')
add('fetch-signal-null',F,1,'fetch("https://example.invalid",{signal:null});','Null does not supply an abort controller signal.')
add('fetch-computed-signal',F,0,'const c=new AbortController(); fetch("https://example.invalid",{["signal"]:c.signal});','Static computed property supplies signal.')
add('fetch-comment-before-signal',F,0,'const c=new AbortController(); fetch("https://example.invalid",{/* cancellation */ signal:c.signal});','Comment does not disable the property.')
add('fetch-overridden-signal',F,1,'const c=new AbortController(); fetch("https://example.invalid",{signal:c.signal,...{signal:undefined}});','Later spread overrides the signal.')
add('fetch-no-call-comment',F,0,'// fetch("https://example.invalid");\nconst example="fetch(url)";','Comments/strings are not calls.')
add('fetch-nested-signal',F,1,'fetch("https://example.invalid",{headers:{signal:"text"}});','A nested key is not RequestInit.signal.')
add('fetch-global-member',F,1,'globalThis.fetch("https://example.invalid");','Real global fetch in a member form; tests declared coverage limitation.')

add('map-dropped-binding',M,1,'const tasks=[1,2].map(async x=>x);','Real array of promises dropped.')
add('map-bare-discard',M,1,'[1,2].map(async x=>x);','Bare real array map result dropped.')
add('map-await-array',M,1,'await [1,2].map(async x=>x);','Awaiting an ordinary array does not await its elements.')
add('map-combined',M,0,'const tasks=[1,2].map(async x=>x); await Promise.all(tasks);','Correct iterable of promises passed to real combiner.')
add('map-returned-binding',M,0,'export function f(){ const tasks=[1,2].map(async x=>x); return tasks; }','Returning an array transfers it to caller; not proof of dropped promises.')
add('map-helper-consumption',M,0,'async function settle(tasks){return await Promise.all(tasks)}\nconst tasks=[1,2].map(async x=>x); await settle(tasks);','Helper actually settles the array.')
add('map-aliased-consumption',M,0,'const tasks=[1,2].map(async x=>x); const pending=tasks; await Promise.all(pending);','Alias points to same array consumed by combiner.')
add('map-for-await',M,0,'const tasks=[1,2].map(async x=>x); for await (const result of tasks) { console.log(result); }','for-await unwraps each yielded promise.')
add('map-per-element-await',M,0,'const tasks=[1,2].map(async x=>x); for (const task of tasks) { await task; }','Each element explicitly awaited.')
add('map-inline-combiner',M,0,'await Promise.all([1,2].map(async x=>x));','Direct inline consumption.')
add('map-nested-array-combiner',M,1,'const tasks=[1,2].map(async x=>x); await Promise.all([tasks]);','Combiner does not recursively settle nested arrays.')
add('map-combiner-unrelated-callback',M,1,'await Promise.all([1].map(async ()=>{ [1,2].map(async x=>x); }));','Nested discarded inner map is not consumed by outer combiner.')
add('map-length-in-combiner',M,1,'const tasks=[1,2].map(async x=>x); await Promise.all([tasks.length]);','Reading array length in combiner does not settle elements.')
add('map-spread-into-combiner',M,0,'const tasks=[1,2].map(async x=>x); await Promise.all([...tasks]);','Spread passes individual promises.')
add('map-shadowed-combiner',M,1,'const Promise={all:async x=>null}; const tasks=[1,2].map(async x=>x); await Promise.all(tasks);','Same-named object does not perform promise settlement.')
add('map-await-object-containing-element',M,1,'const tasks=[1,2].map(async x=>x); for(const task of tasks){ await {task}; }','Awaiting object containing a promise does not unwrap its field.')
add('map-unrelated-scope-combiner',M,1,'const tasks=[1,2].map(async x=>x); function other(){ const tasks=[]; return Promise.all(tasks); }','Other binding cannot consume first array.')
add('map-local-object-method',M,0,'const object={async map(callback){return await callback(1)}}; await object.map(async x=>x);','Custom map is promise-returning and is properly awaited.')
add('map-returned-direct',M,0,'export function f(){return [1,2].map(async x=>x)}','Direct return transfers the array.')
add('map-filtered-chain-discard',M,1,'[1,2].filter(Boolean).map(async x=>x);','Dropped array behind chained receiver; tests declared coverage limitation.')
add('map-const-enclosing-function',M,1,'const work=()=>{ [1,2].map(async x=>x); }; await Promise.all([work]);','Passing the enclosing function value does not consume inner map results.')
add('map-async-function-callback',M,1,'const tasks=[1,2].map(async function(x){return x});','Async function callback has same promise-array semantics.')

R='import {useEffect} from "react";\n'
add('timer-positive',T,1,R+'useEffect(()=>{const timer=setTimeout(()=>{},100);},[]);','Effect starts a timer without cancellation cleanup.')
add('timer-cleanup',T,0,R+'useEffect(()=>{const timer=setTimeout(()=>{},100);return ()=>clearTimeout(timer);},[]);','Cleanup clears same handle.')
add('timer-window-cleanup',T,0,R+'useEffect(()=>{const timer=window.setTimeout(()=>{},100);return ()=>window.clearTimeout(timer);},[]);','Window qualification preserves timer identity and cleanup.')
add('timer-globalthis-cleanup',T,0,R+'useEffect(()=>{const timer=globalThis.setTimeout(()=>{},100);return ()=>globalThis.clearTimeout(timer);},[]);','Global qualification preserves cleanup.')
add('timer-local-effect-lookalike',T,0,'function useEffect(callback){callback()}\nuseEffect(()=>{setTimeout(()=>{},100);});','Local ordinary function is not a React effect.')
add('timer-local-timer-lookalike',T,0,R+'useEffect(()=>{const setTimeout=()=>42;const timer=setTimeout();},[]);','Synchronous local function is not a timer.')
add('timer-local-clear-lookalike',T,1,R+'useEffect(()=>{const clearTimeout=()=>{}; const timer=setTimeout(()=>{},100);return ()=>clearTimeout(timer);},[]);','Unrelated clearTimeout does not cancel timer.')
add('timer-shadowed-handle',T,1,R+'useEffect(()=>{const timer=setTimeout(()=>{},100);return ()=>{const timer=0;clearTimeout(timer);};},[]);','Cleanup clears different shadowed binding.')
add('timer-unused-clear-helper',T,1,R+'useEffect(()=>{const timer=setTimeout(()=>{},100);const cancel=()=>clearTimeout(timer);},[]);','Never invoked or returned helper is not cleanup.')
add('timer-wrong-handle',T,1,R+'useEffect(()=>{const first=setTimeout(()=>{},100);const second=setTimeout(()=>{},100);return ()=>clearTimeout(first);},[]);','Second timer is uncancelled.')
add('timer-concise-effect',T,1,R+'useEffect(()=>void setTimeout(()=>{},100),[]);','Concise effect returns undefined and creates an uncancelled timer.')
add('timer-alias-effect',T,1,'import {useEffect as effect} from "react";\neffect(()=>{setTimeout(()=>{},100);},[]);','Real React effect import alias; tests declared limitation.')
add('timer-namespace-effect',T,1,'import * as React from "react";\nReact.useEffect(()=>{setTimeout(()=>{},100);},[]);','Real namespace React effect.')
add('timer-outside-effect',T,0,'const timer=setTimeout(()=>{},100);','Outside this effect-specific rule.')
add('timer-helper-cleanup',T,0,R+'useEffect(()=>{let timer=0;const start=()=>{timer=setTimeout(()=>{},100);};start();return ()=>clearTimeout(timer);},[]);','Started helper timer cleared through shared handle.')

# Position witnesses are separate from behavioral cases: exact line/column claims.
LOC=[dict(name='map-location',rule=M,source='const xs=[1,2];\nxs.map(async x=>x);',expected=[{'line':2,'column':0}]),dict(name='timers-same-line',rule=T,source=R+'useEffect(()=>{setTimeout(()=>{},100);setTimeout(()=>{},100);},[]);',expected=[{'line':2,'column':15},{'line':2,'column':38}])]

def run(label,base):
 base=Path(base).resolve();seeds=OUT/'seeds';seeds.mkdir(exist_ok=True)
 definitions=OUT/'challenge-expectations.json'; text=json.dumps(CASES,indent=2)
 if definitions.exists():assert definitions.read_text()==text
 else:definitions.write_text(text)
 for case in CASES+LOC:
  f=seeds/(case['name']+'.ts')
  if f.exists():assert f.read_text()==case['source']
  else:f.write_text(case['source'])
 cmd=['node',str(base/'bin/cli.js'),'run',str(base/'doctors/async.mjs'),str(seeds),'--format','json'];p=subprocess.run(cmd,cwd=base,capture_output=True,text=True);(OUT/f'{label}-challenges-scan.json').write_text(p.stdout);(OUT/f'{label}-challenges.stderr').write_text(p.stderr)
 data=json.loads(p.stdout);finds=[dict(f,rule=c['rule']) for g in data['groups'] for c in g['checks'] for f in c['findings']];results=[]
 for c in CASES:
  actual=[f for f in finds if f['file']==c['name']+'.ts' and f['rule']==c['rule']];results.append({**{k:v for k,v in c.items() if k!='source'},'actual':len(actual),'passed':len(actual)==c['expected'],'findings':actual})
 loc=[]
 for c in LOC:
  actual=[{k:f[k] for k in ['line','column'] if k in f} for f in finds if f['file']==c['name']+'.ts' and f['rule']==c['rule']];loc.append({**c,'actual':actual,'passed':actual==c['expected']})
 summary={'label':label,'command':cmd,'exit':p.returncode,'passed':sum(r['passed'] for r in results),'failed':sum(not r['passed'] for r in results),'skipped':0,'results':results,'locations':loc};(OUT/f'{label}-challenges-results.json').write_text(json.dumps(summary,indent=2));print(label,summary['passed'],summary['failed']);print('\n'.join(f"FAIL {r['name']}: expected {r['expected']}, actual {r['actual']}" for r in results if not r['passed']));print('LOCATIONS',json.dumps(loc))
if __name__=='__main__':run(*sys.argv[1:])
