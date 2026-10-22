const KEY = 'pomiberry.v1';
export const DEFAULTS = Object.freeze({
  settings: { focusMinutes: 25, breakMinutes: 5, nickname: '', protection: 'gentle', allowedDomains: [], supportDomains: [], notifyFocus: true, notifyBreak: true, reducedMotion: false, contractEnabled: false },
  tasks: [], history: [], status: 'idle', session: null,
});

export function loadState(storage = globalThis.localStorage) {
  try {
    const saved = JSON.parse(storage?.getItem(KEY) || 'null');
    if (!saved || typeof saved !== 'object') return structuredClone(DEFAULTS);
    const settings = { ...DEFAULTS.settings, ...(saved.settings || {}) };
    settings.protection = settings.protection === 'websites' ? 'websites' : 'gentle';
    settings.allowedDomains = Array.isArray(settings.allowedDomains) ? settings.allowedDomains.filter(x => typeof x === 'string') : [];
    settings.supportDomains = Array.isArray(settings.supportDomains) ? settings.supportDomains.filter(x => typeof x === 'string') : [];
    for (const key of ['focusMinutes', 'breakMinutes']) {
      if (!Number.isInteger(settings[key]) || settings[key] < 1 || settings[key] > 180) settings[key] = DEFAULTS.settings[key];
    }
    return {
      ...structuredClone(DEFAULTS), ...saved,
      settings,
      tasks: Array.isArray(saved.tasks) ? saved.tasks : [],
      history: Array.isArray(saved.history) ? saved.history : [],
    };
  } catch { return structuredClone(DEFAULTS); }
}

export function saveState(state, storage = globalThis.localStorage) {
  try { storage?.setItem(KEY, JSON.stringify(state)); return true; }
  catch { return false; }
}

export function clearHistory(state) { return { ...state, history: [] }; }
