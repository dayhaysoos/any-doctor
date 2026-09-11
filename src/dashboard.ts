import * as fs from "fs";
import * as path from "path";
import { copyToClipboard } from "./clipboard.js";
import { resolveFinding, runCommandFor, Severity } from "./contract.js";
import { recordDecision, reverseDecision, Disposition, encodeDecisionKey } from "./finding-state.js";
import { withDecision, withoutDecision } from "./review.js";
import { captureScan } from "./scan-capture.js";
import { readKeyFor } from "./contract.js";
import {
  buildTree, CheckSummary, DoctorSummary, DoctorTree,
  FINDINGS_PER_CHECK, initialExpanded, SiteFinding, summarizeCheck, summarizeDoctor,
} from "./doctor-tree.js";
import { checkFixPrompt, doctorFixPrompt, fixPrompt } from "./prompts.js";
import { isEmptyScan, scoreFromFileHealth, scoreHeaderLines } from "./score.js";
import { processTtyEnv } from "./tty.js";
import * as tty from "./tty.js";
import { runTty, truncateVisible, TtyStdin, TtyStdout, visibleWidth } from "./tty.js";

import { BOLD, colorizer, DIM, GLYPH, GREEN, ORANGE, RESET, scoreHeaderTone, SEVERITY_COLOR, YELLOW } from "./palette.js";
import { RunOutcome } from "./contract.js";
import { unsafeSkipLine } from "./report.js";
import { deriveSummary } from "./summary.js";

// The Dashboard: the interactive review surface over the Summary. It owns
// layout, the frame renderer, and the TUI loop; the Doctor tree
// (doctor-tree.ts) is its view-model, and the task prompts it copies come
// from prompts.ts. Its per-finding review state is still just readKeys —
// M2's decision workflow will grow that here, in the loop, without
// piercing the tree or the prompts.

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

export interface DashboardInput {
  // The whole batch result; the dashboard renders the same truth as the
  // report — groups, skips, counts, and the scanned target all come from
  // the outcome, with no per-field re-assembly.
  outcome: RunOutcome;
  invoker?: string;
  useColor: boolean;
  // The ReviewView (review.ts): the one derivation of capture + decisions;
  // a/x/u mutate THROUGH it (withDecision/withoutDecision return the next
  // view) so the loop never maintains a parallel copy of the laws.
  view?: import("./review.js").ReviewView;
}

export function scoreBar(score: number, width: number): string {
  const filled = Math.round((score / 100) * width);
  return "█".repeat(filled) + "░".repeat(Math.max(0, width - filled));
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

// ---- the tree's flattening ----
//
// The Doctor tree (doctor-tree.ts) is computed once from the immutable
// items and named; every consumer — expansion defaults, row flattening,
// group prompts, the detail pane — flattens or reads it without
// rebuilding it. What lives here is the flattening into selectable rows.

export type RowKind = "section" | "check" | "item" | "more";

// The re-scan loop is the pagination: a check shows its first N findings,
// then an affordance to fix a few and run again.
// (FINDINGS_PER_CHECK lives in doctor-tree.ts, beside the tree it caps.)

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
  // The decision suppressing this item (review view renders it dim with
  // its disposition) — absent on active rows.
  reviewed?: Disposition;
  // The finding resurfaced because its decided evidence changed.
  reassess?: boolean;
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
  review?: { dispositionByReadKey?: Map<string, Disposition>; reassessPairs?: Set<string>; ambiguousReadKeys?: Map<string, number> },
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
      // collapsible row, severity-ordered, with its total count. The
      // row's score obeys the header's honesty: a doctor over zero
      // scanned files shows n/a — never a green vacuous 100.
      const summary = summarizeDoctor(d);
      const rowIndex = rows.length;
      const isOpen = open.has(d.doctorId);
      // The row's score rides the header's tone policy — n/a in yellow
      // over an empty denominator, never a green vacuous 100.
      const scoreBit = c(
        "· " + (isEmptyScan(summary.score) ? "n/a" : summary.score.score),
        scoreHeaderTone(summary.score),
      );
      rows.push({
        kind: "section",
        text: `${selectedRow === rowIndex ? c("›", BOLD) : " "}${c(isOpen ? "▾" : "▸", DIM)} ${c(GLYPH[summary.worst], SEVERITY_COLOR[summary.worst])} ${c(summary.doctorId, BOLD)} ${c("×" + summary.count, DIM)} ${scoreBit}`,
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
          text: childPrefix(ci, flat.length - 1 + (all.length > flat.length ? 1 : 0)) + itemRowText(it, selectedRow === rowIndex, readKeys, c, !multiDoctor, review?.dispositionByReadKey?.get(it.readKey), review?.reassessPairs?.has(`${it.checkKey}\u0000${it.site.file}`), review?.ambiguousReadKeys?.has(it.readKey)),
          severity: it.severity,
          selectable: true,
          item: it,
          reviewed: review?.dispositionByReadKey?.get(it.readKey),
          reassess: review?.reassessPairs?.has(`${it.checkKey}\u0000${it.site.file}`),
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
        const readKey = it.readKey;
        rows.push({
          kind: "item",
          text: guidePrefix(ci, d.checks.length - 1) + itemRowText(it, selectedRow === rowIndex, readKeys, c, false, review?.dispositionByReadKey?.get(readKey), review?.reassessPairs?.has(`${it.checkKey}\u0000${it.site.file}`), review?.ambiguousReadKeys?.has(readKey)),
          severity: it.severity,
          selectable: true,
          item: it,
          reviewed: review?.dispositionByReadKey?.get(readKey),
          reassess: review?.reassessPairs?.has(`${it.checkKey}\u0000${it.site.file}`),
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
  reviewed?: Disposition,
  reassess?: boolean,
  ambiguous?: boolean,
): string {
  const isRead = readKeys.has(it.readKey);
  const glyph = c(GLYPH[it.severity], SEVERITY_COLOR[it.severity]);
  // A decided row renders dim with its disposition — present tense, never
  // a fix claim — and a resurfaced decision warns with the reassess mark.
  const wrap = reviewed !== undefined ? DIM : isSelected ? BOLD : isRead ? DIM : undefined;
  const suffix = showCheckId && it.checkId !== it.doctorId ? c("  " + it.checkId, DIM) : "";
  const mark = reviewed !== undefined
    ? c(reviewed === "accepted" ? "  ✓ accepted" : "  ⊘ not applicable", DIM)
    : reassess === true
      ? c("  ⚠ decision needs reassessment", YELLOW)
      : ambiguous === true
        ? c("  ⚠ identical copies share this identity", YELLOW)
        : "";
  return `${isSelected ? c("›", BOLD) : " "}${glyph} ${c(it.site.file + ":" + it.site.line, wrap)}${suffix}${mark}`;
}

export interface FrameSource {
  (file: string): string[] | null;
}

export interface DashboardFrameState {
  tree: DoctorTree;
  // Review rendering: decided items carry their disposition; resurfaced
  // decisions carry the reassessment mark.
  dispositionByReadKey?: Map<string, Disposition>;
  reassessPairs?: Set<string>;
  // The reason prompt, when a decision is being composed; `error` marks
  // a refused empty submit so the complaint renders IN the prompt line.
  prompt?: { disposition: Disposition; buffer: string; file: string; line: number; error?: boolean };
  // readKey -> the recorded reason (the review view's detail pane).
  reasonByReadKey?: Map<string, string>;
  // readKeys whose identity is shared by identical copies.
  ambiguousReadKeys?: Map<string, number>;
  selectedRow: number;
  readKeys: Set<string>;
  readSource: FrameSource;
  expanded?: ReadonlySet<string>;
  // The scan's denominator — every doctor's score is computed against it.
  filesTotal: number;
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
  const barWidth = Math.min(46, Math.max(16, cols - 60));

  // The header is the SELECTED doctor's report — never a cohort total,
  // which read as belonging to whichever row was on screen. Rows are
  // needed first: the selection's payload names the doctor.
  const rowsData = buildListRows(tree, useColor, selectedRow, readKeys, state.expanded,
    state.dispositionByReadKey !== undefined || state.reassessPairs !== undefined || state.prompt !== undefined
      ? { dispositionByReadKey: state.dispositionByReadKey, reassessPairs: state.reassessPairs, ambiguousReadKeys: state.ambiguousReadKeys }
      : undefined);
  const sel = rowsData[selectedRow];
  const scopedId = sel?.doctor?.doctorId ?? sel?.check?.doctorId ?? sel?.item?.doctorId ?? tree[0]?.doctorId;
  const scoped = tree.find(d => d.doctorId === scopedId);

  // The header's third line, one shape for every header state — a
  // count, the clean fraction (or the raw file count when there is
  // none), and the run's duration. Composed three ways before, which is
  // how format drift starts.
  const summaryLine = (count: number, cleanLine: string | null, ms: number): string =>
    `${count} finding${count === 1 ? "" : "s"} · ${cleanLine ?? state.filesTotal + " file" + (state.filesTotal === 1 ? "" : "s")} · ${ms}ms`;

  const headerLines: string[] = [];
  if (scoped) {
    const h = scoreHeaderLines(scoped.score);
    const tone = scoreHeaderTone(scoped.score);
    headerLines.push(`${c(scoped.doctorId, BOLD)}  ${c(h.scoreLine, BOLD + tone)}`);
    // An empty scan draws an empty bar: nothing was measured, and a
    // filled bar would assert the vacuous 100 the n/a line just refused.
    headerLines.push(c(scoreBar(h.emptyScan ? 0 : scoped.score.score, barWidth), tone));
    headerLines.push(c(summaryLine(scoped.count, h.cleanLine, state.durationMs), DIM));
  } else if (state.filesTotal === 0) {
    // Zero groups over zero files: the same n/a the report renders —
    // composed through the public score surface, not re-worded here.
    const empty = scoreFromFileHealth([], 0);
    const h = scoreHeaderLines(empty);
    const tone = scoreHeaderTone(empty);
    headerLines.push(c(h.scoreLine, BOLD + tone));
    headerLines.push(c(scoreBar(0, barWidth), tone));
    headerLines.push(c(summaryLine(0, h.cleanLine, state.durationMs), DIM));
  } else {
    headerLines.push(c("No findings", BOLD + GREEN));
    headerLines.push(c(scoreBar(100, barWidth), GREEN));
    headerLines.push(c(summaryLine(0, null, state.durationMs), DIM));
  }
  if (state.skippedUnsafe !== undefined && state.skippedUnsafe.length > 0) {
    headerLines.push(c(`\u26a0 ${unsafeSkipLine(state.skippedUnsafe)}`, YELLOW));
  }
  headerLines.push("");

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
  // A DECIDED row tells the decision's story first — the reason is what
  // a reviewer needs, and u to reverse is the action.
  if (selRow?.item && selRow.reviewed !== undefined && state.reasonByReadKey?.has(selRow.item.readKey) === true) {
    const sel = selRow.item;
    detail.push(c(`${sel.site.file}:${sel.site.line}`, BOLD));
    detail.push(c(selRow.reviewed === "accepted" ? "✓ accepted" : "⊘ not applicable", DIM));
    detail.push("");
    proseSection(detail, "Reason", state.reasonByReadKey.get(sel.readKey) ?? "", layout.detailWidth - 2, c);
    detail.push("");
    proseSection(detail, "Undo", "u reverses this decision — the finding returns to the active list", layout.detailWidth - 2, c);
  } else if (selRow?.item) {
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
    state.prompt !== undefined
      ? c(state.prompt.error === true
        ? `a reason is required — type one (esc cancels): ${state.prompt.buffer}▏`
        : `Reason for ${state.prompt.disposition === "accepted" ? "accepting" : "not-applicable"} ${state.prompt.file}:${state.prompt.line}: ${state.prompt.buffer}▏ (enter records · esc cancels)`, YELLOW)
      : state.notice ? c("✔ " + state.notice, GREEN) : "",
    c("↑↓ move · →← expand · enter copy · c copy group · a accept · x n/a · u undo · v review · q quit", DIM),
  ];

  return [...headerLines, "", ...body, "", ...footer].join("\n");
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
  // Decision recording is injected like the clipboard: tests drive the
  // full key flow without touching disk; production defaults write the
  // local decisions file beside the scanned target.
  decide?: (input: { key: string; checkKey: string; file: string; line: number; disposition: Disposition; reason: string; actor: string; provenance?: { revision?: number; programDigest?: string } }) => { ok: true } | { ok: false; error: string };
  reverse?: (key: string) => { ok: true } | { ok: false; error: string };
}

export async function runDashboardOn(env: { stdin: TtyStdin; stdout: TtyStdout }, input: DashboardInput, deps: DashboardDeps = {}): Promise<void> {
  const { stdout } = env;
  if (!tty.canRunTui(env)) return;

  const useColor = input.useColor;
  // One RunOutcome, one story on every surface: the tree AND the report
  // render the same Summary — the derivation lives in summary.ts, so
  // counts and score can never disagree between surfaces. The tree
  // consumes the Summary's check buckets directly; it never re-groups.
  const summary = deriveSummary(input.outcome);

  // ---- review state (M2): decided items leave the active tree; the
  // review view (v) shows them dim with their disposition and reason.
  // The ReviewView owns every decision law; this loop only reads its
  // rows and swaps in the next view when a/x/u record or reverse —
  // no parallel copies of suppression/ambiguity bookkeeping.
  const encodeForView = (raw: string): string => Buffer.from(raw, "utf8").toString("base64url");
  let view = input.view;
  // The capture the view derives from, rebuilt the same way the command
  // layer built it — a/x/u swap in the next view re-derived from it.
  const captureForView = view !== undefined
    ? captureScan(input.outcome.targetDir, deriveSummary(input.outcome).groups, input.outcome.analysisAvailable ?? false, [])
    : undefined;
  const deriveViewMaps = (): { dispositionByReadKey: Map<string, Disposition>; reasonByReadKey: Map<string, string>; reassessPairs: Set<string>; ambiguousReadKeys: Map<string, number> } => {
    const dispositionByReadKey = new Map<string, Disposition>();
    const reasonByReadKey = new Map<string, string>();
    const reassessPairs = new Set((view?.reassessing ?? []).map((ra) => `${ra.checkKey}\u0000${ra.file}`));
    const ambiguousReadKeys = new Map<string, number>();
    if (view !== undefined) {
      for (const [readKey, row] of view.rows) {
        if (row.decision !== undefined && view.suppressedReadKeys.has(readKey)) {
          dispositionByReadKey.set(readKey, row.decision.disposition);
          reasonByReadKey.set(readKey, row.decision.reason);
        }
        if (row.ambiguous !== undefined) ambiguousReadKeys.set(readKey, row.ambiguous);
      }
    }
    return { dispositionByReadKey, reasonByReadKey, reassessPairs, ambiguousReadKeys };
  };
  let { dispositionByReadKey, reasonByReadKey, reassessPairs, ambiguousReadKeys } = deriveViewMaps();
  const rawKeyOf = (readKey: string): string | undefined => view?.rawKeyByReadKey.get(readKey);
  const readKeyShares = (readKey: string): number => ambiguousReadKeys.get(readKey) ?? 1;
  let showReviewed = false;
  let prompt: { disposition: Disposition; buffer: string; item: SiteFinding; error?: boolean } | undefined;

  const decide = deps.decide ?? ((d) => recordDecision(input.outcome.targetDir, d));
  const reverse = deps.reverse ?? ((key) => reverseDecision(input.outcome.targetDir, key));

  // The readKey of a finding inside the Summary's buckets — the same
  // join the identity layer namespaces by.
  const readKeyOf = (meta: import("./contract.js").DoctorMeta, f: import("./contract.js").Finding): string =>
    readKeyFor(resolveFinding(meta, f).checkKey, f.file, f.line, f.column);

  const groupCountsFor = (withReviewed: boolean) => {
    const suppressedReadKeys = view?.suppressedReadKeys ?? new Set<string>();
    if (withReviewed || suppressedReadKeys.size === 0) return summary.groupChecks;
    return summary.groupChecks
      .map((gc) => ({
        ...gc,
        checks: gc.checks
          .map((b) => ({ ...b, findings: b.findings.filter((f) => !suppressedReadKeys.has(readKeyOf(gc.group.meta, f))) }))
          .filter((b) => b.findings.length > 0),
      }))
      .filter((gc2) => gc2.checks.length > 0);
  };

  const rebuildTrees = (): void => {
    const decided = view?.suppressedReadKeys.size ?? 0;
    trees = {
      active: buildTree(groupCountsFor(false), input.outcome.fileCount),
      full: decided === 0
        ? trees.active
        : buildTree(groupCountsFor(true), input.outcome.fileCount),
    };
    expanded.clear();
    initialExpanded(trees.active).forEach((k) => expanded.add(k));
  };
  let trees = {
    active: buildTree(groupCountsFor(false), input.outcome.fileCount),
    full: buildTree(groupCountsFor(true), input.outcome.fileCount),
  };
  const tree = (): DoctorTree => (showReviewed ? trees.full : trees.active);

  const expanded = new Set<string>();
  initialExpanded(trees.active).forEach((k) => expanded.add(k));
  const readKeys = new Set<string>();
  let notice: string | undefined;

  const currentRows = () => buildListRows(tree(), useColor, selectedRow, readKeys, expanded,
    { dispositionByReadKey, reassessPairs, ambiguousReadKeys });
  let selectedRow = (() => {
    const rows = buildListRows(trees.active, useColor, 0, new Set<string>(), expanded);
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

  const decideCommandFor = (item: SiteFinding): string | undefined => {
    const idKey = rawKeyOf(item.readKey);
    return idKey !== undefined
      ? `any-doctor decide --key ${encodeDecisionKey(idKey)} --accepted|--not-applicable --reason "…"`
      : undefined;
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
        tree: tree(),
        selectedRow,
        readKeys,
        readSource,
        expanded,
        dispositionByReadKey,
        reassessPairs,
        reasonByReadKey,
        ambiguousReadKeys,
        prompt: prompt !== undefined
          ? { disposition: prompt.disposition, buffer: prompt.buffer, file: prompt.item.site.file, line: prompt.item.site.line, ...(prompt.error === true ? { error: true } : {}) }
          : undefined,
        filesTotal: input.outcome.fileCount,
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

  const clampSelection = (): void => {
    const rows = currentRows();
    if (selectedRow >= rows.length) {
      let next = rows.length - 1;
      while (next >= 0 && !rows[next].selectable) next--;
      selectedRow = Math.max(0, next);
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
      if (key === "ignore") return;
      // The reason prompt consumes every key until submitted or cancelled.
      if (prompt !== undefined) {
        if (key === "esc" || key === "\x03") { prompt = undefined; notice = undefined; return; }
        if (key === "\r" || key === "\n") {
          const reason = prompt.buffer.trim();
          if (reason === "") { prompt = { ...prompt, error: true }; return; }
          const p = prompt;
          prompt = undefined;
          const idKey = rawKeyOf(p.item.readKey);
          if (idKey === undefined) { notice = "cannot record: no identity key for this finding (rescan)"; return; }
          if (readKeyShares(p.item.readKey) > 1) {
            notice = `held back: ${ambiguousReadKeys.get(p.item.readKey)} identical occurrences share this identity — they must diverge before a decision applies`;
            return;
          }
          // Provenance is computed BEFORE the write and passed INTO it, so
          // the disk record carries it — adding it only to the in-memory
          // copy made the decision resurface as "doctor changed" after
          // restart (review probe).
          const provRecorded = view !== undefined
            ? (() => {
              const rev = view.provenance.revisions.get(p.item.checkKey);
              return rev !== undefined
                ? { revision: rev }
                : { programDigest: view.provenance.programDigests.get(p.item.checkKey.split("/")[0]) };
            })()
            : undefined;
          const r = decide({ key: idKey, checkKey: p.item.checkKey, file: p.item.site.file, line: p.item.site.line, disposition: p.disposition, reason, actor: "dashboard",
            ...(provRecorded !== undefined ? { provenance: provRecorded } : {}) });
          if (!r.ok) { notice = r.error; return; }
          // The next view re-derives every law from the updated list.
          if (view !== undefined && captureForView !== undefined) {
            const prior = view.decisions.find((d) => d.key === idKey);
            const now = new Date().toISOString();
            const record = {
              key: idKey, checkKey: p.item.checkKey, file: p.item.site.file, line: p.item.site.line,
              disposition: p.disposition, reason, scope: "local" as const, actor: "dashboard",
              createdAt: prior?.createdAt ?? now, updatedAt: now,
              ...(provRecorded !== undefined ? { provenance: provRecorded } : {}),
            };
            view = withDecision(view, record, encodeForView, captureForView, view.provenance);
            ({ dispositionByReadKey, reasonByReadKey, reassessPairs, ambiguousReadKeys } = deriveViewMaps());
          }
          notice = `${p.disposition === "accepted" ? "accepted" : "not applicable"} — hidden from the active list (v reviews, u undoes)`;
          rebuildTrees();
          clampSelection();
          return;
        }
        if (key === "backspace" || key === "\x7f" || key === "\b") {
          prompt = { ...prompt, buffer: prompt.buffer.slice(0, -1), error: undefined };
          return;
        }
        if (key.length === 1 && prompt.buffer.length < 200) {
          prompt = { ...prompt, buffer: prompt.buffer + key, error: undefined };
          return;
        }
        return;
      }
      if (key === "q" || key === "\x03" || key === "esc") return finish();
      if (key === "up" || key === "k") return step(-1);
      if (key === "down" || key === "j") return step(1);
      const rows = currentRows();
      const row = rows[selectedRow];
      const rowKey = toggleKeyOf(row);

      if (key === "v") {
        showReviewed = !showReviewed;
        const decidedCount = view?.suppressedReadKeys.size ?? 0;
        notice = showReviewed && decidedCount > 0
          ? `review view — ${decidedCount} decided finding${decidedCount === 1 ? "" : "s"} shown dim`
          : undefined;
        selectedRow = 0;
        step(1);
        return;
      }
      if ((key === "a" || key === "x") && row?.item !== undefined && row.reviewed === undefined) {
        prompt = { disposition: key === "a" ? "accepted" : "not-applicable", buffer: "", item: row.item };
        notice = undefined;
        return;
      }
      if (key === "u" && row?.item !== undefined && row.reviewed !== undefined) {
        const idKey = rawKeyOf(row.item.readKey);
        if (idKey === undefined) { notice = "cannot reverse: no identity key (rescan)"; return; }
        const r = reverse(idKey);
        if (!r.ok) { notice = r.error; return; }
        if (view !== undefined && captureForView !== undefined) {
          view = withoutDecision(view, idKey, encodeForView, captureForView, view.provenance);
          ({ dispositionByReadKey, reasonByReadKey, reassessPairs, ambiguousReadKeys } = deriveViewMaps());
        }
        notice = "decision reversed — the finding returns to the active list";
        rebuildTrees();
        clampSelection();
        return;
      }

      if (key === "c") {
        // Copy at the level you're on: one finding, a whole check, or an
        // entire doctor — the bulk task is the natural agent unit.
        if (row?.item) {
          copy(fixPrompt(row.item, verifyCmdFor(row.item.doctorId), decideCommandFor(row.item)), "copied finding");
        } else if (row?.check) {
          const check = row.check;
          const items = tree().find(d => d.doctorId === check.doctorId)
            ?.checks.find(g => g.checkKey === check.checkKey)?.items ?? [];
          copy(checkFixPrompt(items, verifyCmdFor(check.doctorId)),
            `copied ${items.length} findings from ${check.checkKey}`);
        } else if (row?.doctor) {
          const doctor = row.doctor;
          const group = tree().find(d => d.doctorId === doctor.doctorId);
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
        copy(fixPrompt(row.item, verifyCmdFor(row.item.doctorId), decideCommandFor(row.item)), "copied finding");
        return;
      }
    },
  });
}
