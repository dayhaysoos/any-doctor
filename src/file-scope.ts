import * as fs from "node:fs";
import * as path from "node:path";
import { DEFAULT_EXTS, isTestPath, withinDir } from "./contract.js";

export type FileRole = "authored" | "test" | "generated";
export interface FileInventory {
  files: { file: string; role: FileRole }[];
  exclusions: string[];
}
export interface AnalysisConfig {
  exclude: string[];
  generated: string[];
  entryPoints: string[];
}

export function matchesPath(file: string, pattern: string): boolean {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*\//g, "\u0000")
    .replace(/\*\*/g, "\u0001")
    .replace(/\*/g, "[^/]*")
    .replace(/\?/g, "[^/]")
    .replace(/\u0000/g, "(?:.*/)?")
    .replace(/\u0001/g, ".*");
  return new RegExp(`^(?:${escaped})(?:/.*)?$`).test(file);
}
export function readAnalysisConfig(root: string): AnalysisConfig {
  const file = path.join(root, "any-doctor.analysis.json");
  const empty = { exclude: [], generated: [], entryPoints: [] };
  if (!fs.existsSync(file)) return empty;
  if (!withinDir(fs.realpathSync(file), fs.realpathSync(root)))
    throw new Error("analysis configuration escapes root");
  const value = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("invalid any-doctor.analysis.json");
  for (const [key, items] of Object.entries(value)) {
    if (
      !Object.hasOwn(empty, key) ||
      !Array.isArray(items) ||
      !items.every(
        (x) =>
          typeof x === "string" &&
          !path.isAbsolute(x) &&
          !x.split("/").includes(".."),
      )
    ) {
      throw new Error(`invalid analysis configuration field: ${key}`);
    }
  }
  return { ...empty, ...value };
}
export function fileRole(file: string, config: AnalysisConfig): FileRole {
  if (
    /(^|\/)(dist|build|__generated__|_generated|generated)\/|\.(gen|generated)\.[cm]?[jt]sx?$|\.d\.[cm]?ts$/.test(
      file,
    ) ||
    config.generated.some((p) => matchesPath(file, p))
  )
    return "generated";
  return isTestPath(file) ? "test" : "authored";
}
export function inventory(
  root: string,
  exts: string[] = DEFAULT_EXTS,
  config = readAnalysisConfig(root),
): FileInventory {
  const files: FileInventory["files"] = [];
  const exclusions = new Set<string>([
    "node_modules/**",
    ".*/**",
    ...config.exclude,
  ]);
  const extensions = new Set(
    exts.map((e) => (e.startsWith(".") ? e : "." + e)),
  );
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name),
        rel = path.relative(root, abs).split(path.sep).join("/");
      if (
        entry.name === "node_modules" ||
        entry.name.startsWith(".") ||
        config.exclude.some((p) => matchesPath(rel, p))
      )
        continue;
      if (entry.isSymbolicLink()) {
        exclusions.add(rel + " (symlink)");
        continue;
      }
      if (entry.isDirectory()) walk(abs);
      else if (entry.isFile() && extensions.has(path.extname(rel)))
        files.push({ file: rel, role: fileRole(rel, config) });
    }
  };
  walk(root);
  return {
    files: files.sort((a, b) => a.file.localeCompare(b.file)),
    exclusions: [...exclusions],
  };
}
