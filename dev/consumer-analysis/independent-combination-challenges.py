import pathlib,json,subprocess,re,sys
E=pathlib.Path(sys.argv[3]).resolve();E.mkdir(parents=True,exist_ok=True);label=sys.argv[1];cli=pathlib.Path(sys.argv[2]).resolve();doctor=cli.parent.parent/'doctors/slop.mjs';cases=[]
base={'src/target.ts':'export function helper(){return 42;}','other/dead.ts':'export const dead=13;'};dead=['other/dead.ts:dead'];both=sorted(dead+['src/target.ts:helper'])
def add(name,code,expected,uncertain,execute=False,more=None):cases.append({'name':name,'seed':{**base,**(more or {}),'src/index.ts':code},'expected':expected,'uncertain':uncertain,'execute':execute})
for name,imp,fac in [('named','import {createRequire as make} from "node:module";','make'),('namespace','import * as mod from "module";','mod[("createRequire" as const)]'),('default','import mod from "node:module";','(mod!)[("createRequire" as string)!]')]:
 add('combined-wrappers-'+name,imp+' const load=(((('+fac+') as any)!)(((import.meta[("url" as const)] as string)!)) satisfies Function); console.log(((load as any)!)((("./target.ts" as string)!)).helper());',dead,True,True)
add('multi-hop-factory-and-loader-alias','import {createRequire as make} from "node:module"; const a=make; const b=(a as typeof make);const r=b(import.meta.url);const s=r;const t=(s as typeof r)!; console.log(t("./target.ts").helper());',dead,True,True)
add('shared-loader-two-targets','import {createRequire} from "module";const load=createRequire(import.meta.url);console.log(load("./target.ts").helper(),load("./second.ts").another());',dead,True,True,{'src/second.ts':'export function another(){return 43;}'})
add('ordinary-wrapper-require','const require=(((v:string)=>v) as (v:string)=>string)!; console.log((require as Function)("./target.ts"));',both,False,True)
add('ordinary-shadowed-module','import mod from "node:module";function run(mod:{createRequire:Function}){const require=mod.createRequire(import.meta.url);return require("./target.ts");}console.log(run({createRequire:()=>((v:string)=>v)}));',both,False,True)
add('resolve-computed-alias-wrappers','import {createRequire} from "module";const r=createRequire(import.meta.url);const resolve=(r[("resolve" as const)] as typeof r.resolve)!;console.log(resolve("./target.ts"));',both,False,True)
add('conditional-known-base','import {createRequire} from "module";const r=createRequire(import.meta.url);const load=Date.now()>0 ? (r as typeof r) : ((v:string)=>v);console.log((load("./target.ts") as any).helper());',dead,True,True)
add('unrelated-unknown-call','declare const ordinary: (v:string)=>string;console.log(ordinary("./target.ts"));',both,False)
add('unrecognized-factory-selection','import * as mod from "module";const key=process.argv[2];const r=(mod as any)[key](import.meta.url);r("./target.ts");',[],True)
add('known-loader-unknown-base','import {createRequire} from "module";const r=createRequire(new URL("../other/base.mjs",import.meta.url));console.log(r("./dead.ts"));',[],True,True)
(E/(label+'-extra-seeds.json')).write_text(json.dumps(cases,indent=2));rows=[]
for c in cases:
 root=E/(label+'-extra')/c['name'];root.mkdir(parents=True)
 for f,s in c['seed'].items():p=root/f;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(s+'\n')
 p=subprocess.run(['node',str(cli),'run',str(doctor),str(root),'--format','json'],cwd=root,capture_output=True,text=True,timeout=60)
 try:d=json.loads(p.stdout)
 except:d={}
 fs=[dict(f,rule=k['rule']) for g in d.get('groups',[]) for k in g['checks'] for f in k['findings']];actual=sorted(f['file']+':'+re.search(r'no consumer found for ([\w$]+)',f['message'])[1] for f in fs if f['rule']=='export-without-any-consumer');issues=[i for g in d.get('groups',[]) for i in g.get('analysisCoverage',{}).get('issues',[])];ok=p.returncode==0 and d.get('analysisAvailable')==True and actual==sorted(c['expected']) and bool(issues)==c['uncertain'];row={'name':c['name'],'passed':ok,'exitCode':p.returncode,'actual':actual,'expected':c['expected'],'issues':issues,'seedDirectory':str(root)}
 if c['execute']:
  run=subprocess.run(['node',str(root/'src/index.ts')],cwd=root,capture_output=True,text=True);row['runtime']={'exitCode':run.returncode,'stdout':run.stdout,'stderr':run.stderr}
 (E/(label+'-extra-'+c['name']+'.json')).write_text(p.stdout);rows.append(row);print(c['name'],'PASS' if ok else 'FAIL',actual,flush=True)
result={'passed':sum(r['passed'] for r in rows),'failed':sum(not r['passed'] for r in rows),'skipped':0,'rows':rows};(E/(label+'-extra-results.json')).write_text(json.dumps(result,indent=2));print(json.dumps({k:result[k] for k in ['passed','failed','skipped']}));sys.exit(1 if result['failed'] else 0)
