export const meta = {
  id: "openrouter",
  description: "OpenRouter discipline: stream errors surfaced, keep-alives skipped, cancellations that stop billing.",
  severity: "warning",
  category: "openrouter",
  blindSpots: [
    "OpenRouter context is detected by the file mentioning it anywhere (URL, import, baseURL); files that route through an unmarked wrapper are not covered.",
    "Stream-error and keep-alive checks reason per file: an error check that lives in a different file from the consumption loop is not seen, and midstream-error-ignored reports the first consumption loop per file (later loops in the same file are not separately counted).",
    "Abort and retry checks pair the OpenRouter marker with the call on the same line: a multi-line fetch whose URL lands on the following line is not recognized; framework-level interceptors and SDK-managed backoff are not recognized.",
    "Cost/token accounting (usage.cost) is deliberately not checked: file-level absence reasoning false-positives on apps whose wrapper logs usage elsewhere.",
    "Fixture-named files (*.fixtures.mjs) in the target are skipped: they are doctor test data, not target source.",
  ],
  checks: [
    {
      id: "midstream-error-ignored",
      description: "A streamed OpenRouter response is consumed without ever checking for mid-stream errors",
      severity: "warning",
      revision: 1,
      impact: "After headers commit, OpenRouter keeps the status at 200 and delivers failures as SSE events — the docs note the error chunk 'can be the first and only event'. A loop that only reads delta.content records a silent empty reply as success.",
      why: "OpenRouter's stream protocol puts errors inside the 200-OK body: a top-level error field on the chunk, with choices[0].finish_reason === \"error\". Neither the HTTP status nor the types say anything is wrong.",
      fix: "Check each chunk: `if (chunk.error ?? parsed.choices?.[0]?.finish_reason === \"error\") throw new Error(chunk.error?.message)` before reading delta.content.",
      claim: "A file consuming OpenRouter stream deltas with no error-shape check anywhere in the file.",
      lookalikes: ["error handling living in a different file"],
    },
    {
      id: "sse-comment-parse-crash",
      description: "A hand-rolled SSE reader will feed OpenRouter's keep-alive comments to JSON.parse",
      severity: "warning",
      revision: 1,
      impact: "OpenRouter sends `: OPENROUTER PROCESSING` comment lines while routing; the docs warn hand parsers must skip them. A loop that JSON.parses every data-bearing line crashes mid-generation.",
      why: "SSE keep-alive comments start with `:` and are legal on any stream, but OpenRouter sends them as a matter of course during provider routing — a naive `split(\"\\n\")` + JSON.parse loop meets one on the first slow request.",
      fix: "Skip comment lines before parsing: `if (line.startsWith(\":\")) continue;` — or use an SDK stream helper that handles SSE framing.",
      claim: "A hand-rolled SSE loop that does not skip colon-prefixed comment lines.",
      lookalikes: ["SDK stream helpers handling SSE framing"],
    },
    {
      id: "missing-abort-signal",
      revision: 2, reportingUnit: 'occurrence', needs: ['calls','identity','option-presence'], onUnknown: 'narrow',
      severity: 'info',
      description: 'Review an OpenRouter request without an established caller cancellation signal.',
      claim: 'A native fetch or supported chat client call with OpenRouter provenance and no established caller signal in its ordered request options.',
      impact: 'Cancellation or a deadline may limit unwanted work; omission alone does not prove a bug or continued billing.',
      why: 'OpenRouter cancellation depends on streaming and provider support, as well as the caller actually aborting.',
      fix: 'Review the intended request lifetime and forward a signal if required; preserve intentional background work.',
      lookalikes: ['Local fetch functions','Other providers','Signals forwarded through options or Request objects'],
      blindSpots: ['Unknown inputs, reassignment and opaque options abstain. SDK cancellation contracts are checked separately from native RequestInit.'],
    },
    {
      id: "retry-after-ignored",
      description: "A retry loop around an OpenRouter call never reads the Retry-After header",
      severity: "warning",
      revision: 1,
      impact: "429 and 503 responses carry Retry-After, and raw fetch gets no SDK backoff — immediate retries thundering-herd into the same limit and can exhaust the daily caps on :free variants (20 RPM / 50–1000 RPD).",
      why: "The official SDKs honor Retry-After automatically; hand-rolled catch-and-retry loops don't. The header is the only backoff signal a raw fetch client receives.",
      fix: "Read the header and wait: `const wait = Number(res.headers.get(\"retry-after\") ?? 1); await sleep(wait * 1000);` before retrying.",
      claim: "A retry loop around an OpenRouter call that never reads Retry-After.",
      lookalikes: ["SDK-managed backoff"],
    },
    {
      id: "hardcoded-dated-model-slug",
      description: "A dated model slug is hardcoded where a maintained alias would survive provider removals",
      severity: "info",
      revision: 1,
      impact: "Model availability is separate from API versioning — the docs state models are added and removed by providers independently, and a removed slug starts returning 404s with zero code changes around it.",
      why: "OpenRouter maintains ~family-latest aliases and per-slug routing variants (:nitro, :floor, :free). A versioned slug is sometimes a deliberate reproducibility pin — this is advice to pin consciously, not a defect.",
      fix: "Prefer `~author/family-latest` aliases or read slugs from config; if the pin is deliberate, keep it and note why.",
      claim: "A dated model slug hardcoded \u2014 advice to pin consciously, at info.",
      lookalikes: ["~family-latest aliases", "slugs read from config"],
    },
  ],
};

export async function doctor(ctx) {
  const files = await ctx.files.list([".ts", ".tsx", ".js", ".jsx", ".mjs"]);
  for (const file of files) {
    // Fixture sandboxes are doctor test data, not target source.
    if (/\.fixtures\.mjs$/.test(file)) continue;
    const raw = await ctx.files.read(file);
    if (ctx.analysis.available) checkRequests(ctx, file);
    if (!/openrouter/i.test(raw)) continue;
    const rawLines = raw.split("\n");
    const masked = ctx.files.readMasked(file);
    const lines = masked.split("\n");

    checkMidstreamErrors(ctx, file, lines);
    checkSseComments(ctx, file, rawLines, lines);

    checkRetryAfter(ctx, file, rawLines, lines);
    checkDatedSlugs(ctx, file, rawLines);
  }
}

// A 200-OK stream can carry its failure as the first and only event; flag
// delta consumption in a file that never looks for the error shape.
function checkMidstreamErrors(ctx, file, lines) {
  const handlesErrors = /\bfinish_reason\b|\.\s*error\b|chunk\s*\.\s*error|\.error\s*[?){,:;]/.test(lines.join("\n"));
  for (let i = 0; i < lines.length; i++) {
    if (!/(?:delta\s*\.\s*content|choices\s*\[\s*\d+\s*\]\s*\.\s*delta)/.test(lines[i])) continue;
    if (!handlesErrors) {
      ctx.report.finding({ rule: "midstream-error-ignored", file, line: i + 1 });
    }
    return;
  }
}

// Hand-rolled SSE framing: data-line handling plus JSON.parse, but no
// guard for `:` keep-alive comments. Structure is read from the masked
// source; the data/guard signals live inside strings, so those come from
// the raw text.
function checkSseComments(ctx, file, rawLines, lines) {
  const masked = lines.join("\n");
  const raw = rawLines.join("\n");
  const manualSse = /\bgetReader\s*\(/.test(masked) || /split\s*\(\s*["']\\n["']\s*\)/.test(raw);
  if (!manualSse) return;
  if (!/\bdata:\s/.test(raw) && !/startsWith\s*\(\s*["']data:/.test(raw)) return;
  if (/startsWith\s*\(\s*["']:["']/.test(raw)) return;
  for (let i = 0; i < lines.length; i++) {
    if (/\bJSON\s*\.\s*parse\s*\(/.test(lines[i])) {
      ctx.report.finding({ rule: "sse-comment-parse-crash", file, line: i + 1 });
      return;
    }
  }
}

// Retry evidence around an openrouter call, with no Retry-After handling
// anywhere in the file. The call test is masked (code shape) paired with
// the raw line for openrouter context — strings alone must not count.
function checkRetryAfter(ctx, file, rawLines, lines) {
  const raw = rawLines.join("\n");
  const callsOpenRouter = rawLines.some((l, i) => /openrouter/i.test(l) && /\bfetch\s*\(/.test(lines[i]));
  if (!callsOpenRouter) return;
  const retries = /\b(?:retry|retries|attempt|maxAttempts|backoff)\b/i.test(raw);
  if (!retries) return;
  if (/retry-after/i.test(raw)) return;
  for (let i = 0; i < lines.length; i++) {
    if (/\bcatch\b/.test(lines[i])) {
      ctx.report.finding({ rule: "retry-after-ignored", file, line: i + 1 });
      return;
    }
  }
}

// Quoted vendor/model-version slugs; ~aliases and URLs are fine.
function checkDatedSlugs(ctx, file, rawLines) {
  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    if (/openrouter\.ai|api\/v1|https?:|~/.test(line)) continue;
    const m = /["']([a-z0-9][a-z0-9.-]*\/[a-z0-9._-]*\d[a-z0-9._-]*)["']/.exec(line);
    if (m && /[a-z]/.test(m[1].split("/")[0])) {
      ctx.report.finding({ rule: "hardcoded-dated-model-slug", file, line: i + 1 });
    }
  }
}

// A custom endpoint gate composes with the SDK option recipe. The generic
// certification profile has no endpoint predicate; doctor fixtures certify it.
const UNKNOWN = { unknown: true };
const FETCH_NAMES = ['fetch','globalThis.fetch','window.fetch','self.fetch'];
function requestFacts(ctx, file) {
  const facts = ctx.analysis.calls(file), flow = facts.structure.flow;
  const values = new Map(flow.values.map(v => [v.id,v]));
  const bindings = new Map(flow.bindings.map(b => [b.binding,b]));
  const states = new Map(facts.structure.bindings.map(b => [b.binding,b]));
  const byStart = new Map(flow.values.map(v => [v.start,v]));
  const stable = b => !states.get(b)?.reassigned && !states.get(b)?.mutated;
  function resolve(id, seen = new Set()) {
    if (id === undefined) return undefined;
    if (id === UNKNOWN || seen.has(id)) return UNKNOWN;
    const v = values.get(id); if (!v) return UNKNOWN;
    seen = new Set(seen).add(id);
    if (v.kind === 'await') return resolve(v.value,seen);
    if (v.kind === 'reference' && v.target?.binding != null) {
      const b=v.target.binding, state=states.get(b);
      if (!stable(b)) return UNKNOWN;
      const init=bindings.get(b)?.initializer;
      if (init !== undefined) return resolve(init,seen);
      if (state?.initializer !== undefined) {
        let item=resolve(byStart.get(state.initializer)?.id,seen);
        for(const key of state.path??[]) item=propertyValue(item,key,seen);
        return item;
      }
    }
    if (v.kind === 'member') {
      const parent=resolve(v.receiver,seen);
      if (parent?.kind === 'object') return propertyValue(parent,v.member,seen);
    }
    if (v.alternatives) {
      const choices=v.alternatives.map(x=>resolve(x,seen));
      if(choices.length && choices.every(x=>x===choices[0] || x?.kind==='literal' && choices[0]?.kind==='literal' && x.literal===choices[0].literal))return choices[0];
      return UNKNOWN;
    }
    return v;
  }
  function propertyValue(v,name,seen=new Set()) {
    if(v===undefined || v?.kind==='literal'&&v.literal===null)return undefined;
    if(v===UNKNOWN || v?.kind!=='object' || name===null)return UNKNOWN;
    let result;
    for(const p of v.properties??[]) {
      if(p.spread){const nested=propertyValue(resolve(p.value,seen),name,seen);if(nested!==undefined)result=nested;}
      else if(p.name===null)result=UNKNOWN;
      else if(p.name===name)result=p.accessor?UNKNOWN:resolve(p.value,seen);
      else if(p.name==='__proto__'&&result===undefined)result=UNKNOWN;
    }
    return result;
  }
  const property=(id,name)=>propertyValue(resolve(id),name);
  function literal(id,seen=new Set()) {
    const v=resolve(id);if(!v||v===UNKNOWN||seen.has(v.id))return UNKNOWN;
    if(v.kind==='literal')return v.literal;
    if(v.template){seen=new Set(seen).add(v.id);let result=v.template.quasis[0];if(result===null)return UNKNOWN;
      for(let i=0;i<v.template.expressions.length;i++){const part=literal(v.template.expressions[i],seen);if(part===UNKNOWN||v.template.quasis[i+1]===null)return UNKNOWN;result+=String(part)+v.template.quasis[i+1];}return result;}
    return UNKNOWN;
  }
  function name(id) {
    const v=resolve(id);if(!v||v===UNKNOWN)return UNKNOWN;
    if(v.kind==='member'){const base=name(v.receiver);return base===UNKNOWN||v.member===null?UNKNOWN:base+'.'+v.member;}
    if(v.kind==='function'||v.kind==='object')return undefined;
    const t=v.target;if(!t)return UNKNOWN;
    if(t.source)return t.source+':'+t.importedName+(t.members.length?'.'+t.members.join('.'):'');
    if(t.binding===null)return [t.root,...t.members].join('.');
    return undefined; // Proven lexical local, including same-named parameters.
  }
  function endpoint(id,seen=new Set()) {
    const v=resolve(id);if(!v||v===UNKNOWN||seen.has(v.id))return UNKNOWN;
    if(v.kind==='construct'&&name(v.callee)==='Request')return endpoint(v.arguments?.[0],new Set(seen).add(v.id));
    const text=literal(v.id);if(text===UNKNOWN)return UNKNOWN;
    return typeof text==='string' && /^https:\/\/openrouter\.ai(?::443)?\/api\/v1(?:\/|$)/i.test(text);
  }
  function native(call) {
    const n=name(call.callee);if(FETCH_NAMES.includes(n))return true;
    if(n===UNKNOWN){const v=values.get(call.callee), t=v?.target;
      if(t?.root==='fetch'||t?.members?.at(-1)==='fetch')return UNKNOWN;
      const init=bindings.get(t?.binding)?.initializer;
      if(init!==undefined&&FETCH_NAMES.includes(name(init)))return UNKNOWN;
    }
    return false;
  }
  function clientOrigin(id,seen=new Set()) {
    if(id===undefined||seen.has(id))return false;seen=new Set(seen).add(id);
    const v=values.get(id);if(!v)return false;
    if(v.target?.source==='@openrouter/sdk'||v.target?.source==='openai')return true;
    const init=bindings.get(v.target?.binding)?.initializer;
    return (init!==undefined&&clientOrigin(init,seen)) ||
      [v.receiver,v.callee,v.value,...(v.alternatives??[])].some(x=>clientOrigin(x,seen));
  }
  function clientCall(call) {
    let v=resolve(call.callee), members=[];
    while(v?.kind==='member'){members.unshift(v.member);v=resolve(v.receiver);}
    if(v===UNKNOWN && ['send','create'].includes(call.member)&&clientOrigin(call.callee))return {endpoint:UNKNOWN};
    if(v?.kind!=='construct')return undefined;
    const ctor=name(v.callee), method=members.join('.');
    const official=ctor==='@openrouter/sdk:OpenRouter' && method==='chat.send';
    const openai=['openai:default','openai:OpenAI'].includes(ctor)&&method==='chat.completions.create';
    if(!official&&!openai)return undefined;
    const config=v.arguments?.[0], key=official?'serverURL':'baseURL';
    const override=official?property(call.arguments?.[1],'serverURL'):undefined;
    const base=override??property(config,key);
    const custom=property(config,official?'httpClient':'fetch');
    const ep=base===UNKNOWN||custom!==undefined?UNKNOWN:base===undefined?official:endpoint(base.id);
    return {endpoint:ep,official,config,body:call.arguments?.[0]};
  }
  return {facts,flow,values,bindings,states,resolve,property,propertyValue,literal,name,endpoint,native,clientCall};
}
function checkRequests(ctx,file) {
  const m=requestFacts(ctx,file);
  for(const call of m.flow.values.filter(v=>v.kind==='call'&&!v.dead)) {
    const native=m.native(call);
    if(!native){
      const client=m.clientCall(call);if(!client||client.endpoint===false)continue;
      const options=call.arguments?.[1];
      const direct=m.property(options,'signal');
      const signal=direct??(client.official?m.propertyValue(m.property(options,'fetchOptions'),'signal'):undefined);
      if(client.endpoint===UNKNOWN||signal===UNKNOWN || signal!==undefined&&signal?.kind!=='literal'&&!(signal?.kind==='member'&&signal.member==='signal'&&m.name(m.resolve(signal.receiver)?.callee)==='AbortController')){
        ctx.report.narrowing({check:'missing-abort-signal',file,reason:'unsupported-expression',capability:'calls'});
      }else if(signal===undefined||signal?.literal===null)ctx.report.finding({rule:'missing-abort-signal',file,line:call.line,column:call.column});
      continue;
    }
    const endpoint=m.endpoint(call.arguments?.[0]);if(endpoint===false)continue;
    if(native===UNKNOWN||endpoint===UNKNOWN){ctx.report.narrowing({check:'missing-abort-signal',file,reason:'unsupported-expression',capability:'calls'});continue;}
    ctx.recipes.requiredOrRecommendedOption(file,{id:call.id,start:call.start,end:call.end},{call:{globals:FETCH_NAMES},option:{option:'signal',sources:['RequestInit','Request']}},{rule:'missing-abort-signal'});
  }
}
