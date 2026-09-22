export function parseIdentityQuery(value) {
    if (!value || typeof value !== "object")
        return null;
    const query = value;
    if (query.globals !== undefined && (!Array.isArray(query.globals) || !query.globals.every((item) => typeof item === "string")))
        return null;
    if (query.imports !== undefined && (!Array.isArray(query.imports) || !query.imports.every((item) => item && typeof item === "object" && typeof item.source === "string" && Array.isArray(item.names) && item.names.every((name) => typeof name === "string"))))
        return null;
    return query;
}
export function parseOptionQuery(value) {
    if (!value || typeof value !== "object")
        return null;
    const record = value;
    return typeof record.option === "string" && Array.isArray(record.sources) && record.sources.every((item) => typeof item === "string")
        ? { option: record.option, sources: record.sources }
        : null;
}
