import { createKeyFeed } from "./keys.js";

// The tty session: the one place that owns the interactive terminal loop —
// raw-mode lifecycle, key feed, and paint discipline. Every TUI (picker,
// dashboard) is content over this loop: it supplies a frame builder and a
// keymap, and never touches raw mode, the cursor, or repaint strategy
// itself. Two adapters already prove the seam: the real tty in the CLI and
// the fake tty in tests.

// "Is this a real terminal" — the shared floor of every TUI decision.
// Deliberately excludes headless env vars and width heuristics: those are
// report-vs-dashboard policy and belong to the command layer.
export function canRunTui(stdin: { readonly isTTY?: boolean }, stdout: { readonly isTTY?: boolean }): boolean {
  return Boolean(stdin.isTTY && stdout.isTTY);
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

// In-place repaint: home the cursor and rewrite every line with a
// clear-to-end-of-line so shorter content cannot leave ghosts, then clear
// below the frame. A full-screen \x1b[2J erase on every keypress leaves a
// blank window while the frame streams back in, which reads as flicker; the
// erase runs only on the first paint.
export function paintFrame(stdout: TtyStdout, frame: string, cols: number, first: boolean): void {
  const width = Math.max(10, cols - 1);
  const lines = frame.split("\n").map(l => truncateVisible(l, width) + "\x1b[K");
  stdout.write((first ? "\x1b[H\x1b[2J" : "\x1b[H") + lines.join("\n") + "\x1b[J");
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
    let firstPaint = true;
    const repaint = (): void => {
      paintFrame(stdout, frame(), stdout.columns || 120, firstPaint);
      firstPaint = false;
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
    repaint();
    stdin.on("data", feed);
  });
}
