export const meta = {
  id: "route-handlers-touch-database-before",
  description: "Route handler touches the database before calling requireUser.",
  severity: "warning",
  blindSpots: [
    "Only recognizes conventional exported HTTP-method handlers and app/router callback handlers.",
    "Only recognizes database calls rooted at db, database, or prisma; aliases and injected database clients are not detected.",
    "Does not follow helper calls, imports, or control flow across functions.",
    "Handlers that never call requireUser are not reported by this ordering check.",
  ],
};

const routeHandler = /(?:export\s+(?:default\s+)?(?:async\s+)?function\s+(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s*\([^)]*\)\s*\{|export\s+const\s+(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>\s*\{|(?:app|router)\s*\.\s*(?:get|post|put|patch|delete|head|options)\s*\([^,]+,\s*(?:async\s*)?\([^)]*\)\s*=>\s*\{)/g;
const requireUserCall = /\brequireUser\s*\(/g;
const databaseCall = /\b(?:db|database|prisma)\s*(?:\?\.)?\s*(?:\.\s*[A-Za-z_$][\w$]*\s*(?:\?\.)?\s*)+\(/g;

function maskNonCode(source) {
  let masked = "";
  let state = "code";

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];

    if (state === "code" && char === "/" && next === "/") {
      masked += "  ";
      index += 1;
      state = "line-comment";
    } else if (state === "code" && char === "/" && next === "*") {
      masked += "  ";
      index += 1;
      state = "block-comment";
    } else if (state === "code" && (char === "'" || char === '"' || char === "`")) {
      masked += " ";
      state = char;
    } else if (state === "line-comment" && char === "\n") {
      masked += "\n";
      state = "code";
    } else if (state === "block-comment" && char === "*" && next === "/") {
      masked += "  ";
      index += 1;
      state = "code";
    } else if (state === "'" || state === '"' || state === "`") {
      if (char === "\\") {
        masked += "  ";
        index += 1;
      } else if (char === state) {
        masked += " ";
        state = "code";
      } else {
        masked += char === "\n" ? "\n" : " ";
      }
    } else {
      masked += state === "code" ? char : char === "\n" ? "\n" : " ";
    }
  }

  return masked;
}

function closingBrace(source, openingBrace) {
  let depth = 0;
  for (let index = openingBrace; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return index;
  }
  return source.length;
}

function lineAt(source, offset) {
  return source.slice(0, offset).split("\n").length;
}

export async function doctor(ctx) {
  for (const file of await ctx.files.list()) {
    const source = await ctx.files.read(file);
    const code = maskNonCode(source);
    routeHandler.lastIndex = 0;

    for (let handler; (handler = routeHandler.exec(code)); ) {
      const openingBrace = code.indexOf("{", handler.index);
      const bodyEnd = closingBrace(code, openingBrace);
      const body = code.slice(openingBrace + 1, bodyEnd);
      requireUserCall.lastIndex = 0;
      databaseCall.lastIndex = 0;
      const authentication = requireUserCall.exec(body);
      const database = databaseCall.exec(body);

      if (authentication && database && database.index < authentication.index) {
        const offset = openingBrace + 1 + database.index;
        ctx.report.finding({ file, line: lineAt(source, offset) });
      }

      routeHandler.lastIndex = bodyEnd + 1;
    }
  }
}
