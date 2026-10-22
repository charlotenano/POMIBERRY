import test from 'node:test';
import assert from 'node:assert/strict';
import { finishSession, makeSession, reconcile, remainingMs, startSession, validateDuration } from '../src/timer.js';
import { clearHistory, loadState, saveState } from '../src/storage.js';

test('timer uses an absolute target time and survives a simulated pause', () => {
  const s = makeSession('focus', 25, 'task-1', '', 1000);
  assert.equal(remainingMs(s, 6 * 60_000 + 1000), 19 * 60_000);
});

test('focus completion is recorded as completed and can be followed by a break', () => {
  let state = startSession({ status: 'idle', history: [] }, 'focus', 5, null, '', 0);
  state = finishSession(state, 300_000, true);
  assert.equal(state.history[0].completed, true);
  assert.equal(startSession(state, 'break', 5, null, '', 300_000).status, 'break');
});

test('starting a break while focus is active saves the focus as partial work', () => {
  let state = startSession({ status: 'idle', history: [] }, 'focus', 25, 'task-1', '', 0);
  state = startSession(state, 'break', 5, 'task-1', '', 60_000);
  assert.equal(state.history[0].completed, false);
  assert.equal(state.history[0].actualDurationMs, 60_000);
  assert.equal(state.status, 'break');
});

test('ending early records partial work without calling it completed', () => {
  const state = startSession({ status: 'idle', history: [] }, 'focus', 25, null, '', 0);
  const ended = finishSession(state, 120_000, false);
  assert.equal(ended.history[0].completed, false);
  assert.equal(ended.history[0].actualDurationMs, 120_000);
});

test('expired sessions reconcile after restart against the target timestamp', () => {
  const state = startSession({ status: 'idle', history: [] }, 'focus', 5, null, '', 10_000);
  const recovered = reconcile(state, 311_000);
  assert.equal(recovered.expired, true);
  assert.equal(recovered.state.history[0].endedAt, 310_000);
});

test('invalid durations and state transitions are rejected', () => {
  for (const n of [0, -1, 1.5, 181, NaN]) assert.equal(validateDuration(n), false);
  assert.throws(() => makeSession('focus', 0));
  assert.throws(() => startSession({ status: 'idle' }, 'break', 5));
});

test('local state survives reload and history can be cleared', () => {
  const map = new Map();
  const storage = { getItem: k => map.get(k), setItem: (k, v) => map.set(k, v) };
  const state = { ...loadState(storage), history: [{ id: 'a' }] };
  assert.equal(saveState(state, storage), true);
  assert.equal(loadState(storage).history.length, 1);
  assert.equal(clearHistory(state).history.length, 0);
});
