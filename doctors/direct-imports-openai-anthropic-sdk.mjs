export const meta = {
  id: "direct-imports-openai-anthropic-sdk",
  description: "Direct OpenAI or Anthropic SDK import outside lib/ai.",
  severity: "warning",
  blindSpots: [
    "Does not detect CommonJS require calls or dynamic imports.",
    "Does not detect SDK access through a local wrapper or an aliased package name.",
  ],
};

export async function doctor(ctx) {
  const imports = await Promise.all([
    ctx.search.pattern("import $$$IMPORT from $SOURCE"),
    ctx.search.pattern("import $SOURCE"),
  ]);
  const reported = new Set();

  for (const imported of imports.flat()) {
    if (isInsideAiLibrary(imported.file) || !isSdkImport(imported.text)) continue;

    const location = `${imported.file}:${imported.line}:${imported.column ?? 0}`;
    if (reported.has(location)) continue;
    reported.add(location);
    ctx.report.finding(imported);
  }
}

function isInsideAiLibrary(file) {
  return /(?:^|\/)lib\/ai(?:\/|$)/.test(file);
}

function isSdkImport(imported) {
  const source = imported.match(/(?:from\s*)?["']([^"']+)["']\s*;?$/s)?.[1];
  return /^(?:openai|@anthropic-ai\/sdk)(?:\/|$)/.test(source ?? "");
}
