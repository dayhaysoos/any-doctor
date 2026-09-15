// Independent, deliberately closed oracle for the reviewed test corpus. No
// production imports, Unicode tables or grapheme segmenter are shared. Unknown
// glyphs fail rather than silently getting an assumed width. Longest tokens
// encode complete reviewed clusters, so a split mark/ZWJ sequence also fails.
const clusters = new Map([
  ['👩‍💻', 2], ['❤️', 2], ['e\u0301', 1], ['👍🏽', 2], ['🇺🇸', 2],
  ['⚡', 2], ['🧪', 2], ['界', 2], ['医', 2], ['師', 2], ['文', 2], ['件', 2],
  ['名', 2], ['Ａ', 2], ['　', 2],
]);
const narrow = new Set('ℹ›✖…—–·×△✔✓⚠↑↓→←─│┌┐└┘├┤┬┴┼▸▾▏█░▒▓●○✘⊘◆◇↳•✗✕➜┊╭╮╰╯');
export const plainSgr = text => text.replace(/\x1b\[[0-9;:]*m/g, '');
export function terminalCells(text) {
  let remaining = plainSgr(text), cells = 0;
  while (remaining) {
    const token = [...clusters.keys()].find(token => remaining.startsWith(token));
    if (token) { cells += clusters.get(token); remaining = remaining.substring(token.length); continue; }
    const ch = [...remaining][0];
    if (/^[\x20-\x7e]$/.test(ch) || narrow.has(ch)) cells++;
    else throw new Error(`Unreviewed or split terminal glyph: ${JSON.stringify(ch)} in ${JSON.stringify(text)}`);
    remaining = remaining.substring(ch.length);
  }
  return cells;
}
