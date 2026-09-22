import type { CheckMeta, DoctorMeta, ExpressionRef, RecipeDecision, RecipeFinding, SemanticResult } from "./contract.js";
import { forbiddenCallRecipe } from "./recipes/forbidden-call.js";
import { requiredOptionRecipe } from "./recipes/required-option.js";
import { resourceWithoutReleaseRecipe } from "./recipes/resource-without-release.js";
import type { AnyRecipeDefinition, ChallengeFixture, RecipeAuthoringSchemas, RecipeDefinition } from "./recipes/types.js";
import { unhandledValueRecipe } from "./recipes/unhandled-value.js";

// The locally complete recipe registry. A recipe module owns its host kind and
// needs, query parser, semantic composition, authoring contract and maintained
// adversarial challenges. Consumers select a definition; they do not recreate
// recipe-specific switches or parallel metadata maps.
export const RECIPE_DEFINITIONS = {
  "unhandled-value": unhandledValueRecipe,
  "resource-without-release": resourceWithoutReleaseRecipe,
  "required-or-recommended-option": requiredOptionRecipe,
  "forbidden-call": forbiddenCallRecipe,
} as const;

export type RegisteredRecipeName = keyof typeof RECIPE_DEFINITIONS;
export type RecipeHostKind = typeof RECIPE_DEFINITIONS[RegisteredRecipeName]["kind"];
export type RecipeQuery<N extends RegisteredRecipeName> =
  typeof RECIPE_DEFINITIONS[N] extends RecipeDefinition<N, string, infer Q> ? Q : never;
export type RegisteredRecipeQuery = RecipeQuery<RegisteredRecipeName>;
export type RegisteredRecipeProfileDeclaration = {
  [N in RegisteredRecipeName]: { name: N; query: RecipeQuery<N> }
}[RegisteredRecipeName];
export type RegisteredRecipeMethods = {
  [N in RegisteredRecipeName as typeof RECIPE_DEFINITIONS[N]["method"]]: (
    file: string,
    expression: ExpressionRef,
    query: RecipeQuery<N>,
    finding: RecipeFinding,
  ) => SemanticResult<RecipeDecision>
};

export function recipeDefinition(name: RegisteredRecipeName): AnyRecipeDefinition {
  return RECIPE_DEFINITIONS[name] as AnyRecipeDefinition;
}

export function recipeAnalysisNeeds(name: RegisteredRecipeName): string[] {
  return [...RECIPE_DEFINITIONS[name].needs];
}

export function checkAnalysisNeeds(check: Pick<CheckMeta, "needs" | "recipe">): string[] {
  const implied = check.recipe ? recipeAnalysisNeeds(check.recipe.name) : [];
  return [...new Set([...(check.needs ?? []), ...implied])];
}

export function narrowedCheckIds(meta: Pick<DoctorMeta, "checks">): string[] {
  return (meta.checks ?? []).filter((check) => checkAnalysisNeeds(check).length > 0).map((check) => check.id);
}

export function recipeAuthoringDetails(name: RegisteredRecipeName, schemas: RecipeAuthoringSchemas) {
  return recipeDefinition(name).authoring(schemas);
}

export function challengeProfileFixtures(check: Pick<CheckMeta, "id" | "recipe">): ChallengeFixture[] {
  const declaration = check.recipe;
  if (!declaration) return [];
  const definition = recipeDefinition(declaration.name);
  const fixtures = definition.challenges(check.id, declaration as never);
  if (!fixtures.length) throw new Error(`recipe ${declaration.name} has no applicable challenge profile for this declaration`);
  for (const fixture of fixtures) {
    if (fixture.analysis !== "off" && !["complete", "narrowed"].includes(fixture.expectedSemantic)) {
      throw new Error(`profile "${fixture.name}": semantic expectation is required for analysis-on challenges`);
    }
  }
  return fixtures;
}
