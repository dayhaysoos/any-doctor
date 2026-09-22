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
        name: "bindings" | "calls" | "identity" | "option-presence" | "resource-lifetime" | "value-disposition" | "consumers" | "spans" | "value-path" | "structures";
    }[];
    recipes: {
        requires: string[];
        outcomes: readonly ["report", "clear", "unknown"];
        api: string;
        purpose: string;
        limits: string[];
        inputSchema: Record<string, unknown>;
        example: string;
        name: "forbidden-call" | "required-or-recommended-option" | "resource-without-release" | "unhandled-value";
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
                certificationApi: string;
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
export interface CapabilityGapCertificationOptions {
    /** Doctor program whose accepted claim the report exercises. */
    doctorPath: string;
    /** Base for fixturePath stakes. Defaults to the current working directory. */
    reportDir?: string;
    /** Test seam for a candidate CLI build. Defaults to this package's CLI. */
    cliPath?: string;
    timeoutMs?: number;
}
export interface CapabilityGapCaseResult {
    name: string;
    ok: boolean;
    errors: string[];
}
export interface CapabilityGapCertificationResult {
    valid: boolean;
    validationErrors: string[];
    passed: number;
    failed: number;
    cases: CapabilityGapCaseResult[];
}
/**
 * Execute every declared capability-gap stake through the real CLI and compare
 * findings, narrowing, scoring and run integrity. This remains separate from
 * ordinary Doctor verification: a gap report is authoring evidence, not a
 * Doctor fixture or a new runtime capability.
 */
export declare function certifyCapabilityGapReport(value: unknown, options: CapabilityGapCertificationOptions): CapabilityGapCertificationResult;
