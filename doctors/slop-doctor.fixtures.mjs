// Fixture law for this doctor: every exported symbol in a seed is consumed
// by src/index.ts (entry-shaped, exempt from dead-export), so incidental
// exports never leak findings into other checks' fixtures.

const consumes = (lines) => lines.join("\n");

export const fixtures = [
  // --- identical-helper-body-in-two-modules ---
  {
    name: "flags the same function body maintained in two modules",
    seed: {
      "src/slug-a.ts": [
        "export function generateSlug(name: string): string {",
        "  return name",
        "    .toLowerCase()",
        '    .replace(/[^a-z0-9]+/g, "-")',
        '    .replace(/^-|-$/g, "");',
        "}",
      ].join("\n"),
      "src/slug-b.ts": [
        "// Local copy for the settings pane",
        "export function generateSlug(name: string): string {",
        "  return name",
        "    .toLowerCase()",
        '    .replace(/[^a-z0-9]+/g, "-")',
        '    .replace(/^-|-$/g, "");',
        "}",
      ].join("\n"),
      "src/index.ts": consumes([
        'import { generateSlug as slugA } from "./slug-a";',
        'import { generateSlug as slugB } from "./slug-b";',
        "export function run(name: string) { return slugA(name) + slugB(name); }",
      ]),
    },
    expected: [
      { rule: "identical-helper-body-in-two-modules", file: "src/slug-a.ts", line: 1 },
      { rule: "identical-helper-body-in-two-modules", file: "src/slug-b.ts", line: 2 },
    ],
  },
  {
    name: "accepts same-named helpers with different bodies",
    seed: {
      "src/slug-a.ts": [
        "export function generateSlug(name: string): string {",
        '  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-");',
        "}",
      ].join("\n"),
      "src/slug-b.ts": [
        "export function generateSlug(title: string): string {",
        '  return title.trim().split(/\\s+/).join("-").toLowerCase();',
        "}",
      ].join("\n"),
      "src/index.ts": consumes([
        'import { generateSlug as slugA } from "./slug-a";',
        'import { generateSlug as slugB } from "./slug-b";',
        "export function run(name: string) { return slugA(name) + slugB(name); }",
      ]),
    },
    expected: [],
  },
  {
    name: "accepts trivial bodies and doctors/ directory copies",
    seed: {
      "src/trivial.ts": [
        "export function noop() {",
        "  return null;",
        "}",
      ].join("\n"),
      "src/other.ts": [
        "export function noop() {",
        "  return null;",
        "}",
      ].join("\n"),
      "doctors/copy.ts": [
        "export function realHelper(value: string): string {",
        "  return value",
        "    .toLowerCase()",
        '    .replace(/[^a-z0-9]+/g, "-")',
        '    .replace(/^-|-$/g, "");',
        "}",
      ].join("\n"),
      "doctors/other.ts": [
        "export function realHelper(value: string): string {",
        "  return value",
        "    .toLowerCase()",
        '    .replace(/[^a-z0-9]+/g, "-")',
        '    .replace(/^-|-$/g, "");',
        "}",
      ].join("\n"),
      "src/index.ts": consumes([
        'import { noop as a } from "./trivial";',
        'import { noop as b } from "./other";',
        'import { realHelper as c } from "../doctors/copy";',
        'import { realHelper as d } from "../doctors/other";',
        "export function run() { return [a(), b(), c(\"x\"), d(\"x\")]; }",
      ]),
    },
    expected: [],
  },

  // --- environment-guessed-from-hostname-substring ---
  {
    name: "flags environment routing from a hostname substring",
    seed: {
      "src/env.ts": [
        'const LOCAL_URL = "http://localhost:3000";',
        'const PROD_URL = "https://app.example.com";',
        "export function resolveAppUrl(backendUrl: string): string {",
        '  if (backendUrl.includes("localhost")) return LOCAL_URL;',
        "  return PROD_URL;",
        "}",
      ].join("\n"),
      "src/index.ts": consumes([
        'import { resolveAppUrl } from "./env";',
        "export function run(url: string) { return resolveAppUrl(url); }",
      ]),
    },
    expected: [{ rule: "environment-guessed-from-hostname-substring", file: "src/env.ts", line: 4 }],
  },
  {
    name: "accepts environment read from explicit configuration",
    seed: {
      "src/env.ts": [
        "export function resolveAppUrl(): string {",
        '  const origin = process.env.APP_ORIGIN;',
        '  if (!origin) throw new Error("APP_ORIGIN is required");',
        "  return origin;",
        "}",
      ].join("\n"),
      "src/index.ts": consumes([
        'import { resolveAppUrl } from "./env";',
        "export function run() { return resolveAppUrl(); }",
      ]),
    },
    expected: [],
  },

  // --- boolean-collapsed-into-three-state ---
  {
    name: "flags a nullish-defaulted boolean collapsed into a two-way ternary",
    seed: {
      "src/relocation.ts": [
        "export function normalize(rawInput: boolean | undefined, detected: boolean) {",
        "  const raw = rawInput ?? detected;",
        '  const status: "offered" | "not_offered" | "not_mentioned" =',
        '    raw === true ? "offered" : "not_mentioned";',
        "  return status;",
        "}",
      ].join("\n"),
      "src/index.ts": consumes([
        'import { normalize } from "./relocation";',
        "export function run(a: boolean | undefined, b: boolean) { return normalize(a, b); }",
      ]),
    },
    expected: [{ rule: "boolean-collapsed-into-three-state", file: "src/relocation.ts", line: 4 }],
  },
  {
    name: "accepts an explicit three-state branch",
    seed: {
      "src/relocation.ts": [
        "export function normalize(rawInput: boolean | undefined, detected: boolean) {",
        "  const raw = rawInput ?? detected;",
        '  const status: "offered" | "not_offered" | "not_mentioned" =',
        '    typeof rawInput === "boolean" ? (raw ? "offered" : "not_offered") : "not_mentioned";',
        "  return status;",
        "}",
      ].join("\n"),
      "src/index.ts": consumes([
        'import { normalize } from "./relocation";',
        "export function run(a: boolean | undefined, b: boolean) { return normalize(a, b); }",
      ]),
    },
    expected: [],
  },

  // --- prefix-overlapping-substring-match ---
  {
    name: "flags OR-chained substring literals that overlap by prefix",
    seed: {
      "src/attribution.ts": [
        "export function classify(token: string): boolean {",
        '  if (token.includes("referral") || token.includes("refer")) return true;',
        "  return false;",
        "}",
      ].join("\n"),
      "src/index.ts": consumes([
        'import { classify } from "./attribution";',
        "export function run(t: string) { return classify(t); }",
      ]),
    },
    expected: [{ rule: "prefix-overlapping-substring-match", file: "src/attribution.ts", line: 2 }],
  },
  {
    name: "accepts non-overlapping literals and word-bounded regexes",
    seed: {
      "src/attribution.ts": [
        "export function classify(token: string): boolean {",
        '  if (token.includes("referral") || token.includes("affiliate")) return true;',
        "  if (/\\brefer\\b/.test(token)) return true;",
        "  return false;",
        "}",
      ].join("\n"),
      "src/index.ts": consumes([
        'import { classify } from "./attribution";',
        "export function run(t: string) { return classify(t); }",
      ]),
    },
    expected: [],
  },

  // --- unanchored-abbreviation-regex ---
  {
    name: "flags a short unanchored case-insensitive stem used with .test()",
    seed: {
      "src/filter.ts": [
        "export function mentionsAi(text: string): boolean {",
        "  return /ai/i.test(text);",
        "}",
      ].join("\n"),
      "src/index.ts": consumes([
        'import { mentionsAi } from "./filter";',
        "export function run(t: string) { return mentionsAi(t); }",
      ]),
    },
    expected: [{ rule: "unanchored-abbreviation-regex", file: "src/filter.ts", line: 2 }],
  },
  {
    name: "accepts word-bounded and long patterns",
    seed: {
      "src/filter.ts": [
        "export function mentionsAi(text: string): boolean {",
        "  return /\\bai\\b/i.test(text);",
        "}",
        "export function mentionsOnboarding(text: string): boolean {",
        "  return /onboarding/i.test(text);",
        "}",
      ].join("\n"),
      "src/index.ts": consumes([
        'import { mentionsAi, mentionsOnboarding } from "./filter";',
        "export function run(t: string) { return mentionsAi(t) || mentionsOnboarding(t); }",
      ]),
    },
    expected: [],
  },

  // --- export-without-any-consumer (identity engine) ---
  {
    name: "flags an exported helper no file imports or references",
    seed: {
      "src/billing.ts": [
        "export function getPaidTiersForAudience(audience: string) {",
        '  return ["basic", "pro"];',
        "}",
      ].join("\n"),
      "src/index.ts": consumes([
        "export function run() { return 0; }",
      ]),
    },
    expected: [{ rule: "export-without-any-consumer", file: "src/billing.ts", line: 1 }],
  },
  {
    name: "accepts an exported helper imported by another module",
    seed: {
      "src/billing.ts": [
        "export function getPaidTiersForAudience(audience: string) {",
        '  return ["basic", "pro"];',
        "}",
      ].join("\n"),
      "src/index.ts": consumes([
        'import { getPaidTiersForAudience } from "./billing";',
        "export function run() { return getPaidTiersForAudience(\"pro\"); }",
      ]),
    },
    expected: [],
  },
  {
    name: "accepts an exported helper used within its own module",
    seed: {
      "src/billing.ts": [
        "export function getPaidTiersForAudience(audience: string) {",
        '  return ["basic", "pro"];',
        "}",
        "const defaultTiers = getPaidTiersForAudience(\"pro\");",
        "export function run() { return defaultTiers; }",
      ].join("\n"),
      "src/index.ts": consumes([
        'import { run } from "./billing";',
        "export function main() { return run(); }",
      ]),
    },
    expected: [],
  },
  {
    name: "entry-point files are exempt from dead-export",
    seed: {
      "src/cli.ts": [
        "export function main() {",
        "  return 0;",
        "}",
      ].join("\n"),
    },
    expected: [],
  },
  {
    name: "without the identity engine the check narrows to silence",
    seed: {
      "src/billing.ts": [
        "export function getPaidTiersForAudience(audience: string) {",
        '  return ["basic", "pro"];',
        "}",
      ].join("\n"),
    },
    expected: [],
    analysis: "off",
  },

  // --- named-import-without-reference (identity engine) ---
  {
    name: "flags a named import never referenced in its module",
    seed: {
      "src/ingestion.ts": [
        'import { hashExtensionToken, verifyToken } from "./tokens";',
        "export function verify(token: string): boolean {",
        "  return verifyToken(token);",
        "}",
      ].join("\n"),
      "src/tokens.ts": [
        "export function hashExtensionToken(t: string) { return t; }",
        "export function verifyToken(t: string) { return true; }",
      ].join("\n"),
      "src/index.ts": consumes([
        'import { verify } from "./ingestion";',
        "export function run(t: string) { return verify(t); }",
      ]),
    },
    expected: [{ rule: "named-import-without-reference", file: "src/ingestion.ts", line: 1 }],
  },
  {
    name: "accepts imports used in value or type positions",
    seed: {
      "src/ingestion.ts": [
        'import { TokenRecord, hashExtensionToken } from "./tokens";',
        "export function handle(record: TokenRecord) {",
        "  return hashExtensionToken(record.token);",
        "}",
      ].join("\n"),
      "src/tokens.ts": [
        "export interface TokenRecord { token: string }",
        "export function hashExtensionToken(t: string) { return t; }",
      ].join("\n"),
      "src/index.ts": consumes([
        'import { handle } from "./ingestion";',
        'export function run(r: { token: string }) { return handle(r); }',
      ]),
    },
    expected: [],
  },
  {
    name: "without the identity engine unused imports narrow to silence",
    seed: {
      "src/ingestion.ts": [
        'import { hashExtensionToken } from "./tokens";',
        "export function verify() { return true; }",
      ].join("\n"),
      "src/tokens.ts": [
        "export function hashExtensionToken(t: string) { return t; }",
      ].join("\n"),
    },
    expected: [],
    analysis: "off",
  },

  // --- unread-local-binding (identity engine) ---
  {
    name: "flags a never-read local constant",
    seed: {
      "src/rate-limit.ts": [
        "export const window = 15;",
        "const MAX_REQUESTS = 60;",
        "export function allow() { return window > 0; }",
      ].join("\n"),
      "src/index.ts": consumes([
        'import { allow } from "./rate-limit";',
        "export function run() { return allow(); }",
      ]),
    },
    expected: [{ rule: "unread-local-binding", file: "src/rate-limit.ts", line: 2 }],
  },
  {
    name: "accepts a read binding and exempts side-effect initializers",
    seed: {
      "src/rate-limit.ts": [
        "export const window = 15;",
        "const limit = window * 2;",
        "const warmed = warmCache();",
        "export function allow() { return limit > 0; }",
        "function warmCache() { return true; }",
      ].join("\n"),
      "src/index.ts": consumes([
        'import { allow } from "./rate-limit";',
        "export function run() { return allow(); }",
      ]),
    },
    expected: [],
  },
  {
    name: "without the identity engine unread locals narrow to silence",
    seed: {
      "src/rate-limit.ts": [
        "const MAX_REQUESTS = 60;",
        "export function allow() { return true; }",
      ].join("\n"),
      "src/index.ts": consumes([
        'import { allow } from "./rate-limit";',
        "export function run() { return allow(); }",
      ]),
    },
    expected: [],
    analysis: "off",
  },
];
