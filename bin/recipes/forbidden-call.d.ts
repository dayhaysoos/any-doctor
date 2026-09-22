import type { IdentityQuery, UnknownReason } from "../contract.js";
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
export declare const forbiddenCallRecipe: RecipeDefinition<"forbidden-call", "forbiddenCall", ForbiddenCallRecipeQuery>;
