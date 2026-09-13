import pathlib,json,subprocess,re,sys
# Independent reviewer cases/assertions retained; only output/CLI paths are parameterized.
E=pathlib.Path(sys.argv[2]).resolve(); E.mkdir(parents=True,exist_ok=True)
R=pathlib.Path(__file__).resolve().parents[2]
H='export function helper() { return 42; }\n'
cases=[]
def case(name,seed,exports=(),duplicates=0,**kw):cases.append(dict(name=name,seed=seed,exports=sorted(exports),duplicates=duplicates,**kw))
case('original-test-consumer',{'src/helpers.ts':H,'src/helpers.test.ts':'import {helper} from "./helpers"; console.log(helper());'})
case('original-aliased-reexport',{'src/helpers.ts':H,'src/index.ts':'export {helper as publicHelper} from "./helpers";','src/app.ts':'import {publicHelper} from "./index"; console.log(publicHelper());'})
case('original-unrelated-same-name',{'src/a.ts':H,'src/b.ts':H.replace('42','41'),'src/index.ts':'import {helper} from "./b"; console.log(helper());'},['src/a.ts:helper'])
case('original-unrelated-dynamic-basename',{'src/a/helper.ts':'export function orphanA() { return 41; }','src/b/helper.ts':'export function usedB() { return 42; }','src/index.ts':'import("./b/helper").then(m => console.log(m.usedB()));'},['src/a/helper.ts:orphanA'])
case('original-generated-dist',{'dist/utility.js':'export const generatedOnly = 1;'})
case('original-literal-whitespace',{'src/a.ts':'export function normalizeLabel(v: string) { return v.trim().replaceAll("a b", "x"); }','src/b.ts':'export function normalizeLabel(v: string) { return v.trim().replaceAll("ab", "x"); }','src/index.ts':'import {normalizeLabel as a} from "./a"; import {normalizeLabel as b} from "./b"; console.log(a("a b"),b("a b"));'})
body='function work(v: string) { const text = v.trim(); if (!text) return ""; const changed = text.replaceAll("a b", "x"); return changed.toLowerCase(); }'
case('substantial-string-whitespace',{'a.ts':'export '+body,'b.ts':'export '+body.replace('"a b"','"ab"'),'index.ts':'import {work as a} from "./a"; import {work as b} from "./b"; console.log(a("x"),b("x"));'})
case('substantial-template-raw',{'a.ts':'export '+body.replace('"a b"',r'String.raw`a\nb`'),'b.ts':'export '+body.replace('"a b"',r'String.raw`a\x0ab`'),'index.ts':'import {work as a} from "./a"; import {work as b} from "./b"; console.log(a("x"),b("x"));'})
case('substantial-regex-whitespace',{'a.ts':'export '+body.replace('replaceAll("a b"','replace(/a b/g'),'b.ts':'export '+body.replace('replaceAll("a b"','replace(/ab/g'),'index.ts':'import {work as a} from "./a"; import {work as b} from "./b"; console.log(a("x"),b("x"));'})
case('substantial-duplicates-format-name',{'a.ts':'export '+body,'b.ts':'export '+body.replace('work(','other(').replace(';',';\n// comment\n'),'index.ts':'import {work} from "./a"; import {other} from "./b"; console.log(work("x"),other("x"));'},duplicates=2)
case('duplicate-captured-contracts',{'a.ts':'const factor=2; export function scale(xs: number[]) { const out=[]; const offset=1; for(const x of xs) { out.push(x*factor+offset); } return out; }','b.ts':'const factor=3; export function scale(xs: number[]) { const out=[]; const offset=1; for(const x of xs) { out.push(x*factor+offset); } return out; }','index.ts':'import {scale as a} from "./a"; import {scale as b} from "./b"; console.log(a([]),b([]));'},duplicates=2,captureExpected=True)
case('barrel-cycle-alias',{'src/a.ts':H,'src/barrel1.ts':'export * from "./barrel2"; export {helper as action} from "./a";','src/barrel2.ts':'export * from "./barrel1";','src/main.ts':'import {action} from "./barrel2"; action();'})
case('namespace-jsx-shadow',{'src/ui.tsx':'export function Widget(){return null;} export function Unused(){return null;}','src/page.tsx':'import * as ui from "./ui"; export default function Page(){return <ui.Widget/>;} function local(ui:any){return ui.Unused();} console.log(local);','src/index.ts':'import Page from "./page"; console.log(Page);'},['src/ui.tsx:Unused'])
case('generated-reference-with-dead-export',{'src/a.ts':H,'src/routeTree.gen.ts':'import {helper} from "./a"; export const generatedResult=helper();'})
case('type-query-bounded',{'a.ts':H+'export const unused=0;','index.ts':'type T = typeof import("./a").helper; const x: T = () => 42; console.log(x);'},['a.ts:unused'])
case('tsconfig-inherited-alias',{'tsconfig.base.json':json.dumps({'compilerOptions':{'baseUrl':'.','paths':{'@lib/*':['src/lib/*']}}}),'tsconfig.json':'{"extends":"./tsconfig.base.json"}','src/lib/a.ts':H,'src/index.ts':'import {helper} from "@lib/a"; helper();'})
case('static-import-dependency-unused-local',{'a.ts':H,'use.ts':'import {helper as unusedAlias} from "./a"; console.log("hello");'})
case('dynamic-destructure-alias',{'a.ts':H+'export const unused=0;','index.ts':'const {helper: run}=await import("./a"); run();'},['a.ts:unused'])
case('dynamic-namespace-reassigned',{'a.ts':H,'index.ts':'let ns = await import("./a"); ns = other; sink(ns);'},uncertainty=True)
case('entry-pattern-nested',{'any-doctor.analysis.json':'{"entryPoints":["src/routes/**"]}','src/routes/health.ts':H,'src/util.ts':'export const dead=1;'},['src/util.ts:dead'])
case('namespace-escape-bounded',{'a.ts':H,'b.ts':'export const dead=1;','index.ts':'import * as a from "./a"; sink(a);'},['b.ts:dead'],uncertainty=True)
case('missing-relative-bounded',{'src/a.ts':H,'src/index.ts':'import {missing} from "./not-there"; missing();'},['src/a.ts:helper'],uncertainty=True)
case('dynamic-template-parent-segment',{'src/plugins/present.ts':'export const placeholder=1;','src/utility.ts':H,'src/index.ts':'const name="../utility"; const mod = await import(`./plugins/${name}.ts`); console.log(mod.helper());'},[],uncertainty=True)
case('shadowed-require-literal',{'a.ts':H,'index.ts':'function require(value:string){ return value; } console.log(require("./a"));'},['a.ts:helper'])
case('shadowed-require-nonliteral',{'a.ts':H,'index.ts':'function require(value:string){ return value; } const name="nothing"; console.log(require(name));'},['a.ts:helper'])
case('dynamic-template-prefix-fragment',{'plugins/apple.ts':H,'unrelated.ts':'export const dead=1;','index.ts':'const suffix="pple"; (await import(`./plugins/a${suffix}.ts`)).helper();'},['unrelated.ts:dead'],uncertainty=True)
case('mts-authored-positive',{'src/helper.mts':H},['src/helper.mts:helper'])
case('default-namespace-reexport',{'a.ts':'export default function helper(){return 42;} export const spare=3;','barrel.ts':'export * as ns from "./a";','index.ts':'import {ns} from "./barrel"; console.log(ns.default());'})
case('missing-config-scope',{'shared/tool.ts':H,'apps/web/tsconfig.json':'{"extends":"@org/tsconfig/base.json"}','apps/web/main.ts':'import {helper} from "@shared/tool"; helper();'},[],uncertainty=True)
case('parse-error-loud',{'a.ts':'export const x = ;'},failure=True)
(E/'independent-seeds.json').write_text(json.dumps(cases,indent=2))
label=sys.argv[1]; cli=pathlib.Path(sys.argv[3]).resolve() if len(sys.argv)>3 else R/'bin/cli.js'; doctor=cli.parent.parent/'doctors/slop.mjs'
rows=[]
for c in cases:
 root=E/('challenges-'+label)/c['name'];root.mkdir(parents=True,exist_ok=True)
 for file,src in c['seed'].items(): p=root/file;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(src+'\n')
 p=subprocess.run(['node',str(cli),'run',str(doctor),str(root),'--format','json'],cwd=root,capture_output=True,text=True,timeout=60)
 try:d=json.loads(p.stdout)
 except: d={}
 fs=[dict(f,rule=k['rule']) for g in d.get('groups',[]) for k in g['checks'] for f in k['findings']]
 actual=sorted(f['file']+':'+re.search(r'no consumer found for ([\w$]+)',f['message'])[1] for f in fs if f['rule']=='export-without-any-consumer')
 duplicates=[f for f in fs if f['rule']=='identical-helper-body-in-two-modules']
 issues=[i for g in d.get('groups',[]) for i in g.get('analysisCoverage',{}).get('issues',[])]
 if c.get('failure'):ok=p.returncode!=0 and bool(d.get('crashed'))
 else:ok=p.returncode==0 and d.get('analysisAvailable')==True and actual==c['exports'] and len(duplicates)==c['duplicates'] and (not c.get('uncertainty') or bool(issues)) and (not c.get('captureExpected') or all('factor' in f['message'] and 'review' in f['message'] for f in duplicates))
 row={'name':c['name'],'passed':ok,'exitCode':p.returncode,'expected':{k:v for k,v in c.items() if k not in ['seed','name']},'exports':actual,'duplicates':len(duplicates),'coverageIssues':issues,'findings':fs,'crashed':d.get('crashed'),'stderr':p.stderr};rows.append(row)
 (E/(label+'-'+c['name']+'-scan.json')).write_text(p.stdout)
 print(c['name'],'PASS' if ok else 'FAIL',actual,'duplicates',len(duplicates),flush=True)
result={'label':label,'cli':str(cli),'passed':sum(r['passed'] for r in rows),'failed':sum(not r['passed'] for r in rows),'skipped':0,'rows':rows};(E/(label+'-independent-challenges.json')).write_text(json.dumps(result,indent=2));print('RESULT',label,result['passed'],result['failed'],flush=True)
