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
    {id:'fetch-calls-without-abortsignal',revision:2,reportingUnit:'occurrence',needs:['calls','identity'],onUnknown:'skip',severity:'info',
      description:'Review a native fetch with no established caller cancellation signal.',
      claim:'A resolved native fetch whose input and ordered options establish no caller signal, including an explicit null override of an unknown input.',
      impact:'Cancellation or a deadline may help bound unnecessary or stalled work; omission alone does not establish a bug.',
      why:'Request lifetime requirements differ between server, extension and UI requests. This is a cancellation-policy review candidate.',
      fix:'Check the intended request lifetime and caller contract. If cancellation or a deadline is required, preserve forwarded options and provide an appropriate AbortSignal; abort only when the work should stop.',
      lookalikes:['Request or options carrying a signal','unknown forwarded inputs/options','unrelated local fetch functions']},
    {id:'unawaited-async-map',revision:2,reportingUnit:'occurrence',needs:['calls'],onUnknown:'skip',severity:'warning',
      description:'An array of async-map promises has no supported consumer or ownership transfer.',
      claim:'A known array map with an async callback whose result has no supported element consumer or ownership transfer in its lexical flow.',
      impact:'Dropped promise results can leave errors unobserved and dependent work running before callbacks finish.',
      why:'Awaiting an array, its container or its length does not await the array elements. A combiner consumes its actual iterable, not all values in its source span.',
      fix:'If the work must finish here, await Promise.all on the actual promise array and handle errors. For sequential processing, use a for...of loop with await inside; merely removing async does not make asynchronous work sequential. Preserve intentional ownership transfers.',
      lookalikes:['returned promise arrays','aliases passed to a native combiner','per-element awaits','unrelated map methods','unresolved transfers']},
    {id:'uncleared-settimeout-in-effect',revision:2,reportingUnit:'occurrence',needs:['calls'],onUnknown:'skip',severity:'warning',
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
      if(fetchIdentity.status==='known'&&fetchIdentity.value.matches && m.fetchSignal(c)==='absent') report('fetch-calls-without-abortsignal',c);
      if(c.member==='map' && m.array(c.receiver) && m.resolve(c.arguments[0])?.async){
        if(m.arrayUse(c)==='dropped') report('unawaited-async-map',c);
      }
    }
    for(const effect of m.calls.filter(c=>m.reactEffect(c.callee))){
      const setup=m.resolve(effect.arguments[0]);if(setup?.kind!=='function')continue;
      const active=m.reachable(setup.start), cleanup=new Set();
      for(const u of m.flow.uses.filter(u=>u.kind==='return'&&!u.dead&&u.functionStart===setup.start)){
        const f=m.resolve(u.value);if(f?.kind==='function')for(const start of m.reachable(f.start))cleanup.add(start);
      }
      const clears=m.calls.filter(c=>cleanup.has(c.functionStart)&&m.native(c.callee,'clearTimeout'));
      for(const timer of m.calls.filter(c=>active.has(c.functionStart)&&m.native(c.callee,'setTimeout'))){
        const handles=m.handles(timer);
        if(!clears.some(c=>handles.has(m.handle(c.arguments[0]))))report('uncleared-settimeout-in-effect',timer,'No matching native cancellation was established in a returned cleanup. Opaque cleanup factories, handle reassignment and conditional lifetimes require source review.');
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
  function isUndefined(id){const v=resolve(id);return v?.kind==='void'||v?.kind==='reference'&&v.target.binding===null&&v.target.root==='undefined';}
  function signal(id){
    const v=resolve(id);if(isUndefined(id)||v?.kind==='literal'&&v.literal===null)return 'absent';
    if(v?.kind==='member'&&v.member==='signal'){const base=resolve(v.receiver);if(base?.kind==='construct'&&native(base.callee,'AbortController'))return 'present';}
    if(v?.kind==='call'&&['timeout','abort','any'].includes(v.member)&&native(v.receiver,'AbortSignal'))return 'present';
    return 'unknown';
  }
  function optionsSignal(id){
    if(id===undefined||isUndefined(id)||resolve(id)?.literal===null)return absent;
    // Unknown calls may mutate an options alias. Native fetch itself is a use.
    const raw=values.get(id);if(raw?.target?.binding!==null&&raw?.target?.binding!==undefined){
      const state=states.get(raw.target.binding);
      if(state?.escapes?.some(t=>!(t.binding===null&&t.root==='fetch') && !(t.binding===null&&['window','globalThis','self'].includes(t.root)&&t.members.join('.')==='fetch')))return unknown;
    }
    const p=property(id,'signal');
    if(p.state!=='present')return p;
    return {state:signal(p.value)};
  }
  function fetchSignal(c,seen=new Set()){
    if(seen.has(c.id))return 'unknown';seen=new Set(seen).add(c.id);
    const opts=optionsSignal(c.arguments[1]);
    // An explicit null signal overrides Request.signal; undefined is ignored by
    // WebIDL optional dictionary conversion, so retain Request evidence below.
    const p=property(c.arguments[1],'signal');
    if(p.state==='present'&&resolve(p.value)?.kind==='literal'&&resolve(p.value).literal===null)return 'absent';
    if(opts.state==='unknown'||opts.state==='present')return opts.state;
    const input=resolve(c.arguments[0]);
    if(input?.kind==='construct'&&native(input.callee,'Request'))return fetchSignal(input,seen);
    if(input?.kind==='literal')return 'absent';
    // Template strings (including interpolation) cannot carry Request signals.
    if(input?.primitive==='string'||input?.kind==='reference'&&bindings.get(input.target.binding)?.primitive==='string')return 'absent';
    return 'unknown';
  }
  function array(id,seen=new Set()){
    if(seen.has(id))return false;seen=new Set(seen).add(id);
    const raw=values.get(id);if(states.get(raw?.target?.binding)?.escapes?.length)return false;
    if(raw?.kind==='reference'&&bindings.get(raw.target.binding)?.array&&stable(raw.target.binding))return true;
    const v=resolve(id);if(!v)return false;if(v.kind==='array')return true;
    if(v.kind==='call'&&['filter','slice','concat','map','flat','flatMap','toSorted','toReversed','toSpliced'].includes(v.member))return array(v.receiver,seen);
    return false;
  }
  function combiner(c){
    if(!['all','allSettled','race','any'].includes(c.member))return false;
    return native(c.receiver,'Promise');
  }
  function same(id,c,parameter){
    const raw=values.get(id);if(parameter!==undefined&&raw?.kind==='reference'&&raw.target.binding===parameter)return true;
    const resolved=resolve(id);return resolved?.id===c.id || parameter!==undefined&&resolved?.kind==='reference'&&resolved.target.binding===parameter;
  }
  function iterable(id,c,parameter){
    if(same(id,c,parameter))return true;
    const v=resolve(id);return v?.kind==='array'&&v.elements.some(e=>e.spread&&same(e.value,c,parameter));
  }
  function contains(id,c,parameter,seen=new Set()){
    if(same(id,c,parameter))return true;
    const v=resolve(id);if(!v||seen.has(v.id))return false;seen=new Set(seen).add(v.id);
    // Containers transfer values, but functions do not transfer their inner work.
    const children=v.kind==='array'?v.elements:v.kind==='object'?v.properties:[];
    return children.some(e=>contains(e.value,c,parameter,seen));
  }
  function arrayUse(c,parameter,owner=c.functionStart,seen=new Set()){
    const key=c.id+':'+parameter+':'+owner;if(seen.has(key))return 'unknown';seen=new Set(seen).add(key);
    const direct=u=>!u.dead&&u.functionStart===owner;
    if(flow.uses.some(u=>direct(u)&&u.kind==='return'&&same(u.value,c,parameter)))return 'transferred';
    for(const call of calls.filter(v=>v.functionStart===owner)){
      if(combiner(call)&&iterable(call.arguments[0],c,parameter))return 'consumed';
    }
    for(const loop of flow.loops.filter(l=>l.functionStart===owner&&iterable(l.iterable,c,parameter))){
      if(loop.await)return 'consumed';
      if(flow.uses.some(u=>direct(u)&&u.kind==='await'&&values.get(u.value)?.start>=loop.start&&values.get(u.value)?.end<=loop.end&&values.get(u.value)?.kind==='reference'&&values.get(u.value).target.binding===loop.binding))return 'consumed';
    }
    let uncertain=flow.uses.some(u=>direct(u)&&u.kind==='return'&&contains(u.value,c,parameter)) || calls.some(call=>call.functionStart===owner&&same(call.receiver,c,parameter));
    for(const call of calls.filter(v=>v.functionStart===owner&&!combiner(v))){
      for(let i=0;i<call.arguments.length;i++)if(contains(call.arguments[i],c,parameter)){
        if(!same(call.arguments[i],c,parameter)){uncertain=true;continue;}
        const f=resolve(call.callee);
        if(f?.kind==='function'){
          const p=facts.structure.bindings.find(b=>b.parameter?.functionStart===f.start&&b.parameter.index===i);
          const outcome=p?arrayUse(c,p.binding,f.start,seen):'unknown';
          if(outcome==='consumed')return outcome;
          if(outcome==='transferred'){const next=arrayUse(call,undefined,call.functionStart,seen);if(next!=='dropped')return next;}
          if(outcome==='unknown')uncertain=true;
        }else uncertain=true;
      }
    }
    // Reassignment or opaque containment is uncertainty, not a dropped-value proof.
    for(const b of flow.bindings)if(b.initializer===c.id&&!stable(b.binding))uncertain=true;
    if(flow.uses.some(u=>u.kind==='write'&&u.value===c.id))uncertain=true;
    return uncertain?'unknown':'dropped';
  }
  function reachable(start){
    const result=new Set([start]),queue=[start];
    while(queue.length){const owner=queue.shift();for(const c of calls.filter(c=>c.functionStart===owner)){
      const f=resolve(c.callee);if(f?.kind==='function'&&!result.has(f.start)){result.add(f.start);queue.push(f.start);}
    }}return result;
  }
  function handle(id,seen=new Set()){
    const raw=values.get(id);if(!raw||seen.has(id))return null;seen=new Set(seen).add(id);
    if(raw.kind==='reference'&&raw.target.binding!==null){
      const b=bindings.get(raw.target.binding),init=values.get(b?.initializer);
      if(stable(raw.target.binding)&&init?.kind==='reference')return handle(init.id,seen);
      return raw.target.binding;
    }
    return null;
  }
  function handles(c){const out=new Set();for(const b of bindings.values())if(b.initializer===c.id)out.add(b.binding);
    for(const u of flow.uses)if(!u.dead&&u.kind==='write'&&u.value===c.id)out.add(u.binding);
    for(const binding of out)if(flow.uses.some(u=>!u.dead&&u.kind==='write'&&u.binding===binding&&u.value!==c.id))out.delete(binding);
    return out;
  }
  const ref=id=>{const v=values.get(id);return {id:v.id,start:v.start,end:v.end}};
  return {flow,calls,resolve,native,reactEffect,array,arrayUse,fetchSignal,reachable,handle,handles,ref};
}
