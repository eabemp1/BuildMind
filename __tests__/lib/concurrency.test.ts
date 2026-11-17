import { test, vi, afterEach } from 'vitest';
afterEach(() => { vi.useRealTimers(); });
import assert from 'node:assert/strict';
const load = async () => {
  vi.resetModules();
  return import('../../lib/server/concurrency');
};
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => { resolve = r; });
  return { promise, resolve };
};

test('timeout removes waiter and preserves all five slots for later work', async () => {
  vi.useFakeTimers();
  const { withAgentConcurrencyLimit: run, getAgentConcurrencyStats: stats } = await load();
  const gates = Array.from({ length: 5 }, deferred);
  const running = gates.map((gate) => run(() => gate.promise));
  let timedOutCallbackRan = false;
  const queued = run(async () => { timedOutCallbackRan = true; });
  const rejection = assert.rejects(queued, /AgentConcurrencyLimit: queue timeout/);
  assert.deepEqual(stats(), { active: 5, queued: 1, max: 5 });
  vi.advanceTimersByTime(30_000);
  await rejection;
  assert.equal(stats().queued, 0);
  gates.forEach((gate) => gate.resolve());
  await Promise.all(running);
  assert.equal(timedOutCallbackRan, false);
  assert.deepEqual(stats(), { active: 0, queued: 0, max: 5 });
  const nextGates = Array.from({ length: 5 }, deferred);
  const next = nextGates.map((gate) => run(() => gate.promise));
  assert.equal(stats().active, 5);
  assert.equal(stats().queued, 0);
  nextGates.forEach((gate) => gate.resolve());
  await Promise.all(next);
});

test('hands off slots FIFO without exceeding limit and clears queued timeout', async () => {
  vi.useFakeTimers();
  const { withAgentConcurrencyLimit: run, getAgentConcurrencyStats: stats } = await load();
  const gates = Array.from({ length: 5 }, deferred);
  const running = gates.map((gate) => run(() => gate.promise));
  const order: string[] = [];
  const aGate = deferred();
  const a = run(async () => { order.push('a'); await aGate.promise; return 'a-result'; });
  const b = run(async () => { order.push('b'); return 'b-result'; });
  gates[0].resolve();
  await running[0];
  assert.deepEqual(order, ['a']);
  assert.deepEqual(stats(), { active: 5, queued: 1, max: 5 });
  aGate.resolve();
  assert.equal(await a, 'a-result');
  assert.equal(await b, 'b-result');
  assert.deepEqual(order, ['a', 'b']);
  vi.advanceTimersByTime(30_000);
  gates.slice(1).forEach((gate) => gate.resolve());
  await Promise.all(running);
  assert.deepEqual(stats(), { active: 0, queued: 0, max: 5 });
});

test('rejecting or synchronously throwing callbacks release their slot', async () => {
  const { withAgentConcurrencyLimit: run, getAgentConcurrencyStats: stats } = await load();
  await assert.rejects(run(async () => { throw new Error('async failure'); }), /async failure/);
  await assert.rejects(run(() => { throw new Error('sync failure'); }), /sync failure/);
  assert.deepEqual(stats(), { active: 0, queued: 0, max: 5 });
  assert.equal(await run(async () => 42), 42);
});

test('releases reach a live waiter after an older queued request times out', async () => {
  vi.useFakeTimers();
  const { withAgentConcurrencyLimit: run, getAgentConcurrencyStats: stats } = await load();
  const gates = Array.from({ length: 5 }, deferred);
  const running = gates.map((gate) => run(() => gate.promise));
  const expired = run(async () => assert.fail('expired callback ran'));
  const rejection = assert.rejects(expired, /queue timeout/);
  vi.advanceTimersByTime(15_000);
  const live = run(async () => 'live');
  vi.advanceTimersByTime(15_000);
  await rejection;
  assert.equal(stats().queued, 1);
  gates[0].resolve();
  assert.equal(await live, 'live');
  gates.slice(1).forEach((gate) => gate.resolve());
  await Promise.all(running);
  assert.deepEqual(stats(), { active: 0, queued: 0, max: 5 });
});
