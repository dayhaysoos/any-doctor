import { parseIdentityQuery, parseOptionQuery } from "../semantic-query-parsers.js";
import { identityFixtures, occurrence, profile } from "./support.js";
export const requiredOptionRecipe = {
    name: "required-or-recommended-option",
    method: "requiredOrRecommendedOption",
    kind: "recipe-required-option",
    needs: ["calls", "identity", "option-presence"],
    parse(value) {
        if (!value || typeof value !== "object")
            return null;
        const record = value;
        const call = parseIdentityQuery(record.call);
        const option = parseOptionQuery(record.option);
        return call && option ? value : null;
    },
    evaluate(runtime, file, source, facts, expression, query) {
        const prepared = runtime.prepare(facts);
        const subject = runtime.expression(prepared, expression);
        if (!subject || subject.kind !== "call" || subject.callee === undefined)
            return runtime.unknown("unsupported-expression");
        const callee = prepared.values.get(subject.callee);
        if (!callee)
            return runtime.unknown("unsupported-expression");
        const candidate = runtime.identityCandidate(prepared, callee, query.call);
        if (candidate === "clear")
            return runtime.known("clear", []);
        if (candidate === "unknown")
            return runtime.unknown("unresolved-identity");
        const identity = runtime.identity(file, source, facts, runtime.ref(candidate), query.call);
        if (identity.status === "unknown")
            return runtime.unknownFrom(identity);
        if (!identity.value.matches)
            return runtime.known("clear", identity.evidence);
        const option = runtime.option(file, source, facts, runtime.ref(subject), query.option);
        if (option.status === "unknown")
            return runtime.unknownFrom(option);
        return runtime.known(option.value === "absent" ? "report" : "clear", [...identity.evidence, ...option.evidence]);
    },
    authoring({ expression, identity, finding, unknownReasons }) {
        return {
            api: "ctx.recipes.requiredOrRecommendedOption(file, expression, query, finding)",
            purpose: "Report a supported call when an ordered option is established absent.",
            limits: ["option presence does not validate arbitrary runtime value types", "opaque inputs may be unknown"],
            inputSchema: {
                type: "object", required: ["file", "expression", "query", "finding"],
                properties: {
                    file: { type: "string", description: "A relative path returned by ctx.files.list()." },
                    expression,
                    query: {
                        type: "object", required: ["call", "option"],
                        properties: {
                            call: identity,
                            option: {
                                type: "object", required: ["option", "sources"],
                                properties: {
                                    option: { type: "string" },
                                    sources: { type: "array", items: { type: "string" } },
                                },
                                additionalProperties: false,
                            },
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
    ctx.recipes.requiredOrRecommendedOption(
      file,
      { id: call.id, start: call.start, end: call.end },
      {
        call: { globals: ["fetch", "globalThis.fetch"] },
        option: { option: "signal", sources: ["RequestInit", "Request"] },
      },
      { rule: "fetch-without-signal", message: "No caller cancellation signal was established." },
    );
  }
}`,
        };
    },
    challenges(rule, declaration) {
        const query = declaration.query;
        const targets = identityFixtures(query.call, "profileCall");
        const target = targets[0];
        const callee = target.callee;
        const head = target.head;
        const option = query.option.option;
        const positive = `${callee}("payload",{})`;
        const value = option === "signal" ? "new AbortController().signal" : "true";
        const present = `${head}${callee}("payload",{${option}:${value}});`;
        const shadow = `${head}${target.shadow.replace("__ARGS__", "\"payload\",{}")}`;
        const alias = `${head}const invoke=${callee};invoke("payload",{});`;
        const uncertain = `${head}const options={};configure(options);${callee}("payload",options);\n${positive};`;
        const same = `${head}${positive};${positive};`;
        const positiveSource = `${head}${positive};`;
        const declared = targets.slice(1).map((candidate) => {
            const source = `${candidate.head}${candidate.callee}("payload",{});`;
            return profile(`declared call identity: ${candidate.label}`, source, [occurrence(source, rule, `${candidate.callee}("payload",{})`)], "complete");
        });
        return [
            profile("genuine absence positive", positiveSource, [occurrence(positiveSource, rule, positive)], "complete"),
            profile("present option lookalike", present, [], "complete"),
            profile("shadowed call identity", shadow, [], "complete"),
            profile("immutable call alias", alias, [occurrence(alias, rule, "invoke(\"payload\",{})")], "complete"),
            profile("unknown options with positive neighbor", uncertain, [occurrence(uncertain, rule, positive)], "narrowed"),
            profile("two same-line occurrences", same, [occurrence(same, rule, positive, 0), occurrence(same, rule, positive, 1)], "complete"),
            ...declared,
            profile("analysis unavailable", positiveSource, [], "unavailable"),
        ];
    },
};
