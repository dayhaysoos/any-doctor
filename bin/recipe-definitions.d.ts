import type { CheckMeta, DoctorMeta, ExpressionRef, RecipeDecision, RecipeFinding, SemanticResult } from "./contract.js";
import type { AnyRecipeDefinition, ChallengeFixture, RecipeAuthoringSchemas, RecipeDefinition } from "./recipes/types.js";
export declare const RECIPE_DEFINITIONS: {
    readonly "unhandled-value": RecipeDefinition<"unhandled-value", "unhandledValue", import("./contract.js").UnhandledValueRecipeQuery>;
    readonly "resource-without-release": RecipeDefinition<"resource-without-release", "resourceWithoutRelease", import("./contract.js").ResourceWithoutReleaseRecipeQuery>;
    readonly "required-or-recommended-option": RecipeDefinition<"required-or-recommended-option", "requiredOrRecommendedOption", import("./contract.js").RequiredOptionRecipeQuery>;
    readonly "forbidden-call": RecipeDefinition<"forbidden-call", "forbiddenCall", import("./contract.js").ForbiddenCallRecipeQuery>;
};
export type RegisteredRecipeName = keyof typeof RECIPE_DEFINITIONS;
export type RecipeHostKind = typeof RECIPE_DEFINITIONS[RegisteredRecipeName]["kind"];
export type RecipeQuery<N extends RegisteredRecipeName> = typeof RECIPE_DEFINITIONS[N] extends RecipeDefinition<N, string, infer Q> ? Q : never;
export type RegisteredRecipeQuery = RecipeQuery<RegisteredRecipeName>;
export type RegisteredRecipeProfileDeclaration = {
    [N in RegisteredRecipeName]: {
        name: N;
        query: RecipeQuery<N>;
    };
}[RegisteredRecipeName];
export type RegisteredRecipeMethods = {
    [N in RegisteredRecipeName as typeof RECIPE_DEFINITIONS[N]["method"]]: (file: string, expression: ExpressionRef, query: RecipeQuery<N>, finding: RecipeFinding) => SemanticResult<RecipeDecision>;
};
export declare function recipeDefinition(name: RegisteredRecipeName): AnyRecipeDefinition;
export declare function recipeAnalysisNeeds(name: RegisteredRecipeName): string[];
export declare function checkAnalysisNeeds(check: Pick<CheckMeta, "needs" | "recipe">): string[];
export declare function narrowedCheckIds(meta: Pick<DoctorMeta, "checks">): string[];
export declare function recipeAuthoringDetails(name: RegisteredRecipeName, schemas: RecipeAuthoringSchemas): import("./recipes/types.js").RecipeAuthoringDetail;
export declare function challengeProfileFixtures(check: Pick<CheckMeta, "id" | "recipe">): ChallengeFixture[];
