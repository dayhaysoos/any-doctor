import type { Node } from './analysis.js';
import type { CallTarget, SourceRange } from './contract.js';

/** Expression IDs are graph identities, not source offsets: a receiver and its
 * call may start at the same byte. This projection describes value uses, never
 * promise settlement, native APIs or framework policy. */
export interface FlowValue extends SourceRange {
  id: number;
  kind: 'unknown' | 'reference' | 'member' | 'literal' | 'array' | 'object' | 'call' | 'construct' | 'function' | 'await' | 'void' | 'choice' | 'super';
  functionStart: number | null;
  dead: boolean;
  conditional?: boolean;
  target?: CallTarget;
  primitive?: "string";
  literal?: string | number | boolean | null;
  receiver?: number;
  member?: string | null;
  callee?: number;
  arguments?: number[];
  argumentRoles?: { value: number; spread: boolean }[];
  value?: number;
  alternatives?: number[];
  /** Source slot index preserves array holes; spread slots may expand at runtime. */
  elements?: { value: number; spread: boolean; index?: number }[];
  properties?: { name: string | null; value: number; spread: boolean; accessor: boolean }[];
  /** Cooked template segments interleaved with expression IDs; no evaluation. */
  template?: { quasis: (string | null)[]; expressions: number[] };
  /** Syntax-only predicates established on entry to this expression. */
  guards?: { test: number; truthy: boolean }[];
  operation?: { operator: string; operands: number[] };
  async?: boolean;
}
export interface ValueFlow {
  values: FlowValue[];
  bindings: { binding: number; initializer?: number; primitive?: "string"; array: boolean; parameter?: {functionStart:number;index:number}; rest?: boolean }[];
  uses: { value: number; kind: 'return' | 'yield' | 'await' | 'discard' | 'write'; functionStart: number | null; binding?: number; /** Flow ID of the assignment destination, including member writes. */ targetValue?: number; dead: boolean }[];
  loops: (SourceRange & { functionStart: number | null; iterable: number; binding: number | null; await: boolean })[];
}

export function valueFlow(nodes: Node[], parents: Map<Node, Node>, target: (n: Node) => CallTarget,
  range: (n: Node) => SourceRange, unwrap: (n: Node) => Node, functionStart: (n: Node) => number | null): ValueFlow {
  const ids = new Map<Node,number>(), values: FlowValue[] = [], uses: ValueFlow['uses'] = [], bindings: ValueFlow['bindings'] = [], loops: ValueFlow['loops'] = [];
  const functions = new Set(['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression']);
  const dead = (n: Node): boolean => {
    let child = n, p = parents.get(child);
    while (p) {
      if (p.type === 'IfStatement' || p.type === 'ConditionalExpression') {
        const test = unwrap(p.test as Node);
        if (test.type === 'Literal' && typeof test.value === 'boolean' && child === (test.value ? p.alternate : p.consequent)) return true;
      }
      if (p.type === 'BlockStatement') {
        const body = p.body as Node[], index = body.indexOf(child);
        if (index >= 0 && body.slice(0,index).some(s => s.type === 'ReturnStatement' || s.type === 'ThrowStatement')) return true;
      }
      child = p; p = parents.get(p);
    }
    return false;
  };
  const conditional = (n: Node): boolean => {
    let child=n,p=parents.get(child);
    while(p){
      if(functions.has(p.type))break;
      if(p.type==='IfStatement'||p.type==='ConditionalExpression'){
        const test=unwrap(p.test as Node);
        if(!(test.type==='Literal'&&typeof test.value==='boolean')&&child!==p.test)return true;
      }
      child=p;p=parents.get(p);
    }
    return false;
  };
  const key = (n: Node, computed: unknown): string | null => {
    n = unwrap(n);
    return !computed && n.type === 'Identifier' ? String(n.name)
      : n.type === 'Literal' && ['string','number'].includes(typeof n.value) ? String(n.value) : null;
  };
  const precedingExits = new Map<Node, {test:Node;truthy:boolean}[]>();
  const exits = (node:Node|undefined):boolean => {
    if(!node)return false;
    if(node.type==='BlockStatement')return exits((node.body as Node[]).at(-1));
    return ['ThrowStatement','ReturnStatement','ContinueStatement','BreakStatement'].includes(node.type)&&!node.label;
  };
  // Build block-prefix facts once. Independent statements do not rescan all
  // earlier siblings for every nested expression.
  for(const block of nodes.filter(n=>n.type==='BlockStatement')){
    let prefix:{test:Node;truthy:boolean}[]=[];
    for(const statement of block.body as Node[]){
      precedingExits.set(statement,prefix);
      if(statement.type==='IfStatement'){
        if(exits(statement.consequent as Node))prefix=[...prefix,{test:statement.test as Node,truthy:false}];
        else if(exits(statement.alternate as Node))prefix=[...prefix,{test:statement.test as Node,truthy:true}];
      }
    }
  }
  const value = (input: Node): number => {
    const n = unwrap(input); const prior = ids.get(n); if (prior !== undefined) return prior;
    const id = values.length, v: FlowValue = { id, ...range(n), kind:'unknown', functionStart:functionStart(n), dead:dead(n), ...(conditional(n)?{conditional:true}:{}) };
    ids.set(n,id); values.push(v);
    if (n.type === 'Super') {v.kind='super';}
    else if (n.type === 'Identifier') { v.kind='reference';v.target=target(n); }
    else if (n.type === 'Literal' && (n.value === null || ['string','number','boolean'].includes(typeof n.value))) { v.kind='literal';v.literal=n.value as FlowValue['literal']; }
    else if (n.type === 'TemplateLiteral' && !(n.expressions as Node[]).length) { v.kind='literal';v.literal=String((((n.quasis as Node[])[0].value) as {cooked?:string}).cooked); }
    else if (n.type === 'TemplateLiteral') {v.primitive='string';v.template={quasis:(n.quasis as Node[]).map(q=>((q.value as {cooked?:string|null}).cooked??null)),expressions:(n.expressions as Node[]).map(value)};}
    else if (n.type === 'MemberExpression') {v.kind='member';v.target=target(n);v.receiver=value(n.object as Node);v.member=key(n.property as Node,n.computed);}
    else if (n.type === 'ArrayExpression') {v.kind='array';v.elements=(n.elements as (Node|null)[]).flatMap((e,index)=>e?[{value:value((e.type==='SpreadElement'?e.argument:e) as Node),spread:e.type==='SpreadElement',index}]:[]);}
    else if (n.type === 'ObjectExpression') {v.kind='object';v.properties=(n.properties as Node[]).map(p=>({name:p.type==='SpreadElement'?null:key(p.key as Node,p.computed),spread:p.type==='SpreadElement',accessor:p.kind==='get'||p.kind==='set',value:value((p.type==='SpreadElement'?p.argument:p.value) as Node)}));}
    else if (n.type === 'CallExpression' || n.type === 'NewExpression') {
      v.kind=n.type==='CallExpression'?'call':'construct';v.target=target(n.callee as Node);v.callee=value(n.callee as Node);
      v.argumentRoles=(n.arguments as Node[]).map(argument=>({value:value((argument.type==='SpreadElement'?argument.argument:argument) as Node),spread:argument.type==='SpreadElement'}));
      v.arguments=v.argumentRoles.map(argument=>argument.value);const callee=unwrap(n.callee as Node);
      if(callee.type==='MemberExpression'){v.receiver=value(callee.object as Node);v.member=key(callee.property as Node,callee.computed);}
    } else if (functions.has(n.type)) {v.kind='function';v.async=!!n.async;}
    else if (n.type==='AwaitExpression' || n.type==='UnaryExpression' && n.operator==='void') {v.kind=n.type==='AwaitExpression'?'await':'void';v.value=value(n.argument as Node);}
    else if (n.type==='BinaryExpression'&&n.operator==='+'){const a=values[value(n.left as Node)],b=values[value(n.right as Node)];if(a.primitive==='string'||b.primitive==='string'||typeof a.literal==='string'||typeof b.literal==='string')v.primitive='string';}
    // Retain logical alternatives without claiming their runtime selection.
    // Existing flow consumers still see unknown; candidate recipes can rule out
    // identities only when neither alternative belongs to their target space.
    else if (n.type==='SequenceExpression') {v.kind='choice';v.alternatives=[value((n.expressions as Node[]).at(-1)!)];}
    else if (n.type==='AssignmentExpression'&&n.operator==='=') {v.kind='choice';v.alternatives=[value(n.right as Node)];}
    else if (n.type==='LogicalExpression'||n.type==='AssignmentExpression'&&['??=','||=','&&='].includes(String(n.operator))) {
      const left=unwrap(n.left as Node),operator=String(n.operator).replace('=','');
      const known=left.type==='Literal'&&(left.value===null||['boolean','string','number'].includes(typeof left.value));
      const right=operator==='??'?left.value===null:operator==='||'?!left.value:!!left.value;
      v.alternatives=known?[value((right?n.right:n.left) as Node)]:[value(n.left as Node),value(n.right as Node)];
    }
    else if (n.type==='ConditionalExpression') {v.kind='choice';const test=unwrap(n.test as Node);v.alternatives=test.type==='Literal'&&typeof test.value==='boolean'?[value((test.value?n.consequent:n.alternate) as Node)]:[value(n.consequent as Node),value(n.alternate as Node)];}
    if (['BinaryExpression','LogicalExpression','UnaryExpression'].includes(n.type))
      v.operation={operator:String(n.operator),operands:(n.type==='UnaryExpression'?[n.argument]:[n.left,n.right]).map(x=>value(x as Node))};
    const guards: NonNullable<FlowValue['guards']> = [];
    let child=n,parent=parents.get(child);
    while(parent&&!functions.has(parent.type)){
      if(parent.type==='IfStatement'){
        if(child===parent.consequent)guards.push({test:value(parent.test as Node),truthy:true});
        if(child===parent.alternate)guards.push({test:value(parent.test as Node),truthy:false});
      }
      if(parent.type==='BlockStatement'){
        for(const guard of precedingExits.get(child)??[])guards.push({test:value(guard.test),truthy:guard.truthy});
      }
      child=parent;parent=parents.get(parent);
    }
    if(guards.length)v.guards=guards;
    return id;
  };
  const arrayType=(n:Node|undefined):boolean=>!!n&&(n.type==='TSArrayType'||n.type==='TSTupleType'||n.type==='TSTypeOperator'&&arrayType(n.typeAnnotation as Node)||n.type==='TSTypeReference'&&['Array','ReadonlyArray'].includes(target(n.typeName as Node).root??'')&&target(n.typeName as Node).binding===null);
  for(const n of nodes){
    if (['Identifier','MemberExpression','Literal','TemplateLiteral','ArrayExpression','ObjectExpression','CallExpression','NewExpression','AwaitExpression','ConditionalExpression'].includes(n.type)||functions.has(n.type)||n.type==='UnaryExpression'&&n.operator==='void') value(n);
    if(n.type==='VariableDeclarator'&& (n.id as Node).type==='Identifier'){
      const b=target(n.id as Node).binding;if(b!==null)bindings.push({binding:b,...(n.init?{initializer:value(n.init as Node)}:{}),...(((n.id as Node).typeAnnotation as Node|undefined)?.typeAnnotation && (((n.id as Node).typeAnnotation as Node).typeAnnotation as Node).type==='TSStringKeyword'?{primitive:'string' as const}:{}),array:arrayType(((n.id as Node).typeAnnotation as Node|undefined)?.typeAnnotation as Node|undefined)});
    }
    if(functions.has(n.type)){
      if(n.type==='FunctionDeclaration'&&n.id){const b=target(n.id as Node).binding;if(b!==null)bindings.push({binding:b,initializer:value(n),array:false});}
      (n.params as Node[]).forEach((raw,index)=>{const p=(raw.type==='RestElement'?raw.argument:raw) as Node;if(p.type==='Identifier'){const b=target(p).binding;if(b!==null)bindings.push({binding:b,...((p.typeAnnotation as Node|undefined)?.typeAnnotation && ((p.typeAnnotation as Node).typeAnnotation as Node).type==='TSStringKeyword'?{primitive:'string' as const}:{}),array:raw.type==='RestElement'||arrayType((p.typeAnnotation as Node|undefined)?.typeAnnotation as Node|undefined),parameter:{functionStart:n.range![0],index},...(raw.type==='RestElement'?{rest:true}:{})});}});
      if(n.type==='ArrowFunctionExpression'&&(n.body as Node).type!=='BlockStatement')uses.push({value:value(n.body as Node),kind:'return',functionStart:n.range![0],dead:dead(n.body as Node)});
    }
    if(['ReturnStatement','YieldExpression','AwaitExpression','ExpressionStatement'].includes(n.type)){
      const arg=(n.type==='ExpressionStatement'?n.expression:n.argument) as Node|undefined;
      if(arg)uses.push({value:value(arg),kind:n.type==='ReturnStatement'?'return':n.type==='YieldExpression'?'yield':n.type==='AwaitExpression'?'await':'discard',functionStart:functionStart(n),dead:dead(n)});
    }
    if(n.type==='AssignmentExpression'){
      const b=(n.left as Node).type==='Identifier'?target(n.left as Node).binding:null;uses.push({value:value(n.right as Node),targetValue:value(n.left as Node),kind:'write',...(b!==null?{binding:b}:{}),functionStart:functionStart(n),dead:dead(n)});
    }
    if(n.type==='ForOfStatement'){
      const left=n.left as Node,p=left.type==='VariableDeclaration'?((left.declarations as Node[])[0].id as Node):left;
      loops.push({...range(n.body as Node),functionStart:functionStart(n),iterable:value(n.right as Node),binding:p.type==='Identifier'?target(p).binding:null,await:!!n.await});
    }
  }
  return {values,bindings,uses,loops};
}
