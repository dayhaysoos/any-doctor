import { forbiddenCallRecipe } from "./recipes/forbidden-call.js";
import { requiredOptionRecipe } from "./recipes/required-option.js";
import { resourceWithoutReleaseRecipe } from "./recipes/resource-without-release.js";
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
};
export function recipeDefinition(name) {
    return RECIPE_DEFINITIONS[name];
}
export function recipeAnalysisNeeds(name) {
    return [...RECIPE_DEFINITIONS[name].needs];
}
export function checkAnalysisNeeds(check) {
    var _a;
    const implied = check.recipe ? recipeAnalysisNeeds(check.recipe.name) : [];
    return [...new Set([...((_a = check.needs) !== null && _a !== void 0 ? _a : []), ...implied])];
}
export function narrowedCheckIds(meta) {
    var _a;
    return ((_a = meta.checks) !== null && _a !== void 0 ? _a : []).filter((check) => checkAnalysisNeeds(check).length > 0).map((check) => check.id);
}
export function recipeAuthoringDetails(name, schemas) {
    return recipeDefinition(name).authoring(schemas);
}
export function challengeProfileFixtures(check) {
    const declaration = check.recipe;
    if (!declaration)
        return [];
    const definition = recipeDefinition(declaration.name);
    const fixtures = definition.challenges(check.id, declaration);
    if (!fixtures.length)
        throw new Error(`recipe ${declaration.name} has no applicable challenge profile for this declaration`);
    for (const fixture of fixtures) {
        if (fixture.analysis !== "off" && !["complete", "narrowed"].includes(fixture.expectedSemantic)) {
            throw new Error(`profile "${fixture.name}": semantic expectation is required for analysis-on challenges`);
        }
    }
    return fixtures;
}
