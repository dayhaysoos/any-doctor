export type KeyHandler = (key: string) => void;

const FLUSH_MS = 30;

export function createKeyFeed(onKey: KeyHandler): (chunk: string | Buffer) => void {
  let buf = "";
  let holdTimer: NodeJS.Timeout | null = null;

  const clearHold = (): void => {
    if (holdTimer) {
      clearTimeout(holdTimer);
      holdTimer = null;
    }
  };

  const flushHeldEsc = (): void => {
    clearHold();
    const held = buf;
    buf = "";
    onKey(held === "\x1b" ? "esc" : held);
  };

  return (chunk: string | Buffer): void => {
    clearHold();
    buf += typeof chunk === "string" ? chunk : chunk.toString("utf8");

    let i = 0;
    for (;;) {
      if (i >= buf.length) {
        buf = "";
        return;
      }
      const ch = buf[i];
      if (ch !== "\x1b") {
        onKey(ch);
        i++;
        continue;
      }
      if (i === buf.length - 1) {
        buf = buf.slice(i);
        holdTimer = setTimeout(flushHeldEsc, FLUSH_MS);
        return;
      }
      if (buf[i + 1] === "[") {
        let j = i + 2;
        while (j < buf.length && !/[A-Za-z~]/.test(buf[j])) j++;
        if (j >= buf.length) {
          buf = buf.slice(i);
          holdTimer = setTimeout(flushHeldEsc, FLUSH_MS);
          return;
        }
        const seq = buf.slice(i, j + 1);
        if (seq === "\x1b[A") onKey("up");
        else if (seq === "\x1b[B") onKey("down");
        else onKey("esc");
        i = j + 1;
        continue;
      }
      onKey("esc");
      i++;
    }
  };
}
