export const meta = {
  id: "openrouter",
  description: "Review OpenRouter request lifetimes, model pins, stream parsing and retry policy.",
  severity: "warning",
  category: "openrouter",
  blindSpots: [
    'All checks require calls analysis; omitted providers abstain with explicit narrowing and null score/grade.',
    'Local lexical aliases, fixed properties and bounded templates are supported. Mutation, opaque transfers and unresolved choices retain check-specific uncertainty.',
    'SDK imports and explicit configuration establish declared provenance, not a proof of installed SDK behavior or runtime environment overrides.',
    'Stream checks cover chat-completion shapes and supported raw reader transformations. Cross-module handlers and custom parsers are not executed.',
    'Retry checks cover response-dependent loops; arbitrary callbacks are opaque. Header consultation does not prove backoff correctness.',
    'Default diagnostic extension and generated/test exclusions remain; .mts, .cts and .cjs are outside default scope. Fixture-named files are skipped.',

  ],
  checks: [
    {
      id: 'midstream-error-ignored', revision: 2, reportingUnit: 'occurrence', needs: ['calls','value-path'], onUnknown: 'narrow', severity: 'warning',
      description: 'OpenRouter stream content is accepted without a prior same-chunk error exclusion.',
      claim: 'A supported chat stream delta is written, returned or passed onward without a dominating exclusion of the same chunk error shape.',
      impact: 'A midstream failure can be mistaken for a successful empty or partial reply.',
      why: 'Chat completion error events can retain HTTP 200; an unrelated or later error check does not protect this content consumer.',
      fix: 'Handle the same chunk error before accepting its content, preserving existing error propagation and partial-result policy.',
      lookalikes: ['Prior same-chunk error exits','Other streams or objects','Unused content reads'],
      blindSpots: ['Opaque chunk handlers and reassigned or conditional flow narrow. Library error guarantees and cross-file handlers are not executed.'],
    },
    {
      id: 'sse-comment-parse-crash', revision: 2, reportingUnit: 'occurrence', needs: ['calls','value-path'], onUnknown: 'narrow', severity: 'warning',
      description: 'OpenRouter SSE comment lines can reach a handwritten JSON parser.',
      claim: 'A native JSON.parse receives a line from a supported OpenRouter SSE reader without a preceding effective comment exclusion.',
      impact: 'Legal keep-alive comments can interrupt stream parsing.',
      why: 'SSE framing distinguishes data fields from colon-prefixed comments; unrelated guards do not filter this line.',
      fix: 'Use a spec-compliant framing parser or exclude comments and non-data fields on this path before parsing payloads.',
      lookalikes: ['Data-prefix guards','Comment exclusions','SDK or eventsource-parser framing','Non-stream response JSON'],
      blindSpots: ['Opaque parser helpers, transforms and mutated line flow narrow; no cross-module execution.'],
    },
    {
      id: "missing-abort-signal",
      revision: 2, reportingUnit: 'occurrence', needs: ['calls','identity','option-presence','value-path'], onUnknown: 'narrow',
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
      id: 'retry-after-ignored', revision: 2, reportingUnit: 'occurrence', needs: ['calls','value-path'], onUnknown: 'narrow', severity: 'info',
      description: 'Review a raw OpenRouter retry path with no corresponding Retry-After consultation.',
      claim: 'A native OpenRouter request in a response-dependent retry loop has no supported corresponding response-header read on the failure path.',
      impact: 'A retry policy may ignore server-provided delay guidance and repeat requests too quickly.',
      why: 'Retry-After can be present on retryable responses; an unrelated header read does not consult this response.',
      fix: 'Review retry eligibility and backoff for this response, honoring a valid Retry-After when provided while preserving budgets and cancellation.',
      lookalikes: ['SDK-managed retries','Batch loops','Unrelated catch blocks','Corresponding failure-path header reads'],
      blindSpots: ['Opaque callbacks, unresolved response identity and conditional header consultation narrow; reading a header is not proof of correct waiting.'],
    },
    {
      id: 'hardcoded-dated-model-slug', revision: 2, reportingUnit: 'occurrence', needs: ['calls','value-path'], onUnknown: 'narrow', severity: 'info',
      description: 'Review a concrete model pin selected for OpenRouter.',
      claim: 'A version-looking concrete model literal in a supported OpenRouter request or model-factory selection.',
      impact: 'A pin preserves reproducibility but requires deliberate availability and upgrade decisions.',
      why: 'Maintained latest aliases trade fixed model behavior for automatic upgrades; neither choice is universally better.',
      fix: 'Confirm that the pin is intentional and available; consider a documented maintained alias only if changing model behavior is acceptable.',
      lookalikes: ['Logs and pricing tables','Other providers','Maintained aliases','URLs, dates, filenames and labels'],
      blindSpots: ['Computed, reassigned and externally supplied model selections narrow. Cross-file configuration is not evaluated.'],
    },
  ],
};

export async function doctor(ctx) {
  if(!ctx.analysis.available)return;
  for(const file of ctx.files.list()){
    if(file.endsWith('.fixtures.mjs'))continue;
    checkRequests(ctx,file);
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
  // Inspect escaped object identity, not primitive uses: passing a URL or a
  // content string does not allow the callee to mutate that value.
  const escapedValues=new Set();
  function markEscaped(id) {
    if(id===undefined||escapedValues.has(id))return;
    escapedValues.add(id);const v=values.get(id);if(!v)return;
    // An opaque owner can mutate any contained object, including stable aliases.
    for(const child of [v.kind==='reference'?bindings.get(v.target?.binding)?.initializer:undefined,v.value,
      ...(v.alternatives??[]),...(v.properties??[]).map(p=>p.value),
      ...(v.elements??[]).map(p=>p.value)])markEscaped(child);
  }
  for(const b of bindings.values())if((states.get(b.binding)?.escapes??[]).some(t=>{
    const n=[t.root,...t.members].join('.');
    if(t.binding===null&&['JSON.stringify',...FETCH_NAMES].includes(n))return false;
    if(t.binding!==null&&['chat.send','chat.completions.create'].includes(t.members.join('.')) &&
      originMatches(bindings.get(t.binding)?.initializer,x=>['@openrouter/sdk','openai'].includes(x.target?.source)))return false;
    return true;
  }))markEscaped(b.initializer);
  function resolve(id, seen = new Set()) {
    if (id === undefined) return undefined;
    if (id === UNKNOWN || seen.has(id)) return UNKNOWN;
    const v = values.get(id); if (!v) return UNKNOWN;
    seen = new Set(seen).add(id);
    if (['object','array','construct'].includes(v.kind)&&escapedValues.has(v.id))return UNKNOWN;
    if (v.kind === 'await') return resolve(v.value,seen);
    if (v.kind === 'reference' && v.target?.binding != null) {
      const b=v.target.binding, state=states.get(b);
      if (!stable(b)) return UNKNOWN;
      const init=bindings.get(b)?.initializer;
      if (init !== undefined) return resolve(init,seen);
      if (state?.initializer !== undefined) {
        let item=resolve(byStart.get(state.initializer)?.id,seen);
        for(const key of state.path??[]) item=localPropertyValue(item,key,seen);
        return item;
      }
    }
    if (v.kind === 'member') {
      const parent=resolve(v.receiver,seen);
      if (parent?.kind === 'object') return localPropertyValue(parent,v.member,seen);
    }
    if (v.alternatives) {
      const choices=v.alternatives.map(x=>resolve(x,seen));
      if(choices.length && choices.every(x=>x===choices[0] || x?.kind==='literal' && choices[0]?.kind==='literal' && x.literal===choices[0].literal))return choices[0];
      return UNKNOWN;
    }
    return v;
  }
  function predicate(id,seen=new Set()) {
    if(id===undefined||seen.has(id))return UNKNOWN;seen=new Set(seen).add(id);
    const v=values.get(id);if(!v)return UNKNOWN;
    if(v.kind==='reference'&&v.target?.binding!=null&&stable(v.target.binding)){
      const init=bindings.get(v.target.binding)?.initializer;
      if(init!==undefined)return predicate(init,seen);
    }
    return v.operation?v:resolve(id);
  }
  // Internal identity resolution needs the graph's local object projection;
  // policy-facing property reads below use Value Path at an explicit call site.
  function localPropertyValue(v,name,seen=new Set()) {
    if(v===undefined || v?.kind==='literal'&&v.literal===null)return undefined;
    if(v===UNKNOWN || v?.kind!=='object' || name===null)return UNKNOWN;
    const state='property:'+v.id+':'+name;
    if(seen.has(state))return UNKNOWN;
    seen=new Set(seen).add(state);
    let result;
    for(const p of v.properties??[]) {
      if(p.spread){const nested=localPropertyValue(resolve(p.value,seen),name,seen);if(nested!==undefined)result=nested;}
      else if(p.name===null)result=UNKNOWN;
      else if(p.name===name)result=p.accessor?UNKNOWN:resolve(p.value,seen);
      else if(p.name==='__proto__'&&result===undefined)result=UNKNOWN;
    }
    return result;
  }
  function propertyValue(v,name,at) {
    if(v===undefined || v?.kind==='literal'&&v.literal===null)return undefined;
    if(v===UNKNOWN || name===null || !at)return UNKNOWN;
    const result=ctx.analysis.valueAtPath(file,{id:v.id,start:v.start,end:v.end},{at:{id:at.id,start:at.start,end:at.end},path:[name]});
    if(result.status==='unknown')return UNKNOWN;
    if(result.value.state==='absent')return undefined;
    return values.get(result.value.expression.id)??byStart.get(result.value.expression.start)??UNKNOWN;
  }
  const property=(id,name,at)=>propertyValue(id===undefined?undefined:values.get(id),name,at);
  function literal(id,seen=new Set()) {
    const v=resolve(id);if(!v||v===UNKNOWN||seen.has(v.id))return UNKNOWN;
    if(v.kind==='literal')return v.literal;
    if(v.template){seen=new Set(seen).add(v.id);let result=v.template.quasis[0];if(result===null)return UNKNOWN;
      for(let i=0;i<v.template.expressions.length;i++){const part=literal(v.template.expressions[i],seen);if(part===UNKNOWN||v.template.quasis[i+1]===null)return UNKNOWN;result+=String(part)+v.template.quasis[i+1];}return result;}
    return UNKNOWN;
  }
  function name(id,seen=new Set()) {
    const v=resolve(id);if(!v||v===UNKNOWN||seen.has(v.id))return UNKNOWN;
    seen=new Set(seen).add(v.id);
    if(v.kind==='member'){const base=name(v.receiver,seen);return base===UNKNOWN||v.member===null?UNKNOWN:base+'.'+v.member;}
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
  function originMatches(id,accept,seen=new Set()) {
    if(id===undefined||seen.has(id))return false;seen.add(id);
    const v=values.get(id);if(!v)return false;
    if(accept(v))return true;
    const state=states.get(v.target?.binding),init=bindings.get(v.target?.binding)?.initializer;
    return [init,...(state?.writes??[]).map(w=>byStart.get(w.value)?.id),v.receiver,v.callee,v.value,...(v.alternatives??[])].some(x=>originMatches(x,accept,seen));
  }
  function native(call) {
    const n=name(call.callee);if(FETCH_NAMES.includes(n))return true;
    if(n===UNKNOWN&&originMatches(call.callee,v=>v.target?.binding===null&&FETCH_NAMES.includes([v.target.root,...v.target.members].join('.'))))return UNKNOWN;
    return false;
  }
  const clientOrigin=id=>originMatches(id,v=>['@openrouter/sdk','openai'].includes(v.target?.source));
  const modelOrigin=id=>originMatches(id,v=>v.target?.source==='@openrouter/ai-sdk-provider'&&['createOpenRouter','openrouter','*'].includes(v.target.importedName));
  function clientCall(call) {
    let v=resolve(call.callee), members=[];const seen=new Set();
    while(v?.kind==='member'){if(seen.has(v.id)){v=UNKNOWN;break;}seen.add(v.id);members.unshift(v.member);v=resolve(v.receiver);}
    if(v===UNKNOWN&&clientOrigin(call.callee))return {endpoint:UNKNOWN};
    if(v?.kind!=='construct')return undefined;
    const ctor=name(v.callee), method=members.join('.');
    const official=['@openrouter/sdk:OpenRouter','@openrouter/sdk:*.OpenRouter'].includes(ctor) && method==='chat.send';
    const openai=['openai:default','openai:OpenAI'].includes(ctor)&&method==='chat.completions.create';
    if(!official&&!openai)return undefined;
    const config=v.arguments?.[0], key=official?'serverURL':'baseURL';
    const override=official?property(call.arguments?.[1],'serverURL',call):undefined;
    // Constructor configuration is observed when the client captures it, not
    // at a later request after the constructor has legitimately received it.
    const base=override??property(config,key,v);
    const custom=property(config,official?'httpClient':'fetch',v);
    const ep=base===UNKNOWN||custom!==undefined?UNKNOWN:base===undefined?official:endpoint(base.id);
    return {endpoint:ep,official,config,body:call.arguments?.[0]};
  }
  return {facts,flow,values,bindings,states,byStart,stable,resolve,predicate,property,propertyValue,literal,name,endpoint,native,clientCall,modelOrigin};
}
function checkRequests(ctx,file) {
  const m=requestFacts(ctx,file);
  checkSse(ctx,file,m);
  checkStreamErrors(ctx,file,m);
  checkRetries(ctx,file,m);
  for(const call of m.flow.values.filter(v=>v.kind==='call'&&!v.dead)) {
    checkModel(ctx,file,m,call);
    const native=m.native(call);
    if(!native){
      const client=m.clientCall(call);if(!client||client.endpoint===false)continue;
      const options=call.arguments?.[1];
      const direct=m.property(options,'signal',call);
      const fetchOptions=m.property(options,'fetchOptions',call);
      const signal=direct??(client.official?m.propertyValue(fetchOptions,'signal',call):undefined);
      if(client.endpoint===UNKNOWN||signal===UNKNOWN || signal!==undefined&&signal?.literal!==null&&!(signal?.kind==='member'&&signal.member==='signal'&&m.name(m.resolve(signal.receiver)?.callee)==='AbortController')){
        ctx.report.narrowing({check:'missing-abort-signal',file,reason:'unsupported-expression',capability:'calls'});
      }else if(signal===undefined||signal?.literal===null)ctx.report.finding({rule:'missing-abort-signal',file,line:call.line,column:call.column});
      continue;
    }
    const endpoint=m.endpoint(call.arguments?.[0]);if(endpoint===false)continue;
    if(native===UNKNOWN||endpoint===UNKNOWN){ctx.report.narrowing({check:'missing-abort-signal',file,reason:'unsupported-expression',capability:'calls'});continue;}
    ctx.recipes.requiredOrRecommendedOption(file,{id:call.id,start:call.start,end:call.end},{call:{globals:FETCH_NAMES},option:{option:'signal',sources:['RequestInit','Request']}},{rule:'missing-abort-signal'});
  }
}

function checkModel(ctx,file,m,call) {
  const rule='hardcoded-dated-model-slug';
  const narrow=()=>ctx.report.narrowing({check:rule,file,reason:'unsupported-expression',capability:'calls'});
  let model, candidate=false, endpoint=true;
  const fn=m.resolve(call.callee), factory=fn?.kind==='call'?m.name(fn.callee):undefined;
  if(fn===UNKNOWN&&m.modelOrigin(call.callee)){candidate=true;model=UNKNOWN;}
  else if(['@openrouter/ai-sdk-provider:openrouter','@openrouter/ai-sdk-provider:*.openrouter'].includes(m.name(call.callee))||['@openrouter/ai-sdk-provider:createOpenRouter','@openrouter/ai-sdk-provider:*.createOpenRouter'].includes(factory)){
    candidate=true;model=m.resolve(call.arguments?.[0]);
    if(factory){const base=m.property(fn.arguments?.[0],'baseURL',call);if(base!==undefined)endpoint=base===UNKNOWN?UNKNOWN:m.endpoint(base.id);}
  } else {
    const native=m.native(call), client=m.clientCall(call);
    if(native){
      endpoint=native===UNKNOWN?UNKNOWN:m.endpoint(call.arguments?.[0]);
      let body=m.property(call.arguments?.[1],'body',call);
      const input=m.resolve(call.arguments?.[0]);
      if(body===undefined&&input?.kind==='construct'&&m.name(input.callee)==='Request')body=m.property(input.arguments?.[1],'body',call);
      if(body!==undefined){candidate=true;model=body?.kind==='call'&&m.name(body.callee)==='JSON.stringify'?m.property(body.arguments?.[0],'model',call):UNKNOWN;}
    }else if(client){
      candidate=true;endpoint=client.endpoint;
      const nested=m.property(call.arguments?.[0],'chatRequest',call);
      model=m.property(nested!==undefined&&nested!==UNKNOWN?nested.id:call.arguments?.[0],'model',call);
    }
  }
  if(!candidate||endpoint===false)return;
  if(endpoint===UNKNOWN||model===UNKNOWN){narrow();return;}
  if(model===undefined)return; // no explicit selection (server/client default)
  const text=m.literal(model.id);
  if(text===UNKNOWN){narrow();return;}
  if(typeof text==='string'&&/^[a-z][a-z0-9.-]*\/[a-z0-9._-]*\d[a-z0-9._-]*(?::[a-z-]+)?$/i.test(text)&&! /\.(?:[cm]?[jt]sx?|json|md|txt)$/i.test(text))
    ctx.report.finding({rule,file,line:call.line,column:call.column});
}

// Interpret only documented transport transformations over the host graph.
// An opaque transfer retains its source identity and is reported as coverage.
function streamFacts(m) {
  const cache=new Map();
  function propertyStage(p,key){
    if(!p)return undefined;
    if(p.stage==='response'&&key==='body')return {...p,stage:'body'};
    if(p.stage==='read'&&key==='value')return {...p,stage:'bytes'};
    if(p.stage==='chunk'||p.stage==='content'){
      const members=[...(p.members??[]),key];
      return {...p,members,stage:/^choices\.\d+\.delta\.content$/.test(members.join('.'))?'content':'chunk',unknown:p.unknown||key===null};
    }
    return {...p,unknown:true};
  }
  function provenance(id,seen=new Set()) {
    if(id===undefined||seen.has(id))return undefined;
    if(cache.has(id))return cache.get(id);
    seen=new Set(seen).add(id);const v=m.values.get(id);if(!v)return undefined;
    let p;
    if(v.kind==='reference'&&v.target?.binding!=null){
      const b=v.target.binding,state=m.states.get(b),init=m.bindings.get(b)?.initializer??m.byStart.get(state?.initializer)?.id;
      if(init!==undefined){p=provenance(init,seen);for(const key of state?.path??[])p=propertyStage(p,key);}
      else {const loop=m.flow.loops.find(l=>l.binding===b||l.bindings?.some(item=>item.binding===b));if(loop){const source=provenance(loop.iterable,seen);if(source)p={...source,stage:source.stage==='lines'?'line':source.stage==='chunks'?'chunk':source.stage,unknown:source.unknown||!['lines','chunks'].includes(source.stage),lineBinding:loop.binding??loop.start};for(const key of loop.bindings?.find(item=>item.binding===b)?.path??[])p=propertyStage(p,key);}}
      if(p&&!m.stable(b))p={...p,unknown:true};
    }else if(v.kind==='await')p=provenance(v.value,seen);
    else if(v.kind==='member')p=propertyStage(provenance(v.receiver,seen),v.member);
    else if(v.alternatives){const candidates=v.alternatives.map(x=>provenance(x,seen)).filter(Boolean);if(candidates.length)p={...candidates[0],unknown:true};}
    else if(v.kind==='call'){
      const native=m.native(v),client=m.clientCall(v);
      if(native&&m.endpoint(v.arguments?.[0])!==false){
        const body=m.property(v.arguments?.[1],'body',v);
        const config=body?.kind==='call'&&m.name(body.callee)==='JSON.stringify'?body.arguments?.[0]:undefined;
        const stream=m.property(config,'stream',v);
        if(stream?.literal!==false)p={origin:v.id,stage:'response',unknown:native===UNKNOWN||m.endpoint(v.arguments?.[0])===UNKNOWN||stream?.literal!==true};
      }else if(client&&client.endpoint!==false){
        const nested=m.property(v.arguments?.[0],'chatRequest',v);
        const stream=nested===UNKNOWN?UNKNOWN:m.property(nested?.id??v.arguments?.[0],'stream',v);
        // An explicit unresolved flag may produce a stream. Missing/false flags
        // use the SDK non-stream default and establish no chunk provenance.
        if(stream!==undefined&&stream?.literal!==false)p={origin:v.id,stage:'chunks',unknown:client.endpoint===UNKNOWN||stream?.literal!==true};
      }
      if(!p){
        const receiver=provenance(v.receiver,seen),args=(v.arguments??[]).map(x=>provenance(x,seen));
        if(v.member==='getReader'&&receiver?.stage==='body')p={...receiver,stage:'reader'};
        else if(v.member==='read'&&receiver?.stage==='reader')p={...receiver,stage:'read'};
        else if(v.member==='decode'&&m.name(m.resolve(v.receiver)?.callee)==='TextDecoder'&&args[0])p={...args[0],stage:'text',unknown:args[0].unknown||args[0].stage!=='bytes'};
        else if(v.member==='split'&&receiver?.stage==='text'&&m.literal(v.arguments?.[0])==='\n')p={...receiver,stage:'lines'};
        else if(v.member==='slice'&&receiver?.stage==='line'&&[0,5,6].includes(m.literal(v.arguments?.[0])))p={...receiver,stage:m.literal(v.arguments?.[0])===0?'line':'payload'};
        else if(m.name(v.callee)==='JSON.parse'&&args[0]&&['line','payload'].includes(args[0].stage))p={...args[0],stage:'chunk',chunk:v.id};
        else if(receiver||args.some(Boolean)){const source=receiver??args.find(Boolean);p={...source,...(source.stage==='content'?{stage:'opaque'}:{}),unknown:true};}
      }
    }
    cache.set(id,p);return p;
  }
  return {provenance};
}
function checkSse(ctx,file,m) {
  const rule='sse-comment-parse-crash',{provenance}=streamFacts(m);
  function excludes(id,truthy,line,seen=new Set()) {
    if(seen.has(id))return false;seen=new Set(seen).add(id);
    const v=m.predicate(id);if(!v||v===UNKNOWN)return false;
    if(v.operation?.operator==='!')return excludes(v.operation.operands[0],!truthy,line,seen);
    if(v.operation && (v.operation.operator==='&&'&&truthy || v.operation.operator==='||'&&!truthy)){const parts=v.operation.operands.map(x=>excludes(x,truthy,line,seen));return parts.includes(true)?true:parts.includes(UNKNOWN)?UNKNOWN:false;}
    if(v.kind!=='call'||v.member!=='startsWith'){
      const related=[v.id,...(v.operation?.operands??[])].some(id=>{const p=provenance(id);return p&&p.lineBinding===line.lineBinding&&p.origin===line.origin});
      return related?UNKNOWN:false;
    }
    const p=provenance(v.receiver);if(!p||p.unknown||p.lineBinding!==line.lineBinding||p.origin!==line.origin)return false;
    // Only an original line prefix at offset zero excludes SSE comments.
    if(p.stage!=='line')return false;
    const offset=v.arguments?.[1]===undefined?0:m.literal(v.arguments[1]);
    if(offset===UNKNOWN)return UNKNOWN;if(offset!==0)return false;
    const prefix=m.literal(v.arguments?.[0]);if(prefix===UNKNOWN)return UNKNOWN;return truthy&&typeof prefix==='string'&&prefix.startsWith('data:')||!truthy&&prefix===':';
  }
  const parserReceivers=new Set(m.flow.values.filter(v=>v.kind==='call'&&['eventsource-parser:createParser'].includes(m.name(v.callee))).map(v=>v.id));
  for(const call of m.flow.values.filter(v=>v.kind==='call'&&!v.dead)){
    const isParse=m.name(call.callee)==='JSON.parse',arg=provenance(call.arguments?.[0]);
    if(isParse&&arg&&['line','payload'].includes(arg.stage)){
      if(arg.unknown){ctx.report.narrowing({check:rule,file,reason:'unsupported-expression',capability:'calls'});continue;}
      const guards=(call.guards??[]).map(g=>excludes(g.test,g.truthy,arg));
      if(guards.includes(true))continue;
      if(guards.includes(UNKNOWN))ctx.report.narrowing({check:rule,file,reason:'unsupported-expression',capability:'calls'});
      else ctx.report.finding({rule,file,line:call.line,column:call.column});
    }else if(!isParse){
      const own=provenance(call.id),receiver=m.resolve(call.receiver),callee=m.resolve(call.callee);
      if(callee?.kind==='function'&&!m.flow.values.some(v=>v.kind==='call'&&v.functionStart===callee.start))continue;
      // Predicates inspect a line without transferring parser ownership.
      if(['startsWith','endsWith'].includes(call.member))continue;
      if(call.member==='feed'&&parserReceivers.has(receiver?.id))continue;
      if(own?.unknown && [call.receiver,...(call.arguments??[])].some(id=>{const p=provenance(id);return p&&!p.unknown&&['response','body','reader','bytes','text','lines','line','payload'].includes(p.stage)}))
        ctx.report.narrowing({check:rule,file,reason:'unsupported-expression',capability:'calls'});
    }
  }
}

function checkStreamErrors(ctx,file,m) {
  const rule='midstream-error-ignored',{provenance}=streamFacts(m),reported=new Set();
  const same=(a,b)=>a&&b&&a.origin===b.origin&&(a.chunk??a.lineBinding)===(b.chunk??b.lineBinding);
  function excludes(id,truthy,chunk,seen=new Set()) {
    if(seen.has(id))return UNKNOWN;seen=new Set(seen).add(id);
    const v=m.predicate(id);if(!v||v===UNKNOWN)return same(provenance(id),chunk)?UNKNOWN:false;
    const p=provenance(id),path=p?.members?.join('.');
    if(same(p,chunk)&&!p.unknown&&path==='error')return !truthy;
    const op=v.operation;
    if(op?.operator==='!')return excludes(op.operands[0],!truthy,chunk,seen);
    if(op&&(op.operator==='||'&&!truthy||op.operator==='&&'&&truthy)){
      const parts=op.operands.map(x=>excludes(x,truthy,chunk,seen));return parts.includes(true)?true:parts.includes(UNKNOWN)?UNKNOWN:false;
    }
    if(op&&['===','==','!==','!='].includes(op.operator)){
      const [a,b]=op.operands,pa=provenance(a),pb=provenance(b);
      const subject=same(pa,chunk)?pa:same(pb,chunk)?pb:undefined;
      const other=subject===pa?m.literal(b):m.literal(a);
      if(subject&&!subject.unknown&&/^choices\.\d+\.finish_reason$/.test(subject.members?.join('.'))&&other==='error')return ['===','=='].includes(op.operator)?!truthy:truthy;
    }
    if(same(p,chunk)||(op?.operands??[]).some(x=>same(provenance(x),chunk)))return UNKNOWN;
    return false;
  }
  function consume(id,opaque=false) {
    const value=m.values.get(id);if(!value||reported.has(id))return;
    const p=provenance(id);if(!p)return;
    if(p.stage!=='content'&&!(opaque&&p.stage==='chunk'&&!p.members?.length))return;
    reported.add(id);
    const guards=(value.guards??[]).map(g=>excludes(g.test,g.truthy,p));
    if(guards.includes(true))return;
    if(p.unknown||opaque&&p.stage==='chunk'||guards.includes(UNKNOWN))ctx.report.narrowing({check:rule,file,reason:'unsupported-expression',capability:'calls'});
    else ctx.report.finding({rule,file,line:value.line,column:value.column});
  }
  for(const use of m.flow.uses)if(!use.dead&&['write','return','yield','discard'].includes(use.kind))consume(use.value);
  for(const call of m.flow.values.filter(v=>v.kind==='call'&&!v.dead)){
    for(const arg of call.arguments??[])consume(arg,true);
    if(provenance(call.id)?.unknown&&!['startsWith','endsWith'].includes(call.member)){
      for(const id of [call.receiver,...(call.arguments??[])]){const p=provenance(id);
        if(p&&!p.unknown&&['response','body','reader','bytes','text','lines','line','payload','chunks'].includes(p.stage)&&!reported.has(id)){
          reported.add(id);ctx.report.narrowing({check:rule,file,reason:'unsupported-expression',capability:'calls'});
        }
      }
    }
  }
}

function checkRetries(ctx,file,m) {
  const rule='retry-after-ignored',{provenance}=streamFacts(m),calls=m.flow.values.filter(v=>v.kind==='call'&&!v.dead);
  const inside=(value,range)=>value.start>=range.start&&value.end<=range.end;
  const narrow=()=>ctx.report.narrowing({check:rule,file,reason:'unsupported-expression',capability:'calls'});
  function failureTest(id,request,seen=new Set()){
    if(seen.has(id))return undefined;seen=new Set(seen).add(id);
    const v=m.predicate(id);if(!v||v===UNKNOWN)return undefined;
    if(v.operation?.operator==='!'){const result=failureTest(v.operation.operands[0],request,seen);return typeof result==='boolean'?!result:result;}
    if(v.operation&&['||','&&'].includes(v.operation.operator)){
      const parts=v.operation.operands.map(x=>failureTest(x,request,seen));
      if(parts.every(x=>typeof x==='boolean'&&x===parts[0]))return parts[0];
      if(parts.some(x=>x!==undefined))return UNKNOWN;
    }
    if(v.kind==='member'&&v.member==='ok'&&provenance(v.receiver)?.origin===request.id)return m.resolve(v.receiver)===UNKNOWN?UNKNOWN:false;
    if(v.operation&&['===','==','!==','!='].includes(v.operation.operator)){
      const [left,right]=v.operation.operands,a=m.resolve(left),b=m.resolve(right);
      const member=a?.member==='status'?a:b?.member==='status'?b:undefined;
      const status=member===a?m.literal(right):m.literal(left);
      if(member&&provenance(member.receiver)?.origin===request.id&&[429,503].includes(status))return m.resolve(member.receiver)===UNKNOWN?UNKNOWN:['===','=='].includes(v.operation.operator);
    }
    return undefined;
  }
  function containsFunction(id,start,seen=new Set()){
    if(id===undefined||seen.has(id))return false;seen=new Set(seen).add(id);
    const v=m.resolve(id);if(!v||v===UNKNOWN)return false;
    if(v.kind==='function')return v.start===start;
    return [...(v.properties??[]),...(v.elements??[])].some(p=>containsFunction(p.value,start,seen));
  }
  for(const request of calls){
    const native=m.native(request);if(!native)continue;
    const endpoint=m.endpoint(request.arguments?.[0]);if(endpoint===false)continue;
    const loops=m.facts.structure.loops.filter(l=>l.functionStart===request.functionStart&&inside(request,l));
    let retry,uncertain=false;
    for(const loop of loops){
      for(const branch of m.flow.branches??[]){
        if(branch.functionStart!==request.functionStart||branch.whenTrue.start<request.end||!inside(branch.whenTrue,loop))continue;
        const failure=failureTest(branch.test,request);if(failure===undefined)continue;
        if(failure===UNKNOWN){uncertain=true;continue;}
        const failed=failure?branch.whenTrue:branch.whenFalse,success=failure?branch.whenFalse:branch.whenTrue;
        if(failed?.exit==='continue'||['return','break'].includes(success?.exit)&&!['return','throw','break'].includes(loop.tailExit))retry={loop,branch,failure};
        else if(failed?.exit==='throw')uncertain=true;
      }
    }
    if(!retry){
      const callback=request.functionStart!==null&&calls.some(c=>(c.arguments??[]).some(id=>containsFunction(id,request.functionStart)));
      if(uncertain||callback)narrow();
      continue;
    }
    if(native===UNKNOWN||endpoint===UNKNOWN){narrow();continue;}
    let reads=false,unknown=false;
    for(const call of calls){
      if(call.functionStart!==request.functionStart||!inside(call,retry.loop)||call.start<request.end||call.member!=='get'||typeof m.literal(call.arguments?.[0])!=='string'||m.literal(call.arguments[0]).toLowerCase()!=='retry-after')continue;
      const headers=m.resolve(call.receiver),response=headers?.kind==='member'&&headers.member==='headers'?m.resolve(headers.receiver):undefined;
      if(response===UNKNOWN||headers===UNKNOWN){unknown=true;continue;}
      if(response?.id!==request.id)continue;
      const guards=call.guards??[];
      if(guards.some(g=>g.test===retry.branch.test&&g.truthy!==retry.failure))continue;
      if(guards.some(g=>g.test!==retry.branch.test)){unknown=true;continue;}
      reads=true;
    }
    if(!reads){if(unknown)narrow();else ctx.report.finding({rule,file,line:request.line,column:request.column});}
  }
}
