import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as analysis from '../bin/analysis.js';

const source = `import { mutation as change } from './_generated/server';
export const update = change({args: {}, handler: async (context) => {
  context.db.patch('a', {});
  const unrelated = 42;
  await Promise.all([]);
  const returned = () => context.db.patch('b', {});
  const discarded = () => { context.db.patch('c', {}); };
  function shadow(context) { context.db.patch('d', {}); }
  (context.db.patch('e', {}) as Promise<void>);
  const start = Date.now();
  return Date.now() - start;
}});`;

test('call facts separate discarded expressions, returned callbacks, and parameter identities', () => {
  const result = analysis.analyzeCalls('convex/sample.ts', source);
  assert.equal(result.ok, true, result.error);
  const {calls, functions, differences} = result.file;
  const patches = calls.filter(c => c.target.members.join('.') === 'db.patch');
  assert.deepEqual(patches.map(c => c.usage), ['discarded', 'returned', 'discarded', 'discarded', 'discarded']);
  assert.equal(patches[0].target.binding, patches[1].target.binding);
  assert.notEqual(patches[0].target.binding, patches[3].target.binding);
  const handler = functions.find(f => f.registration?.property === 'handler');
  assert.equal(handler.registration.target.importedName, 'mutation');
  assert.equal(handler.registration.target.source, './_generated/server');
  assert.equal(handler.parameters[0], patches[0].target.binding);
  const clock = calls.filter(c => c.target.root === 'Date');
  assert.equal(differences[0].left.call, clock[1].start);
  assert.equal(differences[0].right.binding, clock[0].resultBinding);
});

test('call facts preserve two calls on one line and reject malformed syntax', () => {
  const result = analysis.analyzeCalls('a.ts', 'function f(ctx) { ctx.runQuery(a); ctx.runQuery(b); }');
  assert.equal(result.ok, true);
  assert.equal(result.file.calls.length, 2);
  assert.notEqual(result.file.calls[0].column, result.file.calls[1].column);
  assert.equal(analysis.analyzeCalls('broken.ts', 'export const = ;').ok, false);
});

test('registered callbacks must be actual argument values; nested helpers are not handlers', () => {
  const result = analysis.analyzeCalls('a.ts', `import * as server from './_generated/server';
server.query({handler: () => { const f = () => Date.now(); return f; }});`);
  assert.equal(result.ok, true);
  const handlers = result.file.functions.filter(f => f.registration?.property === 'handler');
  assert.equal(handlers.length, 1);
  assert.equal(handlers[0].registration.target.importedName, '*');
  assert.deepEqual(handlers[0].registration.target.members, ['query']);
  assert.notEqual(result.file.calls.find(c => c.target.root === 'Date').functionStart, handlers[0].start);
});

test('JavaScript function parameters normalize into the TypeScript scope adapter', () => {
  const result = analysis.analyzeCalls('a.js', 'function f(ctx) { ctx.runQuery(a); } class Example { field = 1; method(arg) { return arg; } }');
  assert.equal(result.ok, true, result.error);
  assert.equal(result.file.calls[0].target.binding, result.file.functions[0].parameters[0]);
});

test('reassignment is explicit evidence against treating a context name as stable', () => {
  const result=analysis.analyzeCalls('a.ts', `import {mutation} from './_generated/server';
mutation({handler: async (ctx) => {ctx = other; ctx.db.patch(id, {});}});`);
  assert.equal(result.ok,true,result.error);
  assert.equal(result.file.calls.find(c=>c.target.members.join('.')==='db.patch').target.reassigned,true);
});
