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
  /** Ternary selection edges, including the test. No predicate evaluation. */
  selection?: { test: number; whenTrue: number; whenFalse: number };
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
  branches: { test: number; functionStart: number | null; whenTrue: SourceRange & { exit?: string }; whenFalse?: SourceRange & { exit?: string } }[];
  values: FlowValue[];
  bindings: { binding: number; initializer?: number; primitive?: "string"; array: boolean; parameter?: {functionStart:number;index:number}; rest?: boolean }[];
  uses: { value: number; kind: 'return' | 'yield' | 'await' | 'discard' | 'write'; functionStart: number | null; binding?: number; /** Flow ID of the assignment destination, including member writes. */ targetValue?: number; dead: boolean }[];
  loops: (SourceRange & { functionStart: number | null; iterable: number; binding: number | null; bindings?: { binding: number; path: string[] }[]; await: boolean })[];
  jsxElements: (SourceRange & { target: CallTarget; attributes: { name: string | null; value?: number; spread: boolean }[] })[];
}

/** Direct terminal transfer only; nested conditions/loops are not flattened. */
export function terminalExit(node: Node | undefined): 'return' | 'throw' | 'continue' | 'break' | undefined {
  if(!node)return undefined;
  if(node.type==='BlockStatement')return terminalExit((node.body as Node[]).at(-1));
  if(node.label)return undefined;
  return ({ReturnStatement:'return',ThrowStatement:'throw',ContinueStatement:'continue',BreakStatement:'break'} as const)[node.type as 'ReturnStatement'];
}

export function valueFlow(nodes: Node[], parents: Map<Node, Node>, target: (n: Node) => CallTarget,
  range: (n: Node) => SourceRange, unwrap: (n: Node) => Node, functionStart: (n: Node) => number | null): ValueFlow {
  const ids = new Map<Node,number>(), values: FlowValue[] = [], uses: ValueFlow['uses'] = [], bindings: ValueFlow['bindings'] = [], loops: ValueFlow['loops'] = [], branches: ValueFlow['branches'] = [], jsxElements: ValueFlow['jsxElements'] = [];
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
        if (index >= 0 && body.slice(0,index).some(s => ['ReturnStatement','ThrowStatement','ContinueStatement','BreakStatement'].includes(s.type))) return true;
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
  const jsxName = (n: Node): string | null => typeof n.name === 'string' ? n.name : null;
  const precedingExits = new Map<Node, {test:Node;truthy:boolean}[]>();
  const exits = (node:Node|undefined):boolean => terminalExit(node)!==undefined;
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
    else if (n.type === 'Identifier' || n.type === 'MetaProperty') { v.kind='reference';v.target=target(n); }
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
    else if (n.type==='ConditionalExpression') {v.kind='choice';v.selection={test:value(n.test as Node),whenTrue:value(n.consequent as Node),whenFalse:value(n.alternate as Node)};const test=unwrap(n.test as Node);v.alternatives=test.type==='Literal'&&typeof test.value==='boolean'?[value((test.value?n.consequent:n.alternate) as Node)]:[value(n.consequent as Node),value(n.alternate as Node)];}
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
    if (['Identifier','MetaProperty','MemberExpression','Literal','TemplateLiteral','ArrayExpression','ObjectExpression','CallExpression','NewExpression','AwaitExpression','ConditionalExpression'].includes(n.type)||functions.has(n.type)||n.type==='UnaryExpression'&&n.operator==='void') value(n);
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
    if(n.type==='IfStatement'){
      const branch=(node:Node):SourceRange & {exit?:string}=>{
        const exit=terminalExit(node);
        return {...range(node),...(exit?{exit}:{})};
      };
      branches.push({test:value(n.test as Node),functionStart:functionStart(n),whenTrue:branch(n.consequent as Node),...(n.alternate?{whenFalse:branch(n.alternate as Node)}:{})});
    }
    if(n.type==='ForOfStatement'){
      const left=n.left as Node,p=left.type==='VariableDeclaration'?((left.declarations as Node[])[0].id as Node):left;
      const loopBindings:{binding:number;path:string[]}[]=[];
      const patternBindings=(node:Node,path:string[]=[])=>{
        if(node.type==='Identifier'){const binding=target(node).binding;if(binding!==null)loopBindings.push({binding,path});}
        else if(node.type==='ObjectPattern')for(const item of node.properties as Node[]){if(item.type!=='RestElement'){const name=key(item.key as Node,item.computed);if(name!==null)patternBindings(item.value as Node,[...path,name]);}}
        else if(node.type==='ArrayPattern')(node.elements as (Node|null)[]).forEach((item,index)=>{if(item&&item.type!=='RestElement')patternBindings(item,[...path,String(index)]);});
      };
      patternBindings(p);
      loops.push({...range(n.body as Node),functionStart:functionStart(n),iterable:value(n.right as Node),binding:p.type==='Identifier'?target(p).binding:null,...(p.type!=='Identifier'?{bindings:loopBindings}:{}),await:!!n.await});
    }
    if(n.type==='JSXOpeningElement'){
      const attributes=(n.attributes as Node[]).map(attribute=>{
        if(attribute.type==='JSXSpreadAttribute')return {name:null,value:value(attribute.argument as Node),spread:true};
        const raw=attribute.value as Node|null|undefined;
        if(!raw)return {name:jsxName(attribute.name as Node),spread:false};
        const expression=raw.type==='JSXExpressionContainer' ? raw.expression as Node : raw;
        return expression?.type==='JSXEmptyExpression'
          ? {name:jsxName(attribute.name as Node),spread:false}
          : {name:jsxName(attribute.name as Node),value:value(expression),spread:false};
      });
      jsxElements.push({...range(n),target:target(n.name as Node),attributes});
    }
  }
  return {values,bindings,uses,loops,branches,jsxElements};
}
