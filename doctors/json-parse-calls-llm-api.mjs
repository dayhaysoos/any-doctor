export const meta = {
  id: "json-parse-calls-llm-api",
  description: "JSON.parse call on an LLM API response without schema validation.",
  severity: "warning",
  blindSpots: [
    "Only recognizes response variables from statically identifiable OpenAI, Anthropic, or Gemini API and SDK calls in the same file.",
    "Does not follow aliases, reassignments, helper functions, destructuring, or values passed between files.",
    "Only recognizes schema validation when parse, safeParse, validate, or assert wraps JSON.parse directly.",
  ],
};

export async function doctor(ctx) {
  const [calls, files] = await Promise.all([
    ctx.search.pattern("JSON.parse($VALUE)"),
    ctx.files.list(),
  ]);
  const sources = new Map(
    await Promise.all(files.map(async (file) => [file, await ctx.files.read(file)])),
  );

  for (const call of calls) {
    const source = sources.get(call.file);
    if (!source || isSchemaValidated(source, call) || !isLlmResponse(call.text, source)) {
      continue;
    }
    ctx.report.finding(call);
  }
}

function isLlmResponse(call, source) {
  const value = call.slice("JSON.parse(".length, -1).trim();
  if (isLlmApiExpression(value)) return true;

  const llmResponses = responseVariables(source);
  if ([...llmResponses].some((name) => new RegExp(`\\b${escape(name)}\\b`).test(value))) {
    return true;
  }

  const bodies = bodyVariables(source, llmResponses);
  return [...bodies].some((name) => new RegExp(`\\b${escape(name)}\\b`).test(value));
}

function responseVariables(source) {
  const names = new Set();
  const assignment = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:await\s+)?([\s\S]*?);/g;

  for (const match of source.matchAll(assignment)) {
    if (isLlmApiExpression(match[2])) names.add(match[1]);
  }
  return names;
}

function bodyVariables(source, responses) {
  const names = new Set();
  const assignment = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:await\s+)?([\s\S]*?);/g;

  for (const match of source.matchAll(assignment)) {
    if ([...responses].some((name) => new RegExp(`\\b${escape(name)}\\b`).test(match[2]))) {
      names.add(match[1]);
    }
  }
  return names;
}

function isLlmApiExpression(expression) {
  return /\b(?:fetch\s*\(\s*["'][^"']*(?:api\.(?:openai|anthropic)\.com|generativelanguage\.googleapis\.com)|\w+(?:\.\w+)*\.(?:chat\.completions|responses|messages|models)\.create\s*\()/.test(expression);
}

function isSchemaValidated(source, call) {
  const offset = offsetAt(source, call.line, call.column ?? 0);
  const before = source.slice(Math.max(0, offset - 300), offset);
  return /\b(?:[A-Za-z_$][\w$]*\.)?(?:parse|safeParse|validate|assert)\s*\(\s*$/.test(before);
}

function offsetAt(source, line, column) {
  let offset = 0;
  for (let current = 1; current < line; current += 1) {
    offset = source.indexOf("\n", offset) + 1;
  }
  return offset + column;
}

function escape(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
