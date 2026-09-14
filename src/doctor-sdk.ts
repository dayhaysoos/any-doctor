import { createHash } from "node:crypto";
import type {
  AnalysisCalls, CallTarget, ExpressionRef, IdentityOrigin, IdentityQuery,
  IdentityValue, SemanticEvidence, SemanticResult, SourceRange, ValueDisposition,
  ValueDispositionQuery, ResourceLifetime, ResourceLifetimeQuery,
} from "./contract.js";
import { SEMANTIC_RESULT_VERSION } from "./contract.js";

type FlowValue = AnalysisCalls["structure"]["flow"]["values"][number];

  const unknown = <T>(reason: "provider-failure" | "unsupported-expression" | "unresolved-identity" | "outside-owner", evidence?: SemanticEvidence[]): SemanticResult<T> => ({
  version: SEMANTIC_RESULT_VERSION,
  status: "unknown",
  reason,
  ...(evidence?.length ? { evidence } : {}),
});

/** Host-owned lexical identity. The doctor supplies accepted technology names;
 * parsing, alias resolution, shadowing and evidence stay behind this seam. */
export function identityResult(
  file: string,
  source: string,
  facts: AnalysisCalls,
  expression: ExpressionRef,
  query: IdentityQuery,
): SemanticResult<IdentityValue> {
  const digest = createHash("sha256").update(source).digest("hex");
  const flow = facts.structure.flow;
  const values = new Map(flow.values.map((value) => [value.id, value]));
  const bindings = new Map(flow.bindings.map((binding) => [binding.binding, binding]));
  const states = new Map(facts.structure.bindings.map((binding) => [binding.binding, binding]));
  // Expression coordinates are the stable transport identity. The numeric id
  // is a same-projection fast path, not a promise that provider traversal ids
  // remain identical across independently materialized models.
  const byId = values.get(expression.id);
  const start = byId?.start === expression.start && byId.end === expression.end
    ? byId
    : flow.values.find((value) => value.start === expression.start && value.end === expression.end);
  if (!start) return unknown("unsupported-expression");

  const evidence: SemanticEvidence[] = [];
  const addEvidence = (kind: SemanticEvidence["kind"], value: FlowValue, relationship?: string): void => {
    if (evidence.some((item) => item.kind === kind && item.range.start === value.start && item.range.end === value.end)) return;
    evidence.push({ kind, file, sourceDigest: digest, range: rangeOf(value), ...(relationship ? { relationship } : {}) });
  };
  const stable = (binding: number): boolean => !states.get(binding)?.reassigned && !states.get(binding)?.mutated;
  const resolve = (id: number, seen = new Set<number>()): FlowValue | null => {
    const value = values.get(id);
    if (!value || seen.has(id)) return null;
    addEvidence(seen.size ? "alias" : "expression", value, seen.size ? "immutable-alias" : undefined);
    seen = new Set(seen).add(id);
    if (value.kind === "reference" && value.target?.binding !== null && value.target?.binding !== undefined) {
      const binding = value.target.binding;
      if (!stable(binding)) return value;
      const initializer = bindings.get(binding)?.initializer;
      if (initializer !== undefined) {
        const resolved = resolve(initializer, seen);
        if (resolved?.target) return resolved;
        return value;
      }
    }
    return value;
  };

  const resolved = resolve(start.id);
  if (!resolved?.target) return unknown("unsupported-expression", evidence);
  const origin = originOf(resolved.target);
  if (!origin) return unknown("unresolved-identity", evidence);
  if (origin.kind === "global" && !(query.globals ?? []).includes(origin.name)) return unknown("unresolved-identity", evidence);
  if (origin.kind === "local") {
    const declaration = flow.values.find((value) => value.start === origin.binding && value.kind === "reference");
    if (declaration) evidence.push({ kind: "binding", file, sourceDigest: digest, range: rangeOf(declaration), relationship: "lexical-binding" });
  }
  return { version: SEMANTIC_RESULT_VERSION, status: "known", value: { matches: matches(origin, query), origin }, evidence };
}

/** Host-owned bounded value disposition. It follows exact expression identity,
 * immutable aliases and the already-supported local relationships; unsupported
 * transfers stay unknown instead of becoming discarded. */
export function valueDispositionResult(
  file: string,
  source: string,
  facts: AnalysisCalls,
  expression: ExpressionRef,
  query: ValueDispositionQuery,
): SemanticResult<ValueDisposition> {
  const digest=createHash("sha256").update(source).digest("hex"),flow=facts.structure.flow;
  const values=new Map(flow.values.map(value=>[value.id,value])),bindings=new Map(flow.bindings.map(binding=>[binding.binding,binding])),states=new Map(facts.structure.bindings.map(binding=>[binding.binding,binding]));
  const byId=values.get(expression.id),subject=byId?.start===expression.start&&byId.end===expression.end?byId:flow.values.find(value=>value.start===expression.start&&value.end===expression.end);
  if(!subject)return unknown("unsupported-expression");
  const evidence:SemanticEvidence[]=[{kind:"expression",file,sourceDigest:digest,range:rangeOf(subject)}];
  const stable=(binding:number)=>!states.get(binding)?.reassigned&&!states.get(binding)?.mutated;
  const resolve=(id:number,seen=new Set<number>()):FlowValue|null=>{const value=values.get(id);if(!value||seen.has(id))return null;seen=new Set(seen).add(id);if(value.kind==="reference"&&value.target?.binding!==null&&value.target?.binding!==undefined){const binding=value.target.binding,initializer=bindings.get(binding)?.initializer;if(stable(binding)&&initializer!==undefined)return resolve(initializer,seen)??value;}if(value.kind==="member"&&value.receiver!==undefined&&value.member!==null&&value.member!==undefined){const receiver=resolve(value.receiver,seen);if(receiver?.kind==="object"){let property:NonNullable<FlowValue["properties"]>[number]|undefined;for(const item of receiver.properties??[])if(!item.spread&&item.name===value.member)property=item;if(property&&!property.accessor)return resolve(property.value,seen)??value;}}return value;};
  const same=(id:number,parameter?:number)=>{const raw=values.get(id);if(parameter!==undefined&&raw?.kind==="reference"&&raw.target?.binding===parameter)return true;const resolved=resolve(id);return resolved?.id===subject.id||parameter!==undefined&&resolved?.kind==="reference"&&resolved.target?.binding===parameter;};
  const contains=(id:number,parameter?:number,seen=new Set<number>()):boolean=>{if(same(id,parameter))return true;const value=resolve(id);if(!value||seen.has(value.id))return false;seen=new Set(seen).add(value.id);if(value.kind==="await"&&value.value!==undefined)return contains(value.value,parameter,seen);if(value.kind==="choice")return !!value.alternatives?.length&&value.alternatives.every(item=>contains(item,parameter,seen));const children=value.kind==="array"?value.elements:value.kind==="object"?value.properties:[];return !!children?.some(item=>contains(item.value,parameter,seen));};
  const iterable=(id:number,parameter?:number)=>{if(same(id,parameter))return true;const value=resolve(id);return value?.kind==="array"&&!!value.elements?.some(item=>item.spread&&same(item.value,parameter));};
  const targetName=(id:number):string|null=>{const value=resolve(id);if(!value?.target||value.target.binding!==null||!value.target.root)return null;return [value.target.root,...value.target.members].join(".");};
  const calls=flow.values.filter(value=>value.kind==="call"&&!value.dead);
  const consumerTakes=(call:FlowValue,parameter?:number):boolean=>{
    const role=call.argumentRoles?.[0];if(!role)return false;
    if(!role.spread)return iterable(role.value,parameter);
    const spread=resolve(role.value);const first=spread?.kind==="array"?spread.elements?.[0]:undefined;
    return !!first&&!first.spread&&same(first.value,parameter);
  };
  const spreadArgument=(call:FlowValue,parameter?:number):boolean=>(call.argumentRoles??[]).some(role=>role.spread&&same(role.value,parameter));
  const disposition=(parameter:number|undefined,owner:number|null,seen=new Set<string>()):ValueDisposition|"unknown"=>{
    const key=`${subject.id}:${parameter}:${owner}`;if(seen.has(key))return "unknown";seen=new Set(seen).add(key);
    const direct=(use:typeof flow.uses[number])=>!use.dead&&use.functionStart===owner;
    if(flow.uses.some(use=>direct(use)&&(use.kind==="return"||use.kind==="yield")&&contains(use.value,parameter))){
      const use=flow.uses.find(item=>direct(item)&&(item.kind==="return"||item.kind==="yield")&&contains(item.value,parameter));
      if(use){const value=values.get(use.value);if(value)evidence.push({kind:"expression",file,sourceDigest:digest,range:rangeOf(value),relationship:use.kind});}
      return "transferred";
    }
    for(const call of calls.filter(value=>value.functionStart===owner))if(query.consumers.includes(targetName(call.callee!)??"")&&consumerTakes(call,parameter))return "consumed";
    for(const loop of flow.loops.filter(loop=>loop.functionStart===owner&&iterable(loop.iterable,parameter))){if(loop.await||flow.uses.some(use=>direct(use)&&use.kind==="await"&&values.get(use.value)!.start>=loop.start&&values.get(use.value)!.end<=loop.end&&values.get(use.value)?.kind==="reference"&&values.get(use.value)?.target?.binding===loop.binding))return "consumed";}
    for(const store of calls.filter(call=>call.functionStart===owner&&call.member==="push"&&call.receiver!==undefined&&spreadArgument(call,parameter))){
      if(calls.some(call=>call.functionStart===owner&&query.consumers.includes(targetName(call.callee!)??"")&&consumerTakesValue(call,store.receiver!)))return "consumed";
      return "transferred";
    }
    let uncertain=calls.some(call=>call.functionStart===owner&&call.receiver!==undefined&&same(call.receiver,parameter));
    for(const call of calls.filter(value=>value.functionStart===owner&&!query.consumers.includes(targetName(value.callee!)??""))){
      for(let index=0;index<(call.arguments?.length??0);index++)if(contains(call.arguments![index],parameter)){
        if(!same(call.arguments![index],parameter)){uncertain=true;continue;}
        const fn=resolve(call.callee!);if(fn?.kind==="function"){
          const role=call.argumentRoles?.[index],binding=flow.bindings.find(item=>item.parameter?.functionStart===fn.start&&item.parameter.index===index);
          if(role?.spread&&!binding?.rest){uncertain=true;continue;}
          const nested=binding?disposition(binding.binding,fn.start,seen):"unknown";
          if(nested==="consumed")return nested;if(nested==="transferred"){const next=valueDispositionOfCall(call,owner,seen);if(next!=="discarded")return next;}if(nested==="unknown")uncertain=true;
        }else uncertain=true;
      }
    }
    for(const binding of flow.bindings)if(binding.initializer===subject.id&&!stable(binding.binding))uncertain=true;
    if(flow.uses.some(use=>use.kind==="write"&&use.value===subject.id))uncertain=true;
    return uncertain?"unknown":"discarded";
  };
  const consumerTakesValue=(call:FlowValue,valueId:number):boolean=>{
    const role=call.argumentRoles?.[0];if(!role)return false;
    if(!role.spread){const value=resolve(role.value);return value?.id===resolve(valueId)?.id||value?.kind==="array"&&!!value.elements?.some(item=>item.spread&&resolve(item.value)?.id===resolve(valueId)?.id);}
    const spread=resolve(role.value),first=spread?.kind==="array"?spread.elements?.[0]:undefined;return !!first&&!first.spread&&resolve(first.value)?.id===resolve(valueId)?.id;
  };
  const valueDispositionOfCall=(call:FlowValue,owner:number|null,seen:Set<string>):ValueDisposition|"unknown"=>{
    if(flow.uses.some(use=>!use.dead&&use.functionStart===owner&&(use.kind==="return"||use.kind==="yield")&&containsCall(use.value,call.id)))return "transferred";
    if(calls.some(consumer=>consumer.functionStart===owner&&query.consumers.includes(targetName(consumer.callee!)??"")&&consumerTakesValue(consumer,call.id)))return "consumed";
    return flow.uses.some(use=>!use.dead&&use.functionStart===owner&&use.kind==="discard"&&containsCall(use.value,call.id))?"discarded":"unknown";
  };
  const containsCall=(id:number,callId:number)=>resolve(id)?.id===callId;
  const result=disposition(undefined,subject.functionStart);
  return result==="unknown"?{version:SEMANTIC_RESULT_VERSION,status:"unknown",reason:"unsupported-expression",evidence}:{version:SEMANTIC_RESULT_VERSION,status:"known",value:result,evidence};
}

/** Host-owned resource matching through returned cleanup functions and directly
 * called local helpers/factories. It proves release only for the exact handle. */
export function resourceLifetimeResult(file:string,source:string,facts:AnalysisCalls,acquisition:ExpressionRef,query:ResourceLifetimeQuery):SemanticResult<ResourceLifetime>{
  const digest=createHash('sha256').update(source).digest('hex'),flow=facts.structure.flow,values=new Map(flow.values.map(value=>[value.id,value])),bindings=new Map(flow.bindings.map(binding=>[binding.binding,binding])),states=new Map(facts.structure.bindings.map(binding=>[binding.binding,binding]));
  const pick=(ref:ExpressionRef)=>{const byId=values.get(ref.id);return byId?.start===ref.start&&byId.end===ref.end?byId:flow.values.find(value=>value.start===ref.start&&value.end===ref.end);};
  const subject=pick(acquisition),owner=pick(query.owner);if(!subject||subject.kind!=='call'||!owner||owner.kind!=='function')return unknown('unsupported-expression');
  const evidence:SemanticEvidence[]=[{kind:'expression',file,sourceDigest:digest,range:rangeOf(subject),relationship:'acquisition'}];
  const stable=(binding:number)=>!states.get(binding)?.reassigned&&!states.get(binding)?.mutated;
  const resolve=(id:number,seen=new Set<number>()):FlowValue|null=>{const value=values.get(id);if(!value||seen.has(id))return null;seen=new Set(seen).add(id);if(value.kind==='reference'&&value.target?.binding!==null&&value.target?.binding!==undefined){const binding=value.target.binding,initializer=bindings.get(binding)?.initializer;if(stable(binding)&&initializer!==undefined)return resolve(initializer,seen)??value;}return value;};
  const name=(id:number):string|null=>{const value=resolve(id);if(!value?.target||value.target.binding!==null||!value.target.root)return null;return [value.target.root,...value.target.members].join('.');};
  const acquisitionBindings=new Set<number>();for(const binding of flow.bindings)if(binding.initializer===subject.id&&stable(binding.binding))acquisitionBindings.add(binding.binding);for(const use of flow.uses)if(!use.dead&&use.kind==='write'&&use.value===subject.id&&use.binding!==undefined&&!flow.uses.some(other=>!other.dead&&other.kind==='write'&&other.binding===use.binding&&other.value!==subject.id))acquisitionBindings.add(use.binding);
  const isHandle=(id:number,env:ReadonlySet<number>,seen=new Set<number>()):boolean=>{const value=values.get(id);if(!value||seen.has(id))return false;seen=new Set(seen).add(id);if(value.kind==='reference'&&value.target?.binding!==null&&value.target?.binding!==undefined){const binding=value.target.binding;if(env.has(binding)||acquisitionBindings.has(binding))return true;const initializer=bindings.get(binding)?.initializer;return stable(binding)&&initializer!==undefined&&isHandle(initializer,env,seen);}return false;};
  const calls=flow.values.filter(value=>value.kind==='call'&&!value.dead);
  const reachable=new Set<number>([owner.start]),queue=[owner.start];while(queue.length){const current=queue.shift()!;for(const call of calls.filter(value=>value.functionStart===current)){const fn=resolve(call.callee!);if(fn?.kind==='function'&&!reachable.has(fn.start)){reachable.add(fn.start);queue.push(fn.start);}}}
  if(subject.functionStart!==owner.start&&!reachable.has(subject.functionStart??-1))return unknown('outside-owner',evidence);
  type Context={start:number;handles:Set<number>;conditional:boolean};
  const bindArgs=(call:FlowValue,fn:FlowValue,parent:ReadonlySet<number>):Set<number>=>{const out=new Set<number>();for(const parameter of flow.bindings.filter(binding=>binding.parameter?.functionStart===fn.start)){const actual=call.arguments?.[parameter.parameter!.index];if(actual!==undefined&&isHandle(actual,parent))out.add(parameter.binding);}return out;};
  const cleanupContexts=(id:number,parent:ReadonlySet<number>,seen=new Set<number>()):Context[]|null=>{const value=resolve(id);if(!value||seen.has(value.id))return null;seen=new Set(seen).add(value.id);if(value.kind==='function')return [{start:value.start,handles:new Set(parent),conditional:!!value.conditional}];if(value.kind==='call'){const fn=resolve(value.callee!);if(fn?.kind!=='function')return null;const env=bindArgs(value,fn,parent),returns=flow.uses.filter(use=>!use.dead&&use.kind==='return'&&use.functionStart===fn.start);if(!returns.length)return [];const all=returns.flatMap(use=>cleanupContexts(use.value,env,seen)??[]);return all.length?all:null;}if(value.kind==='choice'){const branches=value.alternatives?.map(item=>cleanupContexts(item,parent,seen));return branches?.every(Boolean)?branches.flatMap(item=>item!):null;}return null;};
  const returned=flow.uses.filter(use=>!use.dead&&use.kind==='return'&&use.functionStart===owner.start);if(!returned.length)return {version:SEMANTIC_RESULT_VERSION,status:'known',value:'unreleased',evidence};
  const contexts=returned.flatMap(use=>cleanupContexts(use.value,new Set())??[]);if(!contexts.length)return {version:SEMANTIC_RESULT_VERSION,status:'unknown',reason:'unsupported-expression',evidence};
  const inspect=(context:Context,seen=new Set<string>()):'released'|'unreleased'|'unknown'=>{const key=`${context.start}:${[...context.handles].sort().join(',')}`;if(seen.has(key))return 'unknown';seen=new Set(seen).add(key);let uncertain=false;for(const call of calls.filter(value=>value.functionStart===context.start)){
    if(query.release.includes(name(call.callee!)??'')&&call.arguments?.[0]!==undefined&&isHandle(call.arguments[0],context.handles)){if(call.conditional)return 'unknown';evidence.push({kind:'expression',file,sourceDigest:digest,range:rangeOf(call),relationship:'release'});return 'released';}
    const carries=(call.arguments??[]).some(argument=>isHandle(argument,context.handles));const fn=resolve(call.callee!);if(fn?.kind==='function'){const nested=inspect({start:fn.start,handles:bindArgs(call,fn,context.handles),conditional:context.conditional||!!call.conditional},seen);if(nested==='released')return nested;if(nested==='unknown')uncertain=true;}else if(carries)uncertain=true;
  }return uncertain?'unknown':'unreleased';};
  const outcomes=contexts.map(context=>({context,value:inspect(context)}));if(outcomes.every(item=>item.value==='released')||outcomes.some(item=>item.value==='released'&&!item.context.conditional)&&outcomes.every(item=>item.value==='released'||item.context.conditional))return {version:SEMANTIC_RESULT_VERSION,status:'known',value:'released',evidence};if(outcomes.some(item=>item.value==='unknown')||new Set(outcomes.map(item=>item.value)).size>1)return {version:SEMANTIC_RESULT_VERSION,status:'unknown',reason:'unsupported-expression',evidence};return {version:SEMANTIC_RESULT_VERSION,status:'known',value:'unreleased',evidence};
}

function originOf(target: CallTarget): IdentityOrigin | null {
  if (target.source && target.importedName) return { kind: "import", source: target.source, name: target.importedName };
  if (target.binding !== null) return { kind: "local", binding: target.binding };
  if (!target.root) return null;
  const name = [target.root, ...target.members].join(".");
  return { kind: "global", name };
}

function matches(origin: IdentityOrigin, query: IdentityQuery): boolean {
  if (origin.kind === "global") return (query.globals ?? []).includes(origin.name);
  if (origin.kind === "import") return (query.imports ?? []).some((item) => item.source === origin.source && item.names.includes(origin.name));
  return false;
}

function rangeOf(value: FlowValue): SourceRange {
  return { start: value.start, end: value.end, line: value.line, column: value.column, endLine: value.endLine, endColumn: value.endColumn };
}
