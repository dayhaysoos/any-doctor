import * as fs from "fs";
import * as path from "path";
import { copyToClipboard } from "./clipboard.js";
import { Finding, JoinedFinding, ReportGroup, resolveFinding, runCommandFor, Severity } from "./contract.js";
import { scoreFromFileHealth } from "./score.js";
import { processTtyEnv } from "./tty.js";
import * as tty from "./tty.js";
import { runTty, truncateVisible, TtyStdin, TtyStdout, visibleWidth } from "./tty.js";

import { BOLD, colorizer, DIM, GLYPH, gradeColor, GREEN, ORANGE, RESET, SEVERITY_COLOR, YELLOW } from "./palette.js";
import { RunOutcome, unsafeSkipLine } from "./report.js";

const SPLIT_MIN_COLS = 100;

const TOKEN_RE = /(\/\/.*$)|('(?:[^'\\]|\\.)*'|"(?:[^'\\]|\\.)*"|`(?:[^`\\]|\\.)*`)|\b(const|let|var|function|return|if|else|for|while|await|async|try|catch|finally|import|export|from|new|class|extends|throw|typeof|instanceof|in|of|do|switch|case|break|continue|default|yield)\b|\b(\d+(?:\.\d+)?)\b/g;

export function highlightCode(line: string, useColor: boolean): string {
  if (!useColor) return line;
  return line.replace(TOKEN_RE, (m, comment, str, kw, num) => {
    if (comment) return DIM + m + RESET;
    if (str) return "\x1b[38;5;114m" + m + RESET;
    if (kw) return "\x1b[38;5;75m" + m + RESET;
    if (num) return ORANGE + m + RESET;
    return m;
  });
}

// A JoinedFinding pinned to one dashboard row: the join supplies every
// field; site replaces finding for the frame code.
export type SiteFinding = { readKey: string; site: Finding } & Omit<JoinedFinding, "finding">;

export interface DashboardInput {
  // The whole batch result; the dashboard renders the same truth as the
  // report — groups, skips, counts, and the scanned target all come from
  // the outcome, with no per-field re-assembly.
  outcome: RunOutcome;
  invoker?: string;
  useColor: boolean;
}

export function scoreBar(score: number, width: number): string {
  const filled = Math.round((score / 100) * width);
  return "█".repeat(filled) + "░".repeat(Math.max(0, width - filled));
}

export function buildItems(groups: ReportGroup[]): SiteFinding[] {
  const items: SiteFinding[] = [];
  for (const g of groups) {
    for (const f of g.findings) {
      const j = resolveFinding(g.meta, f);
      items.push({ ...j, readKey: j.checkKey + "@" + f.file + ":" + f.line, site: f });
    }
  }
  return items;
}

// ---- copy prompts ----
//
// Enter copies the selected finding; `c` copies at whatever level the
// selection rests on — one finding, a whole check (the overarching
// explanation plus every site), or an entire doctor. The bulk prompt is
// the natural agent task: "fix this pattern everywhere it appears."

function promptHeading(severity: Severity, description: string, checkKey: string): string {
  return `${severity.toUpperCase()} · ${description} (${checkKey})`;
}

function scopeTail(scopeLine: string, verifyCommand: string, plural = false): string[] {
  return [
    "",
    "Scope:",
    scopeLine,
    `- Fix the root cause; do not suppress, disable, or silence ${plural ? "any of these checks" : "the check"}.`,
    "- Keep unrelated refactors out of this pass.",
    "",
    `Verify with \`${verifyCommand}\` and confirm the finding${plural ? "s are" : " is"} gone before moving on.`,
  ];
}

export function fixPrompt(item: SiteFinding, verifyCommand: string): string {
  const site = item.site;
  const lines: string[] = [
    "Fix exactly one any-doctor finding:",
    "",
    promptHeading(item.severity, item.description, item.checkKey),
    "",
    `Affected site: ${site.file}:${site.line}`,
  ];
  if (item.impact) lines.push("", "Impact " + item.impact);
  if (item.why) lines.push("", "Why " + item.why);
  if (item.fix) lines.push("", "Suggested fix: " + item.fix);
  lines.push(...scopeTail(`- Fix only ${item.checkKey} at this site.`, verifyCommand));
  return lines.join("\n");
}

// The re-scan loop is the pagination for display; a copied task still
// lists generously, then defers the remainder to the next run.
const PROMPT_SITES_CAP = 100;

function sitesOf(items: SiteFinding[], cap: number): { lines: string[]; hidden: number } {
  const shown = items.slice(0, cap);
  return {
    lines: shown.map(i => `- ${i.site.file}:${i.site.line}`),
    hidden: items.length - shown.length,
  };
}

function pushSites(lines: string[], sites: { lines: string[]; hidden: number }): void {
  lines.push(...sites.lines);
  if (sites.hidden > 0) {
    lines.push(`- … and ${sites.hidden} more — fix this batch, then re-run for the rest`);
  }
}

export function checkFixPrompt(items: SiteFinding[], verifyCommand: string): string {
  const check = summarizeCheck(items[0].checkKey, items);
  const lines: string[] = [
    "Fix every finding of one any-doctor check:",
    "",
    promptHeading(check.severity, check.description, check.checkKey),
    "",
    `${check.count} finding${check.count === 1 ? "" : "s"} across ${check.files} file${check.files === 1 ? "" : "s"}:`,
  ];
  pushSites(lines, sitesOf(items, PROMPT_SITES_CAP));
  if (check.impact) lines.push("", "Impact " + check.impact);
  if (check.why) lines.push("", "Why " + check.why);
  if (check.fix) lines.push("", "Suggested fix: " + check.fix);
  lines.push(...scopeTail(`- Fix ${check.checkKey} at every listed site — as many as practical in one pass.`, verifyCommand, true));
  return lines.join("\n");
}

// Doctor prompts list generously per check but not boundlessly; the
// re-run note carries the remainder.
const DOCTOR_PROMPT_SITES_PER_CHECK = 25;

export function doctorFixPrompt(doc: DoctorSummary, group: DoctorGroup | undefined, verifyCommand: string): string {
  const lines: string[] = [
    "Fix the findings of one any-doctor program:",
    "",
    `${doc.worst.toUpperCase()} · ${doc.doctorId} — ${doc.count} finding${doc.count === 1 ? "" : "s"} across ${doc.files} file${doc.files === 1 ? "" : "s"}`,
  ];
  for (const g of group?.checks ?? []) {
    {
      const summary = summarizeCheck(g.checkKey, g.items);
      lines.push(
        "",
        `${summary.severity.toUpperCase()} · ${summary.description} (${summary.checkKey}) — ${summary.count} finding${summary.count === 1 ? "" : "s"}`,
      );
      if (summary.why) lines.push("Why " + summary.why);
      if (summary.fix) lines.push("Suggested fix: " + summary.fix);
      pushSites(lines, sitesOf(g.items, DOCTOR_PROMPT_SITES_PER_CHECK));
    }
  }
  lines.push(...scopeTail(`- Fix every check of ${doc.doctorId} at the listed sites — as many as practical in one pass.`, verifyCommand, true));
  return lines.join("\n");
}

function padVisible(s: string, width: number): string {
  return s + " ".repeat(Math.max(0, width - visibleWidth(s)));
}

function wordWrap(text: string, width: number): string[] {
  if (!text) return [];
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (!current) { current = word; continue; }
    if (current.length + 1 + word.length <= width) current += " " + word;
    else { lines.push(current); current = word; }
  }
  if (current) lines.push(current);
  return lines;
}

// Fixed chrome around the body: 4 header lines, 2 blank spacers, 2 footer
// lines (the notice line is always reserved), plus the bottom terminal row,
// which is never written so no repaint can make the terminal scroll.
const CHROME_ROWS = 9;

export interface DashboardLayout {
  mode: "split" | "stacked";
  listWidth: number;
  detailWidth: number;
  listHeight: number;
  detailHeight: number;
  bodyRows: number;
}

export function resolveDashboardLayout(cols: number, rows: number, itemCount: number): DashboardLayout {
  const bodyRows = Math.max(1, rows - CHROME_ROWS);
  if (cols >= SPLIT_MIN_COLS) {
    const listWidth = Math.min(56, Math.max(32, Math.floor(cols * 0.44)));
    const detailWidth = cols - listWidth - 2;
    return { mode: "split", listWidth, detailWidth, listHeight: bodyRows, detailHeight: bodyRows, bodyRows };
  }
  const listHeight = Math.min(Math.max(2, Math.ceil(bodyRows * 0.4)), Math.max(1, itemCount));
  return {
    mode: "stacked",
    listWidth: cols,
    detailWidth: cols,
    listHeight,
    detailHeight: Math.max(1, bodyRows - listHeight - 2),
    bodyRows,
  };
}

// ---- the doctor tree ----
//
// The tree is the module's load-bearing shape: doctor -> checks ->
// findings, ordered for triage (worst severity first, count descending).
// It is computed once from the immutable items and named; every consumer
// — expansion defaults, row flattening, group prompts, the detail pane —
// flattens or reads it without rebuilding it.

export type RowKind = "section" | "check" | "item" | "more";

export interface DoctorSummary {
  doctorId: string;
  description: string;
  worst: Severity;
  count: number;
  files: number;
  checks: { description: string; severity: Severity; count: number }[];
  blindSpots?: string[];
}

export interface CheckSummary {
  checkKey: string;
  checkId: string;
  doctorId: string;
  description: string;
  severity: Severity;
  impact?: string;
  why?: string;
  fix?: string;
  blindSpots?: string[];
  count: number;
  files: number;
}

export interface DoctorGroup {
  doctorId: string;
  checks: { checkKey: string; items: SiteFinding[] }[];
  multiCheck: boolean;
  count: number;
  worst: Severity;
}

export type DoctorTree = DoctorGroup[];

// The re-scan loop is the pagination: a check shows its first N findings,
// then an affordance to fix a few and run again.
export const FINDINGS_PER_CHECK = 50;

const SEVERITY_RANK: Record<Severity, number> = { error: 0, warning: 1, info: 2 };

export function buildTree(items: SiteFinding[]): DoctorTree {
  const doctors: DoctorGroup[] = [];
  const byDoctor = new Map<string, Map<string, SiteFinding[]>>();
  for (const it of items) {
    let checks = byDoctor.get(it.doctorId);
    if (!checks) {
      checks = new Map();
      byDoctor.set(it.doctorId, checks);
      doctors.push({ doctorId: it.doctorId, checks: [], multiCheck: false, count: 0, worst: "info" });
    }
    const group = checks.get(it.checkKey) ?? [];
    group.push(it);
    checks.set(it.checkKey, group);
  }
  for (const d of doctors) {
    const entries = [...byDoctor.get(d.doctorId)!.entries()].map(([checkKey, list]) => ({
      checkKey,
      items: [...list].sort((a, b) => a.site.file === b.site.file
        ? a.site.line - b.site.line
        : a.site.file < b.site.file ? -1 : 1),
    }));
    d.checks = entries.sort((a, b) => {
      const sa = SEVERITY_RANK[a.items[0].declaredSeverity];
      const sb = SEVERITY_RANK[b.items[0].declaredSeverity];
      return sa !== sb ? sa - sb : b.items.length - a.items.length || (a.checkKey < b.checkKey ? -1 : 1);
    });
    d.multiCheck = entries.length > 1;
    d.count = entries.reduce((n, g) => n + g.items.length, 0);
    d.worst = entries.reduce((w, g) => (
      SEVERITY_RANK[g.items[0].severity] < SEVERITY_RANK[w] ? g.items[0].severity : w
    ), "info" as Severity);
  }
  // Triage order: worst severity first, then most findings, then name.
  return doctors.sort((a, b) =>
    SEVERITY_RANK[a.worst] - SEVERITY_RANK[b.worst]
    || b.count - a.count
    || (a.doctorId < b.doctorId ? -1 : 1));
}

export function summarizeCheck(checkKey: string, groupItems: SiteFinding[]): CheckSummary {
  const first = groupItems[0];
  const files = new Set(groupItems.map(i => i.site.file));
  return {
    checkKey,
    checkId: first.checkId,
    doctorId: first.doctorId,
    description: first.description,
    severity: first.declaredSeverity,
    impact: first.impact,
    why: first.why,
    fix: first.fix,
    blindSpots: first.blindSpots,
    count: groupItems.length,
    files: files.size,
  };
}

export function summarizeDoctor(d: DoctorGroup): DoctorSummary {
  const first = d.checks[0]?.items[0];
  const files = new Set<string>();
  for (const g of d.checks) for (const i of g.items) files.add(i.site.file);
  return {
    doctorId: d.doctorId,
    description: first ? first.description : d.doctorId,
    worst: d.worst,
    count: d.count,
    files: files.size,
    checks: d.checks.map(g => ({
      description: g.items[0].description,
      severity: g.items[0].declaredSeverity,
      count: g.items.length,
    })),
    blindSpots: first?.blindSpots,
  };
}

// Errors open on entry: any doctor carrying error findings, any
// error-severity check, and the top of the list so the first screen is
// never an empty overview. Everything else starts collapsed.
export function initialExpanded(tree: DoctorTree): Set<string> {
  const expanded = new Set<string>();
  const multiDoctor = tree.length > 1;
  tree.forEach((d, i) => {
    if (multiDoctor && (d.worst === "error" || i === 0)) expanded.add(d.doctorId);
    if (!d.multiCheck) return;
    for (const g of d.checks) {
      if (g.items[0].declaredSeverity === "error") expanded.add(g.checkKey);
    }
  });
  return expanded;
}

// A row references the object it was built from — item, check summary, or
// doctor summary — so consumers never index back into the items array.
// "more" rows carry their group's payload (informative detail, copyable
// via c) but never toggle: inertness is a property of carrying no
// toggleKey, not an accident of the handler.
interface ListRow {
  kind: RowKind;
  text: string;
  severity: Severity;
  selectable: boolean;
  item?: SiteFinding;
  check?: CheckSummary;
  doctor?: DoctorSummary;
  toggleKey?: string;
}

// The one way to ask what a row toggles — doctor rows answer their
// doctorId, check rows their checkKey, everything else nothing.
function toggleKeyOf(row: ListRow | undefined): string | undefined {
  return row?.toggleKey;
}

export function buildListRows(
  tree: DoctorTree,
  useColor: boolean,
  selectedRow: number,
  readKeys: Set<string>,
  expanded?: ReadonlySet<string>,
): ListRow[] {
  const c = colorizer(useColor);
  const open = expanded ?? new Set<string>();
  const multiDoctor = tree.length > 1;
  const rows: ListRow[] = [];

  for (const d of tree) {
    if (!multiDoctor) {
      rows.push({
        kind: "section",
        text: c(d.doctorId, BOLD),
        severity: d.worst,
        selectable: false,
      });
    } else {
      // The dashboard is the selection surface: every doctor is a
      // collapsible row, severity-ordered, with its total count.
      const summary = summarizeDoctor(d);
      const rowIndex = rows.length;
      const isOpen = open.has(d.doctorId);
      rows.push({
        kind: "section",
        text: `${selectedRow === rowIndex ? c("›", BOLD) : " "}${c(isOpen ? "▾" : "▸", DIM)} ${c(GLYPH[summary.worst], SEVERITY_COLOR[summary.worst])} ${c(summary.doctorId, BOLD)} ${c("×" + summary.count, DIM)}`,
        severity: summary.worst,
        selectable: true,
        doctor: summary,
        toggleKey: d.doctorId,
      });
      if (!isOpen) continue;
    }

    // Children of a doctor row: checks for multi-check doctors, capped
    // flat findings for single-check ones. Tree connectors make the
    // hierarchy structural — and they follow the DOCTOR's shape, not the
    // frame's: one multi-check doctor run directly nests exactly like the
    // aggregate. Only a single-check doctor alone in a single-doctor
    // frame is flat.
    const nested = multiDoctor || d.multiCheck;
    const childPrefix = (ci: number, last: number): string =>
      nested ? (ci < last ? "  \u251c\u2500 " : "  \u2514\u2500 ") : multiDoctor ? "  " : "";
    const guidePrefix = (ci: number, last: number): string =>
      nested ? (ci < last ? "  \u2502    " : "       ") : multiDoctor ? "  " : "";

    if (!d.multiCheck) {
      // Flat findings, capped like checks; the re-scan loop is the
      // pagination.
      const all = d.checks[0].items;
      const flat = all.slice(0, FINDINGS_PER_CHECK);
      flat.forEach((it, ci) => {
        const rowIndex = rows.length;
        rows.push({
          kind: "item",
          text: childPrefix(ci, flat.length - 1 + (all.length > flat.length ? 1 : 0)) + itemRowText(it, selectedRow === rowIndex, readKeys, c, !multiDoctor),
          severity: it.severity,
          selectable: true,
          item: it,
        });
      });
      if (all.length > flat.length) {
        const moreRowIndex = rows.length;
        rows.push({
          kind: "more",
          // The payload makes selecting this row informative (the doctor's
          // story) instead of a blank detail pane, and lets `c` copy the
          // group task from here like from the check row.
          text: childPrefix(flat.length, flat.length) + `${selectedRow === moreRowIndex ? c("›", BOLD) + " " : ""}${c("… and " + (all.length - flat.length) + " more — fix a few and re-scan", DIM)}`,
          severity: d.worst,
          selectable: true,
          doctor: summarizeDoctor(d),
        });
      }
      continue;
    }

    d.checks.forEach((g, ci) => {
      const summary = summarizeCheck(g.checkKey, g.items);
      const checkRowIndex = rows.length;
      const isOpen = open.has(g.checkKey);
      const arrow = isOpen ? "\u25be" : "\u25b8";
      rows.push({
        kind: "check",
        text: childPrefix(ci, d.checks.length - 1)
          + `${selectedRow === checkRowIndex ? c("›", BOLD) : " "}${c(arrow, DIM)} ${c(GLYPH[summary.severity], SEVERITY_COLOR[summary.severity])} ${c(summary.description, selectedRow === checkRowIndex ? BOLD : undefined)} ${c("×" + summary.count, DIM)}`,
        severity: summary.severity,
        selectable: true,
        check: summary,
        toggleKey: g.checkKey,
      });

      if (!isOpen) return;
      const shown = g.items.slice(0, FINDINGS_PER_CHECK);
      shown.forEach(it => {
        const rowIndex = rows.length;
        rows.push({
          kind: "item",
          text: guidePrefix(ci, d.checks.length - 1) + itemRowText(it, selectedRow === rowIndex, readKeys, c, false),
          severity: it.severity,
          selectable: true,
          item: it,
        });
      });
      if (g.items.length > shown.length) {
        const moreRowIndex = rows.length;
        rows.push({
          kind: "more",
          text: guidePrefix(ci, d.checks.length - 1) + `${selectedRow === moreRowIndex ? c("›", BOLD) + " " : ""}${c("… and " + (g.items.length - shown.length) + " more — fix a few and re-scan", DIM)}`,
          severity: summary.severity,
          selectable: true,
          check: summary,
        });
      }
    });
  }
  return rows;
}

function itemRowText(
  it: SiteFinding,
  isSelected: boolean,
  readKeys: Set<string>,
  c: (s: string, wrap?: string) => string,
  showCheckId = true,
): string {
  const isRead = readKeys.has(it.readKey);
  const glyph = c(GLYPH[it.severity], SEVERITY_COLOR[it.severity]);
  const wrap = isSelected ? BOLD : isRead ? DIM : undefined;
  const suffix = showCheckId && it.checkId !== it.doctorId ? c("  " + it.checkId, DIM) : "";
  return `${isSelected ? c("›", BOLD) : " "}${glyph} ${c(it.site.file + ":" + it.site.line, wrap)}${suffix}`;
}

export interface FrameSource {
  (file: string): string[] | null;
}

export interface DashboardFrameState {
  tree: DoctorTree;
  selectedRow: number;
  readKeys: Set<string>;
  readSource: FrameSource;
  expanded?: ReadonlySet<string>;
  fileCount: number;
  durationMs: number;
  useColor: boolean;
  notice?: string;
  skippedUnsafe?: string[];
  cols: number;
  rows: number;
}

export function dashboardFrame(state: DashboardFrameState): string {
  const { tree, selectedRow, readKeys, useColor, cols, rows } = state;
  const c = colorizer(useColor);
  const findings = tree.flatMap(d => d.checks.flatMap(g => g.items));
  const layout = resolveDashboardLayout(cols, rows, findings.length);
  const { score, grade, filesClean } = scoreFromFileHealth(
    findings.map(it => ({ file: it.site.file, severity: it.severity })),
    state.fileCount,
  );
  const barWidth = Math.min(46, Math.max(16, cols - 60));

  const header: string[] = [
    c(`Score: ${score} / 100 — ${grade}`, BOLD + gradeColor(score)),
    c(scoreBar(score, barWidth), gradeColor(score)),
    c(`${findings.length} finding${findings.length === 1 ? "" : "s"} · ${filesClean}/${state.fileCount} files clean · ${state.durationMs}ms`, DIM),
  ];
  if (state.skippedUnsafe !== undefined && state.skippedUnsafe.length > 0) {
    header.push(c(`\u26a0 ${unsafeSkipLine(state.skippedUnsafe)}`, YELLOW));
  }
  header.push("");

  const rowsData = buildListRows(tree, useColor, selectedRow, readKeys, state.expanded);
  const viewport = Math.max(1, Math.min(layout.listHeight, layout.bodyRows));
  let firstVisible = Math.max(0, Math.min(selectedRow - viewport + 1, Math.max(0, rowsData.length - viewport)));
  if (selectedRow >= 0 && selectedRow < firstVisible) firstVisible = selectedRow;
  const visibleRows = rowsData.slice(firstVisible, firstVisible + viewport);
  const listLines: string[] = [];
  for (const row of visibleRows) {
    listLines.push(truncateVisible(row.text, layout.listWidth));
  }
  while (listLines.length < viewport) listLines.push("");

  const detail: string[] = [];
  const selRow = rowsData[selectedRow];
  if (selRow?.item) {
    const sel = selRow.item;
    detail.push(c(`${sel.site.file}:${sel.site.line}`, BOLD));
    detail.push(c(`${cap(sel.category)} · ${sel.severity}`, DIM));
    detail.push("");
    const impact = sel.impact ?? sel.description;
    for (const l of wordWrap(impact, layout.detailWidth - 2)) detail.push(c(l, SEVERITY_COLOR[sel.severity]));
    detail.push("");
    proseSection(detail, "Why", sel.why ?? "Not documented for this check.", layout.detailWidth - 2, c);
    detail.push("");
    detail.push(c("Code", DIM));
    for (const l of codeFrameLines(state.readSource(sel.site.file), sel.site.line, layout.detailWidth - 2, useColor)) detail.push("  " + l);
    detail.push("");
    if (sel.fix) proseSection(detail, "Fix", sel.fix, layout.detailWidth - 2, c);
    detail.push(...blindSpotLines(sel.blindSpots, layout.detailWidth - 2, c));
  } else if (selRow?.doctor) {
    const d = selRow.doctor;
    detail.push(c(d.doctorId, BOLD));
    detail.push(c(`${d.count} finding${d.count === 1 ? "" : "s"} across ${d.files} file${d.files === 1 ? "" : "s"} · worst ${d.worst}`, DIM));
    detail.push("");
    for (const ck of d.checks) {
      detail.push(`${c(GLYPH[ck.severity], SEVERITY_COLOR[ck.severity])} ${c(ck.description, d.checks.length > 1 ? BOLD : undefined)} ${c("×" + ck.count, DIM)}`);
    }
    detail.push(...blindSpotLines(d.blindSpots, layout.detailWidth - 2, c));
  } else if (selRow?.check) {
    // A check row (or its "… and N more" affordance) tells the check's
    // story: what it catches, why it matters, how to fix it, and the
    // blast radius.
    const s = selRow.check;
    detail.push(c(s.checkKey, BOLD));
    detail.push(c(`${s.count} finding${s.count === 1 ? "" : "s"} across ${s.files} file${s.files === 1 ? "" : "s"} · ${s.severity}`, DIM));
    detail.push("");
    for (const l of wordWrap(s.description, layout.detailWidth - 2)) detail.push(c(l, SEVERITY_COLOR[s.severity]));
    if (s.impact) {
      detail.push("");
      proseSection(detail, "Impact", s.impact, layout.detailWidth - 2, c);
    }
    if (s.why) {
      detail.push("");
      proseSection(detail, "Why", s.why, layout.detailWidth - 2, c);
    }
    if (s.fix) {
      detail.push("");
      proseSection(detail, "Fix", s.fix, layout.detailWidth - 2, c);
    }
    detail.push(...blindSpotLines(s.blindSpots, layout.detailWidth - 2, c));
  }

  // The body always renders exactly layout.bodyRows lines so the frame
  // height is constant (rows - 1) in every state.
  const body: string[] = [];
  if (layout.mode === "split") {
    for (let i = 0; i < layout.bodyRows; i++) {
      body.push(padVisible(truncateVisible(listLines[i] ?? "", layout.listWidth), layout.listWidth) + "  " + (detail[i] ?? ""));
    }
  } else {
    const stacked: string[] = [
      ...listLines,
      "",
      c("─".repeat(Math.max(10, Math.min(cols - 2, 80))), DIM),
      ...detail,
    ];
    for (let i = 0; i < layout.bodyRows; i++) body.push(stacked[i] ?? "");
  }

  // Fixed-shape footer: the notice line is always present (blank when idle)
  // so showing or clearing a notice never changes the frame height.
  const footer: string[] = [
    state.notice ? c("✔ " + state.notice, GREEN) : "",
    c("↑↓ move · →← expand · enter copy finding · c copy group · q quit", DIM),
  ];

  return [...header, "", ...body, "", ...footer].join("\n");
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// The shared tail of every detail story: a labeled prose section and the
// blind-spot footnote. The item, check, and doctor branches differ in
// their headers and rollups, not in how prose renders.
function proseSection(detail: string[], label: string, text: string, width: number, c: (s: string, wrap?: string) => string): void {
  detail.push(c(label, DIM));
  for (const l of wordWrap(text, width)) detail.push("  " + l);
}

function blindSpotLines(blindSpots: string[] | undefined, width: number, c: (s: string, wrap?: string) => string): string[] {
  if (!blindSpots || blindSpots.length === 0) return [];
  return wordWrap("blind spots: " + blindSpots.join("; "), width).map(l => c("  " + l, DIM));
}

function codeFrameLines(source: string[] | null, line: number, width: number, useColor: boolean): string[] {
  const c = colorizer(useColor);
  const out: string[] = [];
  if (source === null) {
    out.push(c("  (source unavailable)", DIM));
    return out;
  }
  const from = Math.max(0, line - 3);
  const to = Math.min(source.length, line + 2);
  for (let i = from; i < to; i++) {
    const marker = i === line - 1 ? c(">  ", BOLD) : "   ";
    const num = c(String(i + 1).padStart(3), DIM);
    const text = truncateVisible(source[i] ?? "", Math.max(10, width));
    out.push(`${marker} ${num} │ ${highlightCode(text, useColor)}`);
  }
  return out;
}

export async function runDashboard(input: DashboardInput): Promise<void> {
  await runDashboardOn(processTtyEnv(), input);
}

export interface DashboardDeps {
  copy?: (text: string) => boolean;
}

export async function runDashboardOn(env: { stdin: TtyStdin; stdout: TtyStdout }, input: DashboardInput, deps: DashboardDeps = {}): Promise<void> {
  const { stdout } = env;
  if (!tty.canRunTui(env)) return;

  const useColor = input.useColor;
  // The tree is computed once from immutable items; everything downstream
  // — rows, prompts, expansion, detail — reads this frozen shape.
  const tree = buildTree(buildItems(input.outcome.groups));
  const expanded = initialExpanded(tree);
  const readKeys = new Set<string>();
  let notice: string | undefined;

  const currentRows = () => buildListRows(tree, useColor, selectedRow, readKeys, expanded);
  let selectedRow = (() => {
    const rows = buildListRows(tree, useColor, 0, new Set<string>(), expanded);
    const first = rows.findIndex(r => r.selectable);
    return first === -1 ? 0 : first;
  })();

  // A review session re-reads the same files on every selection; caching
  // keeps keypresses off the disk (the frame shows the session-start view).
  const sourceCache = new Map<string, string[] | null>();
  const readSource: FrameSource = (file) => {
    if (sourceCache.has(file)) return sourceCache.get(file)!;
    let lines: string[] | null = null;
    try {
      lines = fs.readFileSync(path.resolve(input.outcome.targetDir, file), "utf8").split("\n");
    } catch {
      lines = null;
    }
    sourceCache.set(file, lines);
    return lines;
  };

  const verifyCmdFor = (doctorId: string): string => {
    const doctorPath = input.outcome.doctorPaths.get(doctorId);
    if (doctorPath === undefined) return "(doctor path unknown — re-run from the CLI)";
    return runCommandFor(doctorPath, input.outcome.targetDir, input.invoker);
  };

  const copy = (text: string, what: string): void => {
    notice = (deps.copy ?? copyToClipboard)(text)
      ? `${what} — paste into your agent`
      : "clipboard unavailable";
  };

  const frame = (): string => {
    try {
      const selRow = currentRows()[selectedRow];
      if (selRow?.item) readKeys.add(selRow.item.readKey);
      return dashboardFrame({
        tree,
        selectedRow,
        readKeys,
        readSource,
        expanded,
        fileCount: input.outcome.fileCount,
        durationMs: input.outcome.durationMs,
        useColor,
        notice,
        skippedUnsafe: input.outcome.skippedUnsafe,
        cols: stdout.columns || 120,
        rows: stdout.rows || 34,
      });
    } catch (e) {
      const err = e as Error;
      return "DASHBOARD RENDER ERROR — the view is frozen, press q to quit.\n"
        + "Send a screenshot of this to the maintainer:\n\n"
        + String(err && err.stack ? err.stack : err);
    }
  };

  const step = (dir: 1 | -1): void => {
    const rows = currentRows();
    let next = selectedRow + dir;
    while (next >= 0 && next < rows.length && !rows[next].selectable) next += dir;
    if (next >= 0 && next < rows.length) selectedRow = next;
    notice = undefined;
  };

  await runTty<void>({
    stdin: env.stdin,
    stdout,
    frame,
    onKey: (key, finish) => {
      if (key === "q" || key === "\x03" || key === "esc") return finish();
      if (key === "ignore") return;
      if (key === "up" || key === "k") return step(-1);
      if (key === "down" || key === "j") return step(1);
      const rows = currentRows();
      const row = rows[selectedRow];
      const rowKey = toggleKeyOf(row);

      if (key === "c") {
        // Copy at the level you're on: one finding, a whole check, or an
        // entire doctor — the bulk task is the natural agent unit.
        if (row?.item) {
          copy(fixPrompt(row.item, verifyCmdFor(row.item.doctorId)), "copied finding");
        } else if (row?.check) {
          const check = row.check;
          const items = tree.find(d => d.doctorId === check.doctorId)
            ?.checks.find(g => g.checkKey === check.checkKey)?.items ?? [];
          copy(checkFixPrompt(items, verifyCmdFor(check.doctorId)),
            `copied ${items.length} findings from ${check.checkKey}`);
        } else if (row?.doctor) {
          const doctor = row.doctor;
          const group = tree.find(d => d.doctorId === doctor.doctorId);
          copy(doctorFixPrompt(doctor, group, verifyCmdFor(doctor.doctorId)),
            `copied ${doctor.count} findings from ${doctor.doctorId}`);
        }
        return;
      }

      if (key === "right") {
        if (rowKey) expanded.add(rowKey);
        notice = undefined;
        return;
      }
      if (key === "left" || key === "\x7f" || key === "\b") {
        // Back climbs one level: a finding collapses to its check, a
        // check (or anything beneath a collapsed toggle) collapses to its
        // doctor — landing on the parent so you can select through again.
        const collapseUp = (from: number): void => {
          let i = from;
          while (i >= 0 && toggleKeyOf(rows[i]) === undefined) i--;
          if (i < 0) return;
          const toggleKey = toggleKeyOf(rows[i])!;
          if (expanded.has(toggleKey)) {
            expanded.delete(toggleKey);
            selectedRow = i;
            return;
          }
          // Already collapsed (we're ON it): climb to its parent toggle.
          let j = i - 1;
          while (j >= 0 && toggleKeyOf(rows[j]) === undefined) j--;
          if (j < 0) return;
          expanded.delete(toggleKeyOf(rows[j])!);
          selectedRow = j;
        };
        collapseUp(selectedRow);
        notice = undefined;
        return;
      }
      if (key === "\r" || key === "\n") {
        if (rowKey !== undefined) {
          if (expanded.has(rowKey)) expanded.delete(rowKey);
          else expanded.add(rowKey);
          notice = undefined;
          return;
        }
        if (!row?.item) return;
        copy(fixPrompt(row.item, verifyCmdFor(row.item.doctorId)), "copied finding");
        return;
      }
    },
  });
}
