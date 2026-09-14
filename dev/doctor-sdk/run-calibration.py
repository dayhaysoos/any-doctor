"""Portable completion gates; preserve stdout/stderr and explicit exits beside JSON assertions.
Run local before committing shipped files, then packed against the exact source commit.
Evidence and generated sandboxes live outside the repository.
"""
import argparse, pathlib, subprocess, json, time, hashlib, re, shutil, os
P=argparse.ArgumentParser();P.add_argument('mode',choices=['local','packed']);P.add_argument('output');P.add_argument('frozen');P.add_argument('--candidate');a=P.parse_args()
R=pathlib.Path(__file__).resolve().parents[2];O=pathlib.Path(a.output).resolve();O.mkdir(parents=True,exist_ok=True);F=pathlib.Path(a.frozen).resolve();C=pathlib.Path(a.candidate).resolve() if a.candidate else R;label=a.mode

def write(name,value): (O/name).write_text(json.dumps(value,indent=2)+'\n')
def run(name,args,cwd=None,env=None,expected=0):
 t=time.monotonic();p=subprocess.run([str(x) for x in args],cwd=cwd or C,env=env,capture_output=True,text=True)
 (O/(name+'.stdout')).write_text(p.stdout);(O/(name+'.stderr')).write_text(p.stderr)
 write(name+'.command.json',dict(command=[str(x) for x in args],cwd=str(cwd or C),exit=p.returncode,wallMs=round((time.monotonic()-t)*1000)))
 assert p.returncode==expected,(name,p.returncode,p.stderr[-1200:]);return p

def manifest(name):
 m=json.loads((R/'docs/evidence/consumer-analysis/sift-manifest.json').read_text());bad=[]
 for x in m['files']:
  f=F/x['file']
  if not f.is_file() or f.stat().st_size!=x['bytes'] or hashlib.sha256(f.read_bytes()).hexdigest()!=x['sha256']:bad.append(x['file'])
 row=dict(expected=len(m['files']),matched=len(m['files'])-len(bad),changed=bad,manifestDigest=m['manifestDigest']);write(name,row);assert not bad

def counts(rows):return dict(passed=sum(bool(x['ok']) and not x.get('skipped') for x in rows),failed=sum(not x['ok'] and not x.get('skipped') for x in rows),skipped=sum(bool(x.get('skipped')) for x in rows))
def node(*args):return ['node',*args]
manifest(label+'-manifest-before.json')
summary={}
if label=='local':
 p=run('npm-test',['npm','test']);summary['automated']={k:int(re.search(r'(?:ℹ |# )'+term+r' (\d+)',p.stdout)[1]) for k,term in [('passed','pass'),('failed','fail'),('skipped','skipped')]};assert summary['automated']['passed']>=576 and summary['automated']['failed']==0
cli=C/'bin/cli.js';doctor=C/'doctors/async.mjs'
p=run(label+'-verify-all',node(cli,'verify','--all'))
summary['bundled']={k:len(re.findall(pattern,p.stdout)) for k,pattern in [('passed',r'  ✔ '),('failed',r'  ✘ '),('skipped',r'  – ')]};assert summary['bundled']['passed']>=265 and summary['bundled']['failed']==0 and summary['bundled']['skipped']==15
for fmt in ['json','human']:
 p=run(label+'-profiles-'+fmt,node(cli,'verify',doctor,*(['--format','json'] if fmt=='json' else [])))
 if fmt=='json':
  rows=json.loads(p.stdout)['results'];profiles=[x for x in rows if x['name'].startswith('challenge profile:')];summary['profiles']=counts(profiles);assert summary['profiles']==dict(passed=21,failed=0,skipped=0)
run(label+'-mutations',node(R/'dev/doctor-sdk/run-profile-mutations.mjs',O/(label+'-mutations')),cwd=C)
inputs=O/(label+'-inputs');inputs.mkdir(exist_ok=True);base=R/'docs/evidence/doctor-sdk-foundations/5a1aed2/00-baseline'
for name,folder in [('challenges.py','original'),('fresh.py','fresh')]:shutil.copyfile(base/folder/name,inputs/name)
write(label+'-independent-input-digests.json',{name:hashlib.sha256((inputs/name).read_bytes()).hexdigest() for name in ['challenges.py','fresh.py']})
for name,script in [('original','challenges.py'),('fresh','fresh.py')]:run(label+'-'+name,['python3',inputs/script,label,C])
original=json.loads((inputs/(label+'-challenges-results.json')).read_text());fresh=json.loads((inputs/(label+'-fresh-results.json')).read_text())
summary['original']={k:original[k] for k in ['passed','failed']};summary['fresh']={k:fresh[k] for k in ['passed','failed']};summary['locations']=dict(passed=sum(x['passed'] for x in original['locations']),failed=sum(not x['passed'] for x in original['locations']))
write(label+'-locations.json',original['locations']);assert summary['original']==dict(passed=55,failed=0) and summary['fresh']==dict(passed=20,failed=0) and summary['locations']==dict(passed=2,failed=0)
run(label+'-unavailable',node(R/'dev/async-analysis/check-unavailable.mjs',C,O/(label+'-unavailable')))
summary['unavailable']=json.loads((O/(label+'-unavailable/results.json')).read_text());assert summary['unavailable']['passed']==5 and summary['unavailable']['failed']==0
run(label+'-boundaries',node('--test',R/'test/sdk-candidate-boundaries.test.mjs'),env={**os.environ,'DOCTOR_CANDIDATE_ROOT':str(C)})
run(label+'-unknown-reporting',node('--test','--test-name-pattern=unknown recipe analysis',R/'test/doctor-sdk.test.mjs'),cwd=R,env={**os.environ,'DOCTOR_CANDIDATE_ROOT':str(C)})
perf=[]
for i in range(3):
 p=run(label+'-sift-'+str(i),['/usr/bin/time','-l',*node(cli,'run',doctor,F,'--format','json')]);scan=json.loads(p.stdout);rss=int(re.search(r'(\d+)\s+maximum resident set size',p.stderr)[1]);cmd=json.loads((O/(label+'-sift-'+str(i)+'.command.json')).read_text())
 stage=run(label+'-analysis-'+str(i),node(R/'dev/doctor-sdk/measure-analysis.mjs',C,F));perf.append(dict(wallMs=cmd['wallMs'],durationMs=scan['durationMs'],peakRssBytes=rss,stages=json.loads(stage.stdout)))
 assert scan['fileCount']==671 and scan['counts']['total']==9
 projection=dict(checks=scan['groups'][0]['checks'],narrowed=scan['groups'][0]['semantic']['narrowed']);write(label+'-sift-projection.json',projection)
summary['sift']=dict(files=scan['fileCount'],findings=scan['counts']['total'],narrowed=[{k:x[k] for k in ['check','reason','occurrences']} for x in scan['groups'][0]['semantic']['narrowed']]);write(label+'-performance.json',perf)
manifest(label+'-manifest-after.json');write(label+'-summary.json',summary);print(json.dumps(summary,indent=2))
