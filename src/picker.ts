import { fuzzyFilter } from "./fuzzy.js";
import { Severity } from "./contract.js";
import { BOLD, colorizer, DIM, GLYPH, GREEN, RESET, SEVERITY_COLOR } from "./palette.js";
import { canRunTui, runTty, TtyStdin, TtyStdout } from "./tty.js";

export interface PickerItem {
  id: string;
  label: string;
  sub?: string;
  severity?: Severity;
}

export function pickerFrame(title: string, items: PickerItem[], selected: number, query: string, useColor: boolean, notice?: string): string {
  const c = colorizer(useColor);
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
      const glyph = it.severity ? c(GLYPH[it.severity] + " ", SEVERITY_COLOR[it.severity]) : "";
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

export async function pickItemOn(
  stdin: TtyStdin,
  stdout: TtyStdout,
  items: PickerItem[],
  useColor: boolean,
  title: string = "Select an option",
  notice?: string,
): Promise<PickerItem | null> {
  if (items.length === 0 || !canRunTui(stdin, stdout)) return null;

  let query = "";
  let selected = 0;

  const filtered = (): PickerItem[] => filterPickerItems(items, query);

  const frame = (): string => {
    const list = filtered();
    if (selected >= list.length) selected = Math.max(0, list.length - 1);
    return pickerFrame(title, list, selected, query, useColor, notice);
  };

  return runTty<PickerItem | null>({
    stdin,
    stdout,
    frame,
    onKey: (key, finish) => {
      if (key === "\x03" || key === "esc") return finish(null);
      if (key === "\x7f" || key === "\b") {
        query = query.slice(0, -1);
        selected = 0;
        return;
      }
      if (key === "up" || key === "k") {
        selected = Math.max(0, selected - 1);
        return;
      }
      if (key === "down" || key === "j") {
        selected = Math.min(filtered().length - 1, selected + 1);
        return;
      }
      if (key === "\r" || key === "\n") {
        const list = filtered();
        if (list.length > 0) finish(list[Math.min(selected, list.length - 1)]);
        return;
      }
      if (isPrintable(key)) {
        query += key;
        selected = 0;
        return;
      }
    },
  });
}

export function pickItem(items: PickerItem[], useColor: boolean, title: string = "Select an option", notice?: string): Promise<PickerItem | null> {
  return pickItemOn(process.stdin as unknown as TtyStdin, process.stdout as unknown as TtyStdout, items, useColor, title, notice);
}
