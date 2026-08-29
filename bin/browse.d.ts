import { Finding, Severity } from "./contract";
export interface BrowseInput {
    root: string;
    description: string;
    severity: Severity;
    findings: Finding[];
}
export declare function browseFindings(input: BrowseInput, useColor: boolean): Promise<void>;
