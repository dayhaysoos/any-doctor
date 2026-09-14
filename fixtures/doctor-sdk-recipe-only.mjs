// Synthetic public-SDK consumer: a recipe implies its analysis requirements.
export const meta={id:'recipe-only',description:'Recipe-only certification control',severity:'warning',checks:[{
 id:'recipe-only-map',description:'Discarded async map',claim:'A native async-map array is discarded',lookalikes:['custom object map'],onUnknown:'skip',
 recipe:{name:'unhandled-value',query:{producer:{member:'map',asyncArgument:0,receiver:'array'},consumers:['Promise.all']}}
}]};
export async function doctor(ctx){
 if(!ctx.analysis.available)return;
 for(const file of ctx.files.list())for(const call of ctx.analysis.calls(file).structure.flow.values){
  if(call.kind!=='call'||call.dead||call.member!=='map')continue;
  ctx.recipes.unhandledValue(file,call,meta.checks[0].recipe.query,{rule:'recipe-only-map'});
 }
}
