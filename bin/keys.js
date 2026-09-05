const FLUSH_MS = 30;
export function createKeyFeed(onKey) {
    let buf = "";
    let holdTimer = null;
    const clearHold = () => {
        if (holdTimer) {
            clearTimeout(holdTimer);
            holdTimer = null;
        }
    };
    const flushHeldEsc = () => {
        clearHold();
        const held = buf;
        buf = "";
        onKey(held === "\x1b" ? "esc" : held);
    };
    return (chunk) => {
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
            if (buf[i + 1] === "[" || buf[i + 1] === "O") {
                let j = i + 2;
                while (j < buf.length && !/[A-Za-z~]/.test(buf[j]))
                    j++;
                if (j >= buf.length) {
                    buf = buf.slice(i);
                    holdTimer = setTimeout(flushHeldEsc, FLUSH_MS);
                    return;
                }
                const seq = buf.slice(i, j + 1);
                if (seq === "\x1b[A" || seq === "\x1bOA")
                    onKey("up");
                else if (seq === "\x1b[B" || seq === "\x1bOB")
                    onKey("down");
                else
                    onKey("ignore");
                i = j + 1;
                continue;
            }
            onKey("esc");
            i++;
        }
    };
}
