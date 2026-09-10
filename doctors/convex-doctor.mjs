export const meta = {
  id: "convex-doctor",
  description: "Convex discipline: indexed reads, bounded collects, query clocks, discarded promises, validated args, awaited writes, honest runtime boundaries.",
  severity: "warning",
  category: "convex",
  blindSpots: [
    "Queries: syntactic ctx.db.query/db.query chains are inspected, including helpers; receiver types and schema/cardinality are not resolved. withIndex is trusted to name a real index. withSearchIndex chains are skipped entirely - search bounds are not modeled.",
    "Subscriptions: client useQuery calls are not diagnosed because backend result sizes are not resolved.",
    "Clock and discarded calls require analysis. Only inline handlers registered through imports from convex/server or _generated/server are resolved; custom wrappers and separately declared handlers are unknown. Clock checks exclude nested functions. Promise checks establish direct discards, not eventual settlement of stored, passed, chained, or returned promises.",
    "Chains split across multiple statements (const q = ctx.db.query(t); q.filter(...)) are not tracked - only single-statement chains.",
    "Query chains require AST call facts. A take/first/unique terminator limits results, not necessarily reads when a filter rejects documents. Split statements and unresolved index callbacks are not followed; index ranges do not prove small cardinality.",
    "unbounded-collect cannot tell a provably small table from a growing one: collect on a known-small table without an index is still flagged.",
    "index-filter-combo fires on every withIndex+filter chain; whether the filtered remainder is large enough to matter is a judgement the doctor cannot make.",
    "presence-patch recognizes the canonical field names (lastSeen, heartbeat, pingAt, ...); frequently-patched documents under other names are not seen, and write frequency itself is invisible.",
    "Validators: only the object-config form is inspected (the span between the opening brace and the handler keyword); customQuery/customMutation wrappers and config objects assembled by helpers are not recognized.",
    "Server runs: only a literal api. reference directly after ctx.run* is caught, as a review candidate - the namespace alone does not establish an authorization flaw.",
    "Function bodies are located by brace counting from the definition line; work delegated to helpers outside that span is invisible to the context checks.",
    'Node runtime: "use node" is recognized only as the file\'s first statement.',
    "Loops: only for/while bodies are scanned, as batching review candidates - deliberate retry loops (OCC with backoff) share the shape.",
    "Spread patches: every spread inside .patch()/.replace() is a review candidate (info) - the spread is visible, field ownership is not.",
    "Fixture-named files (*.fixtures.mjs) in the target are skipped: they are doctor test data, not target source.",
  ],
  checks: [
    {
      id: "filter-table-scan",
      needs: ["calls"], onUnknown: "skip", reportingUnit: "occurrence",
      description: "A database filter without an index may scan many documents to find matching results.",
      severity: "warning",
      impact: "Without an index restriction, finding matching results may read many table documents. Cost grows with the scanned candidate set, even when few results are returned.",
      why: ".filter() runs after documents are read - it cannot reduce reads. Only an index range (.withIndex with q.eq/q.gt/...) restricts how many documents the query touches.",
      fix: "Define an index covering the filtered fields in schema.ts and use .withIndex(\"by_field\", q => q.eq(\"field\", value)) instead of .filter().",
      claim: "A ctx.db.query chain using .filter() with no .withIndex() anywhere in the chain.",
      lookalikes: ["chains with withIndex", "non-Convex array filters (import-gated)"],
    },
    {
      id: "index-without-range",
      needs: ["calls"], onUnknown: "skip", reportingUnit: "occurrence",
      description: "An index without a range feeds an unbounded consumer.",
      severity: "warning",
      impact: "The index does not restrict the candidate set. An unbounded collect can grow with the table; filters may read many candidates before returning a few results.",
      why: "Choosing index order does not narrow its range. This check reports unbounded consumers; filtered bounded-result consumers remain index review candidates.",
      fix: "Pass a range expression: .withIndex(\"by_x\", q => q.eq(\"x\", value)) - or bound the chain with .take(n) when recent-items ordering is the intent.",
      claim: "A ctx.db.query/db.query chain with an index but no observed range restriction, ending in collect without a bounded-result terminator.",
      lookalikes: ["multi-line callbacks with real bounds", "take/first/unique terminators"],
    },
    {
      id: "query-clock-reactivity",
      description: "Date.now() in a query can produce stale time-dependent results and reduce cache reuse.",
      severity: "warning", needs: ["calls"], onUnknown: "skip", reportingUnit: "occurrence",
      claim: "A global Date.now() call directly inside an import-resolved Convex query handler.",
      lookalikes: ["mutation expiry timestamps", "action clocks", "shadowed Date", "nested or unresolved helper functions"],
      impact: "Time passing does not itself rerun a subscribed query; time-dependent results may become stale and cache reuse can suffer.",
      why: "Convex query reactivity follows database changes, not the wall clock.",
      fix: "Use a scheduled state transition where appropriate, or an explicit coarse-grained time argument. See docs.convex.dev/understanding/best-practices/#dont-use-datenow-in-queries.",
    },
    {
      id: "transaction-clock-duration",
      description: "Subtracting two Date.now() readings in one transaction produces zero elapsed time.",
      severity: "warning", needs: ["calls"], onUnknown: "skip", reportingUnit: "occurrence",
      claim: "A subtraction of two global Date.now() calls, or immutable direct aliases, in the same inline query/mutation handler.",
      lookalikes: ["historical timestamps or expiry cutoffs", "action duration measurement", "random branching", "reassigned timestamps"],
      impact: "The transaction clock is fixed at function start, so this calculation cannot measure work duration.",
      why: "Both operands read the same transaction-start timestamp. Math.random is a seeded sequence and is not diagnosed.",
      fix: "Measure wall-clock duration outside the transaction; preserve server-authoritative expiration checks.",
    },
    {
      id: "unbounded-collect",
      needs: ["calls"], onUnknown: "skip", reportingUnit: "occurrence",
      description: ".collect() on a query chain with no take, no paginate, and no index range bounding it.",
      severity: "warning",
      impact: "Unbounded reads grow with the table and eventually hit Convex's per-transaction document read limit - the query works at demo scale and fails in production.",
      why: "Convex has no query planner: reads follow the chain exactly as written. The scaling guide is explicit that every .collect() must be provably small or index-narrowed (stack.convex.dev/queries-that-scale).",
      fix: 'Bound the chain - .take(50) for recent-items UIs, .paginate(args.paginationOpts) for incremental loading - or narrow it with .withIndex("by_field", q => q.eq(...)).',
      claim: "A .collect() on a chain with no take, no paginate, and no bounding index range.",
      lookalikes: ["collect bounded by an index range", "collect bounded by take"],
    },
    {
      id: "index-filter-combo",
      needs: ["calls"], onUnknown: "skip", reportingUnit: "occurrence",
      claim: "A .withIndex() chain - range-narrowed or result-bounded - whose same chain also calls .filter().",
      lookalikes: ["multi-field indexes serving both bounds"],
      description: "An indexed chain that also filters - a multi-field index candidate whether the index is range-narrowed or the results are bounded.",
      severity: "warning",
      impact: "The index range still reads every document the filter then discards; when the discarded slice is large, the query pays for it on every call.",
      why: "When one index field plus a filter still reads too much, Convex's guidance is to promote to a multi-field index so both conditions become range bounds instead of post-read filters.",
      fix: '.index("by_teamId_status", ["teamId", "status"]) and query it with both .eq() bounds instead of filtering.',
    },
    {
      id: "presence-patch-on-shared-document",
      reportingUnit: "occurrence",
      description: "A presence field (lastSeen/heartbeat-shaped) patched onto a document.",
      severity: "warning",
      impact: "Convex re-runs every subscribed query that read the document. A 10-second heartbeat on a widely-read user document invalidates those queries continuously - including queries that never touch the field.",
      why: "Frequently-updated fields on widely-referenced documents cause fan-out invalidation; the scaling guide's fix is document segmentation, not smarter queries.",
      fix: 'Split presence into its own table (heartbeats) and patch that; patch the parent document only on meaningful transitions (online to offline).',
      claim: "A canonical presence field (lastSeen/heartbeat/...) patched onto a document.",
      lookalikes: ["presence segmented into its own table"],
    },
    {
      id: "missing-args-validator",
      reportingUnit: "occurrence",
      description: "A query/mutation/action defined without argument validators.",
      severity: "warning",
      impact: "Args arrive unvalidated and untyped: any payload the client sends is accepted at runtime, and the handler's args parameter is any instead of the inferred literal type - typos surface later as undefined fields instead of immediately as validation errors.",
      why: "Validators are the contract: Convex checks every call against args at runtime and generates the handler's TypeScript types from the same definition. A function without args gets neither the check nor the types.",
      fix: "Declare the shape: export const create = mutation({ args: { body: v.string() }, handler: ... }) - an explicit args: {} for no-arg functions keeps the contract visible.",
      claim: "A Convex function span (import-gated) with no args key in its config.",
      lookalikes: ["chrome.tabs.query and other namespaced APIs", "explicit args: {}"],
    },
    {
      id: "public-api-in-server-call",
      reportingUnit: "occurrence",
      description: "A server-side run call referencing the public api namespace - a review candidate; namespace alone does not establish an authorization flaw.",
      severity: "info",
      impact: "Everything reachable through api is callable by any client that can reach the deployment. A server-only workflow invoked via api is an exposed surface that clients can call directly, with any arguments the validators accept.",
      why: "internal.* is the server-to-server namespace: the same functions, unreachable from clients. A run* call that names api.* is either exposing a function by mistake or announcing it should be internal.",
      fix: "Define the target as internalQuery/internalMutation/internalAction and reference it as internal.module.function in the run* call.",
      claim: "A ctx.run* referencing api.* rather than internal.*.",
      lookalikes: ["functions legitimately consumed by both client and server"],
    },
    {
      id: "write-in-query",
      reportingUnit: "occurrence",
      description: "A write, scheduler, or mutation/action call inside a query.",
      severity: "warning",
      impact: "Queries are read-only transactions - the write methods do not exist on a query's context, so the function fails on its first real call rather than at deploy time. ctx.runQuery IS allowed (same read snapshot); only mutations, actions, and scheduling are forbidden.",
      why: "A query body runs inside a deterministic read transaction: its context carries db reads, auth and storage, runQuery, nothing else. Writes and scheduling belong in a mutation.",
      fix: "Move the write into a mutation the client or an action invokes; if the read and the write must be atomic, the whole operation is a mutation that reads first.",
      claim: "A write, scheduler, or mutation/action call inside a query span (runQuery is legal).",
      lookalikes: ["ctx.runQuery inside queries"],
    },
    {
      id: "db-in-action",
      reportingUnit: "occurrence",
      description: "ctx.db used inside an action.",
      severity: "warning",
      impact: "Actions have no db on their context - the call throws at runtime, usually on the first request that reaches that path.",
      why: "Actions run outside the transaction: their context offers runQuery/runMutation/runAction, scheduler, storage and auth. Database access goes through a function the action invokes.",
      fix: "Replace ctx.db.<x> with await ctx.runQuery(...) for reads or await ctx.runMutation(...) for writes.",
      claim: "ctx.db usage inside an action span.",
      lookalikes: ["ctx.runQuery/runMutation from actions"],
    },
    {
      id: "unawaited-convex-call",
      description: "A known Promise-returning Convex context call is discarded as a standalone expression.",
      severity: "warning", needs: ["calls"], onUnknown: "skip", reportingUnit: "occurrence",
      claim: "A direct discarded call to a context method of an import-resolved handler's context parameter - db or storage, reads included, scheduler and run* functions too - resolved by binding identity.",
      lookalikes: ["returned callbacks", "arguments to helpers", "stored promises", "query builders", "shadowed context bindings"],
      impact: "Discarding the promise can lose errors or leave work unfinished when the function returns.",
      why: "This call's result is an expression statement; nearby awaits do not receive it.",
      fix: "Await or return this promise. For broader flow checks use typescript-eslint/no-floating-promises.",
    },
    {
      id: "node-runtime-transaction",
      reportingUnit: "occurrence",
      description: 'A query or mutation defined in a "use node" file.',
      severity: "warning",
      impact: "Deploy fails: queries and mutations must run in Convex's deterministic runtime, which is what makes their transaction guarantees replayable.",
      why: '"use node" opts the file into the Node runtime, which only actions can use. Queries and mutations must be deterministic so re-execution produces identical results.',
      fix: "Split the file: keep the query/mutation in the default runtime and move the Node-dependent work into an action it schedules.",
      claim: "A query or mutation defined in a file whose first statement after imports is \"use node\".",
      lookalikes: ["actions in use-node files"],
    },
    {
      id: "sequential-run-in-loop",
      reportingUnit: "occurrence",
      description: "A run call awaited inside a for/while loop - a batching review candidate; deliberate retry loops (OCC with backoff) share this shape.",
      severity: "info",
      impact: "N iterations become N separate transactions, each with its own round trip and commit - a 1000-item backfill is 1000 sequential transactions, and the caller's timeout budget pays for all of them.",
      why: "Each run* call is a complete transaction of its own. A loop of awaited runs is the slowest possible batch; the batching guidance is to do the work inside one mutation instead.",
      fix: "Pass the ids to a mutation that loops internally over ctx.db writes - one transaction - or chunk the loop into bounded batches of run* calls.",
      claim: "A ctx.run* awaited inside a for/while body.",
      lookalikes: ["deliberate OCC retry loops with backoff"],
    },
    {
      id: "spread-into-patch",
      reportingUnit: "occurrence",
      description: "ctx.db.patch/replace called with a spread - a review candidate; presence alone does not prove client-controlled fields.",
      severity: "info",
      impact: "Every field the client included gets written: the validators constrain the mutation's args, but the spread forwards them all, so fields the mutation never named (ownership, role, timestamps) become client-writable.",
      why: "patch merges whatever object it is given. Spreading args into it delegates field selection to the caller - the opposite of what a validated mutation is for.",
      fix: "Name the fields: ctx.db.patch(args.id, { title: args.title }) - build the patch object server-side from explicitly validated values.",
      claim: "A spread inside .patch()/.replace() \u2014 a review candidate; field ownership is not traced.",
      lookalikes: ["validated server-built objects spread deliberately"],
    },
  ],
};

export async function doctor(ctx) {
  const files = await ctx.files.list([".ts", ".tsx", ".js", ".jsx", ".mjs"]);
  for (const file of files) {
    // Fixture sandboxes are doctor test data, not target source.
    if (/\.fixtures\.mjs$/.test(file)) continue;
    const source = await ctx.files.read(file);
    const masked = ctx.files.readMasked(file);
    const lines = masked.split("\n");
    const rawLines = source.split("\n");

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(".patch(") || lines[i].includes(".replace(")) {
        const stmt = statementAt(lines, i);
        checkPresencePatch(ctx, file, i, stmt);
        checkSpreadPatch(ctx, file, i, stmt);
      }
    }

    if (ctx.analysis.available) {
      const facts = ctx.analysis.calls(file);
      checkCallFacts(ctx, file, facts);
      checkQueryChains(ctx, file, facts);
    }

    // Server-side checks apply where Convex is imported (convex/server,
    // _generated/server): chrome.tabs.query in an extension file is not a
    // Convex function - the audit's missing-validator false positives.
    // Client checks (useQuery) and chain checks (ctx.db.query implies
    // Convex) are not gated.
    if (/from\s+["'][^"']*(?:convex\/|_generated\/server)["']/.test(source)) {
      const spans = functionSpans(lines);
      checkValidators(ctx, file, lines, spans);
      checkContextMisuse(ctx, file, lines, spans);
      checkServerRuns(ctx, file, lines);
      checkSequentialRuns(ctx, file, lines);
      checkNodeRuntime(ctx, file, rawLines, lines);
    }
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
// second argument. The span is matched against a look-AHEAD window joined
// from the withIndex line: callback bodies contain internal semicolons that
// terminate statement reconstruction, and a truncated statement makes
// matchingParen fail - the audit's five "index without range" false
// positives all had real eq/gte/lt bounds inside multi-line callbacks.
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
// Queries may call ctx.runQuery (same read snapshot, per the QueryCtx
// docs) - only mutations, actions, and scheduling cross the line.
const CTX_RUN = /\bctx\s*\.\s*run(?:Mutation|Action)\s*\(/;

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
  // The directive must be the first STATEMENT - imports may precede it, so
  // skip import lines when looking for it.
  const first = rawLines.find((l) => {
    const t = l.trim();
    return t.length > 0 && !t.startsWith("import ") && !t.startsWith("//");
  });
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



// Framework policy over generic AST relationships. Passing/storing a promise
// is outside this direct-discard claim, not proof of eventual consumption.
function registeredKind(fn) {
  const reg = fn.registration;
  if (!reg || reg.argument !== 0 || (reg.property !== "handler" && reg.property !== null)) return null;
  const t = reg.target;
  if (!/(?:^|\/)(?:_generated\/server|convex\/server)(?:\.[cm]?[jt]s)?$/.test(t.source ?? "")) return null;
  const name = t.importedName === "*" && t.members.length === 1 ? t.members[0]
    : t.members.length === 0 ? t.importedName : null;
  if (!/^(?:internal)?(?:Query|Mutation|Action)$/.test(name ?? "") && !/^(?:query|mutation|action|httpAction)$/.test(name ?? "")) return null;
  return name.replace(/^internal/, "").toLowerCase();
}

function checkCallFacts(ctx, file, facts) {
  const handlers = new Map(facts.functions.map(fn => [fn.start, { fn, kind: registeredKind(fn) }]));
  const contexts = new Set([...handlers.values()].filter(h => h.kind && h.fn.parameters[0] !== null).map(h => h.fn.parameters[0]));
  const clocks = new Map();
  const clockBindings = new Map();
  for (const call of facts.calls) {
    const t = call.target;
    const member = t.members.join(".");
    if (call.usage === "discarded" && !t.reassigned && contexts.has(t.binding)
      && /^(?:db\.(?:insert|patch|replace|delete|get)|scheduler\.(?:runAfter|runAt|cancel)|run(?:Query|Mutation|Action)|storage\.(?:get|store|delete|generateUploadUrl|getUrl))$/.test(member)) {
      ctx.report.finding({ rule: "unawaited-convex-call", file, line: call.line, column: call.column });
    }
    if (t.root !== "Date" || t.binding !== null || member !== "now") continue;
    const kind = handlers.get(call.functionStart)?.kind;
    if (kind !== "query" && kind !== "mutation") continue;
    clocks.set(call.start, call);
    if (call.resultBinding !== undefined) clockBindings.set(call.resultBinding, call);
    if (kind === "query") ctx.report.finding({ rule: "query-clock-reactivity", file, line: call.line, column: call.column });
  }
  for (const diff of facts.differences) {
    const get = operand => operand.call !== undefined ? clocks.get(operand.call) : clockBindings.get(operand.binding);
    const left = get(diff.left), right = get(diff.right);
    if (left && right && left.functionStart === diff.functionStart && right.functionStart === diff.functionStart) {
      ctx.report.finding({ rule: "transaction-clock-duration", file, line: diff.line, column: diff.column });
    }
  }
}

// Each linked call chain is visited once; source ranges distinguish identical
// operations, including separate operations on the same line.
function checkQueryChains(ctx, file, facts) {
  const byEnd = new Map(facts.calls.map(c => [c.end, c]));
  const receiverOf = (call) => byEnd.get(call.receiverCall);
  const receivers = new Set(facts.calls.map(receiverOf).filter(Boolean));
  for (const terminal of facts.calls) {
    if (receivers.has(terminal)) continue;
    const steps = [];
    let step = terminal;
    while (step) { steps.unshift(step); step = step.receiverCall === undefined ? null : receiverOf(step); }
    const base = steps[0];
    if (!((base.target.root === "ctx" && base.target.members.join(".") === "db.query")
      || (base.target.root === "db" && base.target.members.join(".") === "query"))) continue;
    const method = c => c.target.members.at(-1);
    const index = steps.find(c => method(c) === "withIndex");
    const filter = steps.find(c => method(c) === "filter");
    if (steps.some(c => method(c) === "withSearchIndex")) continue;
    const collect = steps.find(c => method(c) === "collect");
    const bounded = steps.some(c => ["take", "first", "unique", "paginate"].includes(method(c)));
    // A builder alone does not read anything.
    if (!collect && !bounded) continue;
    let ranged = false;
    if (index && index.arguments.length > 1) {
      const arg = index.arguments[1];
      const callback = facts.functions.find(f => f.start === arg.start);
      if (!callback || callback.parameters[0] === null) continue; // unknown
      ranged = facts.calls.some(c => c.start >= arg.start && c.end <= arg.end
        && c.target.binding === callback.parameters[0] && /^(eq|neq|gt|gte|lt|lte|range)$/.test(method(c)));
    }
    let rule;
    if (filter && !index) rule = "filter-table-scan";
    else if (index && !ranged && !bounded) rule = "index-without-range";
    else if (index && filter) rule = "index-filter-combo";
    else if (collect && !bounded && !ranged) rule = "unbounded-collect";
    if (!rule) continue;
    const trigger = rule === "index-filter-combo" ? filter : steps.find(c => ["withIndex", "filter", "collect"].includes(method(c)));
    const location = trigger.memberRange ?? trigger;
    ctx.report.finding({ rule, file, line: location.line, column: location.column });
  }
}
