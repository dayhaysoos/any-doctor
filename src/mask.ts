// The one masking implementation (D20 Stage 1). Comments, string
// literals, and REGEX LITERALS are blanked; OFFSETS AND LENGTH ARE
// PRESERVED — every char becomes a space except newlines, so a position
// computed on the masked text addresses the same char in the raw source.
//
// Regex literals must be masked because they may contain quote
// characters: an unmasked /["']/ opens a phantom string that swallows
// every line after it (found by slop-doctor flagging imports whose
// type-position uses had been masked out of existence).
//
// Two host-side consumers share it: ctx.files.readMasked (the sdk — what
// doctors pattern-match against) and the capability gate (capabilities.ts —
// so the Confinement tripwire and the doctors see the same code). The
// single-file law forbids DOCTORS from importing it; they get it through
// ctx. First-party host code has no such constraint, so there is exactly
// one copy, here.
// A `/` opens a regex literal (not division) after these characters or
// after these keywords; anywhere else it divides. `<` and `>` are
// deliberately absent: a `/` right after `<` is a JSX CLOSING TAG
// (`</Link>`), and treating it as a regex opener phantom-masks the rest
// of the component — the 0.0.4 false-positive mechanism. Comparison
// operators before a regex (`a < /re/.test(x)`) are vanishingly rare
// next to JSX.
const REGEX_PRECEDER_CHARS = "=([{,;:!&|?+-*%^~";
const REGEX_PRECEDER_WORDS = new Set([
  "return", "typeof", "instanceof", "in", "of", "case", "delete", "void",
  "throw", "new", "do", "else", "yield", "await",
]);

export function maskNonCode(source: string): string {
  const chars = source.split("");
  let index = 0;
  let lastCodeChar = "";
  let lastWord = "";

  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];

    if (char === "/" && next === "/") {
      const end = source.indexOf("\n", index + 2);
      const stop = end === -1 ? source.length : end;
      for (let cursor = index; cursor < stop; cursor += 1) chars[cursor] = " ";
      lastCodeChar = "";
      lastWord = "";
      index = stop;
    } else if (char === "/" && next === "*") {
      const end = source.indexOf("*/", index + 2);
      const stop = end === -1 ? source.length : end + 2;
      for (let cursor = index; cursor < stop; cursor += 1) {
        if (chars[cursor] !== "\n") chars[cursor] = " ";
      }
      index = stop;
    } else if (char === "'" || char === '"' || char === "`") {
      const quote = char;
      let cursor = index + 1;
      while (cursor < source.length) {
        if (source[cursor] === "\\") {
          cursor += 2;
        } else if (source[cursor] === quote) {
          cursor += 1;
          break;
        } else {
          cursor += 1;
        }
      }
      for (let position = index; position < cursor; position += 1) {
        if (chars[position] !== "\n") chars[position] = " ";
      }
      index = cursor;
    } else if (char === "/" && opensRegex(source, index, lastCodeChar, lastWord)) {
      // Regex literal: scan to its closing unescaped slash (a slash
      // inside a [...] class does not close) plus any flags, mask the
      // whole span — the quotes inside regexes are the phantom-string
      // source this fix exists for.
      let cursor = index + 1;
      let inClass = false;
      while (cursor < source.length) {
        const c = source[cursor];
        if (c === "\\") {
          cursor += 2;
          continue;
        }
        if (inClass) {
          if (c === "]") inClass = false;
        } else if (c === "[") {
          inClass = true;
        } else if (c === "/" || c === "\n") {
          break;
        }
        cursor += 1;
      }
      if (cursor < source.length && source[cursor] === "/") cursor += 1;
      while (cursor < source.length && /[a-z]/.test(source[cursor])) cursor += 1;
      for (let position = index; position < cursor; position += 1) {
        if (chars[position] !== "\n") chars[position] = " ";
      }
      lastCodeChar = "/";
      lastWord = "";
      index = cursor;
    } else {
      if (/\S/.test(char)) {
        lastCodeChar = char;
        if (/[A-Za-z0-9_$]/.test(char)) {
          lastWord += char;
        } else {
          lastWord = "";
        }
      }
      index += 1;
    }
  }

  return chars.join("");
}

function opensRegex(source: string, index: number, lastCodeChar: string, lastWord: string): boolean {
  if (lastCodeChar === "") return true; // start of file
  if (REGEX_PRECEDER_CHARS.includes(lastCodeChar)) return true;
  if (/[A-Za-z0-9_$]/.test(lastCodeChar) && REGEX_PRECEDER_WORDS.has(lastWord)) return true;
  return false;
}
