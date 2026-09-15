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
    return n.type === 'Identifier' ? String(n.name) : n.type === 'Literal' && typeof n.value === 'string' ? n.value : null;
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
    } else if (n.type === 'ArrayExpression') fact.kind = 'array';
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
    if (b) (b.writes ??= []).push({ functionStart: functionStart(n),
      ...(n.type === 'AssignmentExpression' && n.operator === '=' ? { value: value(n.right as Node) } : {}),
    });
  }
  for (const n of nodes) {
    const left = (n.type === 'AssignmentExpression' ? n.left :
      n.type === 'UpdateExpression' || (n.type === 'UnaryExpression' && n.operator === 'delete') ? n.argument : undefined) as Node | undefined;
    if (left?.type !== 'MemberExpression') continue;
    const binding = target(left).binding, b = binding === null ? undefined : bindings.get(binding);
    if (b) b.mutated = true;
  }
  for (const n of nodes) if (n.type === 'CallExpression') {
    for (const arg of n.arguments as Node[]) {
      const a = unwrap(arg); if (a.type !== 'Identifier') continue;
      const binding = target(a).binding, b = binding === null ? undefined : bindings.get(binding);
      if (b) (b.escapes ??= []).push(target(n.callee as Node));
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
      if (b.mutated && !origin.mutated) { origin.mutated = true; changed = true; }
      for (const escape of b.escapes ?? []) {
        if (!(origin.escapes ?? []).includes(escape)) { (origin.escapes ??= []).push(escape); changed = true; }
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
