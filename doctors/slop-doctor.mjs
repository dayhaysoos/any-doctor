export const meta = {
  id: "slop-doctor",
  description: "LLM slop discipline: duplicated helpers, dead exports and unread bindings, hostname-sniffed environments, careless text matching, collapsed boolean states. Born from 1,368 Bugbot findings across 182 reviewed PRs.",
  severity: "warning",
  category: "slop",
  blindSpots: [
    "Helpers: only function declarations are compared (arrow-const helpers and class methods are not), bodies must normalize to identical text, and trivial bodies under ~60 characters are ignored. Doctor programs (doctors/) and compiled output (bin/, dist/, build/) are exempt - the single-file law mandates copies, and build artifacts mirror their sources by construction.",
    "Dead exports: entry-point-shaped files (cli, main, index, server, app, mod, anything under bin/, scripts/, or doctors/ - doctor programs are consumed by the loader's dynamic import) are exempt entirely, and a name counts as consumed when ANY other file imports that name from ANYWHERE, so same-name imports from other modules can mask a dead export. Dynamic import() and string-built references are not resolved; test-file consumers are invisible in the default run (pass --include-tests to count them).",
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
      description: "The same function body maintained in two or more modules.",
      severity: "warning",
      impact: "Two copies of one contract drift independently: the next edit fixes one and silently leaves the other behind. This is the single most actioned pattern in the corpus it came from - 16 findings across 14 PRs, every one fixed.",
      why: "Generated code copies what worked instead of importing it, and nothing in review tooling notices two implementations of the same name. The copies are born identical, which is exactly what makes their later divergence invisible.",
      fix: "Consolidate into one shared module and import it on both sides - or, if the domains must stay separate, make the separation explicit in the name and a comment saying why they differ.",
    },
    {
      id: "environment-guessed-from-hostname-substring",
      description: "Environment routing decided by a hostname substring with a fixed fallback.",
      severity: "info",
      impact: "Every deployment host the substring does not anticipate falls through to the fallback environment - production traffic silently using local/dev settings, or vice versa. The corpus caught this 8 times across 2 PRs.",
      why: "Guessing environment from `host.includes(\"staging\")` encodes a naming convention as a behavior switch; opaque custom domains and renamed deployments break the guess with no error anywhere.",
      fix: "Read the environment from configuration (an explicit env var or build-time constant) and treat unknown values as errors, with the hostname heuristic at most a last-resort default.",
    },
    {
      id: "boolean-collapsed-into-three-state",
      description: "A nullish-defaulted boolean collapsed into a two-way ternary that feeds a three-state domain.",
      severity: "info",
      impact: "false from 'not detected' and false from 'explicitly refused' become the same state - downstream logic treats unknown as negative, 8 findings across 4 PRs in the corpus.",
      why: "`x ?? detect()` yields boolean | undefined, but `x === true ? A : B` maps both false and undefined to B. The three-state union was written knowing the difference; the collapse forgets it.",
      fix: "Branch on the actual three states: `typeof x === \"boolean\" ? (x ? A : B) : C` - or model the source as an explicit tri-state from the start.",
    },
    {
      id: "prefix-overlapping-substring-match",
      description: "An OR-chain of substring tests whose literals overlap by prefix.",
      severity: "warning",
      impact: "`includes(\"referral\") || includes(\"refer\")` also matches 'reference', 'referee', 'preferred' - the classifier accepts unrelated words and the stem list grows by accretion. 5 findings across 5 PRs.",
      why: "The shorter stem subsumes the longer one entirely and both subsume words nobody meant. Substring matching has no word boundary, so every added stem widens the net silently.",
      fix: "Match whole tokens: split the text and compare exact membership, or use a word-bounded regex (\\breferral\\b) - one explicit list, no accidental vocabulary.",
    },
    {
      id: "export-without-any-consumer",
      description: "A named export no file imports and no code references.",
      severity: "warning",
      impact: "Dead public surface: code that looks load-bearing, is maintained, reviewed, and shipped - but has no caller anywhere. The corpus caught this 5 times across 4 PRs.",
      why: "Generated code over-exports ('might be useful'), and nothing in the toolchain reports an export with zero consumers. Unlike an unused local, it survives every cleanup pass because it looks deliberate.",
      fix: "Delete it - or consume it. If it is a genuine public API entry point, say so in a comment and exempt it deliberately.",
      needs: ["bindings"],
    },
    {
      id: "named-import-without-reference",
      description: "A named import whose binding is never referenced in its module.",
      severity: "warning",
      impact: "Dead dependency surface: the import suggests usage the module does not have, and removing the last real import from a module can change its initialization order. 5 findings across 3 PRs.",
      why: "Imports accumulate during generation and refactoring; TypeScript only reports these with noUnusedLocals enabled, which most repos never turn on.",
      fix: "Remove the specifier (keep the import statement if other specifiers remain or the module has side effects).",
      needs: ["bindings"],
    },
    {
      id: "unread-local-binding",
      description: "A non-exported local binding that is never read anywhere in its file.",
      severity: "info",
      impact: "Computation whose result nobody uses - constants, derived values, whole call results assigned and forgotten. The corpus found these as rate-limit constants and computed guards left behind by refactors.",
      why: "Bindings created for a plan the code abandoned. Side-effecting initializers are deliberately exempt (the call may matter even when the value does not).",
      fix: "Delete the binding; if its initializer has side effects, keep the expression and drop the assignment.",
      needs: ["bindings"],
    },
    {
      id: "unanchored-abbreviation-regex",
      description: "A short case-insensitive regex tested against text without word boundaries.",
      severity: "info",
      impact: "/ai/i matches 'said', 'wait', 'chair' - an abbreviation filter that accepts common words wholesale. 4 findings across 4 PRs.",
      why: "Short stems need boundaries; without them the regex is a substring test wearing a regex costume, and case-insensitivity widens it further.",
      fix: "Anchor it: /\\bai\\b/i - or match against whole tokens after splitting.",
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
      entry = { masked: ctx.files.readMasked(file) };
      byFile.set(file, entry);
    }
    return entry;
  };

  // --- pass 1: text-shape checks (no engine needed) ---
  const helperBodies = new Map(); // normalized body -> sites
  for (const file of files) {
    if (/\.fixtures\.mjs$/.test(file)) continue;
    const lines = readFile(file).masked.split("\n");
    collectHelperBodies(helperBodies, file, lines);
    checkHostnameGuess(ctx, file, lines);
    checkPrefixOverlappingSubstrings(ctx, file, lines);
    checkBooleanCollapse(ctx, file, lines);
    checkUnanchoredAbbreviation(ctx, file, lines);
  }
  reportIdenticalHelpers(ctx, helperBodies);

  // --- pass 2: identity checks (narrow to silence without the engine) ---
  if (!ctx.analysis.available) return;
  const importedNames = collectImportedNames(files, readFile);
  for (const file of files) {
    if (/\.fixtures\.mjs$/.test(file)) continue;
    let model;
    try {
      model = ctx.analysis.bindings(file);
    } catch {
      continue; // unparsable for the identity engine: not this doctor's finding
    }
    const lines = readFile(file).masked.split("\n");
    checkDeadExports(ctx, file, lines, model, importedNames, files);
    checkUnusedImports(ctx, file, lines, model);
    checkUnreadLocals(ctx, file, lines, model);
  }
}

// --- identical-helper-body-in-two-modules -----------------------------------

// Compiled output mirrors its sources by construction and doctor programs
// are mandated self-contained copies - both would flood this check with
// intentional duplication.
const HELPER_SKIP = /(^|\/)(doctors|bin|dist|build)\//;

function collectHelperBodies(map, file, lines) {
  if (HELPER_SKIP.test(file)) return;
  for (const span of functionSpans(lines)) {
    const body = lines.slice(span.bodyStart, span.end + 1).join(" ").replace(/\s+/g, "");
    if (body.length < 60) continue; // trivial bodies are not a contract
    const sites = map.get(body) ?? [];
    sites.push({ file, line: span.line, name: span.name });
    map.set(body, sites);
  }
}

function reportIdenticalHelpers(ctx, map) {
  for (const sites of map.values()) {
    const distinctFiles = new Set(sites.map(s => s.file));
    if (distinctFiles.size < 2) continue;
    for (const site of sites) {
      ctx.report.finding({ rule: "identical-helper-body-in-two-modules", file: site.file, line: site.line });
    }
  }
}

function functionSpans(lines) {
  const spans = [];
  const DECL = /^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/;
  let cur = null;
  let depth = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!cur) {
      const m = DECL.exec(line);
      if (!m) continue;
      cur = { name: m[1], line: i + 1, bodyStart: i, end: i };
      depth = countChars(line, "{") - countChars(line, "}");
      if (depth <= 0) { spans.push(cur); cur = null; }
      continue;
    }
    depth += countChars(line, "{") - countChars(line, "}");
    cur.end = i;
    if (depth <= 0) { spans.push(cur); cur = null; }
  }
  return spans;
}

// --- environment-guessed-from-hostname-substring -----------------------------

const ENV_TOKENS = /localhost|127\.0\.0\.1|staging|\.?prod\b|\.?dev\b|vercel\.app|netlify\.app/i;
const HOSTISH = /host|origin|url|endpoint|backend|apibase/i; // substrings: camelCase receivers like backendUrl carry no word boundaries

function checkHostnameGuess(ctx, file, lines) {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.includes(".includes(") && !line.includes(".startsWith(")) continue;
    if (!HOSTISH.test(line)) continue;
    // The literal lives in the raw line (masking blanks strings).
    const rawLine = ctx.files.read(file).split("\n")[i];
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

// Entry-point shapes are public by design - their exports are the product.
// Doctor programs are plugin entries: the loader consumes them through a
// dynamic import no static analysis can see.
const ENTRY_FILE = /(^|\/)(bin|scripts|doctors)\//;
const ENTRY_NAME = /^(cli|main|index|server|app|mod)\.[cm]?[jt]sx?$/;

function isEntryFile(file) {
  return ENTRY_FILE.test(file) || ENTRY_NAME.test(file.split("/").pop() ?? "");
}

function collectImportedNames(files, readFile) {
  const names = new Set();
  const namespaces = []; // { ns, text } - members consumed via NS.NAME
  for (const file of files) {
    if (/\.fixtures\.mjs$/.test(file)) continue;
    const masked = readFile(file).masked;
    for (const m of masked.matchAll(/import\s*\{([^}]*)\}/g)) {
      for (const part of m[1].split(",")) {
        const local = part.replace(/^\s*type\s+/, "").split(/\s+as\s+/)[0].trim();
        if (local) names.add(local);
      }
    }
    for (const m of masked.matchAll(/import\s+([A-Za-z_$][\w$]*)\s+from/g)) names.add(m[1]);
    for (const m of masked.matchAll(/import\s*\*\s+as\s+([A-Za-z_$][\w$]*)/g)) {
      namespaces.push({ ns: m[1], text: masked });
    }
  }
  return (name) => {
    if (names.has(name)) return true;
    return namespaces.some(({ ns, text }) =>
      new RegExp(`\\b${escapeRe(ns)}\\s*\\.\\s*${escapeRe(name)}\\b`).test(text));
  };
}

function exportedNames(lines) {
  const names = new Set();
  const text = lines.join("\n");
  // Function and class exports name one binding each.
  for (const m of text.matchAll(/export\s+(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
  for (const m of text.matchAll(/export\s+class\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
  // Multi-declarator exports (`export const A = 1,\n  B = 2`) export EVERY
  // declarator in the statement - matched to the terminating semicolon so
  // wrapped lines count; masked strings are spaces, so no false captures.
  for (const m of text.matchAll(/export\s+(?:const|let|var)\s+([^;]+);/g)) {
    // The identifier may carry a type annotation before its `=`.
    for (const d of m[1].matchAll(/([A-Za-z_$][\w$]*)\s*(?::[^=;]+)?=/g)) names.add(d[1]);
  }
  for (const m of text.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const part of m[1].split(",")) {
      const local = part.split(/\s+as\s+/)[0].trim().replace(/^\s*type\s+/, "");
      if (local && local !== "default") names.add(local);
    }
  }
  return names;
}

function checkDeadExports(ctx, file, lines, model, importedNames, files) {
  if (isEntryFile(file) || file.endsWith(".d.ts")) return;
  const fileText = lines.join("\n");
  const inModule = new Map(model.bindings.map(b => [b.name, b]));
  for (const name of exportedNames(lines)) {
    // Re-exported imports (`export { x } from`) are not this check's finding.
    const binding = inModule.get(name);
    if (!binding) continue;
    if (isUsed(binding)) continue; // used locally
    if (importedNames(name)) continue; // consumed somewhere, from anywhere
    // Whole-word occurrence beyond its own declaration (type positions,
    // dynamic use) masks the finding - precision first.
    const occurrences = fileText.split(new RegExp(`\\b${escapeRe(name)}\\b`)).length - 1;
    if (occurrences > 1) continue;
    ctx.report.finding({ rule: "export-without-any-consumer", file, line: binding.line });
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
  const fileText = lines.join("\n");
  for (const b of model.bindings) {
    if (b.kind !== "ImportBinding") continue;
    if (isUsed(b)) continue;
    // A name occurring anywhere else (type position, JSX, comments) is not
    // a finding - only a specifier with no trace at all is dead.
    const occurrences = fileText.split(new RegExp(`\\b${escapeRe(b.name)}\\b`)).length - 1;
    if (occurrences > 1) continue;
    ctx.report.finding({ rule: "named-import-without-reference", file, line: b.line });
  }
}

function checkUnreadLocals(ctx, file, lines, model) {
  const fileText = lines.join("\n");
  const exportedSet = exportedNames(lines);
  for (const b of model.bindings) {
    if (b.kind !== "Variable") continue;
    if (isUsed(b)) continue;
    if (exportedSet.has(b.name)) continue;
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
