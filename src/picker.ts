import { fuzzyFilter } from "./fuzzy";
import { Severity } from "./contract";

const GREEN = "\x1b[32m", YELLOW = "\x1b[33m", CYAN = "\x1b[36m",
      DIM = "\x1b[2m", BOLD = "\x1b[1m", RESET = "\x1b[0m";

const GLYPH: Record<Severity, string> = { error: "✖", warning: "⚠", info: "ℹ" };
const COLOR: Record<Severity, string> = { error: GREEN, warning: YELLOW, info: CYAN };

export interface PickerItem {
  id: string;
  label: string;
  sub?: string;
  severity?: Severity;
}

export function pickerFrame(title: string, items: PickerItem[], selected: number, query: string, useColor: boolean, notice?: string): string {
  const c = (s: string, wrap?: string): string => (useColor && wrap ? wrap + s + RESET : s);
  const lines: string[] = [];
  lines.push(c(title, BOLD) + c("  (type to filter · ↑↓ move · enter select · esc cancel)", DIM));
  lines.push("");
  lines.push(c("❯ " + query, BOLD) + c("▏", DIM));
  lines.push("");
  if (items.length === 0) {
    lines.push(c("  no matching doctors", DIM));
  } else {
    const cap = Math.min(items.length, 12);
    for (let i = 0; i < cap; i++) {
      const it = items[i];
      const glyph = it.severity ? c(GLYPH[it.severity] + " ", COLOR[it.severity]) : "";
      const row = `${glyph}${it.label}${it.sub ? c("  " + it.sub, DIM) : ""}`;
      lines.push(i === selected ? c("❯ " + row, BOLD) : "  " + row);
    }
    if (items.length > cap) lines.push(c(`  … +${items.length - cap} more`, DIM));
  }
  if (notice) {
    lines.push("");
    lines.push(c("✔ " + notice, GREEN));
  }
  return lines.join("\n");
}

export function filterPickerItems(items: PickerItem[], query: string): PickerItem[] {
  return fuzzyFilter(items, it => `${it.id} ${it.label} ${it.sub ?? ""}`, query);
}

export function isPrintable(s: string): boolean {
  return s.length === 1 && s >= " " && s !== "\x7f";
}

export async function pickItem(items: PickerItem[], useColor: boolean, title: string = "Select an option", notice?: string): Promise<PickerItem | null> {
  const stdin = process.stdin;
  const stdout = process.stdout;
  if (!stdin.isTTY || !stdout.isTTY || items.length === 0) return null;

  const c = (s: string, wrap?: string): string => (useColor && wrap ? wrap + s + RESET : s);
  let query = "";
  let selected = 0;

  const filtered = (): PickerItem[] => filterPickerItems(items, query);

  const draw = (): void => {
    const list = filtered();
    if (selected >= list.length) selected = Math.max(0, list.length - 1);
    stdout.write("\x1b[H\x1b[2J" + pickerFrame(title, list, selected, query, useColor, notice));
  };

  return new Promise<PickerItem | null>((resolve) => {
    const wasRaw = stdin.isRaw;
    stdin.setRawMode(true);
    stdin.resume();
    stdout.write("\x1b[?25l");
    draw();

    const cleanup = (result: PickerItem | null): void => {
      stdin.removeListener("data", onData);
      if (wasRaw !== undefined) stdin.setRawMode(wasRaw);
      stdin.pause();
      stdout.write("\x1b[?25h");
      resolve(result);
    };

    const onData = (buf: Buffer): void => {
      const s = buf.toString("utf8");
      if (s === "\x03" || s === "\x1b") return cleanup(null);
      if (s === "\x7f" || s === "\b") {
        query = query.slice(0, -1);
        selected = 0;
        return draw();
      }
      if (s === "\x1b[A" || s === "k") {
        selected = Math.max(0, selected - 1);
        return draw();
      }
      if (s === "\x1b[B" || s === "j") {
        selected = Math.min(filtered().length - 1, selected + 1);
        return draw();
      }
      if (s === "\r" || s === "\n") {
        const list = filtered();
        if (list.length === 0) return;
        return cleanup(list[Math.min(selected, list.length - 1)]);
      }
      if (isPrintable(s)) {
        query += s;
        selected = 0;
        return draw();
      }
    };

    stdin.on("data", onData);
  });
}
