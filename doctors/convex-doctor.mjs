export const meta = {
  id: "convex-doctor",
  description: "Convex discipline: indexed reads, bounded subscriptions, deterministic transactions.",
  severity: "warning",
  category: "convex",
  blindSpots: [
    "Queries: the schema is never cross-referenced - a .filter() on a table the doctor cannot see indexed is still flagged only at the query site; withIndex is trusted to name a real index.",
    "Subscriptions: useQuery is flagged at the call site without resolving the referenced function, so a paginated cursor returned from a helper is not recognized.",
    "Clock: only direct Date.now()/Math.random() calls inside query/mutation/action bodies are detected; calls hidden behind wrappers or imported aliases are not.",
    "Chains split across multiple statements (const q = ctx.db.query(t); q.filter(...)) are not tracked - only single-statement chains.",
  ],
  checks: [
    {
      id: "filter-table-scan",
      description: ".filter() query without .withIndex() reads every document in the table.",
      severity: "warning",
      impact: "Convex bills and measures performance by documents read: a .filter() chain scans the whole table on every call, so a query that is fast at demo scale degrades linearly with data and can hit function limits in production.",
      why: ".filter() runs after documents are read - it cannot reduce reads. Only an index range (.withIndex with q.eq/q.gt/...) restricts how many documents the query touches.",
      fix: "Define an index covering the filtered fields in schema.ts and use .withIndex(\"by_field\", q => q.eq(\"field\", value)) instead of .filter().",
    },
    {
      id: "index-without-range",
      description: ".withIndex() with no range expression still scans the whole table through the index.",
      severity: "warning",
      impact: "The index is selected but never narrowed: every document is read via the index in full order, which costs the same as a table scan while looking optimized.",
      why: "withIndex(\"by_x\") with no second argument (or a callback that never calls q.eq/q.gt/q.lt/q.range) leaves the read range unbounded - the docs call this out as a scan in disguise.",
      fix: "Pass a range expression: .withIndex(\"by_x\", q => q.eq(\"x\", value)).",
    },
    {
      id: "unbounded-subscription",
      description: "useQuery subscribes to a whole table with no pagination.",
      severity: "warning",
      impact: "Every document re-syncs to the client on any change to the table; as the table grows, the subscription's payload and re-render cost grow without bound.",
      why: "useQuery keeps the result live. Without .paginate() on the query side or usePaginatedQuery on the client side, the subscription reads and ships the entire table.",
      fix: "Use .paginate(opts) in the query and usePaginatedQuery on the client; or bound the result with .withIndex(...).order(\"desc\").take(n) when the table is provably small.",
    },
    {
      id: "nondeterministic-clock-in-transaction",
      description: "Date.now() or Math.random() called inside a Convex transaction function.",
      severity: "warning",
      impact: "The value is snapshotted per transaction: elapsed-time math inside one mutation always sees zero, and repeated calls return the same value - timeouts, jitter, and expiry logic silently misbehave.",
      why: "Convex executes query/mutation bodies deterministically within a transaction: Date.now() is pinned to the transaction's start and Math.random() is seeded from it. Both are safe to store but wrong for measuring or branching.",
      fix: "Pass timestamps/randomness in as arguments from the client or an action (where they are genuinely live), or rely on _creationTime for ordering.",
    },
  ],
};

export async function doctor(ctx) {
  const files = await ctx.files.list([".ts", ".tsx", ".js", ".jsx", ".mjs"]);
  for (const file of files) {
    const source = await ctx.files.read(file);
    const masked = maskNonCode(source);
    const lines = masked.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.includes(".filter(") && !line.includes(".withIndex(")) continue;
      const chain = statementAt(lines, i);
      if (!chain.includes("ctx.db.query(") && !chain.includes("db.query(")) continue;

      const hasWithIndex = chain.includes(".withIndex(");
      const hasFilter = chain.includes(".filter(");
      if (hasFilter && !hasWithIndex) {
        ctx.report.finding({ rule: "filter-table-scan", file, line: i + 1 });
      } else if (hasWithIndex && !hasRangeExpression(chain)) {
        ctx.report.finding({ rule: "index-without-range", file, line: i + 1 });
      }
    }

    checkSubscriptions(ctx, file, masked);
    checkClock(ctx, file, masked);
  }
}

// --- query chain checks ----------------------------------------------------

// Gather the full statement containing line i (chains wrap across lines).
function statementAt(lines, i) {
  let start = i;
  while (start > 0 && !statementEnds(lines[start - 1])) start--;
  let end = i;
  while (end < lines.length - 1 && !statementEnds(lines[end])) end++;
  return lines.slice(start, end + 1).join("\n");
}

function statementEnds(line) {
  const bare = line.trim();
  if (bare.startsWith("//") || bare.startsWith("*") || bare.startsWith("/*")) return true;
  if (/\b(?:return|await|const|let|var|export|throw)\b.*[;)]\s*$/.test(bare) && !/[.(,+]$/.test(bare)) return true;
  return /;\s*(\/\/.*)?$/.test(bare);
}

// withIndex("by_x") or withIndex("by_x", q => q.eq(...)) - the range is the
// second argument; detect it by finding an eq/gt/gtQuiet/lt/ltQuiet/range
// call within the withIndex argument span.
function hasRangeExpression(chain) {
  const idx = chain.indexOf(".withIndex(");
  if (idx === -1) return false;
  const open = chain.indexOf("(", idx);
  const close = matchingParen(chain, open);
  if (close === -1) return false;
  const args = chain.slice(open + 1, close);
  // No second argument at all: withIndex("by_x") or withIndex("by_x")
  if (args.trim().length > 0 && !args.includes(",")) return false;
  return /\bq\s*\.\s*(eq|neq|gt|gtQuiet|lt|ltQuiet|range)\s*\(/.test(args);
}

function matchingParen(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === "(") depth++;
    if (text[i] === ")") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

// --- subscription check ----------------------------------------------------

function checkSubscriptions(ctx, file, masked) {
  const lines = masked.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (!/useQuery\s*\(/.test(lines[i])) continue;
    // A paginated sibling anywhere in the statement opts out.
    const chain = statementAt(lines, i);
    if (chain.includes("usePaginatedQuery")) continue;
    ctx.report.finding({
      rule: "unbounded-subscription",
      file,
      line: i + 1,
    });
  }
}

// --- clock/random check ----------------------------------------------------

// Track function boundaries: an export wired through query()/mutation()/
// action()/internalQuery()/internalMutation()/internalAction() starts a
// transaction body; direct Date.now()/Math.random() inside it is flagged.
const CONVEX_FNS = /\b(?:query|mutation|action|internalQuery|internalMutation|internalAction)\s*\(\s*(?:\([^)]*\)\s*=>|function\b|\{)/;

function checkClock(ctx, file, masked) {
  const lines = masked.split("\n");
  let insideConvexFn = false;
  let braceDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!insideConvexFn && CONVEX_FNS.test(line)) {
      insideConvexFn = true;
      braceDepth = countChars(line, "{") - countChars(line, "}");
      continue;
    }
    if (!insideConvexFn) continue;

    braceDepth += countChars(line, "{") - countChars(line, "}");
    if (/\b(?:Date\s*\.\s*now|Math\s*\.\s*random)\s*\(/.test(line)) {
      ctx.report.finding({
        rule: "nondeterministic-clock-in-transaction",
        file,
        line: i + 1,
      });
    }
    if (braceDepth <= 0) {
      insideConvexFn = false;
    }
  }
}

function countChars(line, ch) {
  let n = 0;
  for (const c of line) if (c === ch) n++;
  return n;
}

// --- shared masking (comments and strings blanked, code shape kept) --------

function maskNonCode(source) {
  const chars = source.split("");
  let index = 0;

  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];

    if (char === "/" && next === "/") {
      const end = source.indexOf("\n", index + 2);
      const stop = end === -1 ? source.length : end;
      for (let cursor = index; cursor < stop; cursor += 1) chars[cursor] = " ";
      index = stop;
    } else if (char === "/" && next === "*") {
      const end = source.indexOf("*/", index + 2);
      const stop = end === -1 ? source.length : end + 2;
      for (let cursor = index; cursor < stop; cursor += 1) {
        if (chars[cursor] !== "\n") chars[cursor] = " ";
      }
      index = stop;
    } else if (char === "'" || char === '"' || char === "`") {
      const quote = char;
      let cursor = index + 1;
      while (cursor < source.length) {
        if (source[cursor] === "\\") {
          cursor += 2;
        } else if (source[cursor] === quote) {
          cursor += 1;
          break;
        } else {
          cursor += 1;
        }
      }
      for (let position = index; position < cursor; position += 1) {
        if (chars[position] !== "\n") chars[position] = " ";
      }
      index = cursor;
    } else {
      index += 1;
    }
  }

  return chars.join("");
}
