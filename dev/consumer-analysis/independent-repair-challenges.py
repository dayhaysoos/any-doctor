import pathlib,json,subprocess,re,sys
# Independent seeds and assertions unchanged; only output and checkout paths parameterized.
E=pathlib.Path(sys.argv[3]).resolve(); E.mkdir(parents=True,exist_ok=True);R=pathlib.Path(__file__).resolve().parents[2]
H='export function helper(){return 42;}';D='export const dead=13;';cases=[]
def add(name,seed,exports=(),issues=None,category='repair'):
 cases.append(dict(name=name,seed=seed,exports=sorted(exports),issues=issues,category=category))
base={'src/target.ts':H,'other/dead.ts':D,'src/plugins/present.ts':'export const present=5;'}
for name,value in [('parent','../target'),('separators','sub/../../target'),('encoded-parent','%2e%2e/target')]:
 add('template-'+name,{**base,'src/index.mjs':'const key='+json.dumps(value)+'; console.log((await import(`./plugins/${key}.ts`)).helper());'},issues=True)
for name,code in [
 ('fixed-suffix','const key="present"; await import(`./plugins/${key}/../../target.ts`);'),
 ('encoded-prefix','const key="target"; await import(`./plugins/%2e%2e/${key}.ts`);'),
 ('shadow-parameter','const key="present"; function run(key){return import(`./plugins/${key}.ts`);} run(process.argv[2]);'),
 ('mutable','let key="present"; key=process.argv[2]; await import(`./plugins/${key}.ts`);')]:
 add('template-'+name,{**base,'src/index.mjs':code},issues=True)
for name,code in [('literal','await import(`./plugins/${"present"}.ts`);'),('const','const key="present"; await import(`./plugins/${key}.ts`);'),('safe-shadow','const key="../target"; { const key="present"; await import(`./plugins/${key}.ts`); }'),('prefix-fragment','const key="sent"; await import(`./plugins/pre${key}.ts`);')]:
 add('template-bounded-'+name,{**base,'src/index.mjs':code},['src/target.ts:helper','other/dead.ts:dead'],True)
# Relative parent traversal with no interpolation is an exact resolved module, not a blanket uncertainty.
add('template-no-interpolation',{**base,'src/index.mjs':'console.log((await import(`./plugins/../target.ts`)).helper());'},['other/dead.ts:dead','src/plugins/present.ts:present'])
config={'apps/web/tsconfig.json':'{"extends":"@org/tsconfig/base.json"}','shared/tool.ts':H,'outer/dead.ts':D}
add('config-relative-preserves-outer-positive',{**config,'apps/web/index.ts':'import {helper} from "../../shared/tool";helper();'},['outer/dead.ts:dead'],True)
add('config-node-builtin-preserves-outer-positives',{**config,'apps/web/index.ts':'import fs from "node:fs";console.log(fs);'},['outer/dead.ts:dead','shared/tool.ts:helper'],True)
add('config-alias-target-after-reexport',{**config,'aaa/barrel.ts':'export {helper} from "../shared/tool";','apps/web/index.ts':'export {helper} from "@shared/tool";'},issues=True)
add('config-unsupported-mode-external-target',{'apps/web/tsconfig.json':'{"compilerOptions":{"moduleResolution":"classic"}}','apps/web/index.ts':'import {helper} from "@shared/tool";helper();','shared/tool.ts':H},issues=True)
add('config-valid-local-alias-keeps-unrelated',{'tsconfig.json':'{"compilerOptions":{"baseUrl":".","paths":{"@lib/*":["shared/*"]}}}','shared/tool.ts':H,'outer/dead.ts':D,'src/index.ts':'import {helper} from "@lib/tool";helper();'},['outer/dead.ts:dead'])
add('config-real-external-base',{**config,'apps/web/index.ts':'import {helper} from "@shared/tool";helper();','node_modules/@org/tsconfig/base.json':'{"compilerOptions":{"baseUrl":"../../../","paths":{"@shared/*":["shared/*"]},"moduleResolution":"bundler","module":"esnext"}}'},issues=True)
reqbase={'src/target.ts':H,'other/dead.ts':D};both=['src/target.ts:helper','other/dead.ts:dead'];dead=['other/dead.ts:dead']
for name,code in [('arrow','const require=x=>x;console.log(require("./target.ts"));'),('parameter','function f(require){return require("./target.ts");}console.log(f(x=>x));'),('destructured','const {require}={require:x=>x};console.log(require(process.argv[2]));'),('method','const x={require(v){return v;}};console.log(x.require("./target.ts"));')]:
 add('nonloader-'+name,{**reqbase,'src/index.mjs':code},both)
add('real-unbound-require',{**reqbase,'src/index.cjs':'console.log(require("./target.ts").helper());'},dead,True)
for name,code in [('named','import {createRequire} from "node:module"; const require=createRequire(import.meta.url); console.log(require("./target.ts").helper());'),('alias','import {createRequire as make} from "module"; const load=make(import.meta.url); console.log(load("./target.ts").helper());'),('namespace','import * as mod from "node:module"; const load=mod.createRequire(import.meta.url); console.log(load("./target.ts").helper());'),('nested-shadow','import {createRequire} from "node:module";const require=createRequire(import.meta.url);console.log(require("./target.ts").helper());function local(require){return require("../other/dead.ts");}console.log(local(x=>x));')]:
 add('real-factory-'+name,{**reqbase,'src/index.mjs':code},dead,True)
add('real-factory-other-base',{**reqbase,'src/index.mjs':'import {createRequire} from "node:module";const require=createRequire(new URL("../other/base.mjs",import.meta.url));console.log(require("./dead.ts"));'},issues=True)
add('real-factory-reassigned',{**reqbase,'src/index.mjs':'import {createRequire} from "node:module";let require=createRequire(import.meta.url);require=globalThis.loader;require("./target.ts");'},issues=True)
# These are real loaders, with direct variable initialization and a known import.meta.url base.
add('real-factory-default-import',{**reqbase,'src/index.mjs':'import mod from "node:module";const require=mod.createRequire(import.meta.url);console.log(require("./target.ts").helper());'},dead,True)
add('real-factory-computed-namespace',{**reqbase,'src/index.mjs':'import * as mod from "node:module";const require=mod["createRequire"](import.meta.url);console.log(require("./target.ts").helper());'},dead,True)
add('real-factory-parenthesized-ts',{**reqbase,'src/index.ts':'import {createRequire} from "node:module";const require=(createRequire(import.meta.url) as ReturnType<typeof createRequire>);console.log(require("./target.ts").helper());'},dead,True)
for ext in ['cts']:
 add('inherited-'+ext,{'src/target.'+ext:H},['src/target.'+ext+':helper'],category='inherited-extension')
seed=E/'new-seeds.json'
if seed.exists(): assert json.loads(seed.read_text())==cases
else:seed.write_text(json.dumps(cases,indent=2))
label=sys.argv[1];cli=pathlib.Path(sys.argv[2]).resolve() if len(sys.argv)>2 else R/'bin/cli.js';doctor=cli.parent.parent/'doctors/slop.mjs';rows=[]
for c in cases:
 root=E/('new-'+label)/c['name'];root.mkdir(parents=True,exist_ok=True)
 for f,src in c['seed'].items():p=root/f;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(src+'\n')
 run=subprocess.run(['node',str(cli),'run',str(doctor),str(root),'--format','json'],cwd=root,capture_output=True,text=True,timeout=60)
 try:d=json.loads(run.stdout)
 except:d={}
 fs=[dict(f,rule=k['rule']) for g in d.get('groups',[]) for k in g['checks'] for f in k['findings']]
 actual=sorted(f['file']+':'+re.search(r'no consumer found for ([\w$]+)',f['message'])[1] for f in fs if f['rule']=='export-without-any-consumer')
 issues=[i for g in d.get('groups',[]) for i in g.get('analysisCoverage',{}).get('issues',[])]
 ok=run.returncode==0 and d.get('analysisAvailable')==True and actual==c['exports'] and (c['issues'] is None or bool(issues)==c['issues'])
 (root/'scan.json').write_text(run.stdout) # Written after scan; outside all protected snapshots.
 rows.append({'name':c['name'],'category':c['category'],'passed':ok,'exitCode':run.returncode,'expectedExports':c['exports'],'actualExports':actual,'issues':issues,'seedDirectory':str(root),'findings':fs})
 print(label,c['name'],'PASS' if ok else 'FAIL',actual,flush=True)
(E/(label+'-new-challenges.json')).write_text(json.dumps({'label':label,'cli':str(cli),'passed':sum(r['passed'] for r in rows),'failed':sum(not r['passed'] for r in rows),'skipped':0,'rows':rows},indent=2))
