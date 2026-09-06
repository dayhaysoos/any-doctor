import { Mode } from "./contract.js";
import { runEngineSearch } from "./engine.js";
export declare function searchBase(mode: Mode): string;
type Engine = typeof runEngineSearch;
export declare function handleSearchLine(line: string, mode: Mode, engine?: Engine): string | null;
export {};
