import { Mode } from "./contract.js";
import { runEngine } from "./engine.js";
type Engine = typeof runEngine;
export declare function handleSearchLine(line: string, mode: Mode, engine?: Engine): string | null;
export {};
