import { parseIdentityQuery } from "../semantic-query-parsers.js";
import { identityFixtures, occurrence, profile } from "./support.js";
export const resourceWithoutReleaseRecipe = {
    name: "resource-without-release",
    method: "resourceWithoutRelease",
    kind: "recipe-resource-without-release",
    needs: ["calls", "identity", "resource-lifetime"],
    parse(value) {
        if (!value || typeof value !== "object")
            return null;
        const record = value;
        const acquisition = parseIdentityQuery(record.acquisition);
        const owner = record.owner;
        const ownerIdentity = parseIdentityQuery(owner === null || owner === void 0 ? void 0 : owner.identity);
        const release = record.release;
        return acquisition
            && ownerIdentity
            && Number.isInteger(owner === null || owner === void 0 ? void 0 : owner.argument)
            && Array.isArray(release)
            && release.every((item) => typeof item === "string")
            ? value
            : null;
    },
    evaluate(runtime, file, source, facts, expression, query) {
        var _a;
        const prepared = runtime.prepare(facts);
        const flow = facts.structure.flow;
        const { values, bindings, states } = prepared;
        const subject = runtime.expression(prepared, expression);
        if (!subject || subject.kind !== "call" || subject.callee === undefined)
            return runtime.unknown("unsupported-expression");
        const callee = values.get(subject.callee);
        if (!callee)
            return runtime.unknown("unsupported-expression");
        const candidate = runtime.identityCandidate(prepared, callee, query.acquisition);
        if (candidate === "clear")
            return runtime.known("clear", []);
        if (candidate === "unknown")
            return runtime.unknown("unresolved-identity");
        const acquisitionIdentity = runtime.identity(file, source, facts, runtime.ref(candidate), query.acquisition);
        if (acquisitionIdentity.status === "unknown")
            return runtime.unknownFrom(acquisitionIdentity);
        if (!acquisitionIdentity.value.matches)
            return runtime.known("clear", acquisitionIdentity.evidence);
        const stable = (binding) => { var _a, _b; return !((_a = states.get(binding)) === null || _a === void 0 ? void 0 : _a.reassigned) && !((_b = states.get(binding)) === null || _b === void 0 ? void 0 : _b.mutated); };
        const resolve = (id, seen = new Set()) => {
            var _a, _b, _c, _d;
            if (id === undefined)
                return null;
            const value = values.get(id);
            if (!value || seen.has(id))
                return null;
            seen = new Set(seen).add(id);
            if (value.kind === "reference" && ((_a = value.target) === null || _a === void 0 ? void 0 : _a.binding) !== null && ((_b = value.target) === null || _b === void 0 ? void 0 : _b.binding) !== undefined && stable(value.target.binding)) {
                const initializer = (_c = bindings.get(value.target.binding)) === null || _c === void 0 ? void 0 : _c.initializer;
                if (initializer !== undefined)
                    return (_d = resolve(initializer, seen)) !== null && _d !== void 0 ? _d : value;
            }
            return value;
        };
        for (const ownerCall of flow.values.filter((value) => value.kind === "call" && !value.dead && value.callee !== undefined)) {
            const ownerCallee = values.get(ownerCall.callee);
            if (!ownerCallee)
                continue;
            const ownerIdentity = runtime.identity(file, source, facts, runtime.ref(ownerCallee), query.owner.identity);
            if (ownerIdentity.status !== "known" || !ownerIdentity.value.matches)
                continue;
            const owner = resolve((_a = ownerCall.arguments) === null || _a === void 0 ? void 0 : _a[query.owner.argument]);
            if ((owner === null || owner === void 0 ? void 0 : owner.kind) !== "function")
                continue;
            const lifetime = runtime.lifetime(file, source, facts, runtime.ref(subject), { owner: runtime.ref(owner), release: query.release });
            if (lifetime.status === "unknown" && lifetime.reason === "outside-owner")
                continue;
            if (lifetime.status === "unknown")
                return runtime.unknownFrom(lifetime);
            return runtime.known(lifetime.value === "unreleased" ? "report" : "clear", [...acquisitionIdentity.evidence, ...ownerIdentity.evidence, ...lifetime.evidence]);
        }
        return runtime.known("clear", acquisitionIdentity.evidence);
    },
    authoring({ expression, identity, finding, unknownReasons }) {
        return {
            api: "ctx.recipes.resourceWithoutRelease(file, expression, query, finding)",
            purpose: "Report a supported acquisition when no matching release is established in its owner cleanup.",
            limits: ["supported owner and acquisition identities", "conditional or opaque cleanup may be unknown"],
            inputSchema: {
                type: "object", required: ["file", "expression", "query", "finding"],
                properties: {
                    file: { type: "string", description: "A relative path returned by ctx.files.list()." },
                    expression,
                    query: {
                        type: "object", required: ["acquisition", "owner", "release"],
                        properties: {
                            acquisition: identity,
                            owner: {
                                type: "object", required: ["identity", "argument"],
                                properties: { identity, argument: { type: "number" } },
                                additionalProperties: false,
                            },
                            release: { type: "array", items: { type: "string" } },
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
    ctx.recipes.resourceWithoutRelease(
      file,
      { id: call.id, start: call.start, end: call.end },
      {
        acquisition: { globals: ["setInterval", "window.setInterval"] },
        owner: {
          identity: { imports: [{ source: "react", names: ["useEffect", "*.useEffect"] }] },
          argument: 0,
        },
        release: ["clearInterval", "window.clearInterval"],
      },
      { rule: "interval-without-effect-cleanup", message: "No matching interval cleanup was established." },
    );
  }
}`,
        };
    },
    challenges(rule, declaration) {
        var _a;
        const query = declaration.query;
        const acquisitions = identityFixtures(query.acquisition, "profileAcquire");
        const owners = identityFixtures(query.owner.identity, "profileOwner");
        const acquisition = acquisitions[0];
        const ownerTarget = owners[0];
        const release = query.release[0];
        if (!release)
            throw new Error("resource recipe needs at least one release identity");
        const head = acquisition.head + ownerTarget.head;
        const acquire = acquisition.callee;
        const owner = ownerTarget.callee;
        const call = `${acquire}(()=>{},1)`;
        const positive = `${head}${owner}(()=>{${call};},[]);`;
        const lookalike = `${head}${owner}(()=>{${acquisition.shadow.replace("__ARGS__", "()=>{},1")}\n${call};},[]);`;
        const releasedAlias = `${head}${owner}(()=>{const handle=${call};const alias=handle;return()=>${release}(alias)},[]);`;
        const wrongHandle = `${head}${owner}(()=>{const handle=${call};return()=>{const other=0;${release}(other)}},[]);`;
        const helper = `${head}function transfer(handle){${release}(handle)}\n${owner}(()=>{const handle=${call};return()=>transfer(handle)},[]);`;
        const unsupported = `${head}${owner}(()=>{const handle=${call};return()=>externalTransfer(handle)},[]);\n${owner}(()=>{${call};},[]);`;
        const unsupportedExpected = ((_a = query.reportUnknown) === null || _a === void 0 ? void 0 : _a.includes("unsupported-expression"))
            ? [occurrence(unsupported, rule, call, 0), occurrence(unsupported, rule, call, 1)]
            : [occurrence(unsupported, rule, call, 1)];
        const same = `${head}${owner}(()=>{${call};${call};},[]);`;
        const declaredAcquisitions = acquisitions.slice(1).map((candidate) => {
            const candidateHead = candidate.head + ownerTarget.head;
            const candidateCall = `${candidate.callee}(()=>{},1)`;
            const source = `${candidateHead}${owner}(()=>{${candidateCall};},[]);`;
            return profile(`declared acquisition identity: ${candidate.label}`, source, [occurrence(source, rule, candidateCall)], "complete");
        });
        const declaredOwners = owners.slice(1).map((candidate) => {
            const candidateHead = acquisition.head + candidate.head;
            const source = `${candidateHead}${candidate.callee}(()=>{${call};},[]);`;
            return profile(`declared owner identity: ${candidate.label}`, source, [occurrence(source, rule, call)], "complete");
        });
        const declaredReleases = query.release.slice(1).map((candidate) => {
            const source = `${head}${owner}(()=>{const handle=${call};return()=>${candidate}(handle)},[]);`;
            return profile(`declared release identity: ${candidate}`, source, [], "complete");
        });
        return [
            profile("genuine unreleased positive", positive, [occurrence(positive, rule, call)], "complete"),
            profile("shadowed acquisition with positive neighbor", lookalike, [occurrence(lookalike, rule, call, 1)], "complete"),
            profile("immutable handle alias release", releasedAlias, [], "complete"),
            profile("different handle does not release acquisition", wrongHandle, [occurrence(wrongHandle, rule, call)], "complete"),
            profile("supported local cleanup transfer", helper, [], "complete"),
            profile("unsupported cleanup transfer with positive neighbor", unsupported, unsupportedExpected, "narrowed"),
            profile("two same-line occurrences", same, [occurrence(same, rule, call, 0), occurrence(same, rule, call, 1)], "complete"),
            ...declaredAcquisitions,
            ...declaredOwners,
            ...declaredReleases,
            profile("analysis unavailable", positive, [], "unavailable"),
        ];
    },
};
