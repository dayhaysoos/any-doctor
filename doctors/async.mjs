export const meta = {
  id: 'async', category: 'Async', severity: 'warning',
  description: 'Review promise-array ownership, effect timer cleanup and request cancellation.',
  blindSpots: [
    'All checks require calls analysis and abstain when it is unavailable; the report exposes narrowed coverage, never a clean bill of health.',
    'Native globals and React imports are resolved lexically. Cross-file wrappers, monkey-patched globals and arbitrary runtime types are not interpreted.',
    'Array identity uses literals, declared array parameters and supported array-producing chains. Unknown receivers/transfers abstain; return transfers ownership, not proof of settlement.',
    'Timer cleanup follows returned functions and direct local helper calls. Conditional cancellation and multiple outstanding writes to one handle remain review cases, not proofs of a leak.',
    'Fetch options use ordered local properties/spreads and Request constructors. Unknown inputs/options, mutation and escapes abstain; signal presence is not proof that anyone aborts.',
    'Fixture-named files and default diagnostic extension exclusions remain outside the scan.',
  ],
  checks: [
    {id:'fetch-calls-without-abortsignal',revision:2,reportingUnit:'occurrence',needs:['calls','identity','option-presence'],onUnknown:'skip',severity:'info',
      description:'Review a native fetch with no established caller cancellation signal.',
      claim:'A resolved native fetch whose input and ordered options establish no caller signal, including an explicit null override of an unknown input.',
      impact:'Cancellation or a deadline may help bound unnecessary or stalled work; omission alone does not establish a bug.',
      why:'Request lifetime requirements differ between server, extension and UI requests. This is a cancellation-policy review candidate.',
      fix:'Check the intended request lifetime and caller contract. If cancellation or a deadline is required, preserve forwarded options and provide an appropriate AbortSignal; abort only when the work should stop.',
      lookalikes:['Request or options carrying a signal','unknown forwarded inputs/options','unrelated local fetch functions']},
    {id:'unawaited-async-map',revision:2,reportingUnit:'occurrence',needs:['calls','value-disposition'],onUnknown:'skip',severity:'warning',
      description:'An array of async-map promises has no supported consumer or ownership transfer.',
      claim:'A known array map with an async callback whose result has no supported element consumer or ownership transfer in its lexical flow.',
      impact:'Dropped promise results can leave errors unobserved and dependent work running before callbacks finish.',
      why:'Awaiting an array, its container or its length does not await the array elements. A combiner consumes its actual iterable, not all values in its source span.',
      fix:'If the work must finish here, await Promise.all on the actual promise array and handle errors. For sequential processing, use a for...of loop with await inside; merely removing async does not make asynchronous work sequential. Preserve intentional ownership transfers.',
      lookalikes:['returned promise arrays','aliases passed to a native combiner','per-element awaits','unrelated map methods','unresolved transfers']},
    {id:'uncleared-settimeout-in-effect',revision:2,reportingUnit:'occurrence',needs:['calls','identity','resource-lifetime'],onUnknown:'skip',severity:'warning',
      description:'Review an effect timer with no matching cancellation in its returned cleanup.',
      claim:'A native setTimeout reachable from a resolved React effect has no supported returned-cleanup cancellation of its actual handle.',
      impact:'The callback may outlive the effect that scheduled it; whether that is wrong depends on the intended lifetime.',
      why:'A matching name or an uncalled helper does not cancel this timer. React runs the returned cleanup on replacement or unmount.',
      fix:'If this timer belongs to the effect lifetime, retain its handle and cancel that handle from returned cleanup. Preserve deliberate completion, rescheduling and cancellation guards; inspect unresolved helper or handle flow before editing.',
      lookalikes:['qualified native cleanup of the same handle','returned cleanup helpers','local API lookalikes','shadowed handles']},
  ],
};

export async function doctor(ctx) {
  if (!ctx.analysis.available) return;
  for (const file of ctx.files.list()) {
    if (file.endsWith('.fixtures.mjs')) continue;
    const facts=ctx.analysis.calls(file), m=model(facts);
    const report=(rule,c,message)=>ctx.report.finding({rule,file,line:c.line,column:c.column,
      evidence:{endLine:c.endLine,endColumn:c.endColumn},...(message?{message}: {})});
    for(const c of m.calls){
      const fetchIdentity=ctx.analysis.identity(file,m.ref(c.callee),{globals:['fetch','window.fetch','globalThis.fetch','self.fetch']});
      if(fetchIdentity.status==='known'&&fetchIdentity.value.matches){const option=ctx.analysis.optionPresence(file,m.ref(c.id),{option:'signal',sources:['RequestInit','Request']});if(option.status==='known'&&option.value==='absent')report('fetch-calls-without-abortsignal',c);}
      if(c.member==='map' && m.array(c.receiver) && m.resolve(c.arguments[0])?.async){
        const disposition=ctx.analysis.valueDisposition(file,m.ref(c.id),{consumers:['Promise.all','Promise.allSettled','Promise.any','Promise.race','globalThis.Promise.all','globalThis.Promise.allSettled','globalThis.Promise.any','globalThis.Promise.race']});
        if(disposition.status==='known'&&disposition.value==='discarded') report('unawaited-async-map',c);
      }
    }
    for(const effect of m.calls.filter(c=>m.reactEffect(c.callee))){
      const setup=m.resolve(effect.arguments[0]);if(setup?.kind!=='function')continue;
      for(const timer of m.calls){
        const timerIdentity=ctx.analysis.identity(file,m.ref(timer.callee),{globals:['setTimeout','window.setTimeout','globalThis.setTimeout']});
        if(timerIdentity.status!=='known'||!timerIdentity.value.matches)continue;
        const lifetime=ctx.analysis.resourceLifetime(file,m.ref(timer.id),{owner:m.ref(setup.id),release:['clearTimeout','window.clearTimeout','globalThis.clearTimeout']});
        if(lifetime.status==='known'&&lifetime.value==='unreleased')report('uncleared-settimeout-in-effect',timer,'No matching native cancellation was established in a returned cleanup. Opaque cleanup factories, handle reassignment and conditional lifetimes require source review.');
        if(lifetime.status==='unknown'&&lifetime.reason!=='outside-owner')report('uncleared-settimeout-in-effect',timer,'Cleanup analysis is uncertain for this timer. No supported matching cancellation was established; inspect opaque, conditional or reassigned cleanup flow before editing.');
      }
    }
  }
}

function model(facts){
  const flow=facts.structure.flow, values=new Map(flow.values.map(v=>[v.id,v])),
    bindings=new Map(flow.bindings.map(b=>[b.binding,b])), states=new Map(facts.structure.bindings.map(b=>[b.binding,b]));
  const calls=flow.values.filter(v=>v.kind==='call'&&!v.dead), absent={state:'absent'}, unknown={state:'unknown'};
  const stable=b=>!states.get(b)?.reassigned&&!states.get(b)?.mutated;
  function resolve(id,seen=new Set()){
    const v=values.get(id);if(!v||seen.has(id))return null;seen=new Set(seen).add(id);
    if(v.kind==='reference'&&v.target.binding!==null){
      const b=bindings.get(v.target.binding);
      if(!stable(v.target.binding))return null;
      if(b?.initializer!==undefined)return resolve(b.initializer,seen);
      const shared=states.get(v.target.binding);
      if(shared?.path?.length && shared.initializer!==undefined){
        // Existing destructuring facts address the initializer's source start.
        const root=flow.values.find(x=>x.start===shared.initializer&&x.kind==='reference');
        let current=root;for(const name of shared.path){const p=property(current?.id,name,seen);current=p.state==='present'?resolve(p.value,seen):null;}
        if(current)return current;
      }
    }
    if(v.kind==='member'){
      const p=property(v.receiver,v.member,seen);if(p.state==='present')return resolve(p.value,seen);
      if(p.state==='unknown' && resolve(v.receiver,seen)?.kind==='object')return null;
    }
    return v;
  }
  function property(id,name,seen=new Set()){
    if(name===null)return unknown;
    const raw=values.get(id), state=states.get(raw?.target?.binding);
    if(state?.escapes?.some(t=>!(t.binding===null&&t.root==='fetch')&&!(t.binding===null&&['window','globalThis','self'].includes(t.root)&&t.members.join('.')==='fetch')))return unknown;
    const v=resolve(id,seen);if(!v)return unknown;
    if(v.kind!=='object')return unknown;
    let result=absent;
    for(const p of v.properties){
      if(p.spread){const s=property(p.value,name,new Set(seen).add(v.id));if(s.state!=='absent')result=s;}
      else if(p.name===null)result=unknown;
      else if(p.name===name)result=p.accessor?unknown:{state:'present',value:p.value};
    }
    return result;
  }
  function native(id,name){
    const v=resolve(id);if(!v)return false;
    if(v.kind==='reference')return v.target.binding===null && v.target.root===name;
    if(v.kind==='member'&&v.member===name){const root=resolve(v.receiver);return root?.kind==='reference'&&root.target.binding===null&&['window','globalThis','self'].includes(root.target.root);}
    return false;
  }
  function reactEffect(id){
    const v=resolve(id);if(!v)return false;
    if(v.kind==='reference')return v.target.source==='react'&&v.target.importedName==='useEffect';
    if(v.kind==='member'&&v.member==='useEffect'){const root=resolve(v.receiver);return root?.target?.source==='react'&&['*','default'].includes(root.target.importedName);}
    return false;
  }
  function array(id,seen=new Set()){
    if(seen.has(id))return false;seen=new Set(seen).add(id);
    const raw=values.get(id);if(states.get(raw?.target?.binding)?.escapes?.length)return false;
    if(raw?.kind==='reference'&&bindings.get(raw.target.binding)?.array&&stable(raw.target.binding))return true;
    const v=resolve(id);if(!v)return false;if(v.kind==='array')return true;
    if(v.kind==='call'&&['filter','slice','concat','map','flat','flatMap','toSorted','toReversed','toSpliced'].includes(v.member))return array(v.receiver,seen);
    return false;
  }
  const ref=id=>{const v=values.get(id);return {id:v.id,start:v.start,end:v.end}};
  return {flow,calls,resolve,native,reactEffect,array,ref};
}
