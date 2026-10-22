// This bridge is restricted to POMIBERRY's local preview origin. It sends only
// the active timer and the user-configured website rules to the extension.
const STORAGE_KEY = 'pomiberry.v1';
let lastSent = '';
let lastSentStatsMinute = -1;
async function syncPomiberryState() {
  let saved;
  try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch { return; }
  if (!saved || !saved.settings) return;
  const currentTask=saved.tasks?.find(t=>t.id===saved.session?.taskId);
  const sessionDomains=saved.status==='focus'&&Array.isArray(saved.session?.websiteDomains)
    ? saved.session.websiteDomains
    : saved.settings.allowedDomains;
  const state={
    status:saved.status,
    session:saved.session?{type:saved.session.type,startedAt:saved.session.startedAt,targetEndAt:saved.session.targetEndAt,durationMinutes:saved.session.durationMinutes,websiteDomains:saved.session.websiteDomains}:null,
    taskTitle:currentTask?.title||'',
    settings:{protection:saved.settings.protection,allowedDomains:sessionDomains,focusMinutes:saved.settings.focusMinutes},
  };
  const today = new Date().toDateString();
  const loggedFocusMs = (saved.history || []).filter(item => item.type === 'focus' && new Date(item.startedAt).toDateString() === today)
    .reduce((total, item) => total + (item.actualDurationMs || 0), 0);
  const liveFocusMs = saved.status === 'focus' && saved.session?.type === 'focus'
    ? Math.max(0, Math.min(Date.now(), saved.session.targetEndAt) - saved.session.startedAt)
    : 0;
  const todayFocusMinutes = Math.floor((loggedFocusMs + liveFocusMs) / 60_000);
  if (todayFocusMinutes !== lastSentStatsMinute) {
    lastSentStatsMinute = todayFocusMinutes;
    try { await chrome.runtime.sendMessage({ type: 'POMIBERRY_WIDGET_STATS', todayFocusMinutes }); }
    catch { lastSentStatsMinute = -1; }
  }
  const serialized = JSON.stringify(state);
  if (serialized === lastSent) {
    try {
      const current = await chrome.runtime.sendMessage({ type: 'POMIBERRY_GET_STATE' });
      const validDomain = domain => typeof domain === 'string' && /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i.test(domain.trim());
      const shouldProtect = state.status === 'focus' && state.session?.type === 'focus' &&
        state.settings.protection === 'websites' && Number.isFinite(state.session.targetEndAt) &&
        state.session.targetEndAt > Date.now() && (state.settings.allowedDomains || []).some(validDomain) &&
        (current?.overrideUntil || 0) <= Date.now();
      const sameState = JSON.stringify(current?.state) === serialized;
      const sameProtection = Boolean(current?.status?.protectionActive) === shouldProtect;
      if (sameState && sameProtection) {
        window.postMessage({ source: 'pomiberry-extension', status: current?.status || { connected: false, protectionActive: false } }, location.origin);
        return;
      }
    } catch { /* Fall through and retry by sending the current app state. */ }
    lastSent = '';
  }
  try {
    const status = await chrome.runtime.sendMessage({ type: 'POMIBERRY_SYNC', state });
    if (!status?.connected) throw new Error('The extension did not confirm the timer state.');
    lastSent = serialized;
    window.postMessage({ source: 'pomiberry-extension', status }, location.origin);
  } catch {
    // Keep retrying this state on the next poll. Marking it as sent before
    // Chrome confirms it can leave old website rules active after a reload.
    lastSent = '';
    window.postMessage({ source: 'pomiberry-extension', status: { connected: false, protectionActive: false } }, location.origin);
  }
}
syncPomiberryState();
setInterval(syncPomiberryState, 1000);
window.addEventListener('storage', syncPomiberryState);
chrome.runtime.onMessage.addListener(message => {
  if (message?.type === 'POMIBERRY_APP_ACTION' && ['end-session', 'start-break', 'quick-focus'].includes(message.action)) {
    window.postMessage({ source: 'pomiberry-extension-action', action: message.action }, location.origin);
  }
});
