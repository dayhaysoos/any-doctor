from pathlib import Path
import json,subprocess,sys
O=Path(__file__).parent;D=O/'fresh-seeds';D.mkdir(exist_ok=True)
F='fetch-calls-without-abortsignal';M='unawaited-async-map';T='uncleared-settimeout-in-effect';R='import {useEffect} from "react";'
rows=[]
def add(name,rule,expected,source,reason):
 control={F:'fetch("/positive");',M:'[1].map(async x=>x);',T:R+'useEffect(()=>{setTimeout(()=>{},1)},[]);'}[rule]
 rows.append(dict(name=name,rule=rule,expected=expected,source=source+'\n'+control,reason=reason))
add('return-await-array',M,0,'async function f(){const tasks=[1].map(async x=>x);return await tasks;}','Await preserves an ordinary array; returning it transfers ownership.')
add('return-await-inline',M,0,'async function f(){return await [1].map(async x=>x);}','Same transfer in inline expression.')
add('return-choice-array',M,0,'function f(flag){const tasks=[1].map(async x=>x);return flag?tasks:{tasks};}','Both branches transfer promise array; cannot establish drop.')
add('yield-array',M,0,'function* f(){const tasks=[1].map(async x=>x);yield tasks;}','Generator yields ownership to caller.')
add('spread-helper-consumption',M,0,'async function settle(...items){return Promise.all(items)}const tasks=[1].map(async x=>x);await settle(...tasks);','Rest helper settles individual promises; spread is transfer.')
add('spread-opaque-consumption',M,0,'const tasks=[1].map(async x=>x);consume(...tasks);','Unknown consumer receives individual promises; abstain.')
add('push-spread-consumption',M,0,'const tasks=[1].map(async x=>x);const pending=[];pending.push(...tasks);await Promise.all(pending);','Array push transfers individual promises to settled array.')
add('combiner-spread-arguments',M,0,'const tasks=[1].map(async x=>x);await Promise.all(...[tasks]);','Argument spread passes tasks as first iterable.')
add('return-void-array',M,1,'function f(){const tasks=[1].map(async x=>x);return void tasks;}','Void discards array; ownership does not transfer.')
add('return-length-array',M,1,'function f(){const tasks=[1].map(async x=>x);return tasks.length;}','Returning length does not transfer promises.')
add('await-array-only',M,1,'async function f(){const tasks=[1].map(async x=>x);await tasks;}','Awaiting array without transfer drops elements.')
add('helper-void-array',M,1,'function ignore(...items){return undefined}const tasks=[1].map(async x=>x);ignore(...tasks);','Known helper discards elements.')
add('fetch-prototype-signal',F,0,'const c=new AbortController();fetch("/",{__proto__:{signal:c.signal}});','Dictionary inherited property supplies signal.')
add('fetch-prototype-null',F,1,'fetch("/",{__proto__:{signal:null}});','Inherited null lacks cancellation.')
add('fetch-prototype-own-null',F,1,'const c=new AbortController();fetch("/",{__proto__:{signal:c.signal},signal:null});','Own null overrides inherited signal.')
add('fetch-request-copy',F,0,'const c=new AbortController();const r=new Request("https://example.invalid",{signal:c.signal});fetch(new Request(r));','Request copy retains signal.')
add('timer-return-await-cleanup',T,0,R+'useEffect(()=>{const h=setTimeout(()=>{},1);return ()=>{clearTimeout(h)}},[]);','Normal cleanup control.')
add('timer-guarded-callback',T,1,R+'useEffect(()=>{let alive=true;setTimeout(()=>{if(!alive)return;work()},1);return()=>{alive=false}},[]);','Timer remains scheduled; wording must preserve cancellation guards.')
add('timer-cleanup-call-parameter',T,0,R+'function stop(h){clearTimeout(h)}useEffect(()=>{const h=setTimeout(()=>{},1);return()=>stop(h)},[]);','Direct helper actually cancels handle.')
add('timer-cleanup-factory',T,0,R+'function makeCleanup(h){return()=>clearTimeout(h)}useEffect(()=>{const h=setTimeout(()=>{},1);return makeCleanup(h)},[]);','Known documented unresolved factory; unnecessary review candidate.')
for row in rows:(D/(row['name']+'.ts')).write_text(row['source'])
(O/'fresh-expectations.json').write_text(json.dumps(rows,indent=2))
label,base=sys.argv[1],Path(sys.argv[2]);p=subprocess.run(['node',str(base/'bin/cli.js'),'run',str(base/'doctors/async.mjs'),str(D),'--format','json'],cwd=base,text=True,capture_output=True);(O/(label+'-fresh-scan.json')).write_text(p.stdout);data=json.loads(p.stdout);findings=[dict(f,rule=c['rule']) for g in data['groups'] for c in g['checks'] for f in c['findings']]
for row in rows:
 actual=[f for f in findings if f['file']==row['name']+'.ts' and f['rule']==row['rule']];row['actualSubject']=sum(f['line']==1 for f in actual);row['controlCount']=sum(f['line']==2 for f in actual);row['passed']=row['actualSubject']==row['expected'] and row['controlCount']==1;row['findings']=actual
result=dict(label=label,exit=p.returncode,passed=sum(r['passed'] for r in rows),failed=sum(not r['passed'] for r in rows),skipped=0,rows=rows);(O/(label+'-fresh-results.json')).write_text(json.dumps(result,indent=2));print(label,result['passed'],result['failed']);print('\n'.join(f"{r['name']}: expected {r['expected']} actual {r['actualSubject']} control {r['controlCount']}" for r in rows if not r['passed']))
