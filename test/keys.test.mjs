import { test } from "node:test";
import assert from "node:assert/strict";

const { createKeyFeed } = (await import("../bin/keys.js"));

function collect() {
  const keys = [];
  const feed = createKeyFeed(key => keys.push(key));
  return { keys, feed };
}

test("split arrow sequence across chunks emits one 'up', no spurious esc", () => {
  const { keys, feed } = collect();
  feed("\x1b");
  feed("[A");
  assert.deepEqual(keys, ["up"]);
});

test("complete sequence in one chunk works", () => {
  const { keys, feed } = collect();
  feed("\x1b[B");
  assert.deepEqual(keys, ["down"]);
});

test("plain escape emits esc", async () => {
  const { keys, feed } = collect();
  feed("\x1b");
  await new Promise(r => setTimeout(r, 50));
  assert.deepEqual(keys, ["esc"]);
});

test("printable characters pass through individually", () => {
  const { keys, feed } = collect();
  feed("abc");
  assert.deepEqual(keys, ["a", "b", "c"]);
});

test("enter passes through", () => {
  const { keys, feed } = collect();
  feed("\r");
  assert.deepEqual(keys, ["\r"]);
});
