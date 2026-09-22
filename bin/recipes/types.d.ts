import type { AnalysisCalls, ExpressionRef, Fixture, IdentityQuery, OptionPresence, OptionPresenceQuery, RecipeDecision, ResourceLifetime, ResourceLifetimeQuery, SemanticEvidence, SemanticResult, UnknownReason, ValueDisposition, ValueDispositionQuery } from "../contract.js";
export type FlowValue = AnalysisCalls["structure"]["flow"]["values"][number];
export interface PreparedRecipeFacts {
    values: Map<number, FlowValue>;
    byRange: Map<string, FlowValue>;
    bindings: Map<number, AnalysisCalls["structure"]["flow"]["bindings"][number]>;
    states: Map<number, AnalysisCalls["structure"]["bindings"][number]>;
    source?: string;
    digest?: string;
}
export interface RecipeEvaluationRuntime {
    prepare(facts: AnalysisCalls, source?: string): PreparedRecipeFacts;
    expression(prepared: PreparedRecipeFacts, expression: ExpressionRef): FlowValue | undefined;
    ref(value: FlowValue): ExpressionRef;
    known(value: RecipeDecision, evidence: SemanticEvidence[]): SemanticResult<RecipeDecision>;
    unknown(reason: UnknownReason, evidence?: SemanticEvidence[]): SemanticResult<RecipeDecision>;
    unknownFrom(result: SemanticResult<unknown>): SemanticResult<RecipeDecision>;
    identityCandidate(prepared: PreparedRecipeFacts, value: FlowValue, query: IdentityQuery): FlowValue | "clear" | "unknown";
    forbiddenCallCandidate(prepared: PreparedRecipeFacts, value: FlowValue, query: IdentityQuery): FlowValue | "clear" | "unknown";
    identity(file: string, source: string, facts: AnalysisCalls, expression: ExpressionRef, query: IdentityQuery): SemanticResult<{
        matches: boolean;
    }>;
    disposition(file: string, source: string, facts: AnalysisCalls, expression: ExpressionRef, query: ValueDispositionQuery): SemanticResult<ValueDisposition>;
    lifetime(file: string, source: string, facts: AnalysisCalls, expression: ExpressionRef, query: ResourceLifetimeQuery): SemanticResult<ResourceLifetime>;
    option(file: string, source: string, facts: AnalysisCalls, expression: ExpressionRef, query: OptionPresenceQuery): SemanticResult<OptionPresence>;
}
export type ChallengeFixture = Fixture & ({
    analysis: "on";
    expectedSemantic: "complete" | "narrowed";
} | {
    analysis: "off";
    expectedSemantic?: never;
});
export interface RecipeAuthoringSchemas {
    expression: Record<string, unknown>;
    identity: Record<string, unknown>;
    finding: Record<string, unknown>;
    unknownReasons: Record<string, unknown>;
}
export interface RecipeAuthoringDetail {
    api: string;
    purpose: string;
    limits: string[];
    inputSchema: Record<string, unknown>;
    example: string;
}
export interface RecipeDefinition<N extends string, M extends string, Q> {
    name: N;
    /** Public DoctorCtx.recipes method contributed by this recipe. */
    method: M;
    kind: `recipe-${string}`;
    needs: readonly string[];
    parse(value: unknown): Q | null;
    evaluate(runtime: RecipeEvaluationRuntime, file: string, source: string, facts: AnalysisCalls, expression: ExpressionRef, query: Q): SemanticResult<RecipeDecision>;
    authoring(schemas: RecipeAuthoringSchemas): RecipeAuthoringDetail;
    challenges(rule: string, declaration: {
        name: N;
        query: Q;
    }): ChallengeFixture[];
}
export type AnyRecipeDefinition = RecipeDefinition<string, string, any>;
