import * as fs from "fs";
import * as path from "path";
import { copyToClipboard } from "./clipboard";
import { Finding, ReportGroup, Severity } from "./contract";
import { scoreFromSeverities } from "./score";

const RED = "\x1b[31m", GREEN = "\x1b[32m", YELLOW = "\x1b[33m", CYAN = "\x1b[36m",
      ORANGE = "\x1b[38;5;208m", DIM = "\x1b[2m", BOLD = "\x1b[1m", RESET = "\x1b[0m";

const GLYPH: Record<Severity, string> = { error: "✖", warning: "⚠", info: "ℹ" };
const COLOR: Record<Severity, string> = { error: RED, warning: ORANGE, info: YELLOW };

const ALT_ENTER = "\x1b[?1049h";
const ALT_EXIT = "\x1b[?1049l";

export interface DashItem {
  key: string;
  doctorId: string;
  checkId: string;
  description: string;
  severity: Severity;
  category: string;
  sites: Finding[];
  impact?: string;
  why?: string;
  fix?: string;
  blindSpots?: string[];
  doctorFile: string;
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

export function buildItems(groups: ReportGroup[], doctorFile: string): DashItem[] {
  const items: DashItem[] = [];
  for (const g of groups) {
    for (const f of g.findings) {
      const checkId = f.rule ?? g.meta.id;
      const check = g.meta.checks?.find(c => c.id === checkId);
      items.push({
        key: g.meta.id + "/" + checkId + "@" + f.file + ":" + f.line,
        doctorId: g.meta.id,
        checkId,
        description: check?.description ?? g.meta.description,
        severity: f.severity ?? check?.severity ?? g.meta.severity,
        category: g.meta.category ?? "general",
        sites: [f],
        impact: check?.impact,
        why: check?.why,
        fix: check?.fix,
        blindSpots: g.meta.blindSpots,
        doctorFile,
      });
    }
  }
  return items;
}

export function issuePrompt(item: DashItem, verifyCommand: string): string {
  const n = item.sites.length;
  const lines: string[] = [
    `Fix exactly one any-doctor check:`,
    "",
    `${item.severity.toUpperCase()} · ${item.description} (${item.key}, ×${n})`,
  ];
  if (item.impact) lines.push("", "Impact " + item.impact);
  lines.push("", "Affected sites:");
  for (const s of item.sites.slice(0, 50)) lines.push(`- ${s.file}:${s.line}`);
  if (item.why) lines.push("", "Why " + item.why);
  if (item.fix) lines.push("", "Suggested fix: " + item.fix);
  lines.push(
    "",
    "Scope:",
    `- Fix only ${item.key}.`,
    "- Fix the root cause; do not suppress, disable, or silence the check.",
    "- Keep unrelated refactors out of this pass.",
    "",
    `Verify with \`${verifyCommand}\` and confirm ${item.key} is gone before moving on.`,
  );
  return lines.join("\n");
}

export interface DashSection {
  title: string;
  itemIndexes: number[];
}

export function buildSections(items: DashItem[]): DashSection[] {
  const sections: DashSection[] = [];
  const byDoctor = new Map<string, number[]>();
  items.forEach((it, i) => {
    if (!byDoctor.has(it.doctorId)) byDoctor.set(it.doctorId, []);
    byDoctor.get(it.doctorId)!.push(i);
  });
  for (const [doctorId, indexes] of byDoctor) {
    sections.push({ title: doctorId, itemIndexes: indexes });
  }
  return sections;
}

export function dashboardFrame(opts: {
  items: DashItem[];
  sections: DashSection[];
  selected: number;
  readKeys: Set<string>;
  query: string;
  cols: number;
  rows: number;
  root: string;
  fileCount: number;
  durationMs: number;
  useColor: boolean;
  notice?: string;
}): string {
  const { items, selected, readKeys, cols, rows, useColor } = opts;
  const c = (s: string, wrap?: string): string => (useColor && wrap ? wrap + s + RESET : s);

  const { score, grade } = scoreFromSeverities(items.map(it => it.severity));
  const barWidth = Math.min(46, Math.max(20, cols - 52));
  const gradeColor = score >= 75 ? GREEN : score >= 50 ? YELLOW : RED;
  const bar = useColor ? c(scoreBar(score, barWidth), gradeColor) : scoreBar(score, barWidth);
  const doctorWord = items.length === 1 ? "doctor" : "doctors";
  const header = [
    c(`┌${"─".repeat(9)}┐`, DIM),
    `${c(`│ ${String(score).padEnd(3)} │`, DIM)} ${c(`${score} / 100 ${grade}`, BOLD + gradeColor)}  ${dim2(`· ${items.length} ${doctorWord} · ${opts.fileCount} files · ${opts.durationMs}ms`, useColor)}`,
    `${c(`│ ${gradeGlyph(score)} │`, DIM)} ${bar}`,
    `${c(`└${"─".repeat(9)}┘`, DIM)} ${c("any-doctor", DIM)}`,
  ];

  const sel = items[selected];
  const detailWidth = Math.max(20, cols - 52);
  const detailLines = sel ? wrapDetail(detailFor(sel, opts.root, useColor), detailWidth) : [];

  const left: string[] = [];
  left.push(c("Issues by doctor", BOLD));
  left.push("");
  let leftCount = 0;
  const maxList = Math.max(4, rows - 10);
  for (const section of buildSections(items)) {
    if (leftCount >= maxList) break;
    left.push(c(section.title, BOLD));
    leftCount++;
    let prevCheckId: string | null = null;
    for (const idx of section.itemIndexes) {
      if (leftCount >= maxList) break;
      const it = items[idx];
      const cursor = idx === selected ? c("› ", BOLD) : "  ";
      const glyph = c(GLYPH[it.severity], COLOR[it.severity]);
      const isRead = readKeys.has(it.key);
      const site = it.sites[0];
      const rowLabel = prevCheckId === it.checkId
        ? c(`${site.file}:${site.line}`, DIM)
        : c(it.description, isRead ? DIM : "");
      prevCheckId = it.checkId;
      left.push(`${cursor}${glyph} ${rowLabel}${c("  " + site.file + ":" + site.line, DIM)}`);
      leftCount++;
    }
    left.push("");
  }

  const frame: string[] = ["\x1b[H\x1b[2J", ...header];
  frame.push("");
  const bodyRows = Math.max(6, rows - header.length - 4);
  for (let i = 0; i < bodyRows; i++) {
    const l = (left[i] ?? "").padEnd(0);
    const r = detailLines[i] ?? "";
    frame.push(padTo(l, Math.min(50, Math.floor(cols / 2))) + r);
  }
  frame.push("");
  if (opts.notice) frame.push(c("✔ " + opts.notice, GREEN));
  frame.push(c("↑↓ move · enter copy issue context · q quit", DIM));
  return frame.join("\n");

  function dim2(s: string, on: boolean): string {
    return on ? DIM + s + RESET : s;
  }
}

function gradeGlyph(score: number): string {
  return score >= 75 ? "▽" : score >= 50 ? "▽" : "x x";
}

function padTo(s: string, width: number): string {
  const plain = s.replace(/\x1b\[[0-9;]*m/g, "");
  const pad = Math.max(0, width - plain.length);
  return s + " ".repeat(pad);
}

function wrapDetail(lines: string[], width: number): string[] {
  const out: string[] = [];
  for (const l of lines) {
    if (l.length <= width) out.push(l);
    else {
      for (let i = 0; i < l.length; i += width) out.push(l.slice(i, i + width));
    }
  }
  return out;
}

function detailFor(item: DashItem, root: string, useColor: boolean): string[] {
  const c = (s: string, wrap?: string): string => (useColor && wrap ? wrap + s + RESET : s);
  const site = item.sites[0];
  const lines: string[] = [];
  const first = item.sites[0];
  lines.push(c(`${cap(item.category)} · ${item.severity} · ${first.file}:${first.line}`, DIM));
  lines.push("");
  if (item.impact) {
    lines.push(c("  Impact " + item.impact, DIM));
    lines.push("");
  } else {
    lines.push(c("  Impact " + item.description, DIM));
    lines.push("");
  }
  if (item.why) {
    lines.push(c("  Why " + item.why, DIM));
    lines.push("");
  }
  const codeLines = codeFrame(root, site.file, site.line, useColor);
  lines.push(...codeLines);
  lines.push("");
  if (item.fix) lines.push(c("  Fix " + item.fix, DIM));
  return lines;
}

function codeFrame(root: string, file: string, line: number, useColor: boolean): string[] {
  const out: string[] = [];
  const c = (s: string, wrap?: string): string => (useColor && wrap ? wrap + s + RESET : s);
  try {
    const all = fs.readFileSync(path.resolve(root, file), "utf8").split("\n");
    const from = Math.max(0, line - 3);
    const to = Math.min(all.length, line + 2);
    for (let i = from; i < to; i++) {
      const marker = i === line - 1 ? "> " : "  ";
      out.push(`${c(String(i + 1).padStart(5), DIM)} │ ${marker}${all[i]}`);
    }
  } catch {
    out.push(c("  (source unavailable)", DIM));
  }
  return out;
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export async function runDashboard(input: DashboardInput): Promise<void> {
  const stdin = process.stdin;
  const stdout = process.stdout;
  if (!stdin.isTTY || !stdout.isTTY) return;

  const useColor = input.useColor;
  const items = buildItems(input.groups, input.doctorFile);
  if (items.length === 0) return;
  const sections = buildSections(items);
  let selected = 0;
  const readKeys = new Set<string>();
  let notice: string | undefined;

  stdin.setRawMode(true);
  stdin.resume();
  stdout.write(ALT_ENTER);

  const draw = (): void => {
    const it = items[selected];
    readKeys.add(it.key);
    stdout.write(dashboardFrame({
      items,
      sections,
      selected,
      readKeys,
      query: "",
      cols: stdout.columns || 120,
      rows: stdout.rows || 34,
      root: input.root,
      fileCount: input.fileCount,
      durationMs: input.durationMs,
      useColor,
      notice,
    }));
  };

  await new Promise<void>((resolve) => {
    draw();
    const onData = (buf: Buffer): void => {
      const s = buf.toString("utf8");
      if (s === "q" || s === "\x03") return finish();
      if (s === "\x1b[A" || s === "k") { selected = Math.max(0, selected - 1); notice = undefined; return draw(); }
      if (s === "\x1b[B" || s === "j") { selected = Math.min(items.length - 1, selected + 1); notice = undefined; return draw(); }
      if (s === "\r" || s === "\n") {
        const it = items[selected];
        const verifyCommand = `node "${path.resolve(__dirname, "cli.js")}" run "${input.doctorFile}" "${input.root}"`;
        if (copyToClipboard(issuePrompt(it, verifyCommand))) {
          notice = "copied issue context — paste into your agent";
        } else {
          notice = "clipboard unavailable";
        }
        return draw();
      }
    };
    const finish = (): void => {
      stdin.removeListener("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write(ALT_EXIT);
      resolve();
    };
    stdin.on("data", onData);
  });
}
