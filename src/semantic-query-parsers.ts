import type { IdentityQuery, OptionPresenceQuery } from "./contract.js";

export function parseIdentityQuery(value: unknown): IdentityQuery | null {
  if (!value || typeof value !== "object") return null;
  const query = value as Record<string, unknown>;
  if (query.globals !== undefined && (!Array.isArray(query.globals) || !query.globals.every((item) => typeof item === "string"))) return null;
  if (query.imports !== undefined && (!Array.isArray(query.imports) || !query.imports.every((item) => item && typeof item === "object" && typeof item.source === "string" && Array.isArray(item.names) && item.names.every((name: unknown) => typeof name === "string")))) return null;
  return query as unknown as IdentityQuery;
}

export function parseOptionQuery(value: unknown): OptionPresenceQuery | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  return typeof record.option === "string" && Array.isArray(record.sources) && record.sources.every((item) => typeof item === "string")
    ? { option: record.option, sources: record.sources }
    : null;
}
