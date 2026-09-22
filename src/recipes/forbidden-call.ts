import type { IdentityQuery, UnknownReason } from "../contract.js";
import { parseIdentityQuery } from "../semantic-query-parsers.js";
import { identityFixtures, occurrence, profileAt } from "./support.js";
import type { RecipeDefinition } from "./types.js";

export interface ForbiddenCallRecipeQuery {
  target: IdentityQuery;
  scope?: {
    /** Relative directories whose descendants are in scope, for example ["src"]. */
    under?: string[];
    /** Exact suffixes including the dot, for example [".ts", ".tsx"]. */
    extensions?: string[];
    /** Exact normalized relative paths that are exempt. */
    exclude?: string[];
  };
  reportUnknown?: UnknownReason[];
}

export const forbiddenCallRecipe: RecipeDefinition<"forbidden-call", "forbiddenCall", ForbiddenCallRecipeQuery> = {
  name: "forbidden-call",
  method: "forbiddenCall",
  kind: "recipe-forbidden-call",
  needs: ["calls", "identity"],

  parse(value) {
    if (!value || typeof value !== "object") return null;
    const record = value as Record<string, unknown>;
    const target = parseIdentityQuery(record.target);
    const scope = record.scope as Record<string, unknown> | undefined;
    const strings = (item: unknown) => item === undefined || Array.isArray(item) && item.every((entry) => typeof entry === "string");
    return target && (!scope || strings(scope.under) && strings(scope.extensions) && strings(scope.exclude))
      ? value as ForbiddenCallRecipeQuery
      : null;
  },

  evaluate(runtime, file, source, facts, expression, query) {
    const scope = query.scope;
    if (scope?.under?.length && !scope.under.some((dir) => {
      const normalized = dir.replace(/\/$/, "");
      return file.startsWith(normalized + "/");
    })) return runtime.known("clear", []);
    if (scope?.extensions?.length && !scope.extensions.some((extension) => file.endsWith(extension))) return runtime.known("clear", []);
    if (scope?.exclude?.includes(file)) return runtime.known("clear", []);
    const prepared = runtime.prepare(facts);
    const subject = runtime.expression(prepared, expression);
    if (!subject || subject.kind !== "call" || subject.callee === undefined) return runtime.unknown("unsupported-expression");
    const callee = prepared.values.get(subject.callee);
    if (!callee) return runtime.unknown("unsupported-expression");
    const candidate = runtime.forbiddenCallCandidate(prepared, callee, query.target);
    if (candidate === "clear") return runtime.known("clear", []);
    if (candidate === "unknown") return runtime.unknown("unresolved-identity");
    const identity = runtime.identity(file, source, facts, runtime.ref(candidate), query.target);
    if (identity.status === "unknown") return runtime.unknownFrom(identity);
    return runtime.known(identity.value.matches ? "report" : "clear", identity.evidence);
  },

  authoring({ expression, identity, finding, unknownReasons }) {
    return {
      api: "ctx.recipes.forbiddenCall(file, expression, query, finding)",
      purpose: "Report a call only when its callee resolves to a configured global or import identity.",
      limits: ["the recipe enforces declared directory, extension and exact-path scope", "mutable or conditional aliases to a candidate remain unknown"],
      inputSchema: {
        type: "object", required: ["file", "expression", "query", "finding"],
        properties: {
          file: { type: "string", description: "A relative path returned by ctx.files.list()." },
          expression,
          query: {
            type: "object", required: ["target"],
            properties: {
              target: identity,
              scope: {
                type: "object",
                properties: {
                  under: { type: "array", items: { type: "string" } },
                  extensions: { type: "array", items: { type: "string" } },
                  exclude: { type: "array", items: { type: "string" } },
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
      example: `for (const file of ctx.files.list([".ts", ".tsx", ".mts", ".cts"])) {
  const calls = ctx.analysis.calls(file).structure.flow.values
    .filter(value => value.kind === "call" && !value.dead);
  for (const call of calls) {
    ctx.recipes.forbiddenCall(
      file,
      { id: call.id, start: call.start, end: call.end },
      {
        target: { globals: ["process.exit"] },
        scope: {
          under: ["src"],
          extensions: [".ts", ".tsx", ".mts", ".cts"],
          exclude: ["src/doctor-loader.mts"],
        },
      },
      { rule: "direct-process-exit", message: "Return an exit code instead of terminating immediately." },
    );
  }
}`,
    };
  },

  challenges(rule, declaration) {
    const query = declaration.query;
    const targets = identityFixtures(query.target, "profileForbidden");
    const target = targets[0];
    const callee = target.callee;
    const head = target.head;
    const under = query.scope?.under?.[0]?.replace(/\/$/, "") ?? "";
    const extension = query.scope?.extensions?.[0] ?? ".ts";
    if (extension && !extension.startsWith(".")) throw new Error("forbidden-call scope extensions must include the leading dot");
    let file = (under ? under + "/" : "") + "recipe-profile" + extension;
    let index = 2;
    while (query.scope?.exclude?.includes(file)) file = (under ? under + "/" : "") + `recipe-profile-${index++}` + extension;
    const positive = `${head}${callee}(1);`;
    const parts = callee.split(".");
    const member = parts.length > 1 ? parts.pop() : undefined;
    const receiver = parts.join(".");
    const receiverVariants = member ? [`(${receiver}).${member}(1);`, `(${receiver} as any).${member}(1);`, `${receiver}!.${member}(1);`, `${receiver} /* comment */\n  .${member}(1);`] : [];
    const variants = [`${callee}(1);`, `(${callee})(1);`, `(${callee} as any)(1);`, `${callee}!(1);`, ...receiverVariants];
    const equivalentSource = head + variants.join("\n");
    const equivalentExpected = variants.map((variant) => occurrence(equivalentSource, rule, variant, 0, file));
    const shadow = `${head}${target.shadow.replace("__ARGS__", "1")}`;
    const alias = `${head}const forbiddenAlias=${callee};forbiddenAlias(1);`;
    const unrelated = `${head}console.log(0);${callee}(1);`;
    const uncertain = `${head}let maybe=${callee};if(flag)maybe=other;maybe(1);\n${callee}(2);`;
    const uncertainExpected = query.reportUnknown?.includes("unresolved-identity")
      ? [occurrence(uncertain, rule, "maybe(1)", 0, file), occurrence(uncertain, rule, `${callee}(2)`, 0, file)]
      : [occurrence(uncertain, rule, `${callee}(2)`, 0, file)];
    const same = `${head}${callee}(1);${callee}(2);`;
    const declared = targets.slice(1).map((candidate) => {
      const source = `${candidate.head}${candidate.callee}(1);`;
      return profileAt(file, `declared target identity: ${candidate.label}`, source, [occurrence(source, rule, `${candidate.callee}(1)`, 0, file)], "complete");
    });
    return [
      profileAt(file, "genuine positive", positive, [occurrence(positive, rule, `${callee}(1)`, 0, file)], "complete"),
      profileAt(file, "equivalent syntax variants", equivalentSource, equivalentExpected, "complete"),
      profileAt(file, "shadowed call identity", shadow, [], "complete"),
      profileAt(file, "immutable call alias", alias, [occurrence(alias, rule, "forbiddenAlias(1)", 0, file)], "complete"),
      profileAt(file, "unrelated call with positive neighbor", unrelated, [occurrence(unrelated, rule, `${callee}(1)`, 0, file)], "complete"),
      profileAt(file, "mutable alias with positive neighbor", uncertain, uncertainExpected, "narrowed"),
      profileAt(file, "two same-line occurrences", same, [occurrence(same, rule, `${callee}(1)`, 0, file), occurrence(same, rule, `${callee}(2)`, 0, file)], "complete"),
      ...declared,
      profileAt(file, "analysis unavailable", positive, [], "unavailable"),
    ];
  },
};
