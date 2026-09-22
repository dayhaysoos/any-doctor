import type { UnknownReason } from "../contract.js";
import type { RecipeDefinition } from "./types.js";
export interface UnhandledValueRecipeQuery {
    producer: {
        member: string;
        asyncArgument: number;
        receiver: "array";
    };
    consumers: string[];
    reportUnknown?: UnknownReason[];
}
export declare const unhandledValueRecipe: RecipeDefinition<"unhandled-value", "unhandledValue", UnhandledValueRecipeQuery>;
