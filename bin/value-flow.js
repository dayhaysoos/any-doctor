export function valueFlow(nodes, parents, target, range, unwrap, functionStart) {
    var _a, _b, _c, _d;
    const ids = new Map(), values = [], uses = [], bindings = [], loops = [];
    const functions = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);
    const dead = (n) => {
        let child = n, p = parents.get(child);
        while (p) {
            if (p.type === 'IfStatement' || p.type === 'ConditionalExpression') {
                const test = unwrap(p.test);
                if (test.type === 'Literal' && typeof test.value === 'boolean' && child === (test.value ? p.alternate : p.consequent))
                    return true;
            }
            if (p.type === 'BlockStatement') {
                const body = p.body, index = body.indexOf(child);
                if (index >= 0 && body.slice(0, index).some(s => s.type === 'ReturnStatement' || s.type === 'ThrowStatement'))
                    return true;
            }
            child = p;
            p = parents.get(p);
        }
        return false;
    };
    const key = (n, computed) => {
        n = unwrap(n);
        return !computed && n.type === 'Identifier' ? String(n.name)
            : n.type === 'Literal' && ['string', 'number'].includes(typeof n.value) ? String(n.value) : null;
    };
    const value = (input) => {
        const n = unwrap(input);
        const prior = ids.get(n);
        if (prior !== undefined)
            return prior;
        const id = values.length, v = { id, ...range(n), kind: 'unknown', functionStart: functionStart(n), dead: dead(n) };
        ids.set(n, id);
        values.push(v);
        if (n.type === 'Identifier') {
            v.kind = 'reference';
            v.target = target(n);
        }
        else if (n.type === 'Literal' && (n.value === null || ['string', 'number', 'boolean'].includes(typeof n.value))) {
            v.kind = 'literal';
            v.literal = n.value;
        }
        else if (n.type === 'TemplateLiteral' && !n.expressions.length) {
            v.kind = 'literal';
            v.literal = String((n.quasis[0].value).cooked);
        }
        else if (n.type === 'TemplateLiteral') {
            v.primitive = 'string';
        }
        else if (n.type === 'MemberExpression') {
            v.kind = 'member';
            v.target = target(n);
            v.receiver = value(n.object);
            v.member = key(n.property, n.computed);
        }
        else if (n.type === 'ArrayExpression') {
            v.kind = 'array';
            v.elements = n.elements.filter((e) => !!e).map(e => ({ value: value((e.type === 'SpreadElement' ? e.argument : e)), spread: e.type === 'SpreadElement' }));
        }
        else if (n.type === 'ObjectExpression') {
            v.kind = 'object';
            v.properties = n.properties.map(p => ({ name: p.type === 'SpreadElement' ? null : key(p.key, p.computed), spread: p.type === 'SpreadElement', accessor: p.kind === 'get' || p.kind === 'set', value: value((p.type === 'SpreadElement' ? p.argument : p.value)) }));
        }
        else if (n.type === 'CallExpression' || n.type === 'NewExpression') {
            v.kind = n.type === 'CallExpression' ? 'call' : 'construct';
            v.target = target(n.callee);
            v.callee = value(n.callee);
            v.arguments = n.arguments.map(value);
            const callee = unwrap(n.callee);
            if (callee.type === 'MemberExpression') {
                v.receiver = value(callee.object);
                v.member = key(callee.property, callee.computed);
            }
        }
        else if (functions.has(n.type)) {
            v.kind = 'function';
            v.async = !!n.async;
        }
        else if (n.type === 'AwaitExpression' || n.type === 'UnaryExpression' && n.operator === 'void') {
            v.kind = n.type === 'AwaitExpression' ? 'await' : 'void';
            v.value = value(n.argument);
        }
        else if (n.type === 'BinaryExpression' && n.operator === '+') {
            const a = values[value(n.left)], b = values[value(n.right)];
            if (a.primitive === 'string' || b.primitive === 'string' || typeof a.literal === 'string' || typeof b.literal === 'string')
                v.primitive = 'string';
        }
        else if (n.type === 'ConditionalExpression') {
            v.kind = 'choice';
            const test = unwrap(n.test);
            v.alternatives = test.type === 'Literal' && typeof test.value === 'boolean' ? [value((test.value ? n.consequent : n.alternate))] : [value(n.consequent), value(n.alternate)];
        }
        return id;
    };
    const arrayType = (n) => { var _a; return !!n && (n.type === 'TSArrayType' || n.type === 'TSTupleType' || n.type === 'TSTypeOperator' && arrayType(n.typeAnnotation) || n.type === 'TSTypeReference' && ['Array', 'ReadonlyArray'].includes((_a = target(n.typeName).root) !== null && _a !== void 0 ? _a : '') && target(n.typeName).binding === null); };
    for (const n of nodes) {
        if (['Identifier', 'MemberExpression', 'Literal', 'TemplateLiteral', 'ArrayExpression', 'ObjectExpression', 'CallExpression', 'NewExpression', 'AwaitExpression', 'ConditionalExpression'].includes(n.type) || functions.has(n.type) || n.type === 'UnaryExpression' && n.operator === 'void')
            value(n);
        if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier') {
            const b = target(n.id).binding;
            if (b !== null)
                bindings.push({ binding: b, ...(n.init ? { initializer: value(n.init) } : {}), ...(((_a = n.id.typeAnnotation) === null || _a === void 0 ? void 0 : _a.typeAnnotation) && n.id.typeAnnotation.typeAnnotation.type === 'TSStringKeyword' ? { primitive: 'string' } : {}), array: arrayType((_b = n.id.typeAnnotation) === null || _b === void 0 ? void 0 : _b.typeAnnotation) });
        }
        if (functions.has(n.type)) {
            if (n.type === 'FunctionDeclaration' && n.id) {
                const b = target(n.id).binding;
                if (b !== null)
                    bindings.push({ binding: b, initializer: value(n), array: false });
            }
            for (const p of n.params)
                if (p.type === 'Identifier') {
                    const b = target(p).binding;
                    if (b !== null)
                        bindings.push({ binding: b, ...(((_c = p.typeAnnotation) === null || _c === void 0 ? void 0 : _c.typeAnnotation) && p.typeAnnotation.typeAnnotation.type === 'TSStringKeyword' ? { primitive: 'string' } : {}), array: arrayType((_d = p.typeAnnotation) === null || _d === void 0 ? void 0 : _d.typeAnnotation) });
                }
            if (n.type === 'ArrowFunctionExpression' && n.body.type !== 'BlockStatement')
                uses.push({ value: value(n.body), kind: 'return', functionStart: n.range[0], dead: dead(n.body) });
        }
        if (['ReturnStatement', 'AwaitExpression', 'ExpressionStatement'].includes(n.type)) {
            const arg = (n.type === 'ExpressionStatement' ? n.expression : n.argument);
            if (arg)
                uses.push({ value: value(arg), kind: n.type === 'ReturnStatement' ? 'return' : n.type === 'AwaitExpression' ? 'await' : 'discard', functionStart: functionStart(n), dead: dead(n) });
        }
        if (n.type === 'AssignmentExpression') {
            const b = n.left.type === 'Identifier' ? target(n.left).binding : null;
            uses.push({ value: value(n.right), kind: 'write', ...(b !== null ? { binding: b } : {}), functionStart: functionStart(n), dead: dead(n) });
        }
        if (n.type === 'ForOfStatement') {
            const left = n.left, p = left.type === 'VariableDeclaration' ? left.declarations[0].id : left;
            loops.push({ ...range(n.body), functionStart: functionStart(n), iterable: value(n.right), binding: p.type === 'Identifier' ? target(p).binding : null, await: !!n.await });
        }
    }
    return { values, bindings, uses, loops };
}
