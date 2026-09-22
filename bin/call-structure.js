import { valueFlow, terminalExit } from './value-flow.js';
/** Generic value relationships, never framework policy or executable target code. */
export function callStructure(nodes, parents, target, range, unwrap, functionStart) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y;
    const functions = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);
    const id = (n) => n.range[0];
    const key = (n) => {
        n = unwrap(n);
        return n.type === 'Identifier' ? String(n.name) : n.type === 'Literal' && (typeof n.value === 'string' || typeof n.value === 'number') ? String(n.value) : null;
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
        else if (n.type === 'ArrayExpression') {
            fact.kind = 'array';
            fact.elements = n.elements.flatMap((item, index) => item
                ? [{ value: value((item.type === 'SpreadElement' ? item.argument : item)), spread: item.type === 'SpreadElement', index }] : []);
        }
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
    const bindingOwners = new Map();
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
            bindingOwners.set(t.binding, functionStart(p));
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
            loops.push({ ...range(n.body), functionStart: functionStart(n), ...(terminalExit(n.body) ? { tailExit: terminalExit(n.body) } : {}) });
    }
    for (const n of nodes) {
        if (n.type !== 'AssignmentExpression' && n.type !== 'UpdateExpression')
            continue;
        const left = (n.type === 'AssignmentExpression' ? n.left : n.argument);
        if (left.type !== 'Identifier')
            continue;
        const binding = target(left).binding, b = binding === null ? undefined : bindings.get(binding);
        if (b)
            ((_a = b.writes) !== null && _a !== void 0 ? _a : (b.writes = [])).push({ functionStart: functionStart(n), start: n.range[0],
                ...(n.type === 'AssignmentExpression' && n.operator === '=' ? { value: value(n.right) } : {}),
            });
    }
    for (const n of nodes) {
        const left = (n.type === 'AssignmentExpression' ? n.left :
            n.type === 'UpdateExpression' || (n.type === 'UnaryExpression' && n.operator === 'delete') ? n.argument : undefined);
        if ((left === null || left === void 0 ? void 0 : left.type) !== 'MemberExpression')
            continue;
        const binding = target(left).binding, b = binding === null ? undefined : bindings.get(binding);
        if (b) {
            b.mutated = true;
            ((_b = b.mutationSites) !== null && _b !== void 0 ? _b : (b.mutationSites = [])).push(n.range[0]);
        }
    }
    const conditionalWrite = (node) => {
        let current = parents.get(node);
        while (current && !functions.has(current.type) && current.type !== 'Program') {
            if (['IfStatement', 'ConditionalExpression', 'LogicalExpression', 'SwitchCase', 'ForStatement', 'ForInStatement', 'ForOfStatement', 'WhileStatement', 'DoWhileStatement', 'TryStatement', 'CatchClause'].includes(current.type))
                return true;
            current = parents.get(current);
        }
        return false;
    };
    const rootWrites = [];
    const memberWrites = [];
    for (const n of nodes) {
        if (n.type !== 'AssignmentExpression' || n.operator !== '=')
            continue;
        const left = n.left;
        let resolved = target(left);
        if (left.type === 'MemberExpression') {
            const member = key(left.property), base = target(left.object);
            if (base.binding !== null && member !== null)
                resolved = { ...base, members: [...base.members, member] };
        }
        if (resolved.binding === null || functionStart(n) !== bindingOwners.get(resolved.binding))
            continue;
        // JavaScript commits an assignment only after its right-hand side has
        // finished evaluating; nested RHS calls still observe the previous value.
        const write = { binding: resolved.binding, path: [...resolved.members], value: value(n.right), start: n.range[1], conditional: conditionalWrite(n) };
        if (left.type === 'Identifier')
            rootWrites.push(write);
        else if (left.type === 'MemberExpression' && resolved.members.length)
            memberWrites.push(write);
    }
    const canonical = (binding, path, at, seen = new Set()) => {
        var _a, _b, _c, _d;
        if (seen.has(binding) || rootWrites.some(write => write.binding === binding && write.start < at))
            return { binding, path };
        seen = new Set(seen).add(binding);
        let fact = values.get((_b = (_a = bindings.get(binding)) === null || _a === void 0 ? void 0 : _a.initializer) !== null && _b !== void 0 ? _b : -1);
        while ((fact === null || fact === void 0 ? void 0 : fact.kind) === 'alias' && fact.value !== undefined)
            fact = values.get(fact.value);
        if ((fact === null || fact === void 0 ? void 0 : fact.kind) === 'reference' && ((_c = fact.target) === null || _c === void 0 ? void 0 : _c.binding) !== null && ((_d = fact.target) === null || _d === void 0 ? void 0 : _d.binding) !== undefined)
            return canonical(fact.target.binding, [...fact.target.members, ...path], at, seen);
        return { binding, path };
    };
    const normalizedMemberWrites = (at) => memberWrites.filter(write => write.start < at).map(write => {
        const owner = canonical(write.binding, write.path, write.start);
        return { ...write, binding: owner.binding, path: owner.path };
    });
    const startsWith = (path, prefix) => prefix.every((part, index) => path[index] === part);
    const activeMemberWrites = (binding, at) => {
        const latestRoot = Math.max(-1, ...rootWrites.filter(write => canonical(write.binding, [], write.start).binding === binding && write.start < at && !write.conditional).map(write => write.start));
        const active = [];
        for (const write of normalizedMemberWrites(at).filter(write => write.binding === binding && write.start > latestRoot).sort((a, b) => a.start - b.start)) {
            if (!write.conditional)
                for (let index = active.length - 1; index >= 0; index--)
                    if (startsWith(active[index].path, write.path))
                        active.splice(index, 1);
            active.push(write);
        }
        return active;
    };
    const factsAt = (binding, path, at, visited = new Set()) => {
        ({ binding, path } = canonical(binding, path, at));
        const visitKey = `${binding}:${path.join('.')}`;
        if (visited.has(visitKey))
            return [];
        visited = new Set(visited).add(visitKey);
        const state = bindings.get(binding);
        let roots = [state === null || state === void 0 ? void 0 : state.initializer].filter((item) => item !== undefined);
        for (const write of rootWrites.filter(write => write.binding === binding && write.start < at).sort((a, b) => a.start - b.start)) {
            if (write.conditional)
                roots.push(write.value);
            else
                roots = [write.value];
        }
        const descend = (fact, index) => {
            var _a, _b, _c, _d;
            if (index === path.length)
                return [fact];
            if (fact.kind === 'reference' && ((_a = fact.target) === null || _a === void 0 ? void 0 : _a.binding) !== null && ((_b = fact.target) === null || _b === void 0 ? void 0 : _b.binding) !== undefined)
                // A stored reference captures the object identity at the point the
                // container/alias is created; later reassignment of its source binding
                // cannot rewrite that snapshot.
                return factsAt(fact.target.binding, [...fact.target.members, ...path.slice(index)], Math.min(at, fact.start), visited);
            if (fact.kind === 'array') {
                const position = Number(path[index]);
                if (!Number.isInteger(position))
                    return [];
                const item = ((_c = fact.elements) !== null && _c !== void 0 ? _c : []).find(element => element.index === position && !element.spread);
                const child = item ? values.get(item.value) : undefined;
                return child ? descend(child, index + 1) : [];
            }
            if (fact.kind !== 'object')
                return [];
            const selected = [];
            for (const property of (_d = fact.properties) !== null && _d !== void 0 ? _d : []) {
                if (!property.spread && property.name === path[index])
                    selected.push(property.value);
            }
            return selected.flatMap(id => { const child = values.get(id); return child ? descend(child, index + 1) : []; });
        };
        let result = roots.flatMap(id => { const fact = values.get(id); return fact ? descend(fact, 0) : []; });
        for (const write of activeMemberWrites(binding, at).filter(write => startsWith(path, write.path)).sort((a, b) => a.start - b.start)) {
            const fact = values.get(write.value), replacement = fact ? descend(fact, write.path.length) : [];
            if (write.conditional)
                result.push(...replacement);
            else
                result = replacement;
        }
        return result;
    };
    const transferredBindings = (input, at, seen = new Set(), aggregate = true) => {
        const n = unwrap(input);
        if (seen.has(n))
            return [];
        seen = new Set(seen).add(n);
        const snapshotFor = (binding, path, visited = new Set()) => {
            var _a, _b, _c, _d, _e;
            if (visited.has(binding))
                return undefined;
            visited = new Set(visited).add(binding);
            let initial = values.get((_b = (_a = bindings.get(binding)) === null || _a === void 0 ? void 0 : _a.initializer) !== null && _b !== void 0 ? _b : -1);
            while ((initial === null || initial === void 0 ? void 0 : initial.kind) === 'alias' && initial.value !== undefined)
                initial = values.get(initial.value);
            const targetBinding = (initial === null || initial === void 0 ? void 0 : initial.kind) === 'reference' ? (_c = initial.target) === null || _c === void 0 ? void 0 : _c.binding : null;
            if (targetBinding === null || targetBinding === undefined)
                return undefined;
            const snapshotPath = [...((_e = (_d = initial.target) === null || _d === void 0 ? void 0 : _d.members) !== null && _e !== void 0 ? _e : []), ...path];
            const pointerReplaced = rootWrites.some(write => write.binding === targetBinding && write.start > initial.start && write.start < at)
                || normalizedMemberWrites(at).some(write => write.binding === targetBinding && write.start > initial.start && startsWith(snapshotPath, write.path));
            return pointerReplaced
                ? { binding: targetBinding, path: snapshotPath, facts: factsAt(targetBinding, snapshotPath, initial.start) }
                : snapshotFor(targetBinding, snapshotPath, visited);
        };
        function fromId(id, visited = new Set()) {
            var _a, _b;
            const child = values.get(id);
            if (!child || visited.has(child.start))
                return [];
            if (child.kind === 'reference' && ((_a = child.target) === null || _a === void 0 ? void 0 : _a.binding) !== null && ((_b = child.target) === null || _b === void 0 ? void 0 : _b.binding) !== undefined) {
                visited = new Set(visited).add(child.start);
                const snapshot = snapshotFor(child.target.binding, [...child.target.members]);
                if (snapshot)
                    return snapshot.facts.flatMap(item => contained(item, visited));
                const owner = canonical(child.target.binding, [...child.target.members], at), terminals = factsAt(owner.binding, owner.path, at);
                return [{ binding: owner.binding, path: owner.path, immutable: terminals.length > 0 && terminals.every(item => item.kind === 'literal') },
                    ...terminals.flatMap(item => containedAt(owner.binding, owner.path, item, visited))];
            }
            return contained(child, visited);
        }
        function spreadFromId(id, visited = new Set()) {
            var _a, _b, _c, _d;
            const raw = values.get(id);
            if (!raw || visited.has(raw.start))
                return [];
            visited = new Set(visited).add(raw.start);
            const sourceAt = Math.min(at, raw.start);
            const origin = raw.kind === 'reference' && ((_a = raw.target) === null || _a === void 0 ? void 0 : _a.binding) !== null && ((_b = raw.target) === null || _b === void 0 ? void 0 : _b.binding) !== undefined
                ? canonical(raw.target.binding, [...raw.target.members], sourceAt) : undefined;
            const sources = origin ? factsAt(origin.binding, origin.path, sourceAt) : [raw];
            if (!sources.length && raw.kind === 'reference' && ((_c = raw.target) === null || _c === void 0 ? void 0 : _c.binding) !== null && ((_d = raw.target) === null || _d === void 0 ? void 0 : _d.binding) !== undefined)
                return [{ binding: origin.binding, path: origin.path, immutable: false }];
            return sources.flatMap(source => {
                var _a, _b;
                if (origin) {
                    const current = containedAt(origin.binding, origin.path, source, visited, sourceAt);
                    const replacedLater = rootWrites.some(write => write.binding === origin.binding && write.start > sourceAt && write.start < at)
                        || normalizedMemberWrites(at).some(write => write.binding === origin.binding && write.start > sourceAt
                            && (startsWith(origin.path, write.path) || startsWith(write.path, origin.path)));
                    return replacedLater ? [...current, ...contained(source, visited)] : current;
                }
                if (source.kind === 'object')
                    return ((_a = source.properties) !== null && _a !== void 0 ? _a : []).flatMap(item => {
                        if (item.spread)
                            return spreadFromId(item.value, visited);
                        return fromId(item.value, visited);
                    });
                if (source.kind === 'array')
                    return ((_b = source.elements) !== null && _b !== void 0 ? _b : []).flatMap(item => item.spread ? spreadFromId(item.value, visited) : fromId(item.value, visited));
                return [];
            });
        }
        function fromFact(fact, origin, visited) {
            var _a;
            if (fact.kind === 'reference')
                return fromId(fact.start, visited);
            if (fact.kind === 'choice')
                return ((_a = fact.alternatives) !== null && _a !== void 0 ? _a : []).flatMap(id => fromId(id, visited));
            if ((fact.kind === 'object' || fact.kind === 'array') && origin)
                return [{ binding: origin.binding, path: origin.path, immutable: false }, ...containedAt(origin.binding, origin.path, fact, visited)];
            return contained(fact, visited);
        }
        function containedAt(binding, path, fact, visited = new Set(), observation = at) {
            var _a, _b, _c;
            if (visited.has(fact.start))
                return [];
            visited = new Set(visited).add(fact.start);
            if (fact.kind === 'choice')
                return ((_a = fact.alternatives) !== null && _a !== void 0 ? _a : []).flatMap(id => fromId(id, visited));
            const writes = activeMemberWrites(binding, observation).filter(write => startsWith(write.path, path) && write.path.length > path.length);
            const directNames = new Set(writes.filter(write => write.path.length === path.length + 1).map(write => write.path.at(-1)));
            const out = [];
            if (fact.kind === 'object')
                for (const item of (_b = fact.properties) !== null && _b !== void 0 ? _b : []) {
                    if (item.spread) {
                        out.push(...spreadFromId(item.value, visited));
                        continue;
                    }
                    if (item.name === null || directNames.has(item.name))
                        continue;
                    const childPath = [...path, item.name];
                    for (const child of factsAt(binding, childPath, observation))
                        out.push(...fromFact(child, { binding, path: childPath }, visited));
                }
            if (fact.kind === 'array')
                for (const item of (_c = fact.elements) !== null && _c !== void 0 ? _c : []) {
                    if (item.spread) {
                        out.push(...spreadFromId(item.value, visited));
                        continue;
                    }
                    const childPath = [...path, String(item.index)];
                    if (directNames.has(String(item.index)))
                        continue;
                    for (const child of factsAt(binding, childPath, observation))
                        out.push(...fromFact(child, { binding, path: childPath }, visited));
                }
            for (const name of directNames) {
                const childPath = [...path, name];
                for (const child of factsAt(binding, childPath, observation))
                    out.push(...fromFact(child, { binding, path: childPath }, visited));
            }
            return out;
        }
        function contained(fact, visited = new Set()) {
            var _a, _b, _c;
            if (!fact || visited.has(fact.start))
                return [];
            visited = new Set(visited).add(fact.start);
            if (fact.kind === 'object')
                return ((_a = fact.properties) !== null && _a !== void 0 ? _a : []).flatMap(item => item.spread ? spreadFromId(item.value, visited) : fromId(item.value, visited));
            if (fact.kind === 'array')
                return ((_b = fact.elements) !== null && _b !== void 0 ? _b : []).flatMap(item => item.spread ? spreadFromId(item.value, visited) : fromId(item.value, visited));
            if (fact.kind === 'choice')
                return ((_c = fact.alternatives) !== null && _c !== void 0 ? _c : []).flatMap(id => fromId(id, visited));
            return [];
        }
        if (n.type === 'Identifier' || n.type === 'MemberExpression') {
            const resolved = target(n), binding = resolved.binding;
            if (binding === null)
                return [];
            const path = [...resolved.members], owner = canonical(binding, path, at), terminals = factsAt(owner.binding, owner.path, at);
            const snapshot = snapshotFor(binding, path);
            return [{ binding, path, immutable: terminals.length > 0 && terminals.every(item => item.kind === 'literal'), aggregate },
                ...(snapshot ? snapshot.facts.flatMap(item => contained(item)) : terminals.flatMap(item => containedAt(owner.binding, owner.path, item)))];
        }
        if (n.type === 'ObjectExpression')
            return n.properties.flatMap(property => {
                // A normal property transfers its value (`{ options }`); an object
                // spread copies enumerable properties synchronously and does not hand
                // the source object's identity to the callee.
                if (property.type === 'SpreadElement') {
                    return spreadFromId(value(property.argument));
                }
                return property.value ? transferredBindings(property.value, at, seen, false) : [];
            });
        if (n.type === 'ArrayExpression')
            return n.elements.flatMap(element => {
                // `[options]` transfers options. `[...options]` transfers the iterated
                // elements, which this local binding model cannot identify, not the
                // options container itself.
                if (!element)
                    return [];
                return element.type === 'SpreadElement' ? spreadFromId(value(element.argument)) : transferredBindings(element, at, seen, false);
            });
        if (n.type === 'ConditionalExpression')
            return [
                ...transferredBindings(n.consequent, at, seen, aggregate),
                ...transferredBindings(n.alternate, at, seen, aggregate),
            ];
        if (n.type === 'LogicalExpression' || n.type === 'SequenceExpression') {
            const children = n.type === 'SequenceExpression' ? n.expressions : [n.left, n.right];
            return children.flatMap(child => transferredBindings(child, at, seen, aggregate));
        }
        return [];
    };
    for (const n of nodes)
        if (n.type === 'CallExpression' || n.type === 'NewExpression') {
            const callee = n.callee, callTarget = target(callee), executionSite = n.range[1];
            const inputs = [...n.arguments.map(arg => arg.type === 'SpreadElement' ? arg.argument : arg)];
            // An opaque method may mutate its receiver (`options.normalize()`).
            // The receiver is therefore an identity transfer just like an argument.
            if (n.type === 'CallExpression' && callee.type === 'MemberExpression') {
                const receiver = callee.object, receiverBinding = target(receiver).binding;
                const method = target(callee).members.at(-1);
                const receiverInitializer = receiverBinding === null ? undefined : (_c = bindings.get(receiverBinding)) === null || _c === void 0 ? void 0 : _c.initializer;
                const immutableArrayMethod = receiverInitializer !== undefined && ((_d = values.get(receiverInitializer)) === null || _d === void 0 ? void 0 : _d.kind) === 'array'
                    && ['concat', 'entries', 'every', 'filter', 'find', 'findIndex', 'findLast', 'findLastIndex', 'flat', 'flatMap', 'forEach', 'includes', 'indexOf', 'join', 'keys', 'lastIndexOf', 'map', 'reduce', 'reduceRight', 'slice', 'some', 'toReversed', 'toSorted', 'toSpliced', 'values', 'with'].includes(method !== null && method !== void 0 ? method : '');
                if (!immutableArrayMethod && receiverBinding !== null) {
                    const receiverState = bindings.get(receiverBinding);
                    if (receiverState)
                        ((_e = receiverState.opaqueCallSites) !== null && _e !== void 0 ? _e : (receiverState.opaqueCallSites = [])).push(executionSite);
                }
            }
            for (const input of inputs) {
                for (const transfer of transferredBindings(input, executionSite)) {
                    const b = bindings.get(transfer.binding);
                    if (!b)
                        continue;
                    if (transfer.aggregate && !transfer.path.length && !transfer.immutable)
                        ((_f = b.escapes) !== null && _f !== void 0 ? _f : (b.escapes = [])).push(callTarget);
                    ((_g = b.escapeSites) !== null && _g !== void 0 ? _g : (b.escapeSites = [])).push({ start: executionSite, target: callTarget, ...(transfer.path.length ? { path: transfer.path } : {}), ...(transfer.immutable ? { immutable: true } : {}) });
                }
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
            const origin = (v === null || v === void 0 ? void 0 : v.kind) === 'reference' && ((_h = v.target) === null || _h === void 0 ? void 0 : _h.binding) !== null ? bindings.get(v.target.binding) : undefined;
            if (!origin || origin === b)
                continue;
            const aliasPath = (_k = (_j = v === null || v === void 0 ? void 0 : v.target) === null || _j === void 0 ? void 0 : _j.members) !== null && _k !== void 0 ? _k : [];
            if (b.mutated && !origin.mutated) {
                origin.mutated = true;
                changed = true;
            }
            for (const site of (_l = b.mutationSites) !== null && _l !== void 0 ? _l : []) {
                if (!((_m = origin.mutationSites) !== null && _m !== void 0 ? _m : []).includes(site)) {
                    ((_o = origin.mutationSites) !== null && _o !== void 0 ? _o : (origin.mutationSites = [])).push(site);
                    changed = true;
                }
            }
            for (const escape of (_p = b.escapes) !== null && _p !== void 0 ? _p : []) {
                if (aliasPath.length)
                    continue;
                if (!((_q = origin.escapes) !== null && _q !== void 0 ? _q : []).includes(escape)) {
                    ((_r = origin.escapes) !== null && _r !== void 0 ? _r : (origin.escapes = [])).push(escape);
                    changed = true;
                }
            }
            for (const site of (_s = b.escapeSites) !== null && _s !== void 0 ? _s : []) {
                const propagated = { ...site, path: [...aliasPath, ...((_t = site.path) !== null && _t !== void 0 ? _t : [])] };
                if (!((_u = origin.escapeSites) !== null && _u !== void 0 ? _u : []).some(item => { var _a; return item.start === propagated.start && item.target.binding === propagated.target.binding && item.target.root === propagated.target.root && item.target.members.join('.') === propagated.target.members.join('.') && ((_a = item.path) !== null && _a !== void 0 ? _a : []).join('.') === propagated.path.join('.'); })) {
                    ((_v = origin.escapeSites) !== null && _v !== void 0 ? _v : (origin.escapeSites = [])).push(propagated);
                    changed = true;
                }
            }
            for (const site of (_w = b.opaqueCallSites) !== null && _w !== void 0 ? _w : []) {
                if (!((_x = origin.opaqueCallSites) !== null && _x !== void 0 ? _x : []).includes(site)) {
                    ((_y = origin.opaqueCallSites) !== null && _y !== void 0 ? _y : (origin.opaqueCallSites = [])).push(site);
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
