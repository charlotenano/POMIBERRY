const RULE_ID = 1;
const OVERRIDE_ALARM = 'pomiberry-override-end';
const END_ALARM = 'pomiberry-session-end';
const DEFAULT_STATE = { status: 'idle', session: null, protection: 'gentle', allowedDomains: [] };
let applyQueue = Promise.resolve();
const restoringTabIds = new Set();

function isAppSender(sender) {
  try {
    const u = new URL(sender.url || '');
    return u.port === '4173' && (u.hostname === '127.0.0.1' || u.hostname === 'localhost');
  } catch { return false; }
}
function allowedDomainsFor(state) {
  const sessionDomains = state?.status === 'focus' && state?.session?.type === 'focus' && Array.isArray(state.session.websiteDomains)
    ? state.session.websiteDomains
    : state?.settings?.allowedDomains;
  return normalizedDomains(sessionDomains);
}
function restrictedDomainsFor(state) {
  const sessionDomains = state?.status === 'focus' && state?.session?.type === 'focus' && Array.isArray(state.session.websiteBlockDomains)
    ? state.session.websiteBlockDomains
    : [];
  return normalizedDomains(sessionDomains);
}
function hostMatchesDomains(host, domains) {
  return domains.some(domain => host === domain || host.endsWith(`.${domain}`));
}
function isProtectedFocus(s) {
  return s?.status === 'focus' && s?.session?.type === 'focus' &&
    s?.settings?.protection === 'websites' && Number.isFinite(s.session.targetEndAt) &&
    s.session.targetEndAt > Date.now() && allowedDomainsFor(s).length > 0;
}
function normalizedDomains(domains) {
  return [...new Set((Array.isArray(domains) ? domains : []).map(x => String(x).toLowerCase().trim()).filter(x => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(x)))].slice(0, 100);
}
async function clearRules() {
  const current = await chrome.declarativeNetRequest.getDynamicRules();
  const ids = current.map(rule => rule.id);
  if (ids.length) await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: ids });
}
async function setRules(nextState) {
  const saved = (await chrome.storage.local.get(['pomiberryState', 'overrideUntil']));
  const state = nextState || saved.pomiberryState || DEFAULT_STATE;
  const overrideUntil = saved.overrideUntil || 0;
  let protectionActive = false;
  let error = '';
  try {
    if (isProtectedFocus(state) && overrideUntil <= Date.now()) {
      const domains = restrictedDomainsFor(state);
      const allowedDomains = allowedDomainsFor(state);
      const rules = domains.map((domain, i) => ({
        id: RULE_ID + i, priority: 1,
        action: { type: 'redirect', redirect: { extensionPath: '/blocked.html' } },
        condition: { requestDomains: [domain], ...(allowedDomains.length ? { excludedRequestDomains: allowedDomains } : {}), resourceTypes: ['main_frame'] },
      }));
      await clearRules();
      await chrome.declarativeNetRequest.updateDynamicRules({ addRules: rules });
      protectionActive = true;
      chrome.alarms.create(END_ALARM, { when: state.session.targetEndAt });
    } else {
      await clearRules();
      chrome.alarms.clear(END_ALARM);
    }
  } catch (err) {
    error = String(err?.message || 'Chrome could not apply the website rules.');
    try { await clearRules(); } catch { /* Fail open; never report blocking as active. */ }
    protectionActive = false;
  }
  const status = { connected: true, protectionActive, status: state.status, allowedDomains: allowedDomainsFor(state), restrictedDomains: restrictedDomainsFor(state), error, updatedAt: Date.now() };
  await chrome.storage.local.set({ pomiberryState: state, pomiberryStatus: status });
  return status;
}
async function readBlockedTabs() {
  const { pomiberryBlockedTabs = {} } = await chrome.storage.local.get('pomiberryBlockedTabs');
  return pomiberryBlockedTabs && typeof pomiberryBlockedTabs === 'object' ? pomiberryBlockedTabs : {};
}
async function restoreBlockedTabs() {
  const blockedTabs = await readBlockedTabs();
  const remaining = {};
  const blockedPage = chrome.runtime.getURL('blocked.html');
  for (const [tabId, original] of Object.entries(blockedTabs)) {
    let tab;
    try {
      tab = await chrome.tabs.get(Number(tabId));
    } catch { /* The tab may have been closed. */ }
    if (tab?.url === blockedPage && /^https?:\/\//i.test(original?.url || '')) {
      try { await chrome.tabs.update(tab.id, { url: original.url }); }
      catch { remaining[tabId] = original; }
    }
  }
  await chrome.storage.local.set({ pomiberryBlockedTabs: remaining });
}
async function syncExistingTabs(_state, status) {
  // Keep current tabs and their URLs intact. widget.js covers disallowed pages
  // with an in-page focus shield; only attempted navigations are DNR-blocked.
  if (!status.protectionActive) { await restoreBlockedTabs(); return; }
  // Recover tabs replaced by older extension versions, keeping their URL and
  // restoring the website shield rather than leaving them on the pause page.
  const blockedTabs = await readBlockedTabs(), blockedPage = chrome.runtime.getURL('blocked.html');
  const restore = [];
  for (const [tabId, original] of Object.entries(blockedTabs)) {
    try {
      const tab = await chrome.tabs.get(Number(tabId));
      if (tab.url === blockedPage && /^https?:\/\//i.test(original?.url || '')) restore.push({ tabId: tab.id, url: original.url });
    } catch { delete blockedTabs[tabId]; }
  }
  if (!restore.length) return;
  await clearRules();
  for (const item of restore) {
    restoringTabIds.add(item.tabId);
    try { await chrome.tabs.update(item.tabId, { url: item.url }); delete blockedTabs[String(item.tabId)]; }
    catch { restoringTabIds.delete(item.tabId); }
  }
  await chrome.storage.local.set({ pomiberryBlockedTabs: blockedTabs });
  await serializeApply(_state);
}
async function rememberBlockedTab(tabId, url) {
  if (!Number.isInteger(tabId) || tabId < 0 || !/^https?:\/\//i.test(url)) return;
  const blockedTabs = await readBlockedTabs();
  if (!blockedTabs[String(tabId)]) {
    blockedTabs[String(tabId)] = { url, savedAt: Date.now() };
    await chrome.storage.local.set({ pomiberryBlockedTabs: blockedTabs });
  }
}
function serializeApply(state) {
  applyQueue = applyQueue.then(() => setRules(state), () => setRules(state));
  return applyQueue;
}
async function broadcastWidget() {
  const { pomiberryState = DEFAULT_STATE, pomiberryStatus = { connected: true, protectionActive: false }, pomiberryTodayFocusMinutes = 0 } = await chrome.storage.local.get(['pomiberryState', 'pomiberryStatus', 'pomiberryTodayFocusMinutes']);
  for (const tab of await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] })) {
    if (tab.id != null) chrome.tabs.sendMessage(tab.id, { type: 'POMIBERRY_WIDGET_STATE', state: pomiberryState, status: pomiberryStatus, todayFocusMinutes: pomiberryTodayFocusMinutes }).catch(() => {});
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'POMIBERRY_SYNC' && isAppSender(sender)) {
    serializeApply(message.state).then(async status => { await syncExistingTabs(message.state,status); broadcastWidget(); sendResponse(status); }, err => sendResponse({ connected: true, protectionActive: false, error: String(err) }));
    return true;
  }
  if (message?.type === 'POMIBERRY_WIDGET_STATS' && isAppSender(sender)) {
    const minutes = Number.isFinite(message.todayFocusMinutes) ? Math.max(0, Math.floor(message.todayFocusMinutes)) : 0;
    chrome.storage.local.set({ pomiberryTodayFocusMinutes: minutes }).then(() => { broadcastWidget(); sendResponse({ ok: true }); });
    return true;
  }
  if (message?.type === 'POMIBERRY_APP_ACTION' && ['end-session', 'start-break', 'quick-focus', 'open-app'].includes(message.action)) {
    chrome.tabs.query({ url: ['http://127.0.0.1:4173/*', 'http://localhost:4173/*'] }).then(async tabs => {
      const appTab = tabs.find(tab => tab.active) || tabs[0];
      if (message.action === 'open-app') {
        if (appTab) await chrome.tabs.update(appTab.id, { active: true });
        else await chrome.tabs.create({ url: 'http://127.0.0.1:4173' });
        sendResponse({ ok: true });
        return;
      }
      if (!appTab) {
        await chrome.tabs.create({ url: 'http://127.0.0.1:4173' });
        sendResponse({ ok: false, openedApp: true });
        return;
      }
      try {
        await chrome.tabs.sendMessage(appTab.id, { type: 'POMIBERRY_APP_ACTION', action: message.action });
        await chrome.tabs.update(appTab.id, { active: true });
        sendResponse({ ok: true });
      } catch {
        await chrome.tabs.update(appTab.id, { url: 'http://127.0.0.1:4173', active: true });
        sendResponse({ ok: false, openedApp: true });
      }
    }).catch(error => sendResponse({ ok: false, error: String(error?.message || error) }));
    return true;
  }
  if (message?.type === 'POMIBERRY_APP_ACTION' && ['end-session', 'start-break', 'quick-focus', 'open-app'].includes(message.action)) {
    chrome.tabs.query({ url: ['http://127.0.0.1:4173/*', 'http://localhost:4173/*'] }).then(async tabs => {
      const appTab = tabs.find(tab => tab.active) || tabs[0];
      if (message.action === 'open-app') {
        if (appTab) await chrome.tabs.update(appTab.id, { active: true });
        else await chrome.tabs.create({ url: 'http://127.0.0.1:4173' });
        sendResponse({ ok: true });
        return;
      }
      if (!appTab) {
        await chrome.tabs.create({ url: 'http://127.0.0.1:4173' });
        sendResponse({ ok: false, openedApp: true });
        return;
      }
      try {
        await chrome.tabs.sendMessage(appTab.id, { type: 'POMIBERRY_APP_ACTION', action: message.action });
        await chrome.tabs.update(appTab.id, { active: true });
        sendResponse({ ok: true });
      } catch {
        await chrome.tabs.update(appTab.id, { url: 'http://127.0.0.1:4173', active: true });
        sendResponse({ ok: false, openedApp: true });
      }
    }).catch(error => sendResponse({ ok: false, error: String(error?.message || error) }));
    return true;
  }
  if (message?.type === 'POMIBERRY_GET_STATE') {
    chrome.storage.local.get(['pomiberryState', 'pomiberryStatus', 'overrideUntil', 'pomiberryTodayFocusMinutes']).then(data => sendResponse({ state: data.pomiberryState || DEFAULT_STATE, status: data.pomiberryStatus || { connected: true, protectionActive: false }, overrideUntil: data.overrideUntil || 0, todayFocusMinutes: data.pomiberryTodayFocusMinutes || 0 }));
    return true;
  }
  if (message?.type === 'POMIBERRY_OVERRIDE') {
    const until = Date.now() + 5 * 60_000;
    chrome.storage.local.set({ overrideUntil: until }).then(() => serializeApply().then(() => {
      chrome.alarms.create(OVERRIDE_ALARM, { when: until });
      chrome.storage.local.get('pomiberryState').then(async ({pomiberryState=DEFAULT_STATE})=>{
        await syncExistingTabs(pomiberryState,{protectionActive:false});
        broadcastWidget();sendResponse({ ok: true, until });
      });
    }));
    return true;
  }
});

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === OVERRIDE_ALARM) chrome.storage.local.set({ overrideUntil: 0 }).then(async () => {
    const status=await serializeApply();
    const {pomiberryState=DEFAULT_STATE}=await chrome.storage.local.get('pomiberryState');
    await syncExistingTabs(pomiberryState,status);
    await broadcastWidget();
  });
  if (alarm.name === END_ALARM) serializeApply().then(async status=>{
    const {pomiberryState=DEFAULT_STATE}=await chrome.storage.local.get('pomiberryState');
    await syncExistingTabs(pomiberryState,status);await broadcastWidget();
  });
});
async function restoreRules() {
  let { overrideUntil=0, pomiberryState=DEFAULT_STATE }=await chrome.storage.local.get(['overrideUntil','pomiberryState']);
  if(overrideUntil>Date.now())chrome.alarms.create(OVERRIDE_ALARM,{when:overrideUntil});
  else if(overrideUntil)await chrome.storage.local.set({overrideUntil:0});
  const status=await serializeApply(pomiberryState);
  await syncExistingTabs(pomiberryState,status);
  await broadcastWidget();
}
chrome.webNavigation.onBeforeNavigate.addListener(details => {
  if (details.frameId !== 0 || !/^https?:\/\//i.test(details.url)) return;
  if (restoringTabIds.has(details.tabId)) return;
  chrome.storage.local.get(['pomiberryState', 'overrideUntil']).then(({ pomiberryState = DEFAULT_STATE, overrideUntil = 0 }) => {
    if (!isProtectedFocus(pomiberryState) || overrideUntil > Date.now()) return;
    try {
      const url = new URL(details.url), host = url.hostname.toLowerCase();
      const app = (host === '127.0.0.1' || host === 'localhost') && url.port === '4173';
      const allowed = app || hostMatchesDomains(host, allowedDomainsFor(pomiberryState));
      const restricted = hostMatchesDomains(host, restrictedDomainsFor(pomiberryState));
      if (restricted && !allowed) rememberBlockedTab(details.tabId, details.url);
    } catch { /* Ignore invalid or non-web navigation URLs. */ }
  });
});
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'complete') restoringTabIds.delete(tabId);
});
chrome.tabs.onRemoved.addListener(tabId => restoringTabIds.delete(tabId));
chrome.runtime.onStartup.addListener(restoreRules);
chrome.runtime.onInstalled.addListener(restoreRules);
