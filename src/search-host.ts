import * as os from "os";
import * as path from "path";
import { includeTestsFor, isTestPath, Mode, SEARCH_REQUEST } from "./contract.js";
import { runEngineSearch, RawSgMatch } from "./engine.js";

// The search host: the doctor child cannot spawn (Confinement), so it asks
// any-doctor to run the Engine over a dedicated channel. This module is
// the host side — a pure function from request line to response JSON,
// directly testable without a real doctor child.
//
// The root check is a security decision: a run may search its target, a
// verify may search its fixture sandboxes under the temp dir, and meta may
// not search at all. The test-path filter is D18's law applied to this
// seam: the same isTestPath predicate the sdk walk uses, the same
// includeTestsFor derivation (run → flag, verify → everything).

export function searchBase(mode: Mode): string {
  switch (mode.kind) {
    // Verify sandboxes are seeded under the temp dir with this prefix —
    // not the whole temp dir, and nothing else in it.
    case "verify": return path.join(os.tmpdir(), "any-doctor-verify-");
    case "run": return mode.root;
    case "meta": return "";
  }
}

type Engine = typeof runEngineSearch;

// Bases are anchors: a run's target directory (anything beneath it), or
// verify's sandbox prefix (any any-doctor-verify-* sandbox). The prefix
// form ends in "-" on purpose — mkdtemp appends to it.
function withinBase(root: string, base: string): boolean {
  if (root === base) return true;
  if (base.endsWith("-")) return root.startsWith(base);
  return root.startsWith(base + path.sep);
}

// One request line in, one response body out (the SEARCH_RESULT sentinel
// is framing added by the transport in the runner). Returns null for lines
// that are not requests — the channel carries nothing else, so they are
// ignored rather than answered.
export function handleSearchLine(line: string, mode: Mode, engine: Engine = runEngineSearch): string | null {
  if (!line.startsWith(SEARCH_REQUEST)) return null;
  let req: { pattern?: unknown; language?: unknown; root?: unknown };
  try {
    req = JSON.parse(line.slice(SEARCH_REQUEST.length));
  } catch {
    return JSON.stringify({ error: "ctx.search failed: malformed host request" });
  }
  const base = searchBase(mode);
  // resolve() collapses `..` and anchors relatives — a prefix check on the
  // raw string would let /target/../../etc through.
  const root = typeof req.root === "string" ? path.resolve(req.root) : "";
  if (base === "" || !withinBase(root, base)) {
    return JSON.stringify({ error: "ctx.search failed: search root is outside the allowed target" });
  }
  const r = engine(String(req.pattern ?? ""), typeof req.language === "string" ? req.language : "TypeScript", root);
  if (!r.ok) return JSON.stringify({ error: r.error });
  const matches = includeTestsFor(mode) ? r.matches : r.matches.filter((m) => !isTestPath(matchRel(root, m)));
  return JSON.stringify({ matches });
}

// Engine paths arrive root-prefixed or already root-relative; either way
// the predicate answers on the path relative to the search root. A match
// with no file is unclassifiable and stays.
function matchRel(root: string, m: RawSgMatch): string {
  const f = m.file ?? "";
  return f.startsWith(root + path.sep) ? f.slice(root.length + 1) : f;
}
