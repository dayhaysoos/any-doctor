import { Mode } from "./contract.js";
import { runEngine } from "./engine.js";
export declare function searchBase(mode: Mode): string;
export declare function withinBase(root: string, base: string): boolean;
type Engine = typeof runEngine;
export declare function handleSearchLine(line: string, mode: Mode, engine?: Engine): string | null;
export {};
