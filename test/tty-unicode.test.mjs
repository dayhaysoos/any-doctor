import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { terminalCells, plainSgr } from './support/terminal-cells.mjs';
const candidate = process.env.DOCTOR_CANDIDATE_ROOT ?? fileURLToPath(new URL('../', import.meta.url));
const { visibleWidth, truncateVisible } = await import(`${candidate}/bin/tty.js`);

const corpus = [
  ['ℹ\u200d', 1], ['©\u200d', 1], ['⚠\u200d', 1], ['⚡', 2], ['\u20e3', 0], ['\u0301\u20e3', 0], ['A\u20e3', 1], ['#️⃣', 2], ['⚠', 1], ['ℹ', 1], ['✔', 1], ['⚠️', 2], ['\x1b[38:2::255:0:0m界\x1b[0m', 2], ['\x1b[38:2::0:255:0me\u0301\x1b[0m', 1], ['abc', 3], ['界', 2], ['界界界', 6], ['Ａ', 2], ['　', 2],
  ['e\u0301', 1], ['🧪', 2], ['👩‍💻', 2], ['❤️', 2], ['👍🏽', 2], ['🇺🇸', 2],
  ['\x1b[31m界界界\x1b[0m', 6], ['\x1b[32me\u0301\x1b[0m', 1],
  ['\u0301', 0], ['\u05b0', 0], ['\ufe0f', 0], ['\u200d', 0], ['·', 1],
];
for (const [text, cells] of corpus) test(`terminal cells: ${JSON.stringify(text)} = ${cells}`, () => {
  assert.equal(visibleWidth(text), cells);
});

const boundaries = [
  ['e\x1b[38:2::255:0:0m\u0301xyz\x1b[0m', 2, 'e\u0301…'], ['a界bc', 2, 'a…'], ['a界bc', 4, 'a界…'], ['界界界', 3, '界…'],
  ['e\u0301xyz', 2, 'e\u0301…'], ['👩‍💻ab', 2, '…'], ['👩‍💻ab', 3, '👩‍💻…'],
  ['❤️ab', 3, '❤️…'], ['👍🏽ab', 3, '👍🏽…'], ['🇺🇸ab', 3, '🇺🇸…'],
  ['a界', 3, 'a界'], ['界', 0, ''], ['abc', 1, '…'], ['', 0, ''],
  ['\x1b[31ma界\x1b[32mbc\x1b[0m', 4, 'a界…'],
  ['e\x1b[31m\u0301xyz\x1b[0m', 2, 'e\u0301…'],
  ['👩\x1b[31m‍💻ab\x1b[0m', 3, '👩‍💻…'],
];
for (const [text, width, expected] of boundaries) test(`grapheme boundary: ${JSON.stringify(text)} at ${width}`, () => {
  const out = truncateVisible(text, width);
  assert.equal(plainSgr(out), expected);
  assert.ok(terminalCells(out) <= width, 'independent cell oracle includes the ellipsis');
  assert.ok(!plainSgr(out).includes('\x1b'), 'no incomplete ANSI escape');
  if (out.includes('\x1b') && out !== text) assert.ok(out.endsWith('\x1b[0m'), 'truncated styling is closed');
});

test('fitting Unicode and balanced ANSI strings are unchanged', () => {
  for (const [text, cells] of corpus.filter(([,cells]) => cells > 0)) assert.equal(truncateVisible(text, cells), text);
});

test('truncated open SGR cannot style subsequent terminal text', () => {
  const out = truncateVisible('\x1b[31m界界界', 3);
  assert.equal(plainSgr(out), '界…');
  assert.ok(!out.includes('\x1b') || out.endsWith('\x1b[0m'));
});

test('terminal controls cannot escape a bounded content line', () => {
  for (const text of ['a\tb\nc\rd\b', '\x1b[2Ja\x1b[20Cb', '\x1b]0;title\x07ab', 'a\x9bb', 'a\u2028b', 'a\u202eb']) {
    const out = truncateVisible(text, 20);
    assert.doesNotMatch(plainSgr(out), /[\x00-\x1f\x7f-\x9f\u2028\u2029\u202a-\u202e\u2066-\u2069]/);
    assert.ok(terminalCells(out) <= 20);
  }
});

test('combining keycap marks alone fit without an invented ellipsis', () => {
  assert.equal(truncateVisible('\u20e3', 1), '\u20e3');
  assert.equal(truncateVisible('A\u20e3x', 2), 'A\u20e3x');
});
