import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { buildCtx, setAnalysisDisabled, probeAnalysisAvailable } from "./sdk.js";
import type { CheckMeta, DoctorMeta, ExpectedFinding, Finding, Fixture, FixtureResult, RecipeProfileDeclaration, RunResult } from "./contract.js";
import { withinDir } from "./contract.js";
import * as contract from "./contract.js";

// The Certification harness: every verify-mode policy in one module, behind
// one interface — certify(mod, fixtures) -> results. The policies: the claim
// contract (unstatable claims are unshippable), the per-fixture gate, the
// shared innocent corpus (known-innocent shapes must stay silent), the
// per-check location coverage (explicit, context-preserving witnesses),
// and the shared sensitivity corpus (confirmed-real patterns must be found).
// The doctor loader owns Doctor-run choreography — decode, confine, frame —
// and calls this module once; prevention tiers land here, not in its main().

export interface DoctorModule {
  meta?: unknown;
  doctor?: (ctx: ReturnType<typeof buildCtx>["ctx"]) => unknown;
}

// One execution of a doctor program against a root, framed as a run result.
// Owned here because both halves need it: the loader's run mode and every
// certification sandbox. Typed, not Record<string, unknown> — consumers
// (certify, the loader frame) read .findings and .meta off it directly.
export async function runOnce(root: string, mod: DoctorModule, opts: { includeTests: boolean }): Promise<RunResult> {
  const started = Date.now();
  const { ctx, getFindings, getAnalysisCoverage } = buildCtx(root, opts);
  const fileCount = ctx.files.list().length;
  const result = mod.doctor!(ctx);
  if (!result || typeof (result as Promise<unknown>).then !== "function") {
    throw new Error("doctor() must be async — declare it `export async function doctor(ctx)`");
  }
  return (result as Promise<void>).then(() => {
    const analysisCoverage = getAnalysisCoverage();
    return {
      protocolVersion: contract.PROTOCOL_VERSION,
      kind: "run" as const,
      root,
      fileCount,
      durationMs: Date.now() - started,
      meta: mod.meta as DoctorMeta,
      findings: getFindings() as Finding[],
      ...(analysisCoverage ? { analysisCoverage } : {}),
    };
  });
}

// The claim contract (D23): certification requires each declared check to
// state the observable condition it establishes, its innocent lookalikes,
// and - when it needs the identity engine - what happens on unknown. Prose
// impact is not a testable claim. Thrown before any sandbox runs; the
// loader renders the problems and exits 3.
export class ClaimContractViolation extends Error {
  constructor(readonly problems: string[]) {
    super("claim contract violations:\n  " + problems.join("\n  "));
    this.name = "ClaimContractViolation";
  }
}

export function validateClaimContract(mod: DoctorModule): void {
  const checks = (mod.meta as { checks?: unknown[] } | undefined)?.checks;
  if (!Array.isArray(checks)) return;
  const problems: string[] = [];
  for (const c of checks as Record<string, unknown>[]) {
    if (typeof c.claim !== "string" || c.claim.trim().length === 0) {
      problems.push(`check "${String(c.id)}": claim is required — one sentence, the observable condition detected, not the consequence`);
    }
    if (!Array.isArray(c.lookalikes) || (c.lookalikes as unknown[]).length === 0) {
      problems.push(`check "${String(c.id)}": lookalikes is required — at least one innocent shape that must stay silent`);
    }
    if (c.reportingUnit !== undefined && !["occurrence", "file", "project"].includes(String(c.reportingUnit))) {
      problems.push(`check "${String(c.id)}": reportingUnit must be occurrence, file, or project`);
    }
    if (Array.isArray(c.needs) && (c.needs as unknown[]).length > 0
      && (c.onUnknown !== "narrow" && c.onUnknown !== "skip")) {
      problems.push(`check "${String(c.id)}": onUnknown is required when needs is declared — "narrow" or "skip"`);
    }
  }
  if (problems.length > 0) throw new ClaimContractViolation(problems);
}

const SKIP_ANALYSIS = "analysis engine unavailable — pins the analysis-on path";

// The result-row constructors: every policy speaks in the same row shape,
// so a verify frame's consumers never see policy-specific spellings.
const okRow = (name: string): FixtureResult => ({ name, ok: true, missing: [], unexpected: [] });
const skipRow = (name: string): FixtureResult => ({ ...okRow(name), skipped: SKIP_ANALYSIS });
const errorRow = (name: string, e: unknown): FixtureResult => ({
  name, ok: false, missing: [], unexpected: [],
  error: e instanceof Error ? e.message : String(e),
});

function materializeSeed(tmp: string, rel: string, content: string): void {
  const abs = path.resolve(tmp, rel);
  if (!withinDir(abs, tmp)) {
    throw new Error(`fixture seed path escapes the sandbox: ${rel}`);
  }
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
}

// The one sandbox lifecycle: materialize a seed into a fresh temp dir, run,
// clean up. A crashing sandbox is a named failing result (or the caller's
// error row) — siblings always run.
async function inSandbox<T>(seed: Record<string, string>, run: (tmp: string) => Promise<T>): Promise<T> {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "any-doctor-verify-"));
  try {
    for (const [rel, content] of Object.entries(seed)) materializeSeed(tmp, rel, content);
    return await run(tmp);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// The one corpus walker: a directory tree as a seed map. `skip` carves out
// manifest files (the sensitivity corpus's expect.json).
function collectSeed(dir: string, prefix: string, seed: Record<string, string>, skip?: string): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    const rel = prefix ? prefix + "/" + entry.name : entry.name;
    if (entry.isDirectory()) collectSeed(abs, rel, seed, skip);
    else if (entry.name !== skip) seed[rel] = fs.readFileSync(abs, "utf8");
  }
}

// doctor-reliability's witness law as one named predicate: an occurrence
// check needs two distinct positions of that check in one file. A line-only
// expectation overlaps every column on its line, so it counts once no
// matter how many column-exact siblings share the line (D28's overlap fix).
function distinctLocationsInFile(hits: ExpectedFinding[]): boolean {
  const files = new Map<string, Map<number, Set<number | undefined>>>();
  for (const hit of hits) {
    const lines = files.get(hit.file) ?? new Map<number, Set<number | undefined>>();
    const columns = lines.get(hit.line) ?? new Set<number | undefined>();
    columns.add(hit.column); lines.set(hit.line, columns); files.set(hit.file, lines);
  }
  return [...files.values()].some((lines) => [...lines.values()]
    .reduce((count, columns) => count + (columns.has(undefined) ? 1 : columns.size), 0) >= 2);
}

// The certification entry point: every policy, in gate order, as result
// rows a verify frame can carry.
export async function certify(mod: DoctorModule, fixtures: Fixture[]): Promise<FixtureResult[]> {
  validateClaimContract(mod);
  const results: FixtureResult[] = [];
  // Only a doctor whose checks declare analysis needs can have
  // analysis-on sandboxes — probing anyone else would make a channel-less
  // direct invocation fail fixtures that never touch analysis at all.
  const declaresNeeds = contract.narrowedCheckIds(mod.meta as DoctorMeta).length > 0;
  let analysisAvailable: boolean | undefined;
  // The fixture loop's own rows, keyed by fixture — the location-coverage
  // witness asks "did THIS fixture pass", never "which row is this index".
  const rowByFixture = new Map<Fixture, FixtureResult>();
  // The one skip policy (D25): an analysis-on sandbox whose engine is not
  // installed here is an honest skip, not a failure — expectations belong
  // to the full-power path. One decision for every policy that asks.
  const skipFor = async (analysisOn: boolean): Promise<boolean> => {
    if (!declaresNeeds || !analysisOn) return false;
    if (analysisAvailable === undefined) {
      analysisAvailable = await inSandbox<boolean>({}, async (tmp) => probeAnalysisAvailable(tmp));
    }
    return analysisAvailable === false;
  };
  for (const fixture of fixtures) {
    try {
      // The fixture's declared analysis mode: "off" forces the degraded
      // path (pinning the narrowed behavior); the default "on" runs with
      // the engine — and skips honestly when it is not installed here,
      // rather than failing a fixture whose expectations belong to the
      // full-power path.
      setAnalysisDisabled(fixture.analysis === "off");
      if (await skipFor(fixture.analysis !== "off")) {
        results.push(skipRow(fixture.name));
        continue;
      }
      // Verify always lists everything (includeTestsFor): the sandbox is
      // the doctor's own world — a seed named *.test.ts is deliberate
      // test data (effect-v4-kitlangton's sleep-in-test depends on it).
      const result = await inSandbox(fixture.seed, (tmp) => runOnce(tmp, mod, { includeTests: fixture.includeTests ?? true }));
      const diff = contract.compareFindings(fixture.expected, result.findings);
      const row = { name: fixture.name, ok: diff.missing.length === 0 && diff.unexpected.length === 0, ...diff };
      results.push(row); rowByFixture.set(fixture, row);
    } catch (e) {
      results.push(errorRow(fixture.name, e));
    } finally {
      setAnalysisDisabled(false);
    }
  }
  // Recipe declarations select maintained adversarial profiles. The generated
  // sources vary only by serialized selectors; labels and expectations stay
  // host-owned, deterministic, and separate from author fixtures.
  for(const check of (mod.meta as DoctorMeta).checks??[]){
    if(!check.recipe)continue;
    for(const fixture of challengeProfileFixtures(check)){
      const name=`challenge profile: ${check.recipe.name} / ${check.id} / ${fixture.name}`;
      try{
        setAnalysisDisabled(fixture.analysis==='off');
        const result=await inSandbox(fixture.seed,tmp=>runOnce(tmp,mod,{includeTests:true}));
        const diff=contract.compareFindings(fixture.expected,result.findings);
        results.push({name,ok:!diff.missing.length&&!diff.unexpected.length,...diff});
      }catch(e){results.push(errorRow(name,e));}
      finally{setAnalysisDisabled(false);}
    }
  }
  // The shared innocent corpus (D23): files that look guilty but aren't —
  // the audit counterexamples as commons. Every doctor runs against them
  // with expected: []; a finding here is a false positive by definition,
  // whoever wrote the check.
  const innocentDir = corpusDir("innocent");
  if (innocentDir !== null) {
    const seed: Record<string, string> = {};
    collectSeed(innocentDir, "", seed);
    try {
      const diff = await inSandbox(seed, (tmp) => runOnce(tmp, mod, { includeTests: true }))
        .then((r) => contract.compareFindings([], r.findings));
      results.push({
        name: "shared innocent corpus (" + Object.keys(seed).length + " files)",
        ok: diff.missing.length === 0 && diff.unexpected.length === 0,
        ...diff,
      });
    } catch (e) {
      results.push(errorRow("shared innocent corpus", e));
    }
  }
  // Explicit, context-preserving witnesses per check replace source rewriting.
  // One sibling's fixture cannot establish another check's location coverage.
  for (const check of (mod.meta as DoctorMeta).checks ?? []) {
    const name = `location coverage: ${check.id}`;
    if (!check.reportingUnit) {
      results.push({ ...okRow(name), skipped: "reporting unit undeclared — location coverage not exercised" });
      continue;
    }
    if (check.needs?.length && await skipFor(true)) {
      results.push(skipRow(name));
      continue;
    }
    const witness = fixtures.find((fixture) => {
      const row = rowByFixture.get(fixture);
      if (row === undefined || !row.ok || row.skipped !== undefined) return false;
      if (check.needs !== undefined && check.needs.length > 0 && fixture.analysis === "off") return false;
      const hits = fixture.expected.filter(f => f.rule === check.id);
      if (check.reportingUnit !== "occurrence") return hits.length > 0;
      return distinctLocationsInFile(hits);
    });
    if (witness) results.push(okRow(name));
    else {
      const reason = check.reportingUnit === "occurrence"
        ? "requires a passing fixture with two distinct locations of this check in one file"
        : "requires a passing positive fixture for this check";
      const severity = check.severity ?? (mod.meta as DoctorMeta).severity;
      results.push(severity === "info" ? { ...okRow(name), skipped: reason } : errorRow(name, reason));
    }
  }
  // The sensitivity corpus (D24): the innocent corpus's complement —
  // confirmed-real patterns from the audits, patterns that MUST produce
  // findings. Each case directory carries its seed files plus an expect.json
  // mapping doctor id -> expected findings; a doctor only runs the cases it
  // has stakes in.
  const sensDir = corpusDir("sensitivity");
  if (sensDir !== null) {
    for (const entry of fs.readdirSync(sensDir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (!entry.isDirectory()) continue;
      const caseDir = path.join(sensDir, entry.name);
      const expectPath = path.join(caseDir, "expect.json");
      if (!fs.existsSync(expectPath)) continue;
      const name = `sensitivity: ${entry.name}`;
      let manifest: { expect?: Record<string, unknown> };
      try {
        manifest = JSON.parse(fs.readFileSync(expectPath, "utf8"));
      } catch (e) {
        results.push({ ...okRow(name), ok: false, error: "unreadable expect.json: " + (e instanceof Error ? e.message : String(e)) });
        continue;
      }
      const expected = manifest?.expect?.[String((mod.meta as DoctorMeta).id)];
      if (!Array.isArray(expected)) continue;
      try {
        const seed: Record<string, string> = {};
        collectSeed(caseDir, "", seed, "expect.json");
        if (await skipFor(true)) {
          results.push(skipRow(name));
          continue;
        }
        const diff = await inSandbox(seed, (tmp) => runOnce(tmp, mod, { includeTests: true }))
          .then((r) => contract.compareFindings(expected as ExpectedFinding[], r.findings));
        results.push({ name, ok: diff.missing.length === 0 && diff.unexpected.length === 0, ...diff });
      } catch (e) {
        results.push(errorRow(name, e));
      }
    }
  }
  return results;
}

const occurrence=(source:string,rule:string,needle:string,nth=0):ExpectedFinding=>{const offset=[...source.matchAll(new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'g'))][nth]?.index;if(offset===undefined)throw new Error(`profile occurrence missing: ${needle}`);const before=source.slice(0,offset),line=before.split('\n').length,column=offset-(before.lastIndexOf('\n')+1);return {rule,file:'profile.ts',line,column};};
const profile=(name:string,source:string,expected:ExpectedFinding[],analysis?:'on'|'off'):Fixture=>({name,seed:{'profile.ts':source},expected,...(analysis?{analysis}:{})});

/** Deterministic extension point for maintained recipe challenge cases. */
export function challengeProfileFixtures(check:CheckMeta):Fixture[]{
  const declaration=check.recipe;if(!declaration)return [];
  return declaration.name==='unhandled-value'?unhandledProfile(check.id,declaration):declaration.name==='resource-without-release'?resourceProfile(check.id,declaration):optionProfile(check.id,declaration);
}

function unhandledProfile(rule:string,declaration:Extract<RecipeProfileDeclaration,{name:'unhandled-value'}>):Fixture[]{
  const member=declaration.query.producer.member,p=`[1].${member}(async value=>value)`;
  const positive=`${p};`,lookalike=`const object={${member}:async callback=>callback(1)};object.${member}(async value=>value);`,transfer=`function own(){return ${p}}`,unknown=`const items=getItems();items.${member}(async value=>value);\n${positive}`,same=`${positive}${positive}`;
  return [
    profile('genuine positive',positive,[occurrence(positive,rule,p)]),
    profile('valid lookalike and shadowed producer',lookalike,[]),
    profile('ownership transfer',transfer,[]),
    profile('unsupported receiver with positive neighbor',unknown,[occurrence(unknown,rule,p)]),
    profile('two same-line occurrences',same,[occurrence(same,rule,p,0),occurrence(same,rule,p,1)]),
    profile('analysis unavailable',positive,[],'off'),
  ];
}

function optionProfile(rule:string,declaration:Extract<RecipeProfileDeclaration,{name:'required-or-recommended-option'}>):Fixture[]{
  const query=declaration.query,callee=query.call.globals?.[0];if(!callee)return [];
  const option=query.option.option,positive=`${callee}("payload",{})`,value=option==='signal'?'new AbortController().signal':'true';
  const present=`${callee}("payload",{${option}:${value}});`,root=callee.split('.')[0],shadow=callee.includes('.')?`function probe(${root}){${callee}("payload",{})}`:`function probe(${callee}){${callee}("payload",{})}`;
  const alias=`const invoke=${callee};invoke("payload",{});`,unknown=`const options={};configure(options);${callee}("payload",options);\n${positive};`,same=`${positive};${positive};`;
  return [
    profile('genuine absence positive',`${positive};`,[occurrence(`${positive};`,rule,positive)]),
    profile('present option lookalike',present,[]),
    profile('shadowed call identity',shadow,[]),
    profile('global call alias',alias,[occurrence(alias,rule,'invoke("payload",{})')]),
    profile('unknown options with positive neighbor',unknown,[occurrence(unknown,rule,positive)]),
    profile('two same-line occurrences',same,[occurrence(same,rule,positive,0),occurrence(same,rule,positive,1)]),
    profile('analysis unavailable',`${positive};`,[],'off'),
  ];
}

function resourceProfile(rule:string,declaration:Extract<RecipeProfileDeclaration,{name:'resource-without-release'}>):Fixture[]{
  const query=declaration.query,acquire=query.acquisition.globals?.[0],ownerSource=query.owner.identity.imports?.[0]?.source,ownerName=query.owner.identity.imports?.[0]?.names.find(name=>!name.includes('.')&&!name.includes('*')),release=query.release[0];if(!acquire||!ownerSource||!ownerName||!release)return [];
  const head=`import {${ownerName} as owner} from ${JSON.stringify(ownerSource)};\n`,call=`${acquire}(()=>{},1)`,positive=`${head}owner(()=>{${call};},[]);`,lookalike=`${head}owner(()=>{function probe(${acquire}){${acquire}(()=>{},1)}\n${call};},[]);`,released=`${head}owner(()=>{const handle=${call};return()=>${release}(handle)},[]);`,conditional=`${head}owner(()=>{const handle=${call};return()=>{if(flag)${release}(handle)}},[]);\nowner(()=>{${call};},[]);`,same=`${head}owner(()=>{${call};${call};},[]);`;
  const conditionalExpected=declaration.query.reportUnknown?.includes('unsupported-expression')?[occurrence(conditional,rule,call,0),occurrence(conditional,rule,call,1)]:[occurrence(conditional,rule,call,1)];
  return [
    profile('genuine unreleased positive',positive,[occurrence(positive,rule,call)]),
    profile('shadowed acquisition with positive neighbor',lookalike,[occurrence(lookalike,rule,call,1)]),
    profile('exact handle release',released,[]),
    profile('unknown cleanup with positive neighbor',conditional,conditionalExpected),
    profile('two same-line occurrences',same,[occurrence(same,rule,call,0),occurrence(same,rule,call,1)]),
    profile('analysis unavailable',positive,[],'off'),
  ];
}

// A shipped corpus directory, resolved next to the compiled module (bin/'s
// sibling fixtures/), or null when absent — an unbundled checkout still
// certifies, just without the commons. ANY_DOCTOR_CORPUS_ROOT is the test
// seam: tests point the harness at their own corpus trees instead of
// planting synthetic stakes in the shipped commons.
function corpusDir(name: string): string | null {
  const override = process.env.ANY_DOCTOR_CORPUS_ROOT;
  if (override !== undefined && override !== "") {
    const dir = path.join(path.resolve(override), name);
    return fs.existsSync(dir) ? dir : null;
  }
  try {
    const dir = fs.realpathSync(new URL("../fixtures/" + name, import.meta.url));
    return fs.existsSync(dir) ? dir : null;
  } catch {
    return null;
  }
}
