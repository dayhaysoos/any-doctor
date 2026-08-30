export const meta = {
  id: "fetch-calls-without-abortsignal",
  description: "Fetch call does not provide an AbortSignal.",
  severity: "warning",
  blindSpots: [
    "Cannot determine whether an options variable, spread, or helper supplies a signal at runtime.",
    "Does not recognize aliased, imported, or member-expression fetch functions.",
    "Cannot verify that a statically supplied signal value is an actual AbortSignal.",
  ],
};

export async function doctor(ctx) {
  const calls = await ctx.search.pattern("fetch($$$ARGS)");
  for (const call of calls) {
    if (!hasInlineSignal(call.text)) {
      ctx.report.finding(call);
    }
  }
}

function hasInlineSignal(call) {
  const open = call.indexOf("(");
  if (open < 0) return false;

  const argumentsText = call.slice(open + 1, -1);
  const argumentsList = splitTopLevel(argumentsText);
  const options = argumentsList[1]?.trim();
  if (!options?.startsWith("{")) return false;

  const close = matchingBrace(options);
  if (close < 0) return false;

  return splitTopLevel(options.slice(1, close)).some((property) =>
    /^(?:signal|["']signal["'])\s*(?::|$)/.test(property.trim()),
  );
}

function splitTopLevel(text) {
  const parts = [];
  let start = 0;
  let depth = 0;
  let quote = null;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quote) {
      if (character === "\\") index += 1;
      else if (character === quote) quote = null;
    } else if (character === "'" || character === '"' || character === "`") {
      quote = character;
    } else if (character === "(" || character === "[" || character === "{") {
      depth += 1;
    } else if (character === ")" || character === "]" || character === "}") {
      depth -= 1;
    } else if (character === "," && depth === 0) {
      parts.push(text.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(text.slice(start));
  return parts;
}

function matchingBrace(text) {
  let depth = 0;
  let quote = null;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quote) {
      if (character === "\\") index += 1;
      else if (character === quote) quote = null;
    } else if (character === "'" || character === '"' || character === "`") {
      quote = character;
    } else if (character === "{") {
      depth += 1;
    } else if (character === "}" && --depth === 0) {
      return index;
    }
  }
  return -1;
}
