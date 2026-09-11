import { ReportGroup } from "./contract.js";
import { DoctorDigest, EvidenceInput, EvidenceReport } from "./identity.js";
export interface Entry {
    f: import("./contract.js").Finding;
    g: ReportGroup;
    checkKey: string;
}
export declare function entriesOf(groups: ReportGroup[]): Entry[];
export declare function evidenceInputOf(e: Entry): EvidenceInput;
export declare function identityKeyOf(e: Entry, evidence: EvidenceReport["occurrences"][number]): string;
export declare function readFileFrom(root: string): (rel: string) => string | null;
export interface ScanCapture {
    groups: ReportGroup[];
    entries: Entry[];
    analysisAvailable: boolean;
    digests: DoctorDigest[];
    evidence: EvidenceReport;
    sources: Map<string, string>;
}
export declare function captureScan(targetDir: string, groups: ReportGroup[], analysisAvailable: boolean, digests: DoctorDigest[]): ScanCapture;
export declare function invalidateChangedFiles(capture: ScanCapture, targetDir: string): void;
