import { valueFlow, terminalExit } from './value-flow.js';
import type { Node } from './analysis.js';
import type { CallStructure, CallTarget, SourceRange, ValueFact, ValueBinding } from './contract.js';

/** Generic value relationships, never framework policy or executable target code. */
export function callStructure(
  nodes: Node[], parents: Map<Node, Node>,
  target: (node: Node) => CallTarget, range: (node: Node) => SourceRange,
  unwrap: (node: Node) => Node, functionStart: (node: Node) => number | null,
): CallStructure {
  const functions = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);
  const id = (n: Node): number => n.range![0];
  const key = (n: Node): string | null => {
    n = unwrap(n);
    return n.type === 'Identifier' ? String(n.name) : n.type === 'Literal' && (typeof n.value === 'string'||typeof n.value === 'number') ? String(n.value) : null;
  };
  const values = new Map<number, ValueFact>();
  const value = (input: Node): number => {
    const n = unwrap(input), start = id(input);
    if (values.has(start)) return start;
    const fact: ValueFact = { start, kind: 'unknown' };
    values.set(start, fact);
    if (n !== input && id(n) !== start) { fact.kind = 'alias'; fact.value = value(n); return start; }
    if (n.type === 'Literal' && ['string', 'number', 'boolean'].includes(typeof n.value)) {
      fact.kind = 'literal'; fact.literal = n.value as string | number | boolean;
    } else if (n.type === 'Identifier' || n.type === 'MemberExpression') {
      fact.kind = 'reference'; fact.target = target(n);
    } else if (n.type === 'ObjectExpression') {
      fact.kind = 'object'; fact.properties = (n.properties as Node[]).map(p => ({
        name: p.type === 'SpreadElement' ? null : p.computed && unwrap(p.key as Node).type !== 'Literal' ? null : key(p.key as Node),
        spread: p.type === 'SpreadElement', accessor: p.kind === 'get' || p.kind === 'set',
        value: value((p.type === 'SpreadElement' ? p.argument : p.value) as Node),
      }));
    } else if (n.type === 'ArrayExpression') {
      fact.kind = 'array';
      fact.elements = (n.elements as (Node | null)[]).flatMap((item,index)=>item
        ? [{value:value((item.type==='SpreadElement'?item.argument:item) as Node),spread:item.type==='SpreadElement',index}]:[]);
    }
    else if (n.type === 'CallExpression') { fact.kind = 'call'; fact.value = n.range![1]; }
    else if (functions.has(n.type)) { fact.kind = 'function'; fact.value = id(n); }
    else if (n.type === 'ConditionalExpression') {
      fact.kind = 'choice'; const test = unwrap(n.test as Node);
      fact.alternatives = test.type === 'Literal' && typeof test.value === 'boolean'
        ? [value((test.value ? n.consequent : n.alternate) as Node)]
        : [value(n.consequent as Node), value(n.alternate as Node)];
    }
    return start;
  };
  const bindings = new Map<number, ValueBinding>();
  const bindingOwners = new Map<number,number|null>();
  const typeAliases = new Map<number, Node>();
  for (const n of nodes) if (n.type === 'TSTypeAliasDeclaration') {
    const binding = target(n.id as Node).binding;
    if (binding !== null) typeAliases.set(binding, n.typeAnnotation as Node);
  }
  const declaredTypes = (n: Node | undefined, seen = new Set<Node>()): NonNullable<ValueBinding['types']> => {
    if (!n || seen.has(n)) return [];
    seen = new Set(seen).add(n);
    if (n.type === 'TSUnionType') {
      const parts = (n.types as Node[]).map(t => declaredTypes(t, seen));
      return parts.every(p => p.length) ? parts.flat() : [];
    }
    if (n.type !== 'TSTypeReference') return [];
    const t = target(n.typeName as Node);
    if (t.binding !== null && typeAliases.has(t.binding)) return declaredTypes(typeAliases.get(t.binding), seen);
    if (t.binding === null && t.root === 'Pick') {
      const args = (n.typeArguments as Node | undefined)?.params as Node[] | undefined;
      if (!args || args.length !== 2) return [];
      const keys = args[1].type === 'TSUnionType' ? args[1].types as Node[] : [args[1]];
      if (!keys.every(k => k.type === 'TSLiteralType' && typeof (k.literal as Node).value === 'string')) return [];
      const members = keys.map(k => String((k.literal as Node).value));
      return declaredTypes(args[0], seen).map(base => ({ ...base, members: base.members ? base.members.filter(m => members.includes(m)) : members }));
    }
    return t.source ? [{ target: t }] : [];
  };

  const pattern = (p: Node, data: Omit<ValueBinding, 'binding'>, path: string[] = []): void => {
    if (p.type === 'Identifier') {
      const t = target(p); if (t.binding === null) return;
      const annotation = p.typeAnnotation as Node | undefined;
      const type = annotation?.typeAnnotation as Node | undefined;
      bindings.set(t.binding, { ...data, binding: t.binding, path, reassigned: data.reassigned || t.reassigned || false,
        types: declaredTypes(type),
      });
      bindingOwners.set(t.binding,functionStart(p));
    } else if (p.type === 'ArrayPattern') {
      (p.elements as (Node|null)[]).forEach((element,index)=>{
        if(element&&element.type!=='RestElement')pattern(element,data,[...path,String(index)]);
      });
    } else if (p.type === 'ObjectPattern') {
      for (const prop of p.properties as Node[]) {
        if (prop.type !== 'Property' || prop.computed) continue;
        const name = key(prop.key as Node); if (name !== null) pattern(prop.value as Node, data, [...path, name]);
      }
    } else if (p.type === 'AssignmentPattern') {
      // Defaults may replace the incoming value; do not invent parameter provenance.
      pattern(p.left as Node, { reassigned: true }, path);
    }
  };
  // Only modeled straight-line and if/return relationships are evaluated. No calls run.
  type Returns = { returns: number[]; unknownReturn: boolean; fallsThrough: boolean };
  const returns = (n: Node): Returns => {
    if (n.type === 'ReturnStatement') return { returns: n.argument ? [value(n.argument as Node)] : [], unknownReturn: !n.argument, fallsThrough: false };
    if (n.type === 'ThrowStatement') return { returns: [], unknownReturn: false, fallsThrough: false };
    if (n.type === 'BlockStatement') {
      const out: Returns = { returns: [], unknownReturn: false, fallsThrough: true };
      for (const s of n.body as Node[]) {
        if (!out.fallsThrough) break;
        const r = returns(s); out.returns.push(...r.returns); out.unknownReturn ||= r.unknownReturn; out.fallsThrough = r.fallsThrough;
      }
      return out;
    }
    if (n.type === 'IfStatement') {
      const test = unwrap(n.test as Node);
      if (test.type === 'Literal' && typeof test.value === 'boolean') {
        const branch = test.value ? n.consequent : n.alternate;
        return branch ? returns(branch as Node) : { returns: [], unknownReturn: false, fallsThrough: true };
      }
      const a = returns(n.consequent as Node), b = n.alternate ? returns(n.alternate as Node) : { returns: [], unknownReturn: false, fallsThrough: true };
      return { returns: [...a.returns, ...b.returns], unknownReturn: a.unknownReturn || b.unknownReturn, fallsThrough: a.fallsThrough || b.fallsThrough };
    }
    return { returns: [], unknownReturn: !['VariableDeclaration', 'ExpressionStatement', 'EmptyStatement', 'FunctionDeclaration'].includes(n.type), fallsThrough: true };
  };
  const flows: CallStructure['functions'] = [], loops: CallStructure['loops'] = [];
  for (const n of nodes) {
    // Facts are a bounded projection, not an AST exposed to the doctor.
    if (['Identifier','MemberExpression','ObjectExpression','ArrayExpression','CallExpression','Literal','ConditionalExpression'].includes(n.type) || functions.has(n.type)) value(n);
    if (n.type === 'CallExpression') for (const arg of n.arguments as Node[]) value(arg);
    if (['ImportSpecifier','ImportNamespaceSpecifier','ImportDefaultSpecifier'].includes(n.type)) pattern(n.local as Node, {});
    if (n.type === 'VariableDeclarator') pattern(n.id as Node, { ...(n.init ? { initializer: value(n.init as Node) } : {}) });
    if (functions.has(n.type)) {
      (n.params as Node[]).forEach((p,index) => pattern(p, { parameter: { functionStart: id(n), index } }));
      if (n.type === 'FunctionDeclaration' && n.id) pattern(n.id as Node, { initializer: value(n) });
      const body = n.body as Node;
      const r = body.type === 'BlockStatement' ? returns(body) : { returns: [value(body)], unknownReturn: false, fallsThrough: false };
      flows.push({ start: id(n), returns: r.returns, unknownReturn: r.unknownReturn || r.fallsThrough });
    }
    if (['ForStatement','ForOfStatement','ForInStatement','WhileStatement','DoWhileStatement'].includes(n.type))
      loops.push({ ...range(n.body as Node), functionStart: functionStart(n), ...(terminalExit(n.body as Node)?{tailExit:terminalExit(n.body as Node)}:{}) });
  }
  for (const n of nodes) {
    if (n.type !== 'AssignmentExpression' && n.type !== 'UpdateExpression') continue;
    const left = (n.type === 'AssignmentExpression' ? n.left : n.argument) as Node;
    if (left.type !== 'Identifier') continue;
    const binding = target(left).binding, b = binding === null ? undefined : bindings.get(binding);
    if (b) (b.writes ??= []).push({ functionStart: functionStart(n), start: n.range![0],
      ...(n.type === 'AssignmentExpression' && n.operator === '=' ? { value: value(n.right as Node) } : {}),
    });
  }
  for (const n of nodes) {
    const left = (n.type === 'AssignmentExpression' ? n.left :
      n.type === 'UpdateExpression' || (n.type === 'UnaryExpression' && n.operator === 'delete') ? n.argument : undefined) as Node | undefined;
    if (left?.type !== 'MemberExpression') continue;
    const binding = target(left).binding, b = binding === null ? undefined : bindings.get(binding);
    if (b) { b.mutated = true; (b.mutationSites ??= []).push(n.range![0]); }
  }
  type TransferredBinding={binding:number;path:string[];immutable:boolean;aggregate?:boolean};
  type ContainerWrite={binding:number;path:string[];value:number;start:number;conditional:boolean};
  const conditionalWrite=(node:Node):boolean=>{
    let current=parents.get(node);
    while(current&&!functions.has(current.type)&&current.type!=='Program'){
      if(['IfStatement','ConditionalExpression','LogicalExpression','SwitchCase','ForStatement','ForInStatement','ForOfStatement','WhileStatement','DoWhileStatement','TryStatement','CatchClause'].includes(current.type))return true;
      current=parents.get(current);
    }
    return false;
  };
  const rootWrites:ContainerWrite[]=[];
  const memberWrites:ContainerWrite[]=[];
  for(const n of nodes){
    if(n.type!=='AssignmentExpression'||n.operator!=='=')continue;
    const left=n.left as Node;
    let resolved=target(left);
    if(left.type==='MemberExpression'){
      const member=key(left.property as Node),base=target(left.object as Node);
      if(base.binding!==null&&member!==null)resolved={...base,members:[...base.members,member]};
    }
    if(resolved.binding===null||functionStart(n)!==bindingOwners.get(resolved.binding))continue;
    // JavaScript commits an assignment only after its right-hand side has
    // finished evaluating; nested RHS calls still observe the previous value.
    const write={binding:resolved.binding,path:[...resolved.members],value:value(n.right as Node),start:n.range![1],conditional:conditionalWrite(n)};
    if(left.type==='Identifier')rootWrites.push(write);else if(left.type==='MemberExpression'&&resolved.members.length)memberWrites.push(write);
  }
  const canonical=(binding:number,path:string[],at:number,seen=new Set<number>()):{binding:number;path:string[]}=>{
    if(seen.has(binding)||rootWrites.some(write=>write.binding===binding&&write.start<at))return {binding,path};
    seen=new Set(seen).add(binding);
    let fact=values.get(bindings.get(binding)?.initializer??-1);
    while(fact?.kind==='alias'&&fact.value!==undefined)fact=values.get(fact.value);
    if(fact?.kind==='reference'&&fact.target?.binding!==null&&fact.target?.binding!==undefined)
      return canonical(fact.target.binding,[...fact.target.members,...path],at,seen);
    return {binding,path};
  };
  const normalizedMemberWrites=(at:number):ContainerWrite[]=>memberWrites.filter(write=>write.start<at).map(write=>{
    const owner=canonical(write.binding,write.path,write.start);return {...write,binding:owner.binding,path:owner.path};
  });
  const startsWith=(path:string[],prefix:string[])=>prefix.every((part,index)=>path[index]===part);
  const activeMemberWrites=(binding:number,at:number):ContainerWrite[]=>{
    const latestRoot=Math.max(-1,...rootWrites.filter(write=>canonical(write.binding,[],write.start).binding===binding&&write.start<at&&!write.conditional).map(write=>write.start));
    const active:ContainerWrite[]=[];
    for(const write of normalizedMemberWrites(at).filter(write=>write.binding===binding&&write.start>latestRoot).sort((a,b)=>a.start-b.start)){
      if(!write.conditional)for(let index=active.length-1;index>=0;index--)if(startsWith(active[index].path,write.path))active.splice(index,1);
      active.push(write);
    }
    return active;
  };
  const factsAt=(binding:number,path:string[],at:number,visited=new Set<string>()):ValueFact[]=>{
    ({binding,path}=canonical(binding,path,at));
    const visitKey=`${binding}:${path.join('.')}`;if(visited.has(visitKey))return [];
    visited=new Set(visited).add(visitKey);
    const state=bindings.get(binding);
    let roots=[state?.initializer].filter((item):item is number=>item!==undefined);
    for(const write of rootWrites.filter(write=>write.binding===binding&&write.start<at).sort((a,b)=>a.start-b.start)){
      if(write.conditional)roots.push(write.value);else roots=[write.value];
    }
    const descend=(fact:ValueFact,index:number):ValueFact[]=>{
      if(index===path.length)return [fact];
      if(fact.kind==='reference'&&fact.target?.binding!==null&&fact.target?.binding!==undefined)
        // A stored reference captures the object identity at the point the
        // container/alias is created; later reassignment of its source binding
        // cannot rewrite that snapshot.
        return factsAt(fact.target.binding,[...fact.target.members,...path.slice(index)],Math.min(at,fact.start),visited);
      if(fact.kind==='array'){
        const position=Number(path[index]);if(!Number.isInteger(position))return [];
        const item=(fact.elements??[]).find(element=>element.index===position&&!element.spread);
        const child=item?values.get(item.value):undefined;return child?descend(child,index+1):[];
      }
      if(fact.kind!=='object')return [];
      const selected:number[]=[];
      for(const property of fact.properties??[]){
        if(!property.spread&&property.name===path[index])selected.push(property.value);
      }
      return selected.flatMap(id=>{const child=values.get(id);return child?descend(child,index+1):[];});
    };
    let result=roots.flatMap(id=>{const fact=values.get(id);return fact?descend(fact,0):[];});
    for(const write of activeMemberWrites(binding,at).filter(write=>startsWith(path,write.path)).sort((a,b)=>a.start-b.start)){
      const fact=values.get(write.value),replacement=fact?descend(fact,write.path.length):[];
      if(write.conditional)result.push(...replacement);else result=replacement;
    }
    return result;
  };
  const transferredBindings = (input: Node, at:number, seen = new Set<Node>(), aggregate=true): TransferredBinding[] => {
    const n = unwrap(input);
    if (seen.has(n)) return [];
    seen = new Set(seen).add(n);
    const snapshotFor=(binding:number,path:string[],visited=new Set<number>()):{binding:number;path:string[];facts:ValueFact[]}|undefined=>{
      if(visited.has(binding))return undefined;visited=new Set(visited).add(binding);
      let initial=values.get(bindings.get(binding)?.initializer??-1);
      while(initial?.kind==='alias'&&initial.value!==undefined)initial=values.get(initial.value);
      const targetBinding=initial?.kind==='reference'?initial.target?.binding:null;
      if(targetBinding===null||targetBinding===undefined)return undefined;
      const snapshotPath=[...(initial!.target?.members??[]),...path];
      const pointerReplaced=rootWrites.some(write=>write.binding===targetBinding&&write.start>initial!.start&&write.start<at)
        ||normalizedMemberWrites(at).some(write=>write.binding===targetBinding&&write.start>initial!.start&&startsWith(snapshotPath,write.path));
      return pointerReplaced
        ? {binding:targetBinding,path:snapshotPath,facts:factsAt(targetBinding,snapshotPath,initial!.start)}
        : snapshotFor(targetBinding,snapshotPath,visited);
    };
    function fromId(id:number,visited=new Set<number>()):TransferredBinding[]{
      const child=values.get(id);if(!child||visited.has(child.start))return [];
      if(child.kind==='reference'&&child.target?.binding!==null&&child.target?.binding!==undefined){
        visited=new Set(visited).add(child.start);
        const snapshot=snapshotFor(child.target.binding,[...child.target.members]);
        if(snapshot)return snapshot.facts.flatMap(item=>contained(item,visited));
        const owner=canonical(child.target.binding,[...child.target.members],at),terminals=factsAt(owner.binding,owner.path,at);
        return [{binding:owner.binding,path:owner.path,immutable:terminals.length>0&&terminals.every(item=>item.kind==='literal')},
          ...terminals.flatMap(item=>containedAt(owner.binding,owner.path,item,visited))];
      }
      return contained(child,visited);
    }
    function spreadFromId(id:number,visited=new Set<number>()):TransferredBinding[]{
      const raw=values.get(id);if(!raw||visited.has(raw.start))return [];
      visited=new Set(visited).add(raw.start);
      const sourceAt=Math.min(at,raw.start);
      const origin=raw.kind==='reference'&&raw.target?.binding!==null&&raw.target?.binding!==undefined
        ? canonical(raw.target.binding,[...raw.target.members],sourceAt):undefined;
      const sources=origin?factsAt(origin.binding,origin.path,sourceAt):[raw];
      if(!sources.length&&raw.kind==='reference'&&raw.target?.binding!==null&&raw.target?.binding!==undefined)
        return [{binding:origin!.binding,path:origin!.path,immutable:false}];
      return sources.flatMap(source=>{
        if(origin){
          const current=containedAt(origin.binding,origin.path,source,visited,sourceAt);
          const replacedLater=rootWrites.some(write=>write.binding===origin.binding&&write.start>sourceAt&&write.start<at)
            ||normalizedMemberWrites(at).some(write=>write.binding===origin.binding&&write.start>sourceAt
              &&(startsWith(origin.path,write.path)||startsWith(write.path,origin.path)));
          return replacedLater?[...current,...contained(source,visited)]:current;
        }
        if(source.kind==='object')return (source.properties??[]).flatMap(item=>{
          if(item.spread)return spreadFromId(item.value,visited);
          return fromId(item.value,visited);
        });
        if(source.kind==='array')return (source.elements??[]).flatMap(item=>item.spread?spreadFromId(item.value,visited):fromId(item.value,visited));
        return [];
      });
    }
    function fromFact(fact:ValueFact,origin:{binding:number;path:string[]}|undefined,visited:Set<number>):TransferredBinding[]{
      if(fact.kind==='reference')return fromId(fact.start,visited);
      if(fact.kind==='choice')return (fact.alternatives??[]).flatMap(id=>fromId(id,visited));
      if((fact.kind==='object'||fact.kind==='array')&&origin)
        return [{binding:origin.binding,path:origin.path,immutable:false},...containedAt(origin.binding,origin.path,fact,visited)];
      return contained(fact,visited);
    }
    function containedAt(binding:number,path:string[],fact:ValueFact,visited=new Set<number>(),observation=at):TransferredBinding[]{
      if(visited.has(fact.start))return [];visited=new Set(visited).add(fact.start);
      if(fact.kind==='choice')return (fact.alternatives??[]).flatMap(id=>fromId(id,visited));
      const writes=activeMemberWrites(binding,observation).filter(write=>startsWith(write.path,path)&&write.path.length>path.length);
      const directNames=new Set(writes.filter(write=>write.path.length===path.length+1).map(write=>write.path.at(-1)!));
      const out:TransferredBinding[]=[];
      if(fact.kind==='object')for(const item of fact.properties??[]){
        if(item.spread){out.push(...spreadFromId(item.value,visited));continue;}
        if(item.name===null||directNames.has(item.name))continue;
        const childPath=[...path,item.name];
        for(const child of factsAt(binding,childPath,observation))out.push(...fromFact(child,{binding,path:childPath},visited));
      }
      if(fact.kind==='array')for(const item of fact.elements??[]){
        if(item.spread){out.push(...spreadFromId(item.value,visited));continue;}
        const childPath=[...path,String(item.index)];if(directNames.has(String(item.index)))continue;
        for(const child of factsAt(binding,childPath,observation))out.push(...fromFact(child,{binding,path:childPath},visited));
      }
      for(const name of directNames){
        const childPath=[...path,name];
        for(const child of factsAt(binding,childPath,observation))out.push(...fromFact(child,{binding,path:childPath},visited));
      }
      return out;
    }
    function contained(fact:ValueFact|undefined,visited=new Set<number>()):TransferredBinding[]{
      if(!fact||visited.has(fact.start))return [];visited=new Set(visited).add(fact.start);
      if(fact.kind==='object')return (fact.properties??[]).flatMap(item=>item.spread?spreadFromId(item.value,visited):fromId(item.value,visited));
      if(fact.kind==='array')return (fact.elements??[]).flatMap(item=>item.spread?spreadFromId(item.value,visited):fromId(item.value,visited));
      if(fact.kind==='choice')return (fact.alternatives??[]).flatMap(id=>fromId(id,visited));
      return [];
    }
    if (n.type === 'Identifier' || n.type === 'MemberExpression') {
      const resolved=target(n),binding=resolved.binding;
      if(binding===null)return [];
      const path=[...resolved.members],owner=canonical(binding,path,at),terminals=factsAt(owner.binding,owner.path,at);
      const snapshot=snapshotFor(binding,path);
      return [{binding,path,immutable:terminals.length>0&&terminals.every(item=>item.kind==='literal'),aggregate},
        ...(snapshot?snapshot.facts.flatMap(item=>contained(item)):terminals.flatMap(item=>containedAt(owner.binding,owner.path,item)))];
    }
    if (n.type === 'ObjectExpression') return (n.properties as Node[]).flatMap(property => {
      // A normal property transfers its value (`{ options }`); an object
      // spread copies enumerable properties synchronously and does not hand
      // the source object's identity to the callee.
      if (property.type === 'SpreadElement') {
        return spreadFromId(value(property.argument as Node));
      }
      return property.value ? transferredBindings(property.value as Node, at, seen, false) : [];
    });
    if (n.type === 'ArrayExpression') return (n.elements as (Node | null)[]).flatMap(element => {
      // `[options]` transfers options. `[...options]` transfers the iterated
      // elements, which this local binding model cannot identify, not the
      // options container itself.
      if (!element) return [];
      return element.type==='SpreadElement'?spreadFromId(value(element.argument as Node)):transferredBindings(element,at,seen,false);
    });
    if (n.type === 'ConditionalExpression') return [
      ...transferredBindings(n.consequent as Node, at, seen, aggregate),
      ...transferredBindings(n.alternate as Node, at, seen, aggregate),
    ];
    if (n.type === 'LogicalExpression' || n.type === 'SequenceExpression') {
      const children = n.type === 'SequenceExpression' ? n.expressions as Node[] : [n.left as Node, n.right as Node];
      return children.flatMap(child => transferredBindings(child, at, seen, aggregate));
    }
    return [];
  };
  for (const n of nodes) if (n.type === 'CallExpression' || n.type === 'NewExpression') {
    const callee=n.callee as Node,callTarget=target(callee),executionSite=n.range![1];
    const inputs=[...(n.arguments as Node[]).map(arg=>arg.type==='SpreadElement'?arg.argument as Node:arg)];
    // An opaque method may mutate its receiver (`options.normalize()`).
    // The receiver is therefore an identity transfer just like an argument.
    if(n.type==='CallExpression'&&callee.type==='MemberExpression'){
      const receiver=callee.object as Node,receiverBinding=target(receiver).binding;
      const method=target(callee).members.at(-1);
      const receiverInitializer=receiverBinding===null?undefined:bindings.get(receiverBinding)?.initializer;
      const immutableArrayMethod=receiverInitializer!==undefined&&values.get(receiverInitializer)?.kind==='array'
        && ['concat','entries','every','filter','find','findIndex','findLast','findLastIndex','flat','flatMap','forEach','includes','indexOf','join','keys','lastIndexOf','map','reduce','reduceRight','slice','some','toReversed','toSorted','toSpliced','values','with'].includes(method??'');
      if(!immutableArrayMethod&&receiverBinding!==null){
        const receiverState=bindings.get(receiverBinding);
        if(receiverState)(receiverState.opaqueCallSites??=[]).push(executionSite);
      }
    }
    for (const input of inputs) {
      for (const transfer of transferredBindings(input,executionSite)) {
        const b = bindings.get(transfer.binding); if (!b) continue;
        if(transfer.aggregate&&!transfer.path.length&&!transfer.immutable)(b.escapes ??= []).push(callTarget);
        (b.escapeSites ??= []).push({start:executionSite,target:callTarget,...(transfer.path.length?{path:transfer.path}:{}),...(transfer.immutable?{immutable:true}:{})});
      }
    }
  }
  // A direct alias shares the object's mutation/escape uncertainty with its origin.
  let changed = true;
  while (changed) {
    changed = false;
    for (const b of bindings.values()) {
      if (b.initializer === undefined) continue;
      let v = values.get(b.initializer); const seen = new Set<number>();
      while (v?.kind === 'alias' && v.value !== undefined && !seen.has(v.start)) { seen.add(v.start); v = values.get(v.value); }
      const origin = v?.kind === 'reference' && v.target?.binding !== null ? bindings.get(v.target!.binding!) : undefined;
      if (!origin || origin === b) continue;
      const aliasPath=v?.target?.members??[];
      if (b.mutated && !origin.mutated) { origin.mutated = true; changed = true; }
      for (const site of b.mutationSites ?? []) {
        if (!(origin.mutationSites ?? []).includes(site)) { (origin.mutationSites ??= []).push(site); changed = true; }
      }
      for (const escape of b.escapes ?? []) {
        if(aliasPath.length)continue;
        if (!(origin.escapes ?? []).includes(escape)) { (origin.escapes ??= []).push(escape); changed = true; }
      }
      for (const site of b.escapeSites ?? []) {
        const propagated={...site,path:[...aliasPath,...(site.path??[])]};
        if (!(origin.escapeSites ?? []).some(item=>item.start===propagated.start&&item.target.binding===propagated.target.binding&&item.target.root===propagated.target.root&&item.target.members.join('.')===propagated.target.members.join('.')&&(item.path??[]).join('.')===propagated.path.join('.'))) {
          (origin.escapeSites ??= []).push(propagated); changed = true;
        }
      }
      for (const site of b.opaqueCallSites ?? []) {
        if (!(origin.opaqueCallSites ?? []).includes(site)) { (origin.opaqueCallSites ??= []).push(site); changed = true; }
      }
    }
  }
  const directives: string[] = [];
  for (const n of nodes[0].body as Node[]) {
    if (n.type !== 'ExpressionStatement') break;
    const e = n.expression as Node;
    if (e.type !== 'Literal' || typeof e.value !== 'string') break;
    directives.push(e.value);
  }
  return { flow: valueFlow(nodes, parents, target, range, unwrap, functionStart), values: [...values.values()], bindings: [...bindings.values()], functions: flows, loops, directives };
}
