import * as fs from "fs";
import * as path from "path";
import { copyToClipboard } from "./clipboard.js";
import { Finding, JoinedFinding, ReportGroup, resolveFinding, runCommandFor, Severity } from "./contract.js";
import { scoreFromSeverities } from "./score.js";
import { processTtyEnv } from "./tty.js";
import * as tty from "./tty.js";
import { runTty, truncateVisible, TtyStdin, TtyStdout, visibleWidth } from "./tty.js";

export { truncateVisible, visibleWidth };

import { BOLD, colorizer, DIM, GLYPH, gradeColor, GREEN, ORANGE, RESET, SEVERITY_COLOR } from "./palette.js";

const SPLIT_MIN_COLS = 100;

const TOKEN_RE = /(\/\/.*$)|('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`)|\b(const|let|var|function|return|if|else|for|while|await|async|try|catch|finally|import|export|from|new|class|extends|throw|typeof|instanceof|in|of|do|switch|case|break|continue|default|yield)\b|\b(\d+(?:\.\d+)?)\b/g;

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
export type DashItem = { key: string; site: Finding } & Omit<JoinedFinding, "finding">;

export interface DashboardInput {
  root: string;
  groups: ReportGroup[];
  doctorFile: string;
  verifyCommand?: string;
  fileCount: number;
  durationMs: number;
  useColor: boolean;
}

export function scoreBar(score: number, width: number): string {
  const filled = Math.round((score / 100) * width);
  return "█".repeat(filled) + "░".repeat(Math.max(0, width - filled));
}

export function buildItems(groups: ReportGroup[]): DashItem[] {
  const items: DashItem[] = [];
  for (const g of groups) {
    for (const f of g.findings) {
      const j = resolveFinding(g.meta, f);
      items.push({ ...j, key: j.checkKey + "@" + f.file + ":" + f.line, site: f });
    }
  }
  return items;
}

export function issuePrompt(item: DashItem, verifyCommand: string): string {
  const site = item.site;
  const lines: string[] = [
    "Fix exactly one any-doctor check:",
    "",
    `${item.severity.toUpperCase()} · ${item.description} (${item.checkKey})`,
    "",
    `Affected site: ${site.file}:${site.line}`,
  ];
  if (item.impact) lines.push("", "Impact " + item.impact);
  if (item.why) lines.push("", "Why " + item.why);
  if (item.fix) lines.push("", "Suggested fix: " + item.fix);
  lines.push(
    "",
    "Scope:",
    `- Fix only ${item.checkKey} at this site.`,
    "- Fix the root cause; do not suppress, disable, or silence the check.",
    "- Keep unrelated refactors out of this pass.",
    "",
    `Verify with \`${verifyCommand}\` and confirm the finding is gone before moving on.`,
  );
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

// ---- the list tree ----
//
// A doctor's findings span one or more checks. Single-check doctors render
// flat, exactly as they always have; multi-check doctors render a tree:
// check rows (severity-ordered, with instance counts) whose instances
// appear indented beneath when expanded. Errors start expanded — the React
// Doctor rule: the highest-severity findings are on screen at entry.

export type RowKind = "section" | "check" | "item" | "more";

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

interface ListRow {
  kind: RowKind;
  text: string;
  severity: Severity;
  selectable: boolean;
  itemIndex: number;
  check?: CheckSummary;
}

// The re-scan loop is the pagination: a check shows its first N instances,
// then an affordance to fix a few and run again.
export const INSTANCES_PER_CHECK = 50;

const SEVERITY_RANK: Record<Severity, number> = { error: 0, warning: 1, info: 2 };

interface DoctorGroup {
  doctorId: string;
  checks: { checkKey: string; items: DashItem[] }[];
  multiCheck: boolean;
}

function groupByDoctor(items: DashItem[]): DoctorGroup[] {
  const doctors: DoctorGroup[] = [];
  const byDoctor = new Map<string, Map<string, DashItem[]>>();
  for (const it of items) {
    let checks = byDoctor.get(it.doctorId);
    if (!checks) {
      checks = new Map();
      byDoctor.set(it.doctorId, checks);
      doctors.push({ doctorId: it.doctorId, checks: [], multiCheck: false });
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
  }
  return doctors;
}

function summarize(checkKey: string, groupItems: DashItem[]): CheckSummary {
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

// Error-severity checks open on entry; everything else starts collapsed.
export function initialExpanded(items: DashItem[]): Set<string> {
  const expanded = new Set<string>();
  for (const d of groupByDoctor(items)) {
    if (!d.multiCheck) continue;
    for (const g of d.checks) {
      if (g.items[0].declaredSeverity === "error") expanded.add(g.checkKey);
    }
  }
  return expanded;
}

export function buildListRows(
  items: DashItem[],
  useColor: boolean,
  selectedRow: number,
  readKeys: Set<string>,
  expanded?: ReadonlySet<string>,
): ListRow[] {
  const c = colorizer(useColor);
  const open = expanded ?? new Set<string>();
  const indexOfItem = new Map(items.map((it, i) => [it, i]));
  const rows: ListRow[] = [];

  for (const d of groupByDoctor(items)) {
    rows.push({
      kind: "section",
      text: c(d.doctorId, BOLD),
      severity: d.checks[0]?.items[0].severity ?? "info",
      selectable: false,
      itemIndex: -1,
    });

    if (!d.multiCheck) {
      // Flat rendering, byte-identical to the single-doctor era.
      for (const it of d.checks[0].items) {
        const rowIndex = rows.length;
        rows.push({
          kind: "item",
          text: itemRowText(it, selectedRow === rowIndex, readKeys, c),
          severity: it.severity,
          selectable: true,
          itemIndex: indexOfItem.get(it)!,
        });
      }
      continue;
    }

    for (const g of d.checks) {
      const summary = summarize(g.checkKey, g.items);
      const checkRowIndex = rows.length;
      const isOpen = open.has(g.checkKey);
      rows.push({
        kind: "check",
        text: checkRowText(summary, isOpen, selectedRow === checkRowIndex, c),
        severity: summary.severity,
        selectable: true,
        itemIndex: -1,
        check: summary,
      });

      if (!isOpen) continue;
      const shown = g.items.slice(0, INSTANCES_PER_CHECK);
      for (const it of shown) {
        const rowIndex = rows.length;
        rows.push({
          kind: "item",
          text: "  " + itemRowText(it, selectedRow === rowIndex, readKeys, c, true),
          severity: it.severity,
          selectable: true,
          itemIndex: indexOfItem.get(it)!,
        });
      }
      if (g.items.length > shown.length) {
        const moreRowIndex = rows.length;
        rows.push({
          kind: "more",
          text: `  ${selectedRow === moreRowIndex ? c("›", BOLD) + " " : ""}${c("… and " + (g.items.length - shown.length) + " more — fix a few and re-scan", DIM)}`,
          severity: summary.severity,
          selectable: true,
          itemIndex: -1,
          check: summary,
        });
      }
    }
  }
  return rows;
}

function itemRowText(
  it: DashItem,
  isSelected: boolean,
  readKeys: Set<string>,
  c: (s: string, wrap?: string) => string,
  nested = false,
): string {
  const isRead = readKeys.has(it.key);
  const glyph = c(GLYPH[it.severity], SEVERITY_COLOR[it.severity]);
  const wrap = isSelected ? BOLD : isRead ? DIM : undefined;
  const suffix = nested || it.checkId === it.doctorId ? "" : c("  " + it.checkId, DIM);
  return `${isSelected ? c("›", BOLD) : " "}${glyph} ${c(it.site.file + ":" + it.site.line, wrap)}${suffix}`;
}

function checkRowText(summary: CheckSummary, isOpen: boolean, isSelected: boolean, c: (s: string, wrap?: string) => string): string {
  const arrow = isOpen ? "▾" : "▸";
  return `${isSelected ? c("›", BOLD) : " "}${c(arrow, DIM)} ${c(GLYPH[summary.severity], SEVERITY_COLOR[summary.severity])} ${c(summary.description, isSelected ? BOLD : undefined)} ${c("×" + summary.count, DIM)}`;
}

export interface FrameSource {
  (file: string): string[] | null;
}

export function dashboardFrame(state: {
  items: DashItem[];
  selected: number;
  readKeys: Set<string>;
  readSource: FrameSource;
  expanded?: ReadonlySet<string>;
  fileCount: number;
  durationMs: number;
  useColor: boolean;
  notice?: string;
  cols: number;
  rows: number;
}): string {
  const { items, selected, readKeys, useColor, cols, rows } = state;
  const c = colorizer(useColor);
  const layout = resolveDashboardLayout(cols, rows, items.length);
  const { score, grade } = scoreFromSeverities(items.map(it => it.severity));
  const barWidth = Math.min(46, Math.max(16, cols - 60));

  const header: string[] = [
    c(`Score: ${score} / 100 — ${grade}`, BOLD + gradeColor(score)),
    c(scoreBar(score, barWidth), gradeColor(score)),
    c(`${items.length} finding${items.length === 1 ? "" : "s"} · ${scanSummary(state.fileCount)}`, DIM),
    "",
  ];
  function scanSummary(n: number): string {
    return n + " files · " + state.durationMs + "ms";
  }

  const rowsData = buildListRows(items, useColor, selected, readKeys, state.expanded);
  const viewport = Math.max(1, Math.min(layout.listHeight, layout.bodyRows));
  let firstVisible = Math.max(0, Math.min(selected - viewport + 1, Math.max(0, rowsData.length - viewport)));
  if (selected >= 0 && selected < firstVisible) firstVisible = selected;
  const visibleRows = rowsData.slice(firstVisible, firstVisible + viewport);
  const listLines: string[] = [];
  for (const row of visibleRows) {
    listLines.push(truncateVisible(row.text, layout.listWidth));
  }
  while (listLines.length < viewport) listLines.push("");

  const detail: string[] = [];
  const selRow = rowsData[selected];
  if (selRow && selRow.kind === "item" && selRow.itemIndex >= 0) {
    const sel = items[selRow.itemIndex];
    detail.push(c(`${sel.site.file}:${sel.site.line}`, BOLD));
    detail.push(c(`${cap(sel.category)} · ${sel.severity}`, DIM));
    detail.push("");
    const impact = sel.impact ?? sel.description;
    for (const l of wordWrap(impact, layout.detailWidth - 2)) detail.push(c(l, SEVERITY_COLOR[sel.severity]));
    detail.push("");
    detail.push(c("Why", DIM));
    for (const l of wordWrap(sel.why ?? "Not documented for this check.", layout.detailWidth - 2)) detail.push("  " + l);
    detail.push("");
    detail.push(c("Code", DIM));
    for (const l of codeFrameLines(state.readSource(sel.site.file), sel.site.line, layout.detailWidth - 2, useColor)) detail.push("  " + l);
    detail.push("");
    if (sel.fix) {
      detail.push(c("Fix", DIM));
      for (const l of wordWrap(sel.fix, layout.detailWidth - 2)) detail.push("  " + l);
    }
    if (sel.blindSpots && sel.blindSpots.length > 0) {
      for (const l of wordWrap("blind spots: " + sel.blindSpots.join("; "), layout.detailWidth - 2)) {
        detail.push(c("  " + l, DIM));
      }
    }
  } else if (selRow && selRow.check) {
    // A check row (or its "… and N more" affordance) tells the check's
    // story: what it catches, why it matters, how to fix it, and the
    // blast radius.
    const s = selRow.check;
    detail.push(c(s.checkKey, BOLD));
    detail.push(c(`${s.count} instance${s.count === 1 ? "" : "s"} across ${s.files} file${s.files === 1 ? "" : "s"} · ${s.severity}`, DIM));
    detail.push("");
    for (const l of wordWrap(s.description, layout.detailWidth - 2)) detail.push(c(l, SEVERITY_COLOR[s.severity]));
    if (s.impact) {
      detail.push("");
      detail.push(c("Impact", DIM));
      for (const l of wordWrap(s.impact, layout.detailWidth - 2)) detail.push("  " + l);
    }
    if (s.why) {
      detail.push("");
      detail.push(c("Why", DIM));
      for (const l of wordWrap(s.why, layout.detailWidth - 2)) detail.push("  " + l);
    }
    if (s.fix) {
      detail.push("");
      detail.push(c("Fix", DIM));
      for (const l of wordWrap(s.fix, layout.detailWidth - 2)) detail.push("  " + l);
    }
    if (s.blindSpots && s.blindSpots.length > 0) {
      detail.push("");
      for (const l of wordWrap("blind spots: " + s.blindSpots.join("; "), layout.detailWidth - 2)) {
        detail.push(c("  " + l, DIM));
      }
    }
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
    c("↑↓ move · →← expand · enter copy issue context · q quit", DIM),
  ];

  return [...header, "", ...body, "", ...footer].join("\n");
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
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

export type DashboardStdin = TtyStdin;
export type DashboardStdout = TtyStdout;

export async function runDashboard(input: DashboardInput): Promise<void> {
  await runDashboardOn(processTtyEnv(), input);
}

export interface DashboardDeps {
  copy?: (text: string) => boolean;
}

export async function runDashboardOn(env: { stdin: DashboardStdin; stdout: DashboardStdout }, input: DashboardInput, deps: DashboardDeps = {}): Promise<void> {
  const { stdout } = env;
  if (!tty.canRunTui(env)) return;

  const useColor = input.useColor;
  const items = buildItems(input.groups);
  const expanded = initialExpanded(items);
  const readKeys = new Set<string>();
  let notice: string | undefined;

  const currentRows = () => buildListRows(items, useColor, selectedRow, readKeys, expanded);
  let selectedRow = (() => {
    const rows = buildListRows(items, useColor, 0, new Set<string>(), expanded);
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
      lines = fs.readFileSync(path.resolve(input.root, file), "utf8").split("\n");
    } catch {
      lines = null;
    }
    sourceCache.set(file, lines);
    return lines;
  };

  const frame = (): string => {
    try {
      const rows = currentRows();
      const selRow = rows[selectedRow];
      if (selRow && selRow.kind === "item" && selRow.itemIndex >= 0) {
        readKeys.add(items[selRow.itemIndex].key);
      }
      return dashboardFrame({
        items,
        selected: selectedRow,
        readKeys,
        readSource,
        expanded,
        fileCount: input.fileCount,
        durationMs: input.durationMs,
        useColor,
        notice,
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
      const row = currentRows()[selectedRow];
      if (key === "right" || key === "left") {
        if (!row?.check) return;
        if (key === "right") expanded.add(row.check.checkKey);
        else expanded.delete(row.check.checkKey);
        notice = undefined;
        return;
      }
      if (key === "\r" || key === "\n") {
        if (row?.kind === "check" && row.check) {
          if (expanded.has(row.check.checkKey)) expanded.delete(row.check.checkKey);
          else expanded.add(row.check.checkKey);
          notice = undefined;
          return;
        }
        if (row?.kind !== "item" || row.itemIndex < 0) return;
        const it = items[row.itemIndex];
        const verifyCommand = input.verifyCommand ?? runCommandFor(input.doctorFile, input.root);
        notice = (deps.copy ?? copyToClipboard)(issuePrompt(it, verifyCommand))
          ? "copied issue context — paste into your agent"
          : "clipboard unavailable";
        return;
      }
    },
  });
}

