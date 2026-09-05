import * as fs from "fs";
import * as path from "path";
import { copyToClipboard } from "./clipboard.js";
import { Finding, ReportGroup, resolveFinding, Severity } from "./contract.js";
import { scoreFromSeverities } from "./score.js";
import { createKeyFeed } from "./keys.js";

const RED = "\x1b[31m", GREEN = "\x1b[32m", YELLOW = "\x1b[33m", CYAN = "\x1b[36m",
      ORANGE = "\x1b[38;5;208m", DIM = "\x1b[2m", BOLD = "\x1b[1m", RESET = "\x1b[0m";

const GLYPH: Record<Severity, string> = { error: "✖", warning: "⚠", info: "ℹ" };
const COLOR: Record<Severity, string> = { error: RED, warning: ORANGE, info: YELLOW };

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

export interface DashItem {
  key: string;
  checkKey: string;
  doctorId: string;
  checkId: string;
  description: string;
  severity: Severity;
  category: string;
  site: Finding;
  impact?: string;
  why?: string;
  fix?: string;
  blindSpots?: string[];
}

export interface DashboardInput {
  root: string;
  groups: ReportGroup[];
  doctorFile: string;
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
      items.push({
        key: j.checkKey + "@" + f.file + ":" + f.line,
        checkKey: j.checkKey,
        doctorId: j.doctorId,
        checkId: j.checkId,
        description: j.description,
        severity: j.severity,
        category: j.category,
        site: f,
        impact: j.impact,
        why: j.why,
        fix: j.fix,
        blindSpots: j.blindSpots,
      });
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

export function visibleWidth(s: string): number {
  return s.replace(/\x1b\[[0-9;]*m/g, "").length;
}

export function truncateVisible(s: string, width: number): string {
  if (visibleWidth(s) <= width) return s;
  let out = "";
  let w = 0;
  for (const ch of s.replace(/\x1b\[[0-9;]*m/g, "")) {
    if (w + 1 > width - 1) break;
    out += ch;
    w++;
  }
  return out + "…";
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

interface ListRow {
  kind: "section" | "item";
  text: string;
  severity: Severity;
  itemIndex: number;
}

export function buildListRows(items: DashItem[], useColor: boolean, selected: number, readKeys: Set<string>): ListRow[] {
  const c = (s: string, wrap?: string): string => (useColor && wrap ? wrap + s + RESET : s);
  const rows: ListRow[] = [];
  let currentDoctor: string | null = null;
  let currentCheck: string | null = null;
  items.forEach((it, index) => {
    if (it.doctorId !== currentDoctor) {
      currentDoctor = it.doctorId;
      currentCheck = null;
      rows.push({ kind: "section", text: c(it.doctorId, BOLD), severity: it.severity, itemIndex: index });
    }
    const isSelected = index === selected;
    const isRead = readKeys.has(it.key);
    const glyph = c(GLYPH[it.severity], COLOR[it.severity]);
    const wrap = isSelected ? BOLD : isRead ? DIM : undefined;
    const row: ListRow = {
      kind: "item",
      text: `${isSelected ? c("›", BOLD) : " "}${glyph} ${c(it.site.file + ":" + it.site.line, wrap)}${it.checkId !== it.doctorId ? c("  " + it.checkId, DIM) : ""}`,
      severity: it.severity,
      itemIndex: index,
    };
    rows.push(row);
    void currentCheck;
  });
  return rows;
}

export function dashboardFrame(state: {
  items: DashItem[];
  selected: number;
  readKeys: Set<string>;
  root: string;
  fileCount: number;
  durationMs: number;
  useColor: boolean;
  notice?: string;
  cols: number;
  rows: number;
}): string {
  const { items, selected, readKeys, root, useColor, cols, rows } = state;
  const c = (s: string, wrap?: string): string => (useColor && wrap ? wrap + s + RESET : s);
  const layout = resolveDashboardLayout(cols, rows, items.length);
  const { score, grade } = scoreFromSeverities(items.map(it => it.severity));
  const gradeColor = score >= 75 ? GREEN : score >= 50 ? YELLOW : RED;
  const barWidth = Math.min(46, Math.max(16, cols - 60));

  const header: string[] = [
    c(`Score: ${score} / 100 — ${grade}`, BOLD + gradeColor),
    c(scoreBar(score, barWidth), gradeColor),
    c(`${items.length} finding${items.length === 1 ? "" : "s"} · ${input0(state.fileCount)}`, DIM),
    "",
  ];
  function input0(n: number): string {
    return n + " files · " + state.durationMs + "ms";
  }

  const rowsData = buildListRows(items, useColor, selected, readKeys);
  const viewport = Math.max(1, Math.min(layout.listHeight, layout.bodyRows));
  let firstVisible = Math.max(0, Math.min(selected - viewport + 1, Math.max(0, rowsData.length - viewport)));
  const visibleRows = rowsData.slice(firstVisible, firstVisible + viewport);
  const listLines: string[] = [];
  for (const row of visibleRows) {
    listLines.push(truncateVisible(row.text, layout.listWidth));
  }
  while (listLines.length < viewport) listLines.push("");

  const sel = items[selected];
  const detail: string[] = [];
  if (sel) {
    detail.push(c(`${sel.site.file}:${sel.site.line}`, BOLD));
    detail.push(c(`${cap(sel.category)} · ${sel.severity}`, DIM));
    detail.push("");
    const impact = sel.impact ?? sel.description;
    for (const l of wordWrap(impact, layout.detailWidth - 2)) detail.push(c(l, sel.severity === "error" ? RED : sel.severity === "warning" ? ORANGE : CYAN));
    detail.push("");
    detail.push(c("Why", DIM));
    for (const l of wordWrap(sel.why ?? "Not documented for this check.", layout.detailWidth - 2)) detail.push("  " + l);
    detail.push("");
    detail.push(c("Code", DIM));
    for (const l of codeFrame(root, sel.site.file, sel.site.line, layout.detailWidth - 2, useColor)) detail.push("  " + l);
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
    c("↑↓ move · enter copy issue context · q quit", DIM),
  ];

  return [...header, "", ...body, "", ...footer].join("\n");
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function codeFrame(root: string, file: string, line: number, width: number, useColor: boolean): string[] {
  const c = (s: string, wrap?: string): string => (useColor && wrap ? wrap + s + RESET : s);
  const out: string[] = [];
  try {
    const all = fs.readFileSync(path.resolve(root, file), "utf8").split("\n");
    const from = Math.max(0, line - 3);
    const to = Math.min(all.length, line + 2);
    for (let i = from; i < to; i++) {
      const marker = i === line - 1 ? c(">  ", BOLD) : "   ";
      const num = c(String(i + 1).padStart(3), DIM);
      const text = truncateVisible(all[i] ?? "", Math.max(10, width));
      out.push(`${marker} ${num} │ ${highlightCode(text, useColor)}`);
    }
  } catch {
    out.push(c("  (source unavailable)", DIM));
  }
  return out;
}

export interface DashboardStdin {
  readonly isTTY?: boolean;
  readonly isRaw?: boolean;
  setRawMode(mode: boolean): unknown;
  resume(): unknown;
  pause(): unknown;
  on(event: "data", listener: (chunk: string | Buffer) => void): unknown;
  removeListener(event: "data", listener: (chunk: string | Buffer) => void): unknown;
}

export interface DashboardStdout {
  readonly isTTY?: boolean;
  columns?: number;
  rows?: number;
  write(s: string): unknown;
}

export async function runDashboard(input: DashboardInput): Promise<void> {
  await runDashboardOn(process.stdin as unknown as DashboardStdin, process.stdout as unknown as DashboardStdout, input);
}

// In-place repaint: home the cursor and rewrite every line with a
// clear-to-end-of-line so shorter content cannot leave ghosts, then clear
// below the frame. A full-screen \x1b[2J erase on every keypress leaves a
// blank window while the frame streams back in, which reads as flicker; the
// erase runs only on the first paint.
function paintFrame(stdout: DashboardStdout, frame: string, cols: number, first: boolean): void {
  const width = Math.max(10, cols - 1);
  const lines = frame.split("\n").map(l => truncateVisible(l, width) + "\x1b[K");
  stdout.write((first ? "\x1b[H\x1b[2J" : "\x1b[H") + lines.join("\n") + "\x1b[J");
}

export interface DashboardDeps {
  copy?: (text: string) => boolean;
}

export async function runDashboardOn(stdin: DashboardStdin, stdout: DashboardStdout, input: DashboardInput, deps: DashboardDeps = {}): Promise<void> {
  if (!stdin.isTTY || !stdout.isTTY) return;

  const useColor = input.useColor;
  const items = buildItems(input.groups);
  let selected = 0;
  const readKeys = new Set<string>();
  let notice: string | undefined;
  let firstPaint = true;

  const draw = (): void => {
    let frame: string;
    try {
      const it = items[selected];
      if (it) readKeys.add(it.key);
      frame = dashboardFrame({
        items,
        selected,
        readKeys,
        root: input.root,
        fileCount: input.fileCount,
        durationMs: input.durationMs,
        useColor,
        notice,
        cols: stdout.columns || 120,
        rows: stdout.rows || 34,
      });
    } catch (e) {
      const err = e as Error;
      frame = "DASHBOARD RENDER ERROR — the view is frozen, press q to quit.\n"
        + "Send a screenshot of this to the maintainer:\n\n"
        + String(err && err.stack ? err.stack : err);
    }
    paintFrame(stdout, frame, stdout.columns || 120, firstPaint);
    firstPaint = false;
  };

  return new Promise<void>((resolve) => {
    // The picker (or any earlier TUI phase) leaves stdin explicitly paused
    // and cooked. An explicitly paused stdin never auto-flows when a "data"
    // listener attaches, so without resume() the event loop drains and the
    // process exits right after the first frame.
    const wasRaw = stdin.isRaw;
    stdin.setRawMode(true);
    stdin.resume();
    stdout.write("\x1b[?25l");
    draw();

    const finish = (): void => {
      stdin.removeListener("data", feed);
      if (wasRaw !== undefined) stdin.setRawMode(wasRaw);
      stdin.pause();
      stdout.write("\x1b[?25h");
      resolve();
    };

    function handleKey(key: string): void {
      if (key === "q" || key === "\x03" || key === "esc") return finish();
      if (key === "ignore") return;
      if (key === "up" || key === "k") { selected = Math.max(0, selected - 1); notice = undefined; return draw(); }
      if (key === "down" || key === "j") { selected = Math.min(items.length - 1, selected + 1); notice = undefined; return draw(); }
      if (key === "\r" || key === "\n") {
        const it = items[selected];
        if (!it) return draw();
        const verifyCommand = `any-doctor run "${input.doctorFile}" "${input.root}"`;
        if ((deps.copy ?? copyToClipboard)(issuePrompt(it, verifyCommand))) {
          notice = "copied issue context — paste into your agent";
        } else {
          notice = "clipboard unavailable";
        }
        return draw();
      }
    }

    const onKey = (key: string): void => {
      try {
        handleKey(key);
      } catch (e) {
        process.stderr.write("key handling error: " + String(e));
      }
    };
    const feed = createKeyFeed(onKey);
    stdin.on("data", feed);
  });
}

