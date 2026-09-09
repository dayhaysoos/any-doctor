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
