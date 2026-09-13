export const meta = {
  id: "slop",
  description: "LLM slop discipline: duplicated helpers, dead exports and unread bindings, hostname-sniffed environments, careless text matching, collapsed boolean states. Born from 1,368 Bugbot findings across 182 reviewed PRs.",
  severity: "warning",
  category: "slop",
  blindSpots: [
    "Helpers: named function declarations/expressions only. Matching AST structure preserves literals; signatures do not count toward the minimum three executable statements and 25 body nodes. Captured bindings and contracts can differ. Doctor programs and generated output are exempt.",
    "Exports: host-resolved module identities include tests, generated consumers, types, barrels and declared public entries. No consumer found is bounded to the captured inventory and supported resolution; unresolved namespaces/configuration abstain. See analysisCoverage for scan-specific limits. Undeclared external/framework loading remains a review question.",
    "Bindings: the analysis engine resolves value positions only - a binding used purely as a type never becomes a reference. The text-occurrence guard keeps those out of findings, but a name reused in comments or strings can mask a genuinely dead binding. Parameter and catch bindings are not checked.",
    "Hostname: only .includes()/startsWith shapes against known environment tokens on host/URL-ish receivers are seen; URL parsing, DNS suffix checks, and configured-base-URL-first flows are not.",
    "Substring matches: only OR-chains whose literal arguments overlap by prefix are flagged; a single unbounded stem that silently matches longer words is not seen.",
    "Boolean collapse: the shape requires a ?? -defaulted boolean later tested with `=== true ?`; switches, explicit typeof branches, and collapses without a nullish default are not recognized.",
    "Abbreviation regexes: only bare 1-5 letter case-insensitive patterns without anchors or word boundaries used with .test()/.match() are flagged; longer patterns and compiled RegExp objects are not seen.",
    "Declaration files (.d.ts) are skipped entirely: they declare types, not behavior - a `declare const` is a contract, not a dead binding.",
    "This doctor needs the identity engine for three checks (dead exports, unread bindings, unused imports); without it those narrow to silence and the report says so.",
  ],
  checks: [
    {
      id: "identical-helper-body-in-two-modules",
      description: "A substantial function has matching source structure in another module - a consolidation review candidate.",
      severity: "info",
      revision: 2,
      reportingUnit: "occurrence",
      impact: "Matching implementations can drift independently when a change reaches only one copy. Review whether they share a contract before deciding whether consolidation would reduce maintenance work.",
      why: "The parameter/body syntax matches with literal values preserved. Captured bindings, side effects and domain ownership may differ, so matching structure does not establish equivalent behavior.",
      fix: "Compare contracts, captured bindings, side effects and future ownership before considering a shared implementation. Intentional copies may remain; matching source structure does not prove behavioral equivalence.",
      claim: "A nontrivial function has matching AST source structure (literal contents preserved, comments and formatting ignored) in another module; captured values and contracts may differ.",
      lookalikes: ["intentional domain-separated copies", "bodies below three statements or 25 syntax nodes", "doctor programs and build artifacts (exempt)"],
      needs: ["spans"],
      onUnknown: "narrow",
    },
    {
      id: "environment-guessed-from-hostname-substring",
      description: "Environment routing decided by a hostname substring with a fixed fallback.",
      severity: "info",
      revision: 1,
      reportingUnit: "occurrence",
      impact: "Every deployment host the substring does not anticipate falls through to the fallback environment - production traffic silently using local/dev settings, or vice versa. The corpus caught this 8 times across 2 PRs.",
      why: "Guessing environment from `host.includes(\"staging\")` encodes a naming convention as a behavior switch; opaque custom domains and renamed deployments break the guess with no error anywhere.",
      fix: "Read the environment from configuration (an explicit env var or build-time constant) and treat unknown values as errors, with the hostname heuristic at most a last-resort default.",
      claim: "A hostname substring test whose branch assigns or returns a URL-shaped constant.",
      lookalikes: ["QA guards that throw", "config that reads an explicit env var first"],
    },
    {
      id: "boolean-collapsed-into-three-state",
      description: "A nullish-defaulted boolean collapsed into a two-way ternary that feeds a three-state domain.",
      severity: "info",
      revision: 1,
      reportingUnit: "occurrence",
      impact: "false from 'not detected' and false from 'explicitly refused' become the same state - downstream logic treats unknown as negative, 8 findings across 4 PRs in the corpus.",
      why: "`x ?? detect()` yields boolean | undefined, but `x === true ? A : B` maps both false and undefined to B. The three-state union was written knowing the difference; the collapse forgets it.",
      fix: "Branch on the actual three states: `typeof x === \"boolean\" ? (x ? A : B) : C` - or model the source as an explicit tri-state from the start.",
      claim: "A ?? -defaulted boolean later branched with `=== true ?` to two outcomes.",
      lookalikes: ["typeof-guarded three-state branches", "booleans with no nullish default"],
    },
    {
      id: "prefix-overlapping-substring-match",
      description: "An OR-chain of substring tests whose literals overlap by prefix.",
      severity: "warning",
      revision: 1,
      reportingUnit: "occurrence",
      impact: "`includes(\"referral\") || includes(\"refer\")` also matches 'reference', 'referee', 'preferred' - the classifier accepts unrelated words and the stem list grows by accretion. 5 findings across 5 PRs.",
      why: "The shorter stem subsumes the longer one entirely and both subsume words nobody meant. Substring matching has no word boundary, so every added stem widens the net silently.",
      fix: "Match whole tokens: split the text and compare exact membership, or use a word-bounded regex (\\breferral\\b) - one explicit list, no accidental vocabulary.",
      claim: "An OR-chain of substring tests whose literals overlap by prefix.",
      lookalikes: ["non-overlapping literals", "word-bounded regexes"],
    },
    {
      id: "export-without-any-consumer",
      description: "An exported binding with no consumer found within supported coverage - a review candidate.",
      severity: "info",
      revision: 2,
      reportingUnit: "occurrence",
      impact: "Likely dead public surface: code that looks load-bearing, is maintained, reviewed, and shipped - but no consumer was found. The corpus caught this 5 times across 4 PRs.",
      why: "Generated code over-exports ('might be useful'), and nothing in the toolchain reports an export with zero consumers. The host resolves supported consumer edges by module identity and exposes coverage limits; this is a candidate, not a verdict.",
      fix: "Review whether this export is intentional or externally/framework consumed; declare entryPoints in any-doctor.analysis.json where appropriate. Only change it after checking side effects and contracts. This finding does not authorize deleting its module or initializer.",
      needs: ["bindings"],
      claim: "An authored exported binding with no observed local, runtime, test, type or re-export consumer, public exposure, or affected uncertainty in the host snapshot.",
      lookalikes: ["entry-point files", "test-only consumers (always reference evidence)", "namespace member usage", "string-built references"],
      onUnknown: "narrow",
    },
    {
      id: "named-import-without-reference",
      description: "A named import with zero references (value, JSX, and type positions all resolve) and no textual trace.",
      severity: "warning",
      revision: 1,
      reportingUnit: "occurrence",
      impact: "Dead dependency surface: the import suggests usage the module does not have, and removing the last real import from a module can change its initialization order. 5 findings across 3 PRs.",
      why: "Imports accumulate during generation and refactoring; TypeScript only reports these with noUnusedLocals enabled, which most repos never turn on. The identity engine resolves JSX and type-position references, and a whole-word occurrence guard backstops what no resolver sees - a finding means BOTH layers found nothing.",
      fix: "Remove the specifier (keep the import statement if other specifiers remain or the module has side effects).",
      needs: ["bindings"],
      claim: "A named import with zero references (value, JSX, and type positions all resolve) and no whole-word trace in the file.",
      lookalikes: ["type-position usage", "JSX usage", "string-built references"],
      onUnknown: "narrow",
    },
    {
      id: "unread-local-binding",
      description: "A non-exported local binding that is never read anywhere in its file.",
      severity: "info",
      revision: 1,
      reportingUnit: "occurrence",
      impact: "Computation whose result nobody uses - constants, derived values, whole call results assigned and forgotten. The corpus found these as rate-limit constants and computed guards left behind by refactors.",
      why: "Bindings created for a plan the code abandoned. Side-effecting initializers are deliberately exempt (the call may matter even when the value does not).",
      fix: "Delete the binding; if its initializer has side effects, keep the expression and drop the assignment.",
      needs: ["bindings"],
      claim: "A non-exported, non-excluded, non-underscore local binding never read in its file, with a side-effect-free initializer.",
      lookalikes: ["object-rest exclusions", "side-effecting initializers", "underscore-prefixed names", "exported bindings"],
      onUnknown: "narrow",
    },
    {
      id: "unanchored-abbreviation-regex",
      description: "A short case-insensitive regex tested against text without word boundaries.",
      severity: "info",
      revision: 1,
      reportingUnit: "occurrence",
      impact: "/ai/i matches 'said', 'wait', 'chair' - an abbreviation filter that accepts common words wholesale. 4 findings across 4 PRs.",
      why: "Short stems need boundaries; without them the regex is a substring test wearing a regex costume, and case-insensitivity widens it further.",
      fix: "Anchor it: /\\bai\\b/i - or match against whole tokens after splitting.",
      claim: "A 2-5 letter case-insensitive regex without anchors or word boundaries used with .test()/.match().",
      lookalikes: ["word-bounded patterns", "patterns six letters or longer"],
    },
  ],
};

export async function doctor(ctx) {
  const files = ctx.files.list([".ts", ".tsx", ".js", ".jsx", ".mjs"])
    // Declaration files declare types, not behavior - their `declare const`
    // bindings are contracts, not dead code.
    .filter(f => !f.endsWith(".d.ts"));
  const byFile = new Map();
  const readFile = (file) => {
    let entry = byFile.get(file);
    if (entry === undefined) {
      const raw = ctx.files.read(file);
      entry = { raw, masked: ctx.files.readMasked(file) };
      byFile.set(file, entry);
    }
    return entry;
  };

  // --- pass 1: text-shape checks (no engine needed) ---
  const helperBodies = new Map(); // normalized body -> sites
  for (const file of files) {
    if (/\.fixtures\.mjs$/.test(file)) continue;
    const lines = readFile(file).masked.split("\n");
    const rawLines = readFile(file).raw.split("\n");
    if (ctx.analysis.available) collectHelperBodies(helperBodies, file, ctx.analysis.structures(file));
    checkHostnameGuess(ctx, file, lines);
    checkPrefixOverlappingSubstrings(ctx, file, lines);
    checkBooleanCollapse(ctx, file, lines);
    checkUnanchoredAbbreviation(ctx, file, lines);
  }
  reportIdenticalHelpers(ctx, helperBodies);

  // --- pass 2: identity checks (narrow to silence without the engine) ---
  if (!ctx.analysis.available) return;

  for (const file of files) {
    if (/\.fixtures\.mjs$/.test(file)) continue;
    const model = ctx.analysis.bindings(file);
    const lines = readFile(file).masked.split("\n");
    checkDeadExports(ctx, file);
    checkUnusedImports(ctx, file, lines, model);
    checkUnreadLocals(ctx, file, lines, model);
  }
}

// --- identical-helper-body-in-two-modules -----------------------------------

// Compiled output mirrors its sources by construction and doctor programs
// are mandated self-contained copies - both would flood this check with
// intentional duplication.
const HELPER_SKIP = /(^|\/)(doctors|bin|dist|build)\//;

function collectHelperBodies(map, file, spans) {
  if (HELPER_SKIP.test(file)) return;
  for (const span of spans) {
    if (span.statements < 3 || span.nodes < 25) continue;
    const sites = map.get(span.fingerprint) ?? [];
    sites.push({ file, ...span });
    map.set(span.fingerprint, sites);
  }
}

function reportIdenticalHelpers(ctx, map) {
  for (const sites of map.values()) {
    const distinctFiles = new Set(sites.map(s => s.file));
    if (distinctFiles.size < 2) continue;
    for (const site of sites) {
      const twins = sites.filter(s => s.file !== site.file).map(s => s.file);
      ctx.report.finding({
        rule: "identical-helper-body-in-two-modules",
        file: site.file,
        line: site.line,
        column: site.column,
        evidence: { endLine: site.endLine, endColumn: site.endColumn },
        message: "matching source structure also in: " + twins.join(", ") + "; captured bindings (" + site.captures.join(", ") + ") and contracts require review before consolidation",
      });
    }
  }
}

// --- environment-guessed-from-hostname-substring -----------------------------

const ENV_TOKENS = /localhost|127\.0\.0\.1|staging|\.?prod\b|\.?dev\b|vercel\.app|netlify\.app/i;
const HOSTISH = /host|origin|url|endpoint|backend|apibase/i; // substrings: camelCase receivers like backendUrl carry no word boundaries

// Only ROUTING is claimed: the branch must assign or return a URL-ish
// constant (LOCAL_URL, PROD_URL, API_ORIGIN...). A throw guard (`if
// (!url.startsWith("http://localhost:")) throw`) is enforcement, not
// routing - exempt.
function checkHostnameGuess(ctx, file, lines) {
  const rawLines = ctx.files.read(file).split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.includes(".includes(") && !line.includes(".startsWith(")) continue;
    if (!HOSTISH.test(line)) continue;
    const rawLine = rawLines[i];
    if (/\bthrow\b/.test(line)) continue; // a guard, not a route
    if (!/\breturn\s+\w*(?:URL|ORIGIN|BASE|ENDPOINT)\w*/.test(line)
      && !/\w*(?:URL|ORIGIN|BASE|ENDPOINT)\w*\s*=/.test(line)) continue;
    if (/\.(?:includes|startsWith)\(\s*["'][^"']*["']/.test(rawLine) && ENV_TOKENS.test(rawLine)) {
      ctx.report.finding({ rule: "environment-guessed-from-hostname-substring", file, line: i + 1 });
    }
  }
}

// --- prefix-overlapping-substring-match ---------------------------------------

function checkPrefixOverlappingSubstrings(ctx, file, lines) {
  const rawLines = ctx.files.read(file).split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const includes = (line.match(/\.includes\(/g) ?? []).length;
    if (includes < 2 || !line.includes("||")) continue;
    const args = [...rawLines[i].matchAll(/\.includes\(\s*(["'])([^"']*)\1/g)].map(m => m[2]);
    if (args.length < 2) continue;
    for (let a = 0; a < args.length; a++) {
      for (let b = a + 1; b < args.length; b++) {
        const [x, y] = [args[a], args[b]];
        if (x.length < y.length ? y.startsWith(x) : x.startsWith(y)) {
          ctx.report.finding({ rule: "prefix-overlapping-substring-match", file, line: i + 1 });
          a = args.length; // one finding per line
          break;
        }
      }
    }
  }
}

// --- boolean-collapsed-into-three-state ---------------------------------------

function checkBooleanCollapse(ctx, file, lines) {
  for (let i = 0; i < lines.length; i++) {
    const m = /(\w+)\s*===\s*true\s*\?/.exec(lines[i]);
    if (!m) continue;
    const name = m[1];
    // The nullish default earlier in the file is what makes the collapse
    // lossy: undefined falls into the false branch.
    const defaulted = new RegExp(`\\b${name}\\s*=[^=]*\\?\\?`).test(lines.slice(0, i).join("\n"));
    if (defaulted) {
      ctx.report.finding({ rule: "boolean-collapsed-into-three-state", file, line: i + 1 });
    }
  }
}

// --- unanchored-abbreviation-regex ---------------------------------------------

function checkUnanchoredAbbreviation(ctx, file, lines) {
  const rawLines = ctx.files.read(file).split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (!/\.(?:test|match)\(/.test(lines[i])) continue;
    for (const m of rawLines[i].matchAll(/\/([a-z]{2,5})\/[gimsuy]*i[gimsuy]*\b/g)) {
      ctx.report.finding({ rule: "unanchored-abbreviation-regex", file, line: i + 1 });
      break;
    }
  }
}

// --- identity checks -----------------------------------------------------------

const GENERATED_FILE = /(^|\/)(__generated__|_generated|generated)\/|\.(?:gen|generated)\.[cm]?[jt]sx?$/;

function checkDeadExports(ctx, file) {
  const facts = ctx.analysis.consumers(file);
  for (const binding of facts.exports) {
    if (binding.evidence.length) continue;
    ctx.report.finding({
      rule: "export-without-any-consumer", file, line: binding.line, column: binding.column,
      message: "candidate: no consumer found for " + binding.name
        + " within supported captured coverage (including tests, generated modules, types and re-exports). Exclusions: "
        + facts.coverage.inventory.exclusions.join(", ")
        + ". Undeclared external/framework usage and module side effects require review; this is not deletion authorization.",
    });
  }
}

// The declarator (or import specifier) is itself a write reference, and
// loop variables declare over the whole loop - eslint-scope spans make
// body references look like part of the declaration. A binding is USED
// when anything READS it, or writes it beyond its own declaration.
function isUsed(b) {
  return b.references.some(r => !r.write)
    || b.references.some(r => !refInsideDecl(r, b));
}

function refInsideDecl(r, b) {
  return (r.line > b.line && r.line < b.endLine)
    || (r.line === b.line && r.column >= b.column && r.endColumn <= b.endColumn)
    || (r.line === b.endLine && r.column >= b.column && r.column <= b.endColumn);
}

function checkUnusedImports(ctx, file, lines, model) {
  // Generated code (route trees, API clients) is machine-authored — its
  // unused imports are the generator's, not the developer's.
  if (GENERATED_FILE.test(file)) return;
  const fileText = lines.join("\n");
  for (const b of model.bindings) {
    if (b.kind !== "ImportBinding") continue;
    if (isUsed(b)) continue;
    // Belt and braces: the engine resolves JSX and type positions, and the
    // whole-word occurrence guard catches what no resolver sees
    // (string-built references, reflection). A name with no reference AND
    // no textual trace is dead; anything less is UNKNOWN, not unused.
    const occurrences = fileText.split(new RegExp(`\\b${escapeRe(b.name)}\\b`)).length - 1;
    if (occurrences > 1) continue;
    ctx.report.finding({ rule: "named-import-without-reference", file, line: b.line });
  }
}

function checkUnreadLocals(ctx, file, lines, model) {
  const fileText = lines.join("\n");
  for (const b of model.bindings) {
    if (b.kind !== "Variable") continue;
    if (isUsed(b)) continue;
    // The engine marks the object-rest exclusion idiom - unreadness is
    // the point there, not a defect.
    if (b.excluded) continue;
    if (b.exported) continue;
    // The underscore convention for intentionally-unused destructured
    // names (_secret) is opt-out by spelling.
    if (b.name.startsWith("_")) continue;
    const occurrences = fileText.split(new RegExp(`\\b${escapeRe(b.name)}\\b`)).length - 1;
    if (occurrences > 1) continue;
    // Conservative side-effect exemption: any initializer containing a
    // call, await, or parenthesized expression is left alone - the work
    // may matter even when the value does not.
    const declLine = lines[b.line - 1] ?? "";
    if (declLine.includes("(") || declLine.includes("await ")) continue;
    ctx.report.finding({ rule: "unread-local-binding", file, line: b.line });
  }
}

// --- shared helpers -------------------------------------------------------------

function countChars(line, ch) {
  let n = 0;
  for (const c of line) if (c === ch) n++;
  return n;
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
