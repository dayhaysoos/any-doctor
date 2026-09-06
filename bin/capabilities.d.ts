export type CapabilityLevel = "red" | "yellow";
export interface CapabilityFinding {
    capability: string;
    level: CapabilityLevel;
    line: number;
    detail: string;
}
export interface CapabilityReport {
    findings: CapabilityFinding[];
    red: CapabilityFinding[];
    yellow: CapabilityFinding[];
}
export declare function scanCapabilities(source: string): CapabilityReport;
export declare function scanDoctorFile(programPath: string): CapabilityReport;
export declare function capabilitySummary(report: CapabilityReport): string;
