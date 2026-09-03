const SYNC_BEGIN = "\x1b[?2026h";
const SYNC_END = "\x1b[?2026l";
const ALT_ENTER = "\x1b[?1049h";
const ALT_EXIT = "\x1b[?1049l";

export interface Writable {
  write(s: string): void;
}

export class Screen {
  private prev: string[] | null = null;
  private usedAlt = false;

  constructor(private out: Writable) {}

  render(lines: string[]): void {
    const out: string[] = [];
    if (this.prev === null) {
      out.push(ALT_ENTER, "\x1b[H", "\x1b[2J");
    }
    out.push(SYNC_BEGIN, "\x1b[H");
    const max = Math.max(this.prev?.length ?? 0, lines.length);
    for (let i = 0; i < max; i++) {
      const current = lines[i] ?? "";
      if (this.prev && this.prev[i] === current) continue;
      out.push(`\x1b[${i + 1};1H\x1b[2K` + current);
    }
    out.push("\x1b[J", SYNC_END);
    this.prev = lines;
    this.out.write(out.join(""));
  }

  exit(): void {
    if (this.usedAlt) this.out.write(ALT_EXIT);
    this.prev = null;
  }
}
