export const STATES = Object.freeze({ IDLE: 'idle', FOCUS: 'focus', BREAK: 'break', COMPLETED: 'completed' });
const transitions = {
  idle: ['focus'],
  focus: ['break', 'completed'],
  break: ['focus', 'completed'],
  completed: ['focus', 'break', 'idle'],
};

export function remainingMs(session, now = Date.now()) {
  if (!session || !['focus', 'break'].includes(session.type)) return 0;
  return Math.max(0, session.targetEndAt - now);
}

export function validateDuration(minutes) {
  return Number.isFinite(minutes) && Number.isInteger(minutes) && minutes >= 1 && minutes <= 180;
}

export function makeSession(type, durationMinutes, taskId = null, contract = '', now = Date.now()) {
  if (!['focus', 'break'].includes(type)) throw new Error('Choose a focus or break session.');
  if (!validateDuration(durationMinutes)) throw new Error('Choose a duration between 1 and 180 minutes.');
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `${now}-${Math.random().toString(36).slice(2)}`,
    type,
    state: type,
    startedAt: now,
    targetEndAt: now + durationMinutes * 60_000,
    durationMinutes,
    taskId,
    contract: contract.trim(),
  };
}

export function startSession(state, type, durationMinutes, taskId = null, contract = '', now = Date.now()) {
  if (!transitions[state.status]?.includes(type)) throw new Error(`Cannot start ${type} while ${state.status}.`);
  let history = state.history || [];
  if (state.session && ['focus', 'break'].includes(state.status)) {
    history = [{ ...state.session, endedAt: now, completed: false, actualDurationMs: Math.max(0, Math.min(now, state.session.targetEndAt) - state.session.startedAt) }, ...history];
  }
  const next = makeSession(type, durationMinutes, taskId, contract, now);
  return { ...state, history, status: type, session: next };
}

export function finishSession(state, now = Date.now(), completed = true) {
  if (!['focus', 'break'].includes(state.status) || !state.session) throw new Error('There is no active session to end.');
  const record = { ...state.session, endedAt: now, completed: Boolean(completed), actualDurationMs: Math.max(0, Math.min(now, state.session.targetEndAt) - state.session.startedAt) };
  return { ...state, status: 'completed', session: null, history: [record, ...(state.history || [])] };
}

export function reconcile(state, now = Date.now()) {
  if (!state?.session || !['focus', 'break'].includes(state.status)) return { state, expired: false };
  if (state.session.targetEndAt > now) return { state, expired: false };
  return { state: finishSession(state, state.session.targetEndAt, true), expired: true };
}
