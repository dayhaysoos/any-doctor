import { valueFlow } from './value-flow.js';
/** Generic value relationships, never framework policy or executable target code. */
export function callStructure(nodes, parents, target, range, unwrap, functionStart) {
    var _a, _b, _c, _d, _e, _f;
    const functions = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);
    const id = (n) => n.range[0];
    const key = (n) => {
        n = unwrap(n);
        return n.type === 'Identifier' ? String(n.name) : n.type === 'Literal' && typeof n.value === 'string' ? n.value : null;
    };
    const values = new Map();
    const value = (input) => {
        const n = unwrap(input), start = id(input);
        if (values.has(start))
            return start;
        const fact = { start, kind: 'unknown' };
        values.set(start, fact);
        if (n !== input && id(n) !== start) {
            fact.kind = 'alias';
            fact.value = value(n);
            return start;
        }
        if (n.type === 'Literal' && ['string', 'number', 'boolean'].includes(typeof n.value)) {
            fact.kind = 'literal';
            fact.literal = n.value;
        }
        else if (n.type === 'Identifier' || n.type === 'MemberExpression') {
            fact.kind = 'reference';
            fact.target = target(n);
        }
        else if (n.type === 'ObjectExpression') {
            fact.kind = 'object';
            fact.properties = n.properties.map(p => ({
                name: p.type === 'SpreadElement' ? null : p.computed && unwrap(p.key).type !== 'Literal' ? null : key(p.key),
                spread: p.type === 'SpreadElement', accessor: p.kind === 'get' || p.kind === 'set',
                value: value((p.type === 'SpreadElement' ? p.argument : p.value)),
            }));
        }
        else if (n.type === 'ArrayExpression')
            fact.kind = 'array';
        else if (n.type === 'CallExpression') {
            fact.kind = 'call';
            fact.value = n.range[1];
        }
        else if (functions.has(n.type)) {
            fact.kind = 'function';
            fact.value = id(n);
        }
        else if (n.type === 'ConditionalExpression') {
            fact.kind = 'choice';
            const test = unwrap(n.test);
            fact.alternatives = test.type === 'Literal' && typeof test.value === 'boolean'
                ? [value((test.value ? n.consequent : n.alternate))]
                : [value(n.consequent), value(n.alternate)];
        }
        return start;
    };
    const bindings = new Map();
    const typeAliases = new Map();
    for (const n of nodes)
        if (n.type === 'TSTypeAliasDeclaration') {
            const binding = target(n.id).binding;
            if (binding !== null)
                typeAliases.set(binding, n.typeAnnotation);
        }
    const declaredTypes = (n, seen = new Set()) => {
        var _a;
        if (!n || seen.has(n))
            return [];
        seen = new Set(seen).add(n);
        if (n.type === 'TSUnionType') {
            const parts = n.types.map(t => declaredTypes(t, seen));
            return parts.every(p => p.length) ? parts.flat() : [];
        }
        if (n.type !== 'TSTypeReference')
            return [];
        const t = target(n.typeName);
        if (t.binding !== null && typeAliases.has(t.binding))
            return declaredTypes(typeAliases.get(t.binding), seen);
        if (t.binding === null && t.root === 'Pick') {
            const args = (_a = n.typeArguments) === null || _a === void 0 ? void 0 : _a.params;
            if (!args || args.length !== 2)
                return [];
            const keys = args[1].type === 'TSUnionType' ? args[1].types : [args[1]];
            if (!keys.every(k => k.type === 'TSLiteralType' && typeof k.literal.value === 'string'))
                return [];
            const members = keys.map(k => String(k.literal.value));
            return declaredTypes(args[0], seen).map(base => ({ ...base, members: base.members ? base.members.filter(m => members.includes(m)) : members }));
        }
        return t.source ? [{ target: t }] : [];
    };
    const pattern = (p, data, path = []) => {
        if (p.type === 'Identifier') {
            const t = target(p);
            if (t.binding === null)
                return;
            const annotation = p.typeAnnotation;
            const type = annotation === null || annotation === void 0 ? void 0 : annotation.typeAnnotation;
            bindings.set(t.binding, { ...data, binding: t.binding, path, reassigned: data.reassigned || t.reassigned || false,
                types: declaredTypes(type),
            });
        }
        else if (p.type === 'ArrayPattern') {
            p.elements.forEach((element, index) => {
                if (element && element.type !== 'RestElement')
                    pattern(element, data, [...path, String(index)]);
            });
        }
        else if (p.type === 'ObjectPattern') {
            for (const prop of p.properties) {
                if (prop.type !== 'Property' || prop.computed)
                    continue;
                const name = key(prop.key);
                if (name !== null)
                    pattern(prop.value, data, [...path, name]);
            }
        }
        else if (p.type === 'AssignmentPattern') {
            // Defaults may replace the incoming value; do not invent parameter provenance.
            pattern(p.left, { reassigned: true }, path);
        }
    };
    const returns = (n) => {
        if (n.type === 'ReturnStatement')
            return { returns: n.argument ? [value(n.argument)] : [], unknownReturn: !n.argument, fallsThrough: false };
        if (n.type === 'ThrowStatement')
            return { returns: [], unknownReturn: false, fallsThrough: false };
        if (n.type === 'BlockStatement') {
            const out = { returns: [], unknownReturn: false, fallsThrough: true };
            for (const s of n.body) {
                if (!out.fallsThrough)
                    break;
                const r = returns(s);
                out.returns.push(...r.returns);
                out.unknownReturn || (out.unknownReturn = r.unknownReturn);
                out.fallsThrough = r.fallsThrough;
            }
            return out;
        }
        if (n.type === 'IfStatement') {
            const test = unwrap(n.test);
            if (test.type === 'Literal' && typeof test.value === 'boolean') {
                const branch = test.value ? n.consequent : n.alternate;
                return branch ? returns(branch) : { returns: [], unknownReturn: false, fallsThrough: true };
            }
            const a = returns(n.consequent), b = n.alternate ? returns(n.alternate) : { returns: [], unknownReturn: false, fallsThrough: true };
            return { returns: [...a.returns, ...b.returns], unknownReturn: a.unknownReturn || b.unknownReturn, fallsThrough: a.fallsThrough || b.fallsThrough };
        }
        return { returns: [], unknownReturn: !['VariableDeclaration', 'ExpressionStatement', 'EmptyStatement', 'FunctionDeclaration'].includes(n.type), fallsThrough: true };
    };
    const flows = [], loops = [];
    for (const n of nodes) {
        // Facts are a bounded projection, not an AST exposed to the doctor.
        if (['Identifier', 'MemberExpression', 'ObjectExpression', 'ArrayExpression', 'CallExpression', 'Literal', 'ConditionalExpression'].includes(n.type) || functions.has(n.type))
            value(n);
        if (n.type === 'CallExpression')
            for (const arg of n.arguments)
                value(arg);
        if (['ImportSpecifier', 'ImportNamespaceSpecifier', 'ImportDefaultSpecifier'].includes(n.type))
            pattern(n.local, {});
        if (n.type === 'VariableDeclarator')
            pattern(n.id, { ...(n.init ? { initializer: value(n.init) } : {}) });
        if (functions.has(n.type)) {
            n.params.forEach((p, index) => pattern(p, { parameter: { functionStart: id(n), index } }));
            if (n.type === 'FunctionDeclaration' && n.id)
                pattern(n.id, { initializer: value(n) });
            const body = n.body;
            const r = body.type === 'BlockStatement' ? returns(body) : { returns: [value(body)], unknownReturn: false, fallsThrough: false };
            flows.push({ start: id(n), returns: r.returns, unknownReturn: r.unknownReturn || r.fallsThrough });
        }
        if (['ForStatement', 'ForOfStatement', 'ForInStatement', 'WhileStatement', 'DoWhileStatement'].includes(n.type))
            loops.push({ ...range(n.body), functionStart: functionStart(n) });
    }
    for (const n of nodes) {
        if (n.type !== 'AssignmentExpression' && n.type !== 'UpdateExpression')
            continue;
        const left = (n.type === 'AssignmentExpression' ? n.left : n.argument);
        if (left.type !== 'Identifier')
            continue;
        const binding = target(left).binding, b = binding === null ? undefined : bindings.get(binding);
        if (b)
            ((_a = b.writes) !== null && _a !== void 0 ? _a : (b.writes = [])).push({ functionStart: functionStart(n),
                ...(n.type === 'AssignmentExpression' && n.operator === '=' ? { value: value(n.right) } : {}),
            });
    }
    for (const n of nodes) {
        const left = (n.type === 'AssignmentExpression' ? n.left :
            n.type === 'UpdateExpression' || (n.type === 'UnaryExpression' && n.operator === 'delete') ? n.argument : undefined);
        if ((left === null || left === void 0 ? void 0 : left.type) !== 'MemberExpression')
            continue;
        const binding = target(left).binding, b = binding === null ? undefined : bindings.get(binding);
        if (b)
            b.mutated = true;
    }
    for (const n of nodes)
        if (n.type === 'CallExpression') {
            for (const arg of n.arguments) {
                const a = unwrap(arg);
                if (a.type !== 'Identifier')
                    continue;
                const binding = target(a).binding, b = binding === null ? undefined : bindings.get(binding);
                if (b)
                    ((_b = b.escapes) !== null && _b !== void 0 ? _b : (b.escapes = [])).push(target(n.callee));
            }
        }
    // A direct alias shares the object's mutation/escape uncertainty with its origin.
    let changed = true;
    while (changed) {
        changed = false;
        for (const b of bindings.values()) {
            if (b.initializer === undefined)
                continue;
            let v = values.get(b.initializer);
            const seen = new Set();
            while ((v === null || v === void 0 ? void 0 : v.kind) === 'alias' && v.value !== undefined && !seen.has(v.start)) {
                seen.add(v.start);
                v = values.get(v.value);
            }
            const origin = (v === null || v === void 0 ? void 0 : v.kind) === 'reference' && ((_c = v.target) === null || _c === void 0 ? void 0 : _c.binding) !== null ? bindings.get(v.target.binding) : undefined;
            if (!origin || origin === b)
                continue;
            if (b.mutated && !origin.mutated) {
                origin.mutated = true;
                changed = true;
            }
            for (const escape of (_d = b.escapes) !== null && _d !== void 0 ? _d : []) {
                if (!((_e = origin.escapes) !== null && _e !== void 0 ? _e : []).includes(escape)) {
                    ((_f = origin.escapes) !== null && _f !== void 0 ? _f : (origin.escapes = [])).push(escape);
                    changed = true;
                }
            }
        }
    }
    const directives = [];
    for (const n of nodes[0].body) {
        if (n.type !== 'ExpressionStatement')
            break;
        const e = n.expression;
        if (e.type !== 'Literal' || typeof e.value !== 'string')
            break;
        directives.push(e.value);
    }
    return { flow: valueFlow(nodes, parents, target, range, unwrap, functionStart), values: [...values.values()], bindings: [...bindings.values()], functions: flows, loops, directives };
}
