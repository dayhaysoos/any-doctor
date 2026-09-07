export const meta = {
  id: "convex-doctor",
  description: "Convex discipline: indexed reads, bounded collects, bounded subscriptions, deterministic transactions, validated args, awaited writes, honest runtime boundaries.",
  severity: "warning",
  category: "convex",
  blindSpots: [
    "Queries: the schema is never cross-referenced - a .filter() on a table the doctor cannot see indexed is still flagged only at the query site; withIndex is trusted to name a real index.",
    "Subscriptions: useQuery is flagged at the call site without resolving the referenced function, so a paginated cursor returned from a helper is not recognized.",
    "Clock: only direct Date.now()/Math.random() calls participating in arithmetic or a comparison are findings - stored values are safe and unflagged; calls behind wrappers are not seen, and elapsed time measured entirely through stored values (const t2 = Date.now(); ... t2 - t1) is invisible.",
    "Chains split across multiple statements (const q = ctx.db.query(t); q.filter(...)) are not tracked - only single-statement chains.",
    "index-without-range exempts chains ending in .take()/.first()/.unique() (the terminator bounds the read); an unnarrowed index consumed by .collect() on a split statement is not seen.",
    "unbounded-collect cannot tell a provably small table from a growing one: collect on a known-small table without an index is still flagged.",
    "index-filter-combo fires on every withIndex+filter chain; whether the filtered remainder is large enough to matter is a judgement the doctor cannot make.",
    "presence-patch recognizes the canonical field names (lastSeen, heartbeat, pingAt, ...); frequently-patched documents under other names are not seen, and write frequency itself is invisible.",
    "Validators: only the object-config form is inspected (the span between the opening brace and the handler keyword); customQuery/customMutation wrappers and config objects assembled by helpers are not recognized.",
    "Server runs: only a literal api. reference directly after ctx.run* is caught - an aliased import of the public function tree is not.",
    "Function bodies are located by brace counting from the definition line; work delegated to helpers outside that span is invisible to the context checks.",
    'Node runtime: "use node" is recognized only as the file\'s first statement.',
    "Loops: only for/while bodies are scanned; recursion and per-item callbacks (.map(async ...)) hide the same one-transaction-per-item pattern.",
    "Spread patches: every spread inside .patch()/.replace() is flagged, including deliberate {...allowed} whitelists.",
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
      impact: "The index is selected but never narrowed: every document is read via the index in full order, which costs the same as a table scan while looking optimized. Chains ending in .take()/.first()/.unique() are exempt - the terminator bounds the read.",
      why: "withIndex(\"by_x\") with no second argument (or a callback that never calls q.eq/q.gt/q.lt/q.range) leaves the read range unbounded - the docs call this out as a scan in disguise. A terminator (take/first/unique) stops the scan early, so only unbounded consumers are findings.",
      fix: "Pass a range expression: .withIndex(\"by_x\", q => q.eq(\"x\", value)) - or bound the chain with .take(n) when recent-items ordering is the intent.",
    },
    {
      id: "unbounded-subscription",
      description: "useQuery subscribes to a whole table with no pagination.",
      severity: "info",
      impact: "Every document re-syncs to the client on any change to the table; as the table grows, the subscription's payload and re-render cost grow without bound.",
      why: "useQuery keeps the result live. Without .paginate() on the query side or usePaginatedQuery on the client side, the subscription reads and ships the entire table. Info severity: the referenced query may be bounded in ways the call site cannot show.",
      fix: "Use .paginate(opts) in the query and usePaginatedQuery on the client; or bound the result with .withIndex(...).order(\"desc\").take(n) when the table is provably small.",
    },
    {
      id: "nondeterministic-clock-in-transaction",
      description: "Date.now() or Math.random() used for measuring or branching inside a Convex transaction function.",
      severity: "warning",
      impact: "The value is snapshotted per transaction: elapsed-time math inside one mutation always sees zero, and repeated calls return the same value - timeouts, jitter, and expiry logic silently misbehave.",
      why: "Convex executes query/mutation bodies deterministically within a transaction: Date.now() is pinned to the transaction's start and Math.random() is seeded from it. Both are safe to store but wrong for measuring or branching - so only arithmetic and comparisons are findings; stored values are not.",
      fix: "Pass timestamps/randomness in as arguments from the client or an action (where they are genuinely live), or rely on _creationTime for ordering.",
    },
    {
      id: "unbounded-collect",
      description: ".collect() on a query chain with no take, no paginate, and no index range bounding it.",
      severity: "warning",
      impact: "Unbounded reads grow with the table and eventually hit Convex's per-transaction document read limit - the query works at demo scale and fails in production.",
      why: "Convex has no query planner: reads follow the chain exactly as written. The scaling guide is explicit that every .collect() must be provably small or index-narrowed (stack.convex.dev/queries-that-scale).",
      fix: 'Bound the chain - .take(50) for recent-items UIs, .paginate(args.paginationOpts) for incremental loading - or narrow it with .withIndex("by_field", q => q.eq(...)).',
    },
    {
      id: "index-filter-combo",
      description: ".withIndex() narrowed, then .filter() on the same chain - a multi-field index candidate.",
      severity: "warning",
      impact: "The index range still reads every document the filter then discards; when the discarded slice is large, the query pays for it on every call.",
      why: "When one index field plus a filter still reads too much, Convex's guidance is to promote to a multi-field index so both conditions become range bounds instead of post-read filters.",
      fix: '.index("by_teamId_status", ["teamId", "status"]) and query it with both .eq() bounds instead of filtering.',
    },
    {
      id: "presence-patch-on-shared-document",
      description: "A presence field (lastSeen/heartbeat-shaped) patched onto a document.",
      severity: "warning",
      impact: "Convex re-runs every subscribed query that read the document. A 10-second heartbeat on a widely-read user document invalidates those queries continuously - including queries that never touch the field.",
      why: "Frequently-updated fields on widely-referenced documents cause fan-out invalidation; the scaling guide's fix is document segmentation, not smarter queries.",
      fix: 'Split presence into its own table (heartbeats) and patch that; patch the parent document only on meaningful transitions (online to offline).',
    },
    {
      id: "missing-args-validator",
      description: "A query/mutation/action defined without argument validators.",
      severity: "warning",
      impact: "Args arrive unvalidated and untyped: any payload the client sends is accepted at runtime, and the handler's args parameter is any instead of the inferred literal type - typos surface later as undefined fields instead of immediately as validation errors.",
      why: "Validators are the contract: Convex checks every call against args at runtime and generates the handler's TypeScript types from the same definition. A function without args gets neither the check nor the types.",
      fix: "Declare the shape: export const create = mutation({ args: { body: v.string() }, handler: ... }) - an explicit args: {} for no-arg functions keeps the contract visible.",
    },
    {
      id: "public-api-in-server-call",
      description: "A server-side ctx.runQuery/runMutation/runAction references its target through the public api namespace.",
      severity: "warning",
      impact: "Everything reachable through api is callable by any client that can reach the deployment. A server-only workflow invoked via api is an exposed surface that clients can call directly, with any arguments the validators accept.",
      why: "internal.* is the server-to-server namespace: the same functions, unreachable from clients. A run* call that names api.* is either exposing a function by mistake or announcing it should be internal.",
      fix: "Define the target as internalQuery/internalMutation/internalAction and reference it as internal.module.function in the run* call.",
    },
    {
      id: "write-in-query",
      description: "A write or scheduler/run call inside a query.",
      severity: "warning",
      impact: "Queries are read-only transactions - the write methods do not exist on a query's context, so the function fails on its first real call rather than at deploy time.",
      why: "A query body runs inside a deterministic read transaction: its context carries db reads, auth and storage, nothing else. Writes and scheduling belong in a mutation.",
      fix: "Move the write into a mutation the client or an action invokes; if the read and the write must be atomic, the whole operation is a mutation that reads first.",
    },
    {
      id: "db-in-action",
      description: "ctx.db used inside an action.",
      severity: "warning",
      impact: "Actions have no db on their context - the call throws at runtime, usually on the first request that reaches that path.",
      why: "Actions run outside the transaction: their context offers runQuery/runMutation/runAction, scheduler, storage and auth. Database access goes through a function the action invokes.",
      fix: "Replace ctx.db.<x> with await ctx.runQuery(...) for reads or await ctx.runMutation(...) for writes.",
    },
    {
      id: "unawaited-convex-call",
      description: "A promise-returning ctx call used as a bare statement - never awaited.",
      severity: "warning",
      impact: "The function can return before the write settles: the write may not land, and its ordering against later reads is undefined - the bug presents as intermittently missing data.",
      why: "Every ctx method (db, scheduler, run*) is async. Inside a transaction the await is what folds the step into the transaction; a floating promise races the function's return against the write.",
      fix: "await the call (or return it). If the value is genuinely unneeded, await it anyway inside the transaction, or move the work to an action.",
    },
    {
      id: "node-runtime-transaction",
      description: 'A query or mutation defined in a "use node" file.',
      severity: "warning",
      impact: "Deploy fails: queries and mutations must run in Convex's deterministic runtime, which is what makes their transaction guarantees replayable.",
      why: '"use node" opts the file into the Node runtime, which only actions can use. Queries and mutations must be deterministic so re-execution produces identical results.',
      fix: "Split the file: keep the query/mutation in the default runtime and move the Node-dependent work into an action it schedules.",
    },
    {
      id: "sequential-run-in-loop",
      description: "ctx.runQuery/runMutation/runAction awaited inside a for/while loop.",
      severity: "warning",
      impact: "N iterations become N separate transactions, each with its own round trip and commit - a 1000-item backfill is 1000 sequential transactions, and the caller's timeout budget pays for all of them.",
      why: "Each run* call is a complete transaction of its own. A loop of awaited runs is the slowest possible batch; the batching guidance is to do the work inside one mutation instead.",
      fix: "Pass the ids to a mutation that loops internally over ctx.db writes - one transaction - or chunk the loop into bounded batches of run* calls.",
    },
    {
      id: "spread-into-patch",
      description: "ctx.db.patch/replace called with a spread (...args) of a client-controlled object.",
      severity: "warning",
      impact: "Every field the client included gets written: the validators constrain the mutation's args, but the spread forwards them all, so fields the mutation never named (ownership, role, timestamps) become client-writable.",
      why: "patch merges whatever object it is given. Spreading args into it delegates field selection to the caller - the opposite of what a validated mutation is for.",
      fix: "Name the fields: ctx.db.patch(args.id, { title: args.title }) - build the patch object server-side from explicitly validated values.",
    },
  ],
};

export async function doctor(ctx) {
  const files = await ctx.files.list([".ts", ".tsx", ".js", ".jsx", ".mjs"]);
  for (const file of files) {
    const source = await ctx.files.read(file);
    const masked = maskNonCode(source);
    const lines = masked.split("\n");
    const rawLines = source.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.includes(".patch(") || line.includes(".replace(")) {
        const stmt = statementAt(lines, i);
        checkPresencePatch(ctx, file, i, stmt);
        checkSpreadPatch(ctx, file, i, stmt);
      }
      if (!line.includes(".filter(") && !line.includes(".withIndex(") && !line.includes(".collect(")) continue;
      const chain = statementAt(lines, i);
      if (!chain.includes("ctx.db.query(") && !chain.includes("db.query(")) continue;

      const hasWithIndex = chain.includes(".withIndex(");
      const hasFilter = chain.includes(".filter(");
      if (hasFilter && hasWithIndex) {
        // The diagnosis belongs to the filter step: report when the visited
        // line is the .filter( line, not the chain's withIndex line.
        if (line.includes(".filter(")) {
          ctx.report.finding({ rule: "index-filter-combo", file, line: i + 1 });
        }
      } else if (hasFilter && !hasWithIndex) {
        ctx.report.finding({ rule: "filter-table-scan", file, line: i + 1 });
      } else if (hasWithIndex && !hasRangeExpression(chain) && !isBoundedRead(chain)) {
        ctx.report.finding({ rule: "index-without-range", file, line: i + 1 });
      }
      if (chain.includes(".collect(")
        && !chain.includes(".take(")
        && !chain.includes(".paginate(")
        && !(hasWithIndex && hasRangeExpression(chain))) {
        ctx.report.finding({ rule: "unbounded-collect", file, line: i + 1 });
      }
    }

    checkSubscriptions(ctx, file, masked);

    const spans = functionSpans(lines);
    checkClock(ctx, file, lines, spans);
    checkValidators(ctx, file, lines, spans);
    checkContextMisuse(ctx, file, lines, spans);
    checkServerRuns(ctx, file, lines);
    checkUnawaited(ctx, file, lines);
    checkSequentialRuns(ctx, file, lines);
    checkNodeRuntime(ctx, file, rawLines, lines);
  }
}

// --- query chain checks ----------------------------------------------------

// Gather the full statement containing line i (chains wrap across lines).
// Whitespace is squashed so multi-line chains match contiguous shapes
// ("ctx.db.query(" split over two lines still reads as one chain).
function statementAt(lines, i) {
  let start = i;
  while (start > 0 && !statementEnds(lines[start - 1])) start--;
  let end = i;
  while (end < lines.length - 1 && !statementEnds(lines[end])) end++;
  return lines.slice(start, end + 1).join(" ").replace(/\s+/g, "");
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

// take/first/unique stop the scan: an un-narrowed index read bounded by a
// terminator costs at most the terminator's count, not the table.
function isBoundedRead(chain) {
  return chain.includes(".take(") || chain.includes(".first(") || chain.includes(".unique(");
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

// --- presence patch check --------------------------------------------------

// The heartbeat shape: a presence field patched onto a document that other
// queries read, invalidating them on every tick. Only the canonical field
// names are recognizable — frequency and read fan-out are invisible.
const PRESENCE_FIELDS = /\b(?:lastSeen|lastPing|lastActive|lastHeartbeat|heartbeat|pingAt|lastOnline)\s*:/;

function checkPresencePatch(ctx, file, lineIndex, chain) {
  if (PRESENCE_FIELDS.test(chain)) {
    ctx.report.finding({ rule: "presence-patch-on-shared-document", file, line: lineIndex + 1 });
  }
}

// --- spread patch check ----------------------------------------------------

// A spread inside .patch()/.replace() forwards fields the mutation never
// named; whatever the caller included is merged into the document.
const SPREAD_PATCH = /\.(?:patch|replace)\s*\([^)]*\.\.\./;

function checkSpreadPatch(ctx, file, lineIndex, stmt) {
  if (SPREAD_PATCH.test(stmt)) {
    ctx.report.finding({ rule: "spread-into-patch", file, line: lineIndex + 1 });
  }
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

// --- function spans ----------------------------------------------------------

// A Convex function definition opens at query(/mutation(/action(/internal*
// variants followed by a config object, arrow or function body. The span
// covers the definition line through the line where brace depth closes;
// a one-line definition closes on its own line. Nested helper braces are
// counted, so spans are only as trustworthy as brace balance.
const CONVEX_FN_DEF = /\b(internalQuery|internalMutation|internalAction|query|mutation|action)\s*\(\s*(?:\([^)]*\)\s*=>|function\b|\{)/;

function functionSpans(lines) {
  const spans = [];
  let cur = null;
  let depth = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!cur) {
      const m = CONVEX_FN_DEF.exec(line);
      if (!m) continue;
      cur = { kind: m[1].replace("internal", "").toLowerCase(), start: i, end: i };
      depth = countChars(line, "{") - countChars(line, "}");
      if (depth <= 0) {
        spans.push(cur);
        cur = null;
      }
      continue;
    }
    depth += countChars(line, "{") - countChars(line, "}");
    cur.end = i;
    if (depth <= 0) {
      spans.push(cur);
      cur = null;
    }
  }
  if (cur) spans.push(cur);
  return spans;
}

// --- clock/random check ------------------------------------------------------

// Stored clock values are safe (the why says so): only calls that measure
// (arithmetic on the result) or branch (compare it) misbehave under the
// pinned transaction clock. The operator immediately before or after the
// call decides.
const CLOCK_CALL = /\b(?:Date\s*\.\s*now|Math\s*\.\s*random)\s*\(\s*\)/;

function clockIsMeasuringOrBranching(line) {
  const m = CLOCK_CALL.exec(line);
  if (!m) return false;
  const before = line.slice(0, m.index).trimEnd();
  const after = line.slice(m.index + m[0].length).trimStart();
  return /^[-+*/%]/.test(after)
    || /^(?:===|!==|==|!=|>=|<=|>|<)/.test(after)
    || /[-+*/%]$/.test(before)
    || /(?:===|!==|==|!=|>=|<=|>|<)$/.test(before);
}

function checkClock(ctx, file, lines, spans) {
  for (const span of spans) {
    for (let i = span.start + 1; i <= span.end; i++) {
      if (clockIsMeasuringOrBranching(lines[i])) {
        ctx.report.finding({
          rule: "nondeterministic-clock-in-transaction",
          file,
          line: i + 1,
        });
      }
    }
  }
}

// --- args validator check ------------------------------------------------------

// The validator contract lives in the config object before the handler
// keyword: query({ args: {...}, handler }). The direct-function form
// (query(async ctx => ...)) has no config at all and is flagged as-is.
function checkValidators(ctx, file, lines, spans) {
  for (const span of spans) {
    const text = squash(lines.slice(span.start, span.end + 1).join(" "));
    const at = text.search(/\b(?:internalQuery|internalMutation|internalAction|query|mutation|action)\s*\(/);
    if (at === -1) continue;
    const open = text.indexOf("(", at);
    const rest = text.slice(open + 1);
    if (!rest.startsWith("{")) {
      ctx.report.finding({ rule: "missing-args-validator", file, line: span.start + 1 });
      continue;
    }
    const close = matchingBrace(rest, 0);
    const config = close === -1 ? rest : rest.slice(0, close + 1);
    const handlerAt = config.indexOf("handler");
    const head = handlerAt === -1 ? config : config.slice(0, handlerAt);
    if (!/\bargs\s*:/.test(head)) {
      ctx.report.finding({ rule: "missing-args-validator", file, line: span.start + 1 });
    }
  }
}

function matchingBrace(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === "{") depth++;
    if (text[i] === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

// --- context misuse checks -----------------------------------------------------

// What each function kind's context actually offers:
//   query:    db (reads), auth, storage - no writes, no scheduler, no run*
//   mutation: db (reads+writes), auth, storage, scheduler
//   action:   run*, scheduler, storage, auth - no db
const CTX_DB_WRITE = /\bctx\s*\.\s*db\s*\.\s*(?:insert|patch|replace|delete)\s*\(/;
const CTX_DB_ANY = /\bctx\s*\.\s*db\s*\./;
const CTX_SCHEDULER = /\bctx\s*\.\s*scheduler\s*\./;
const CTX_RUN = /\bctx\s*\.\s*run(?:Query|Mutation|Action)\s*\(/;

function checkContextMisuse(ctx, file, lines, spans) {
  for (const span of spans) {
    for (let i = span.start + 1; i <= span.end; i++) {
      const line = lines[i];
      if (span.kind === "query") {
        if (CTX_DB_WRITE.test(line) || CTX_SCHEDULER.test(line) || CTX_RUN.test(line)) {
          ctx.report.finding({ rule: "write-in-query", file, line: i + 1 });
        }
      } else if (span.kind === "action" && CTX_DB_ANY.test(line)) {
        ctx.report.finding({ rule: "db-in-action", file, line: i + 1 });
      }
    }
  }
}

// --- server run namespace check --------------------------------------------------

// ctx.run*(api.module.fn) reaches through the client-visible tree; internal.
// is the server-only namespace for server-to-server calls.
const PUBLIC_RUN = /\bctx\s*\.\s*run(?:Query|Mutation|Action)\s*\(\s*api\s*\./;

function checkServerRuns(ctx, file, lines) {
  for (let i = 0; i < lines.length; i++) {
    if (PUBLIC_RUN.test(lines[i])) {
      ctx.report.finding({ rule: "public-api-in-server-call", file, line: i + 1 });
    }
  }
}

// --- unawaited ctx call ----------------------------------------------------------

// Only lines that BEGIN with the bare call are flagged: anything awaited,
// returned, assigned or wrapped in another expression is left alone. The
// statement span is consulted solely to spot deliberate .then( chaining.
const BARE_CTX_LINE = /^ctx\s*\.\s*(?:db\s*\.\s*(?:insert|patch|replace|delete|get|query)\s*\(|scheduler\s*\.\s*\w+\s*\(|run(?:Query|Mutation|Action)\s*\()/;

function checkUnawaited(ctx, file, lines) {
  for (let i = 0; i < lines.length; i++) {
    if (!BARE_CTX_LINE.test(lines[i].trim())) continue;
    if (statementAt(lines, i).includes(".then(")) continue;
    ctx.report.finding({ rule: "unawaited-convex-call", file, line: i + 1 });
  }
}

// --- sequential run in loop --------------------------------------------------------

// The loop body is brace-tracked from the for/while line; the first run*
// call inside it is the finding. Nested loops are covered by the outer one.
const LOOP_START = /^\s*(?:for\s*\(|for\s+|while\s*\()/;

function checkSequentialRuns(ctx, file, lines) {
  for (let i = 0; i < lines.length; i++) {
    if (!LOOP_START.test(lines[i])) continue;
    let depth = countChars(lines[i], "{") - countChars(lines[i], "}");
    let end = i;
    if (depth > 0) {
      for (let j = i + 1; j < lines.length; j++) {
        depth += countChars(lines[j], "{") - countChars(lines[j], "}");
        end = j;
        if (depth <= 0) break;
      }
    }
    for (let j = i; j <= end; j++) {
      if (CTX_RUN.test(lines[j])) {
        ctx.report.finding({ rule: "sequential-run-in-loop", file, line: j + 1 });
        break;
      }
    }
    i = end;
  }
}

// --- node runtime check -------------------------------------------------------------

// "use node" must be the file's first statement, so it is read from the raw
// source (masking would blank the directive as a string literal). Only
// query/mutation definitions are flagged - actions may opt into Node.
const NODE_FORBIDDEN = /=\s*(?:internalQuery|internalMutation|query|mutation)\s*\(\s*(?:\([^)]*\)\s*=>|function\b|\{)/;

function checkNodeRuntime(ctx, file, rawLines, lines) {
  const first = rawLines.find((l) => l.trim().length > 0);
  if (!first || !/^['"]use node['"]\s*;/.test(first.trim())) return;
  for (let i = 0; i < lines.length; i++) {
    if (NODE_FORBIDDEN.test(lines[i])) {
      ctx.report.finding({ rule: "node-runtime-transaction", file, line: i + 1 });
    }
  }
}

// --- shared helpers -----------------------------------------------------------

function countChars(line, ch) {
  let n = 0;
  for (const c of line) if (c === ch) n++;
  return n;
}

function squash(text) {
  return text.replace(/\s+/g, "");
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
