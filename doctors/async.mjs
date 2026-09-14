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
      recipe:{name:'required-or-recommended-option',query:{call:{globals:['fetch','window.fetch','globalThis.fetch','self.fetch']},option:{option:'signal',sources:['RequestInit','Request']}}},
      description:'Review a native fetch with no established caller cancellation signal.',
      claim:'A resolved native fetch whose input and ordered options establish no caller signal, including an explicit null override of an unknown input.',
      impact:'Cancellation or a deadline may help bound unnecessary or stalled work; omission alone does not establish a bug.',
      why:'Request lifetime requirements differ between server, extension and UI requests. This is a cancellation-policy review candidate.',
      fix:'Check the intended request lifetime and caller contract. If cancellation or a deadline is required, preserve forwarded options and provide an appropriate AbortSignal; abort only when the work should stop.',
      lookalikes:['Request or options carrying a signal','unknown forwarded inputs/options','unrelated local fetch functions']},
    {id:'unawaited-async-map',revision:2,reportingUnit:'occurrence',needs:['calls','value-disposition'],onUnknown:'skip',severity:'warning',
      recipe:{name:'unhandled-value',query:{producer:{member:'map',asyncArgument:0,receiver:'array'},consumers:['Promise.all','Promise.allSettled','Promise.any','Promise.race','globalThis.Promise.all','globalThis.Promise.allSettled','globalThis.Promise.any','globalThis.Promise.race']}},
      description:'An array of async-map promises has no supported consumer or ownership transfer.',
      claim:'A known array map with an async callback whose result has no supported element consumer or ownership transfer in its lexical flow.',
      impact:'Dropped promise results can leave errors unobserved and dependent work running before callbacks finish.',
      why:'Awaiting an array, its container or its length does not await the array elements. A combiner consumes its actual iterable, not all values in its source span.',
      fix:'If the work must finish here, await Promise.all on the actual promise array and handle errors. For sequential processing, use a for...of loop with await inside; merely removing async does not make asynchronous work sequential. Preserve intentional ownership transfers.',
      lookalikes:['returned promise arrays','aliases passed to a native combiner','per-element awaits','unrelated map methods','unresolved transfers']},
    {id:'uncleared-settimeout-in-effect',revision:2,reportingUnit:'occurrence',needs:['calls','identity','resource-lifetime'],onUnknown:'skip',severity:'warning',
      recipe:{name:'resource-without-release',query:{acquisition:{globals:['setTimeout','window.setTimeout','globalThis.setTimeout']},owner:{identity:{imports:[{source:'react',names:['useEffect','*.useEffect','default.useEffect']}]},argument:0},release:['clearTimeout','window.clearTimeout','globalThis.clearTimeout'],reportUnknown:['unsupported-expression']}},
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
    const flow=ctx.analysis.calls(file).structure.flow, calls=flow.values.filter(value=>value.kind==='call'&&!value.dead);
    const ref=value=>({id:value.id,start:value.start,end:value.end});
    for(const call of calls){
      ctx.recipes.requiredOrRecommendedOption(file,ref(call),{
        call:{globals:['fetch','window.fetch','globalThis.fetch','self.fetch']},option:{option:'signal',sources:['RequestInit','Request']},
      },{rule:'fetch-calls-without-abortsignal'});
      if(call.member==='map')ctx.recipes.unhandledValue(file,ref(call),{
        producer:{member:'map',asyncArgument:0,receiver:'array'},consumers:['Promise.all','Promise.allSettled','Promise.any','Promise.race','globalThis.Promise.all','globalThis.Promise.allSettled','globalThis.Promise.any','globalThis.Promise.race'],
      },{rule:'unawaited-async-map'});
      if(call.target?.root==='setTimeout'||call.target?.members?.at(-1)==='setTimeout')ctx.recipes.resourceWithoutRelease(file,ref(call),{
        acquisition:{globals:['setTimeout','window.setTimeout','globalThis.setTimeout']},owner:{identity:{imports:[{source:'react',names:['useEffect','*.useEffect','default.useEffect']}]},argument:0},release:['clearTimeout','window.clearTimeout','globalThis.clearTimeout'],reportUnknown:['unsupported-expression'],
      },{rule:'uncleared-settimeout-in-effect',message:'No supported matching native cancellation was established in a returned cleanup. Opaque, conditional or reassigned cleanup flow requires source review.'});
    }
  }
}
