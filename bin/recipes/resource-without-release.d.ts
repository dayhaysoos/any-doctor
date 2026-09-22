import type { IdentityQuery, UnknownReason } from "../contract.js";
import type { RecipeDefinition } from "./types.js";
export interface ResourceWithoutReleaseRecipeQuery {
    acquisition: IdentityQuery;
    owner: {
        identity: IdentityQuery;
        argument: number;
    };
    release: string[];
    reportUnknown?: UnknownReason[];
}
export declare const resourceWithoutReleaseRecipe: RecipeDefinition<"resource-without-release", "resourceWithoutRelease", ResourceWithoutReleaseRecipeQuery>;
