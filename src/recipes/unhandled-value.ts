import type { UnknownReason } from "../contract.js";
import { occurrence, profile } from "./support.js";
import type { RecipeDefinition } from "./types.js";

export interface UnhandledValueRecipeQuery {
  producer: { member: string; asyncArgument: number; receiver: "array" };
  consumers: string[];
  reportUnknown?: UnknownReason[];
}

export const unhandledValueRecipe: RecipeDefinition<"unhandled-value", "unhandledValue", UnhandledValueRecipeQuery> = {
  name: "unhandled-value",
  method: "unhandledValue",
  kind: "recipe-unhandled-value",
  needs: ["calls", "value-disposition"],

  parse(value) {
    if (!value || typeof value !== "object") return null;
    const record = value as Record<string, unknown>;
    const producer = record.producer as Record<string, unknown> | undefined;
    const consumers = record.consumers;
    return producer
      && typeof producer.member === "string"
      && Number.isInteger(producer.asyncArgument)
      && producer.receiver === "array"
      && Array.isArray(consumers)
      && consumers.every((item) => typeof item === "string")
      ? value as UnhandledValueRecipeQuery
      : null;
  },

  evaluate(runtime, file, source, facts, expression, query) {
    const prepared = runtime.prepare(facts);
    const flow = facts.structure.flow;
    const { values, bindings, states } = prepared;
    const subject = runtime.expression(prepared, expression);
    if (!subject || subject.kind !== "call") return runtime.unknown("unsupported-expression");
    if (subject.member !== query.producer.member) return runtime.known("clear", []);
    const stable = (binding: number) => !states.get(binding)?.reassigned && !states.get(binding)?.mutated;
    const resolve = (id: number | undefined, seen = new Set<number>()): typeof subject | null => {
      if (id === undefined) return null;
      const value = values.get(id);
      if (!value || seen.has(id)) return null;
      seen = new Set(seen).add(id);
      if (value.kind === "reference" && value.target?.binding !== null && value.target?.binding !== undefined) {
        if (!stable(value.target.binding)) return null;
        const initializer = bindings.get(value.target.binding)?.initializer;
        if (initializer !== undefined) return resolve(initializer, seen) ?? value;
      }
      return value;
    };
    const array = (id: number | undefined, seen = new Set<number>()): boolean | "unknown" => {
      if (id === undefined || seen.has(id)) return "unknown";
      seen = new Set(seen).add(id);
      const raw = values.get(id);
      const binding = raw?.target?.binding;
      const value = resolve(id);
      if (!value) return "unknown";
      if (value.kind === "object") {
        let method: NonNullable<typeof value.properties>[number] | undefined;
        for (const property of value.properties ?? []) {
          if (property.spread || property.name === null) method = undefined;
          else if (property.name === query.producer.member) method = property;
        }
        if (method && !method.accessor && resolve(method.value)?.kind === "function") return false;
      }
      if (binding !== null && binding !== undefined && states.get(binding)?.escapes?.length) return "unknown";
      if (binding !== null && binding !== undefined && bindings.get(binding)?.array && stable(binding)) return true;
      if (value.kind === "array") return true;
      if (value.kind === "call" && ["filter", "slice", "concat", "map", "flat", "flatMap", "toSorted", "toReversed", "toSpliced"].includes(value.member ?? "")) {
        return array(value.receiver, seen) === true ? true : "unknown";
      }
      return "unknown";
    };
    const callback = resolve(subject.arguments?.[query.producer.asyncArgument]);
    if (callback?.kind === "reference" && callback.target?.binding === null && callback.target.members.length === 0
      && ["String", "Number", "Boolean", "BigInt", "Symbol"].includes(callback.target.root ?? "")) return runtime.known("clear", []);
    if (callback?.kind !== "function") return runtime.unknown("unsupported-expression");
    if (!callback.async) return runtime.known("clear", []);
    const receiver = array(subject.receiver);
    if (receiver === false) return runtime.known("clear", []);
    if (receiver === "unknown") return runtime.unknown("unsupported-expression");
    const disposition = runtime.disposition(file, source, facts, runtime.ref(subject), { consumers: query.consumers });
    if (disposition.status === "unknown") return runtime.unknownFrom(disposition);
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
