import { fuzzyFilter } from "./fuzzy.js";
import { Severity } from "./contract.js";
import { BOLD, colorizer, DIM, GLYPH, GREEN, SEVERITY_COLOR } from "./palette.js";
import { canRunTui, runTty, TtyEnv } from "./tty.js";

export interface PickerItem {
  id: string;
  label: string;
  sub?: string;
  severity?: Severity;
}

export function pickerFrame(
  title: string,
  items: PickerItem[],
  selected: number,
  query: string,
  useColor: boolean,
  notice?: string,
  chosen?: ReadonlySet<string>,
): string {
  const c = colorizer(useColor);
  const multi = chosen !== undefined;
  const hint = multi
    ? "  (type to filter · ↑↓ move · space select · enter run · esc cancel)"
    : "  (type to filter · ↑↓ move · enter select · esc cancel)";
  const lines: string[] = [];
  lines.push(c(title, BOLD) + c(hint, DIM));
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
      const box = multi ? c(chosen!.has(it.id) ? "[x] " : "[ ] ", chosen!.has(it.id) ? GREEN : DIM) : "";
      const row = `${glyph}${box}${it.label}${it.sub ? c("  " + it.sub, DIM) : ""}`;
      lines.push(i === selected ? c("❯ " + row, BOLD) : "  " + row);
    }
    if (items.length > cap) lines.push(c(`  … +${items.length - cap} more`, DIM));
    if (multi) lines.push(c(`${chosen!.size} of ${items.length} selected · enter runs the selection`, DIM));
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

// The cohort selector: every doctor pre-selected (Enter alone still runs
// everything — the cold start stays one keypress), space toggles the row
// under the cursor, and an empty selection refuses to run (notice, stay).
// Toggling operates on the FILTERED row, so query + space deselects
// precisely what the filter shows.
export async function pickItemsOn(
  env: TtyEnv,
  items: PickerItem[],
  useColor: boolean,
  title: string = "Select doctors to run",
): Promise<PickerItem[] | null> {
  if (items.length === 0 || !canRunTui(env)) return null;

  const chosen = new Set(items.map(it => it.id));
  let query = "";
  let selected = 0;
  let notice: string | undefined;

  const filtered = (): PickerItem[] => filterPickerItems(items, query);

  const frame = (): string => {
    const list = filtered();
    if (selected >= list.length) selected = Math.max(0, list.length - 1);
    return pickerFrame(title, list, selected, query, useColor, notice, chosen);
  };

  return runTty<PickerItem[] | null>({
    stdin: env.stdin,
    stdout: env.stdout,
    frame,
    onKey: (key, finish) => {
      notice = undefined;
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
      if (key === " ") {
        const list = filtered();
        const it = list[Math.min(selected, list.length - 1)];
        if (it) {
          if (chosen.has(it.id)) chosen.delete(it.id);
          else chosen.add(it.id);
        }
        return;
      }
      if (key === "\r" || key === "\n") {
        if (chosen.size === 0) {
          notice = "nothing selected — space to select, or esc to cancel";
          return;
        }
        finish(items.filter(it => chosen.has(it.id)));
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

export async function pickItemOn(
  env: TtyEnv,
  items: PickerItem[],
  useColor: boolean,
  title: string = "Select an option",
  notice?: string,
): Promise<PickerItem | null> {
  if (items.length === 0 || !canRunTui(env)) return null;

  let query = "";
  let selected = 0;

  const filtered = (): PickerItem[] => filterPickerItems(items, query);

  const frame = (): string => {
    const list = filtered();
    if (selected >= list.length) selected = Math.max(0, list.length - 1);
    return pickerFrame(title, list, selected, query, useColor, notice);
  };

  return runTty<PickerItem | null>({
    stdin: env.stdin,
    stdout: env.stdout,
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
