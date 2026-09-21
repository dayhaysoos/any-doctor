import { RecipeName } from "./contract.js";
export declare const AUTHORING_CATALOG_VERSION: 1;
export declare const AUTHORING_BOUNDARY = "Consumer agents use public facts and recipes; do not patch an installed Any Doctor package or build a private parser/resolver. When public facts are insufficient, narrow the affected check and produce a capability-gap report. Any Doctor maintainers may extend the shared provider only with a framework-neutral change and definite-positive, negative, uncertain, and mixed-neighbor regressions. A capability-gap report is evidence for future product work, not permission to guess or claim a clean result.";
export declare function authoringCatalog(): {
    schema: 1;
    tool: string;
    command: string;
    rule: string;
    sourceAccess: {
        api: string;
        purpose: string;
    }[];
    capabilities: {
        api: string;
        purpose: string;
        limits?: string[];
        outcomes?: string[];
        name: "bindings" | "spans" | "calls" | "identity" | "value-disposition" | "resource-lifetime" | "option-presence" | "consumers" | "structures";
    }[];
    recipes: {
        requires: string[];
        outcomes: readonly ["report", "clear", "unknown"];
        api: string;
        purpose: string;
        limits: string[];
        inputSchema: Record<string, unknown>;
        example: string;
        name: RecipeName;
    }[];
    customChecks: {
        reference: string;
        boundary: string;
        procedure: string[];
        gapReport: {
            classifications: {
                "authoring-error": string;
                "reusable-sdk-gap": string;
                "project-policy": string;
                "runtime-dynamic": string;
            };
            requiredFields: string[];
            validation: {
                api: string;
                consumedByDoctorVerify: boolean;
                stakes: readonly ["currentFailure", "definitePositive", "negativeControl", "uncertainControl"];
                stakeFields: {
                    seed: string;
                    fixturePath: string;
                    findings: string;
                    narrowing: string;
                    score: string;
                    grade: string;
                };
                constraints: string;
            };
            completion: string;
        };
    };
    reporting: {
        api: string;
        purpose: string;
    }[];
};
export type AuthoringCatalog = ReturnType<typeof authoringCatalog>;
/** Validate authoring evidence without executing seeds or claiming their assertions passed. */
export declare function validateCapabilityGapReport(value: unknown): {
    valid: boolean;
    errors: string[];
};
