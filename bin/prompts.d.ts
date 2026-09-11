import { DoctorGroup, DoctorSummary, SiteFinding } from "./doctor-tree.js";
export declare function fixPrompt(item: SiteFinding, verifyCommand: string, decideCommand?: string): string;
export declare function checkFixPrompt(items: SiteFinding[], verifyCommand: string): string;
export declare function doctorFixPrompt(doc: DoctorSummary, group: DoctorGroup | undefined, verifyCommand: string): string;
