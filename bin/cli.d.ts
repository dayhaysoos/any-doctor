#!/usr/bin/env node
import { SpinnerHandle } from "./spinner.js";
export declare function runSpinner(label: string, total: number): SpinnerHandle | null;
export declare function plantSkill(scopeDir: string, skill: string): "planted" | "refreshed" | "left-user-copy";
export declare function main(argv?: string[]): Promise<number>;
