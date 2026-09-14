import { eastAsianWidth } from "get-east-asian-width";
import { stripVTControlCharacters } from "node:util";
import { createKeyFeed } from "./keys.js";

// The tty session: the one place that owns the interactive terminal loop —
// raw-mode lifecycle, key feed, and paint discipline. Every TUI (picker,
// dashboard) is content over this loop: it supplies a frame builder and a
// keymap, and never touches raw mode, the cursor, or repaint strategy
// itself. Two adapters already prove the seam: the real tty in the CLI and
// the fake tty in tests.

export interface TtyEnv {
  stdin: TtyStdin;
  stdout: TtyStdout;
}

// The one adapter from Node's process stdio to the tty seam.
export function processTtyEnv(): TtyEnv {
  return {
    stdin: process.stdin as unknown as TtyStdin,
    stdout: process.stdout as unknown as TtyStdout,
  };
}

// "Is this a real terminal" — the shared floor of every TUI decision.
// Deliberately excludes headless env vars and width heuristics: those are
// report-vs-dashboard policy and belong to the command layer.
export function canRunTui(env: { stdin: { readonly isTTY?: boolean }; stdout: { readonly isTTY?: boolean } }): boolean {
  return Boolean(env.stdin.isTTY && env.stdout.isTTY);
}

export interface TtyStdin {
  readonly isTTY?: boolean;
  readonly isRaw?: boolean;
  setRawMode(mode: boolean): unknown;
  resume(): unknown;
  pause(): unknown;
  on(event: "data", listener: (chunk: string | Buffer) => void): unknown;
  removeListener(event: "data", listener: (chunk: string | Buffer) => void): unknown;
}

export interface TtyStdout {
  readonly isTTY?: boolean;
  columns?: number;
  rows?: number;
  write(s: string): unknown;
}

// Conventional terminal cells: East Asian wide/fullwidth and emoji clusters
// occupy two cells; ambiguous characters occupy one. Grapheme boundaries come
// from the runtime's ICU. get-east-asian-width supplies the Unicode width table.
const graphemes = new Intl.Segmenter("en", { granularity: "grapheme" });

// Content is one inert line. Preserve SGR styling, remove other VT commands,
// cursor-moving C0/C1 controls, line separators and bidi layout controls. This
// also removes stray ESC bytes from malformed sequences. Paint commands belong
// to paintFrame, never to doctor-controlled text.
function safeLine(s: string): string {
  return s.split(/(\x1b\[[0-9;:]*m)/g).map((part, i) => i % 2 ? part
    : stripVTControlCharacters(part).replace(/[\x00-\x1f\x7f-\x9f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g, "")).join("");
}

function clusterWidth(cluster: string): number {
  // Text-default symbols (e.g. warning/info) stay text-width unless VS16 or
  // a ZWJ emoji sequence requests emoji presentation. No per-glyph exceptions.
  if (/\p{Emoji_Presentation}|\p{Emoji}\uFE0F|\u20E3/u.test(cluster)
    || (cluster.includes("\u200d") && /\p{Extended_Pictographic}/u.test(cluster))) return 2;
  const base = [...cluster].find(ch => !/[\p{Mark}\p{Default_Ignorable_Code_Point}]/u.test(ch));
  return base === undefined ? 0 : eastAsianWidth(base.codePointAt(0)!, { ambiguousAsWide: false });
}

export function visibleWidth(s: string): number {
  let width = 0;
  for (const { segment } of graphemes.segment(stripVTControlCharacters(safeLine(s)))) width += clusterWidth(segment);
  return width;
}

export function truncateVisible(s: string, width: number): string {
  const limit = Math.max(0, Math.floor(width));
  if (limit === 0) return "";
  const safe = safeLine(s);
  if (visibleWidth(safe) <= limit) return safe;
  // Truncation deliberately removes styling. Segment the plain text first so
  // even an SGR transition inside a combining/ZWJ cluster cannot split it or
  // leave an active color behind. Fitting, safe strings retain their bytes.
  let out = "", cells = 0;
  for (const { segment } of graphemes.segment(stripVTControlCharacters(safe))) {
    const next = clusterWidth(segment);
    if (cells + next > limit - 1) break;
    out += segment;
    cells += next;
  }
  return out + "…";
}

// The one paint-width policy for every in-place painter (frames and the
// live line): a column of headroom, floored so a tiny terminal cannot
// produce a degenerate width. A tty that reports nothing — undefined OR
// zero (expect's PTYs report 0) — is unknown, not tiny, and paints at
// the 120 default. One definition — spinner.ts and paintFrame both call
// it, so truncation cannot drift between them.
export function paintWidth(columns: number | undefined): number {
  const cols = columns !== undefined && columns > 0 ? columns : 120;
  return Math.max(10, cols - 1);
}

// In-place repaint, always: home the cursor and rewrite every line with a
// clear-to-end-of-line, then clear below the frame. Per-line \x1b[K plus
// the trailing \x1b[J fully own the screen, so no full-screen \x1b[2J
// erase is ever needed — including on the first paint, where the erase
// showed as a one-time blank flash while the frame streamed in. The payload
// is wrapped in DECSET 2026 (synchronized output): terminals that support
// it hold the repaint until the frame is fully transmitted, so they never
// paint a half-frame; terminals that don't simply ignore the mode.
export function paintFrame(stdout: TtyStdout, frame: string, cols?: number): void {
  const lines = frame.split("\n").map(l => truncateVisible(l, paintWidth(cols)) + "\x1b[K");
  stdout.write("\x1b[?2026h\x1b[H" + lines.join("\n") + "\x1b[J\x1b[?2026l");
}

export interface RunTtyOptions<T> {
  stdin: TtyStdin;
  stdout: TtyStdout;
  frame: () => string;
  // Handle one key. Call finish(result) to end the session; return without
  // it and the session repaints. A throw is reported on stderr and the
  // session holds — it never crashes the TUI.
  onKey: (key: string, finish: (result: T) => void) => void;
}

export function runTty<T>(options: RunTtyOptions<T>): Promise<T> {
  const { stdin, stdout, frame, onKey } = options;
  return new Promise<T>((resolve) => {
    const wasRaw = stdin.isRaw;
    stdin.setRawMode(true);
    stdin.resume();
    stdout.write("\x1b[?25l");
    let lastFrame: string | undefined;
    const repaint = (): void => {
      const f = frame();
      if (f === lastFrame) return; // identical frame: not one byte of churn
      lastFrame = f;
      paintFrame(stdout, f, stdout.columns);
    };
    let settled = false;
    const finish = (result: T): void => {
      if (settled) return;
      settled = true;
      stdin.removeListener("data", feed);
      if (wasRaw !== undefined) stdin.setRawMode(wasRaw);
      stdin.pause();
      stdout.write("\x1b[?25h");
      resolve(result);
    };
    const guarded = (key: string): void => {
      try {
        onKey(key, finish);
        if (!settled) repaint();
      } catch (e) {
        process.stderr.write("key handling error: " + String(e));
      }
    };
    const feed = createKeyFeed(guarded);
    // The first paint gets the same armor as every repaint: a throwing
    // frame builder degrades to a blank-but-alive session (keys still work,
    // finish still restores the tty) instead of a hung promise and a leaked
    // raw mode.
    try {
      repaint();
    } catch (e) {
      process.stderr.write("initial paint failed: " + String(e) + "\n");
    }
    stdin.on("data", feed);
  });
}
