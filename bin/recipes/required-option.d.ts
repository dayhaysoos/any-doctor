import type { IdentityQuery, OptionPresenceQuery, UnknownReason } from "../contract.js";
import type { RecipeDefinition } from "./types.js";
export interface RequiredOptionRecipeQuery {
    call: IdentityQuery;
    option: OptionPresenceQuery;
    reportUnknown?: UnknownReason[];
}
export declare const requiredOptionRecipe: RecipeDefinition<"required-or-recommended-option", "requiredOrRecommendedOption", RequiredOptionRecipeQuery>;
