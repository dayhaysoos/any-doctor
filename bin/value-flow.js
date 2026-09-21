/** Direct terminal transfer only; nested conditions/loops are not flattened. */
export function terminalExit(node) {
    if (!node)
        return undefined;
    if (node.type === 'BlockStatement')
        return terminalExit(node.body.at(-1));
    if (node.label)
        return undefined;
    return { ReturnStatement: 'return', ThrowStatement: 'throw', ContinueStatement: 'continue', BreakStatement: 'break' }[node.type];
}
export function valueFlow(nodes, parents, target, range, unwrap, functionStart) {
    var _a, _b;
    const ids = new Map(), values = [], uses = [], bindings = [], loops = [], branches = [], jsxElements = [];
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
                if (index >= 0 && body.slice(0, index).some(s => ['ReturnStatement', 'ThrowStatement', 'ContinueStatement', 'BreakStatement'].includes(s.type)))
                    return true;
            }
            child = p;
            p = parents.get(p);
        }
        return false;
    };
    const conditional = (n) => {
        let child = n, p = parents.get(child);
        while (p) {
            if (functions.has(p.type))
                break;
            if (p.type === 'IfStatement' || p.type === 'ConditionalExpression') {
                const test = unwrap(p.test);
                if (!(test.type === 'Literal' && typeof test.value === 'boolean') && child !== p.test)
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
    const jsxName = (n) => typeof n.name === 'string' ? n.name : null;
    const precedingExits = new Map();
    const exits = (node) => terminalExit(node) !== undefined;
    // Build block-prefix facts once. Independent statements do not rescan all
    // earlier siblings for every nested expression.
    for (const block of nodes.filter(n => n.type === 'BlockStatement')) {
        let prefix = [];
        for (const statement of block.body) {
            precedingExits.set(statement, prefix);
            if (statement.type === 'IfStatement') {
                if (exits(statement.consequent))
                    prefix = [...prefix, { test: statement.test, truthy: false }];
                else if (exits(statement.alternate))
                    prefix = [...prefix, { test: statement.test, truthy: true }];
            }
        }
    }
    const value = (input) => {
        var _a;
        const n = unwrap(input);
        const prior = ids.get(n);
        if (prior !== undefined)
            return prior;
        const id = values.length, v = { id, ...range(n), kind: 'unknown', functionStart: functionStart(n), dead: dead(n), ...(conditional(n) ? { conditional: true } : {}) };
        ids.set(n, id);
        values.push(v);
        if (n.type === 'Super') {
            v.kind = 'super';
        }
        else if (n.type === 'Identifier' || n.type === 'MetaProperty') {
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
            v.template = { quasis: n.quasis.map(q => { var _a; return ((_a = q.value.cooked) !== null && _a !== void 0 ? _a : null); }), expressions: n.expressions.map(value) };
        }
        else if (n.type === 'MemberExpression') {
            v.kind = 'member';
            v.target = target(n);
            v.receiver = value(n.object);
            v.member = key(n.property, n.computed);
        }
        else if (n.type === 'ArrayExpression') {
            v.kind = 'array';
            v.elements = n.elements.flatMap((e, index) => e ? [{ value: value((e.type === 'SpreadElement' ? e.argument : e)), spread: e.type === 'SpreadElement', index }] : []);
        }
        else if (n.type === 'ObjectExpression') {
            v.kind = 'object';
            v.properties = n.properties.map(p => ({ name: p.type === 'SpreadElement' ? null : key(p.key, p.computed), spread: p.type === 'SpreadElement', accessor: p.kind === 'get' || p.kind === 'set', value: value((p.type === 'SpreadElement' ? p.argument : p.value)) }));
        }
        else if (n.type === 'CallExpression' || n.type === 'NewExpression') {
            v.kind = n.type === 'CallExpression' ? 'call' : 'construct';
            v.target = target(n.callee);
            v.callee = value(n.callee);
            v.argumentRoles = n.arguments.map(argument => ({ value: value((argument.type === 'SpreadElement' ? argument.argument : argument)), spread: argument.type === 'SpreadElement' }));
            v.arguments = v.argumentRoles.map(argument => argument.value);
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
        // Retain logical alternatives without claiming their runtime selection.
        // Existing flow consumers still see unknown; candidate recipes can rule out
        // identities only when neither alternative belongs to their target space.
        else if (n.type === 'SequenceExpression') {
            v.kind = 'choice';
            v.alternatives = [value(n.expressions.at(-1))];
        }
        else if (n.type === 'AssignmentExpression' && n.operator === '=') {
            v.kind = 'choice';
            v.alternatives = [value(n.right)];
        }
        else if (n.type === 'LogicalExpression' || n.type === 'AssignmentExpression' && ['??=', '||=', '&&='].includes(String(n.operator))) {
            const left = unwrap(n.left), operator = String(n.operator).replace('=', '');
            const known = left.type === 'Literal' && (left.value === null || ['boolean', 'string', 'number'].includes(typeof left.value));
            const right = operator === '??' ? left.value === null : operator === '||' ? !left.value : !!left.value;
            v.alternatives = known ? [value((right ? n.right : n.left))] : [value(n.left), value(n.right)];
        }
        else if (n.type === 'ConditionalExpression') {
            v.kind = 'choice';
            v.selection = { test: value(n.test), whenTrue: value(n.consequent), whenFalse: value(n.alternate) };
            const test = unwrap(n.test);
            v.alternatives = test.type === 'Literal' && typeof test.value === 'boolean' ? [value((test.value ? n.consequent : n.alternate))] : [value(n.consequent), value(n.alternate)];
        }
        if (['BinaryExpression', 'LogicalExpression', 'UnaryExpression'].includes(n.type))
            v.operation = { operator: String(n.operator), operands: (n.type === 'UnaryExpression' ? [n.argument] : [n.left, n.right]).map(x => value(x)) };
        const guards = [];
        let child = n, parent = parents.get(child);
        while (parent && !functions.has(parent.type)) {
            if (parent.type === 'IfStatement') {
                if (child === parent.consequent)
                    guards.push({ test: value(parent.test), truthy: true });
                if (child === parent.alternate)
                    guards.push({ test: value(parent.test), truthy: false });
            }
            if (parent.type === 'BlockStatement') {
                for (const guard of (_a = precedingExits.get(child)) !== null && _a !== void 0 ? _a : [])
                    guards.push({ test: value(guard.test), truthy: guard.truthy });
            }
            child = parent;
            parent = parents.get(parent);
        }
        if (guards.length)
            v.guards = guards;
        return id;
    };
    const arrayType = (n) => { var _a; return !!n && (n.type === 'TSArrayType' || n.type === 'TSTupleType' || n.type === 'TSTypeOperator' && arrayType(n.typeAnnotation) || n.type === 'TSTypeReference' && ['Array', 'ReadonlyArray'].includes((_a = target(n.typeName).root) !== null && _a !== void 0 ? _a : '') && target(n.typeName).binding === null); };
    for (const n of nodes) {
        if (['Identifier', 'MetaProperty', 'MemberExpression', 'Literal', 'TemplateLiteral', 'ArrayExpression', 'ObjectExpression', 'CallExpression', 'NewExpression', 'AwaitExpression', 'ConditionalExpression'].includes(n.type) || functions.has(n.type) || n.type === 'UnaryExpression' && n.operator === 'void')
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
            n.params.forEach((raw, index) => { var _a, _b; const p = (raw.type === 'RestElement' ? raw.argument : raw); if (p.type === 'Identifier') {
                const b = target(p).binding;
                if (b !== null)
                    bindings.push({ binding: b, ...(((_a = p.typeAnnotation) === null || _a === void 0 ? void 0 : _a.typeAnnotation) && p.typeAnnotation.typeAnnotation.type === 'TSStringKeyword' ? { primitive: 'string' } : {}), array: raw.type === 'RestElement' || arrayType((_b = p.typeAnnotation) === null || _b === void 0 ? void 0 : _b.typeAnnotation), parameter: { functionStart: n.range[0], index }, ...(raw.type === 'RestElement' ? { rest: true } : {}) });
            } });
            if (n.type === 'ArrowFunctionExpression' && n.body.type !== 'BlockStatement')
                uses.push({ value: value(n.body), kind: 'return', functionStart: n.range[0], dead: dead(n.body) });
        }
        if (['ReturnStatement', 'YieldExpression', 'AwaitExpression', 'ExpressionStatement'].includes(n.type)) {
            const arg = (n.type === 'ExpressionStatement' ? n.expression : n.argument);
            if (arg)
                uses.push({ value: value(arg), kind: n.type === 'ReturnStatement' ? 'return' : n.type === 'YieldExpression' ? 'yield' : n.type === 'AwaitExpression' ? 'await' : 'discard', functionStart: functionStart(n), dead: dead(n) });
        }
        if (n.type === 'AssignmentExpression') {
            const b = n.left.type === 'Identifier' ? target(n.left).binding : null;
            uses.push({ value: value(n.right), targetValue: value(n.left), kind: 'write', ...(b !== null ? { binding: b } : {}), functionStart: functionStart(n), dead: dead(n) });
        }
        if (n.type === 'IfStatement') {
            const branch = (node) => {
                const exit = terminalExit(node);
                return { ...range(node), ...(exit ? { exit } : {}) };
            };
            branches.push({ test: value(n.test), functionStart: functionStart(n), whenTrue: branch(n.consequent), ...(n.alternate ? { whenFalse: branch(n.alternate) } : {}) });
        }
        if (n.type === 'ForOfStatement') {
            const left = n.left, p = left.type === 'VariableDeclaration' ? left.declarations[0].id : left;
            const loopBindings = [];
            const patternBindings = (node, path = []) => {
                if (node.type === 'Identifier') {
                    const binding = target(node).binding;
                    if (binding !== null)
                        loopBindings.push({ binding, path });
                }
                else if (node.type === 'ObjectPattern')
                    for (const item of node.properties) {
                        if (item.type !== 'RestElement') {
                            const name = key(item.key, item.computed);
                            if (name !== null)
                                patternBindings(item.value, [...path, name]);
                        }
                    }
                else if (node.type === 'ArrayPattern')
                    node.elements.forEach((item, index) => { if (item && item.type !== 'RestElement')
                        patternBindings(item, [...path, String(index)]); });
            };
            patternBindings(p);
            loops.push({ ...range(n.body), functionStart: functionStart(n), iterable: value(n.right), binding: p.type === 'Identifier' ? target(p).binding : null, ...(p.type !== 'Identifier' ? { bindings: loopBindings } : {}), await: !!n.await });
        }
        if (n.type === 'JSXOpeningElement') {
            const attributes = n.attributes.map(attribute => {
                if (attribute.type === 'JSXSpreadAttribute')
                    return { name: null, value: value(attribute.argument), spread: true };
                const raw = attribute.value;
                if (!raw)
                    return { name: jsxName(attribute.name), spread: false };
                const expression = raw.type === 'JSXExpressionContainer' ? raw.expression : raw;
                return (expression === null || expression === void 0 ? void 0 : expression.type) === 'JSXEmptyExpression'
                    ? { name: jsxName(attribute.name), spread: false }
                    : { name: jsxName(attribute.name), value: value(expression), spread: false };
            });
            jsxElements.push({ ...range(n), target: target(n.name), attributes });
        }
    }
    return { values, bindings, uses, loops, branches, jsxElements };
}
