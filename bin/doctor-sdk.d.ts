import type { AnalysisCalls, ExpressionRef, IdentityQuery, IdentityValue, SemanticResult, ValueDisposition, ValueDispositionQuery, ResourceLifetime, ResourceLifetimeQuery, OptionPresence, OptionPresenceQuery, ValuePathQuery, ValuePathValue, ForbiddenCallRecipeQuery, RecipeDecision, RequiredOptionRecipeQuery, ResourceWithoutReleaseRecipeQuery, UnhandledValueRecipeQuery } from "./contract.js";
import type { RecipeEvaluationRuntime } from "./recipes/types.js";
/** Resolve one static property path at one source observation. This is a
 * deliberately small query: it exposes the answer and terminal expression,
 * while alias, spread, mutation and escape mechanics remain host-owned. */
export declare function valueAtPathResult(file: string, source: string, facts: AnalysisCalls, expression: ExpressionRef, query: ValuePathQuery): SemanticResult<ValuePathValue>;
/** Host-owned lexical identity. The doctor supplies accepted technology names;
 * parsing, alias resolution, shadowing and evidence stay behind this seam. */
export declare function identityResult(file: string, source: string, facts: AnalysisCalls, expression: ExpressionRef, query: IdentityQuery): SemanticResult<IdentityValue>;
/** Host-owned bounded value disposition. It follows exact expression identity,
 * immutable aliases and the already-supported local relationships; unsupported
 * transfers stay unknown instead of becoming discarded. */
export declare function valueDispositionResult(file: string, source: string, facts: AnalysisCalls, expression: ExpressionRef, query: ValueDispositionQuery): SemanticResult<ValueDisposition>;
/** Host-owned resource matching through returned cleanup functions and directly
 * called local helpers/factories. It proves release only for the exact handle. */
export declare function resourceLifetimeResult(file: string, source: string, facts: AnalysisCalls, acquisition: ExpressionRef, query: ResourceLifetimeQuery): SemanticResult<ResourceLifetime>;
/** Host-owned structured option lookup. Ordered own properties and supported
 * spreads override inherited values. `undefined` is an ignored WebIDL member,
 * while `null` establishes absence for nullable request options such as signal. */
export declare function optionPresenceResult(file: string, source: string, facts: AnalysisCalls, expression: ExpressionRef, query: OptionPresenceQuery): SemanticResult<OptionPresence>;
/** Recipe: resolve a configured producer and report only when its exact value is
 * established as discarded. Array identity is owned here, not by consumers. */
export declare function unhandledValueRecipeResult(file: string, source: string, facts: AnalysisCalls, expression: ExpressionRef, query: UnhandledValueRecipeQuery): SemanticResult<RecipeDecision>;
/** Candidate-aware call identity for custom checks. Reuse the recipe's
 * membership rules without emitting a policy finding or private name filters. */
export declare function callIdentityResult(file: string, source: string, facts: AnalysisCalls, expression: ExpressionRef, query: IdentityQuery): SemanticResult<{
    matches: boolean;
}>;
/** Recipe: report a call only when its callee resolves to the configured
 * global or import identity. Transparent JavaScript and TypeScript wrappers
 * are normalized by the shared call model before this recipe sees them. */
export declare function forbiddenCallRecipeResult(file: string, source: string, facts: AnalysisCalls, expression: ExpressionRef, query: ForbiddenCallRecipeQuery): SemanticResult<RecipeDecision>;
/** Recipe: combine configured call identity with structured option presence. */
export declare function requiredOptionRecipeResult(file: string, source: string, facts: AnalysisCalls, expression: ExpressionRef, query: RequiredOptionRecipeQuery): SemanticResult<RecipeDecision>;
/** Recipe: find a configured owner, validate acquisition identity and classify
 * the exact handle in that owner's returned cleanup. */
export declare function resourceWithoutReleaseRecipeResult(file: string, source: string, facts: AnalysisCalls, expression: ExpressionRef, query: ResourceWithoutReleaseRecipeQuery): SemanticResult<RecipeDecision>;
/** Internal adapter used by locally complete recipe modules. It exposes the
 * shared semantic mechanics recipes compose without making those mechanics a
 * second public Doctor interface. */
export declare const recipeEvaluationRuntime: RecipeEvaluationRuntime;
