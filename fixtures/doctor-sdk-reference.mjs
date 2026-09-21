export const meta={
  id:'doctor-sdk-reference',category:'SDK reference',severity:'warning',description:'Synthetic second consumer for reusable Doctor SDK recipes.',
  blindSpots:['This confined reference doctor exists to exercise recipe reuse with different APIs and copy; it is not a bundled policy doctor.'],
  checks:[
    {id:'unhandled-flat-map-work',revision:1,reportingUnit:'occurrence',needs:['calls','value-disposition'],onUnknown:'skip',severity:'warning',recipe:{name:'unhandled-value',query:{producer:{member:'flatMap',asyncArgument:0,receiver:'array'},consumers:['TaskGroup.join']}},description:'Reference async flat-map work is unhandled.',claim:'The configured producer result is discarded.',impact:'Reference impact.',why:'Reference rationale.',fix:'Handle or transfer the value.',lookalikes:['handled values']},
    {id:'animation-frame-without-release',revision:1,reportingUnit:'occurrence',needs:['calls','identity','resource-lifetime'],onUnknown:'skip',severity:'warning',recipe:{name:'resource-without-release',query:{acquisition:{globals:['requestAnimationFrame']},owner:{identity:{imports:[{source:'ui-kit',names:['onDispose']}]},argument:0},release:['cancelAnimationFrame']}},description:'Reference animation frame lacks release.',claim:'The configured acquisition has no release in its owner.',impact:'Reference impact.',why:'Reference rationale.',fix:'Cancel the owned frame.',lookalikes:['released frames']},
    {id:'send-without-retry-option',revision:1,reportingUnit:'occurrence',needs:['calls','identity','option-presence'],onUnknown:'skip',severity:'info',recipe:{name:'required-or-recommended-option',query:{call:{globals:['send']},option:{option:'retry',sources:['SendOptions']}}},description:'Reference send omits retry.',claim:'The configured option is absent.',impact:'Reference impact.',why:'Reference rationale.',fix:'Choose a retry policy.',lookalikes:['configured sends']},
    {id:'direct-process-exit',revision:1,reportingUnit:'occurrence',onUnknown:'skip',severity:'warning',recipe:{name:'forbidden-call',query:{target:{globals:['process.exit']}}},description:'Reference direct process exit is forbidden.',claim:'A call resolves to the configured forbidden identity.',impact:'Reference impact.',why:'Reference rationale.',fix:'Return an exit code.',lookalikes:['locally shadowed process objects']},
  ],
};

export async function doctor(ctx){
  if(!ctx.analysis.available)return;
  for(const file of ctx.files.list()){
    const calls=ctx.analysis.calls(file).structure.flow.values.filter(value=>value.kind==='call'&&!value.dead),ref=value=>({id:value.id,start:value.start,end:value.end});
    for(const call of calls){
      ctx.recipes.requiredOrRecommendedOption(file,ref(call),{call:{globals:['send']},option:{option:'retry',sources:['SendOptions']}},{rule:'send-without-retry-option',message:'No explicit retry policy was established.'});
      ctx.recipes.forbiddenCall(file,ref(call),{target:{globals:['process.exit']}},{rule:'direct-process-exit',message:'Return an exit code instead.'});
      if(call.member==='flatMap')ctx.recipes.unhandledValue(file,ref(call),{producer:{member:'flatMap',asyncArgument:0,receiver:'array'},consumers:['TaskGroup.join']},{rule:'unhandled-flat-map-work',message:'Reference flat-map work is unhandled.'});
      if(call.target?.root==='requestAnimationFrame')ctx.recipes.resourceWithoutRelease(file,ref(call),{acquisition:{globals:['requestAnimationFrame']},owner:{identity:{imports:[{source:'ui-kit',names:['onDispose']}]},argument:0},release:['cancelAnimationFrame']},{rule:'animation-frame-without-release',message:'Reference frame ownership has no matching release.'});
    }
  }
}
