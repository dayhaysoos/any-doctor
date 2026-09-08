// The one masking implementation (D20 Stage 1). Comments and string
// literals are blanked; OFFSETS AND LENGTH ARE PRESERVED — every char
// becomes a space except newlines, so a position computed on the masked
// text addresses the same char in the raw source.
//
// Two host-side consumers share it: ctx.files.readMasked (the sdk — what
// doctors pattern-match against) and the capability gate (capabilities.ts —
// so the Confinement tripwire and the doctors see the same code). The
// single-file law forbids DOCTORS from importing it; they get it through
// ctx. First-party host code has no such constraint, so there is exactly
// one copy, here.
export function maskNonCode(source) {
    const chars = source.split("");
    let index = 0;
    while (index < source.length) {
        const char = source[index];
        const next = source[index + 1];
        if (char === "/" && next === "/") {
            const end = source.indexOf("\n", index + 2);
            const stop = end === -1 ? source.length : end;
            for (let cursor = index; cursor < stop; cursor += 1)
                chars[cursor] = " ";
            index = stop;
        }
        else if (char === "/" && next === "*") {
            const end = source.indexOf("*/", index + 2);
            const stop = end === -1 ? source.length : end + 2;
            for (let cursor = index; cursor < stop; cursor += 1) {
                if (chars[cursor] !== "\n")
                    chars[cursor] = " ";
            }
            index = stop;
        }
        else if (char === "'" || char === '"' || char === "`") {
            const quote = char;
            let cursor = index + 1;
            while (cursor < source.length) {
                if (source[cursor] === "\\") {
                    cursor += 2;
                }
                else if (source[cursor] === quote) {
                    cursor += 1;
                    break;
                }
                else {
                    cursor += 1;
                }
            }
            for (let position = index; position < cursor; position += 1) {
                if (chars[position] !== "\n")
                    chars[position] = " ";
            }
            index = cursor;
        }
        else {
            index += 1;
        }
    }
    return chars.join("");
}
