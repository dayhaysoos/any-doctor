import { occurrence, profile } from "./support.js";
export const unhandledValueRecipe = {
    name: "unhandled-value",
    method: "unhandledValue",
    kind: "recipe-unhandled-value",
    needs: ["calls", "value-disposition"],
    parse(value) {
        if (!value || typeof value !== "object")
            return null;
        const record = value;
        const producer = record.producer;
        const consumers = record.consumers;
        return producer
            && typeof producer.member === "string"
            && Number.isInteger(producer.asyncArgument)
            && producer.receiver === "array"
            && Array.isArray(consumers)
            && consumers.every((item) => typeof item === "string")
            ? value
            : null;
    },
    evaluate(runtime, file, source, facts, expression, query) {
        var _a, _b, _c;
        const prepared = runtime.prepare(facts);
        const flow = facts.structure.flow;
        const { values, bindings, states } = prepared;
        const subject = runtime.expression(prepared, expression);
        if (!subject || subject.kind !== "call")
            return runtime.unknown("unsupported-expression");
        if (subject.member !== query.producer.member)
            return runtime.known("clear", []);
        const stable = (binding) => { var _a, _b; return !((_a = states.get(binding)) === null || _a === void 0 ? void 0 : _a.reassigned) && !((_b = states.get(binding)) === null || _b === void 0 ? void 0 : _b.mutated); };
        const resolve = (id, seen = new Set()) => {
            var _a, _b, _c, _d;
            if (id === undefined)
                return null;
            const value = values.get(id);
            if (!value || seen.has(id))
                return null;
            seen = new Set(seen).add(id);
            if (value.kind === "reference" && ((_a = value.target) === null || _a === void 0 ? void 0 : _a.binding) !== null && ((_b = value.target) === null || _b === void 0 ? void 0 : _b.binding) !== undefined) {
                if (!stable(value.target.binding))
                    return null;
                const initializer = (_c = bindings.get(value.target.binding)) === null || _c === void 0 ? void 0 : _c.initializer;
                if (initializer !== undefined)
                    return (_d = resolve(initializer, seen)) !== null && _d !== void 0 ? _d : value;
            }
            return value;
        };
        const array = (id, seen = new Set()) => {
            var _a, _b, _c, _d, _e, _f, _g;
            if (id === undefined || seen.has(id))
                return "unknown";
            seen = new Set(seen).add(id);
            const raw = values.get(id);
            const binding = (_a = raw === null || raw === void 0 ? void 0 : raw.target) === null || _a === void 0 ? void 0 : _a.binding;
            const value = resolve(id);
            if (!value)
                return "unknown";
            if (value.kind === "object") {
                let method;
                for (const property of (_b = value.properties) !== null && _b !== void 0 ? _b : []) {
                    if (property.spread || property.name === null)
                        method = undefined;
                    else if (property.name === query.producer.member)
                        method = property;
                }
                if (method && !method.accessor && ((_c = resolve(method.value)) === null || _c === void 0 ? void 0 : _c.kind) === "function")
                    return false;
            }
            if (binding !== null && binding !== undefined && ((_e = (_d = states.get(binding)) === null || _d === void 0 ? void 0 : _d.escapes) === null || _e === void 0 ? void 0 : _e.length))
                return "unknown";
            if (binding !== null && binding !== undefined && ((_f = bindings.get(binding)) === null || _f === void 0 ? void 0 : _f.array) && stable(binding))
                return true;
            if (value.kind === "array")
                return true;
            if (value.kind === "call" && ["filter", "slice", "concat", "map", "flat", "flatMap", "toSorted", "toReversed", "toSpliced"].includes((_g = value.member) !== null && _g !== void 0 ? _g : "")) {
                return array(value.receiver, seen) === true ? true : "unknown";
            }
            return "unknown";
        };
        const callback = resolve((_a = subject.arguments) === null || _a === void 0 ? void 0 : _a[query.producer.asyncArgument]);
        if ((callback === null || callback === void 0 ? void 0 : callback.kind) === "reference" && ((_b = callback.target) === null || _b === void 0 ? void 0 : _b.binding) === null && callback.target.members.length === 0
            && ["String", "Number", "Boolean", "BigInt", "Symbol"].includes((_c = callback.target.root) !== null && _c !== void 0 ? _c : ""))
            return runtime.known("clear", []);
        if ((callback === null || callback === void 0 ? void 0 : callback.kind) !== "function")
            return runtime.unknown("unsupported-expression");
        if (!callback.async)
            return runtime.known("clear", []);
        const receiver = array(subject.receiver);
        if (receiver === false)
            return runtime.known("clear", []);
        if (receiver === "unknown")
            return runtime.unknown("unsupported-expression");
        const disposition = runtime.disposition(file, source, facts, runtime.ref(subject), { consumers: query.consumers });
        if (disposition.status === "unknown")
            return runtime.unknownFrom(disposition);
        return runtime.known(disposition.value === "discarded" ? "report" : "clear", disposition.evidence);
    },
    authoring({ expression, finding, unknownReasons }) {
        return {
            api: "ctx.recipes.unhandledValue(file, expression, query, finding)",
            purpose: "Report a configured produced value only when no supported consumer or ownership transfer is established.",
            limits: ["supported native-array producers", "bounded lexical value flow"],
            inputSchema: {
                type: "object", required: ["file", "expression", "query", "finding"],
                properties: {
                    file: { type: "string", description: "A relative path returned by ctx.files.list()." },
                    expression,
                    query: {
                        type: "object", required: ["producer", "consumers"],
                        properties: {
                            producer: {
                                type: "object", required: ["member", "asyncArgument", "receiver"],
                                properties: { member: { type: "string" }, asyncArgument: { type: "number" }, receiver: { const: "array" } },
                                additionalProperties: false,
                            },
                            consumers: { type: "array", items: { type: "string" } },
                            reportUnknown: unknownReasons,
                        },
                        additionalProperties: false,
                    },
                    finding,
                },
                additionalProperties: false,
            },
            example: `for (const file of ctx.files.list()) {
  const calls = ctx.analysis.calls(file).structure.flow.values
    .filter(value => value.kind === "call" && !value.dead);
  for (const call of calls) {
    ctx.recipes.unhandledValue(
      file,
      { id: call.id, start: call.start, end: call.end },
      {
        producer: { member: "map", asyncArgument: 0, receiver: "array" },
        consumers: ["Promise.all", "Promise.allSettled"],
      },
      { rule: "unhandled-map-work", message: "This async map result is discarded." },
    );
  }
}`,
        };
    },
    challenges(rule, declaration) {
        const member = declaration.query.producer.member;
        const producer = `[1].${member}(async value=>value)`;
        const positive = `${producer};`;
        const lookalike = `const object={${member}:async callback=>callback(1)};object.${member}(async value=>value);`;
        const transfer = `function own(){return ${producer}}`;
        const uncertain = `const items=getItems();items.${member}(async value=>value);\n${positive}`;
        const same = `${positive}${positive}`;
        return [
            profile("genuine positive", positive, [occurrence(positive, rule, producer)], "complete"),
            profile("valid lookalike and shadowed producer", lookalike, [], "complete"),
            profile("ownership transfer", transfer, [], "complete"),
            profile("unsupported receiver with positive neighbor", uncertain, [occurrence(uncertain, rule, producer)], "narrowed"),
            profile("two same-line occurrences", same, [occurrence(same, rule, producer, 0), occurrence(same, rule, producer, 1)], "complete"),
            profile("analysis unavailable", positive, [], "unavailable"),
        ];
    },
};
