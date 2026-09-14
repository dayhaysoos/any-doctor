from pathlib import Path
import json,sys,subprocess
out=Path(__file__).resolve().parent;label=sys.argv[1];base=Path(sys.argv[2]).resolve();root=out/(label+'-degraded');root.mkdir(exist_ok=True)
selected={'map-dropped-binding','map-per-element-await','map-unrelated-scope-combiner','map-returned-binding','map-nested-array-combiner','map-combined'}
cases=[c for c in json.loads((out/'challenge-expectations.json').read_text()) if c['name'] in selected]
fixtures=[{'name':c['name'],'analysis':'off','seed':{'src/example.ts':c['source']},'expected':[{'rule':c['rule'],'file':'src/example.ts','line':1}] if c['expected'] else []} for c in cases]
(root/'async.mjs').write_bytes((base/'doctors/async.mjs').read_bytes());(root/'async.fixtures.mjs').write_text('export const fixtures = '+json.dumps(fixtures,indent=2)+';\n')
cmd=['node',str(base/'bin/cli.js'),'verify',str(root/'async.mjs')];p=subprocess.run(cmd,cwd=base,capture_output=True,text=True);(out/(label+'-degraded.log')).write_text(p.stdout+p.stderr)
passed=[c['name'] for c in cases if '✔ '+c['name'] in p.stdout];failed=[c['name'] for c in cases if c['name'] not in passed];result={'label':label,'command':cmd,'exit':p.returncode,'authoredPassed':len(passed),'authoredFailed':len(failed),'passed':passed,'failed':failed,'note':'Read full log for additional shared-corpus and legacy location-coverage rows; six authored cases intentionally test conservative claims with analysis disabled.'};(out/(label+'-degraded-results.json')).write_text(json.dumps(result,indent=2));print(json.dumps(result));print(p.stdout[-800:])
