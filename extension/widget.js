const host = document.createElement('div');
host.id = 'pomiberry-extension-widget';
host.style.cssText = 'position:fixed;right:20px;bottom:20px;z-index:2147483647;width:112px;height:136px;';

const shieldHost = document.createElement('div');
shieldHost.id = 'pomiberry-focus-shield';
shieldHost.style.cssText = 'display:none;position:fixed;inset:0;z-index:2147483646;';
const shield = shieldHost.attachShadow({ mode: 'closed' });

function safeExtensionCall(call) {
  try {
    const result = call();
    if (result && typeof result.catch === 'function') result.catch(() => {});
    return result;
  } catch {
    // Reloading the extension invalidates content scripts already in tabs.
    return undefined;
  }
}

shield.innerHTML = `<style>
  *{box-sizing:border-box;font:14px/1.45 system-ui,sans-serif;color:#4b3038}
  .veil{position:fixed;inset:0;display:grid;place-items:center;padding:18px;background:#fff8f2ed;backdrop-filter:blur(7px)}
  .card{width:min(340px,100%);padding:24px;border:1px solid #f0d4d5;border-radius:22px;background:#fffcfa;box-shadow:0 18px 60px #48242d30;text-align:center}
  img{width:58px;height:58px;image-rendering:pixelated}h1{font-size:21px;color:#9b2944;margin:12px 0 8px}p{font-size:13px;color:#806b70;margin:8px 0 18px}
  button{width:100%;padding:11px;border:0;border-radius:11px;background:#f45b69;color:white;font-weight:700;cursor:pointer;margin-top:8px}
  button.quiet{background:#ffe1e5;color:#8f2942}
</style><div class="veil"><section class="card"><img alt="POMIBERRY"><h1>This tab is resting</h1><p>You are focusing on your allowed websites. Your open tab will be here when focus ends.</p><button class="open">Open POMIBERRY</button><button class="override quiet">Pause website blocks for 5 minutes</button></section></div>`;
shield.querySelector('img').src = chrome.runtime.getURL('strawberry.svg');
shield.querySelector('.open').addEventListener('click', () => window.open('http://127.0.0.1:4173', '_blank', 'noopener'));
shield.querySelector('.override').addEventListener('click', () => safeExtensionCall(() => chrome.runtime.sendMessage({ type: 'POMIBERRY_OVERRIDE' })));

const shadow = host.attachShadow({ mode: 'closed' });
shadow.innerHTML = `<style>
  *{box-sizing:border-box;font-family:system-ui,sans-serif}
  .launcher{position:absolute;inset:0;width:112px;height:136px;padding:0;border:0;background:transparent;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0;cursor:grab;touch-action:none;user-select:none}
  .launcher:active{cursor:grabbing}
  .berry{width:76px;height:76px;object-fit:contain;image-rendering:pixelated;filter:drop-shadow(0 5px 8px #48242d45);pointer-events:none}
  .name{margin-top:-1px;color:#8f2942;text-align:center;font-size:10px;line-height:1.2;font-weight:850;letter-spacing:1px;text-shadow:-1px -1px 0 #fff,1px 1px 0 #fff,0 2px 5px #fff;pointer-events:none}
  .timer{display:flex;align-items:center;justify-content:center;min-width:90px;min-height:24px;margin-top:1px;padding:0;border:0;border-radius:0;background:transparent;box-shadow:none;pointer-events:none}
  .launcher:focus-visible{outline:3px solid #f45b69;outline-offset:2px;border-radius:16px}
</style><button class="launcher" aria-label="POMIBERRY timer; click to open timer details or drag to move"><img class="berry" alt="POMIBERRY strawberry"><span class="name">POMIBERRY</span><span class="timer">25:00</span></button>
<div class="dialogue" role="status" aria-live="polite" hidden></div><section class="panel" role="dialog" aria-label="POMIBERRY timer details" hidden>
  <div class="drag-label">DRAG YOUR LITTLE WIDGET</div>
  <div class="panel-head"><button class="brand" data-action="open-app">POMIBERRY</button><button class="close" aria-label="Close timer details">×</button></div>
  <div class="status">READY WHEN YOU ARE</div><div class="panel-time">25:00</div>
  <div class="task">A little time for yourself</div><div class="message">One little step is plenty for now.</div>
  <div class="panel-actions"></div><div class="today"><span>Today’s focus</span><b>0 min</b></div>
</section>`;

shadow.innerHTML += `<style>
  .dialogue{position:absolute;right:0;bottom:calc(100% + 5px);z-index:4;width:max-content;max-width:210px;padding:9px 12px;border:1px solid #f0d4d5;border-radius:13px;background:#fffcfa;color:#8f2942;font:700 11px/1.45 system-ui,sans-serif;text-align:center;box-shadow:0 7px 22px #48242d25;pointer-events:none}.dialogue::after{content:'';position:absolute;right:22px;bottom:-6px;width:10px;height:10px;border-right:1px solid #f0d4d5;border-bottom:1px solid #f0d4d5;background:#fffcfa;transform:rotate(45deg)}.dialogue[hidden]{display:none}
  .panel{position:absolute;width:min(360px,calc(100vw - 24px));padding:20px 22px 18px;border:1px solid #f0d4d5;border-radius:25px;background:#fffcfa;box-shadow:0 18px 50px #48242d25;color:#4b3038;font:13px/1.45 system-ui,sans-serif;z-index:2}
  .panel[hidden]{display:none}.drag-label{font-size:10px;letter-spacing:1.1px;font-weight:800;color:#ae9298;cursor:grab;touch-action:none;user-select:none}
  .panel-head{display:flex;justify-content:space-between;align-items:center;margin:12px 0 16px}.brand{border:0;padding:0;background:none;color:#8f2942;font-family:Silkscreen,monospace;font-size:11px;font-weight:800;cursor:pointer}.close{border:0;background:none;color:#957b81;font-size:20px;line-height:1;cursor:pointer}
  .status{font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#ac8f94;font-weight:800}.panel-time{display:flex;align-items:center;justify-content:center;min-height:48px;margin:20px 0 4px}.task{text-align:center;font-size:12px;color:#927a80;margin-bottom:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .message{padding:13px 12px;border-radius:14px;background:#fff4f1;text-align:center;font-size:12px;color:#795961;margin-bottom:14px}.panel-actions{display:flex;gap:8px}.panel-actions button{flex:1;border:0;border-radius:14px;padding:12px 10px;background:#f45b69;color:white;font-size:12px;font-weight:750;cursor:pointer}.panel-actions .secondary{background:#91c96b;color:#35502a}.panel-actions .quiet{background:#ffe1e5;color:#8f2942}
  .today{display:flex;justify-content:space-between;border-top:1px solid #f4e5e2;margin-top:14px;padding-top:11px;color:#967e84;font-size:10px}.today b{color:#8f2942}
</style>`;

const launcher = shadow.querySelector('.launcher');
const timeDisplay = shadow.querySelector('.timer');
const panel = shadow.querySelector('.panel');
const panelTime = shadow.querySelector('.panel-time');
const dialogue = shadow.querySelector('.dialogue');
let state = { status: 'idle', session: null, settings: {} };
let enforcement = { protectionActive: false, allowedDomains: [], restrictedDomains: [] };
let todayFocusMinutes = 0;
let drag = null;
let moved = false;
let savedPosition = null;
let announcedMinuteSession = null;
let dialogueTimeout = 0;

for (const berry of shadow.querySelectorAll('img')) berry.src = chrome.runtime.getURL('strawberry.svg');
window.pomiberryDrawPixelText?.(shadow.querySelector('.name'), 'POMIBERRY', 2);
window.pomiberryDrawPixelText?.(shadow.querySelector('.panel-head .brand'), 'POMIBERRY', 2);

const fmt = ms => {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
};

function setPosition(left, top, save = true) {
  const margin = 8;
  const maxLeft = Math.max(margin, innerWidth - host.offsetWidth - margin);
  const maxTop = Math.max(margin, innerHeight - host.offsetHeight - margin);
  left = Math.max(margin, Math.min(maxLeft, left));
  top = Math.max(margin, Math.min(maxTop, top));
  host.style.left = `${left}px`;
  host.style.top = `${top}px`;
  host.style.right = 'auto';
  host.style.bottom = 'auto';
  const placeAbove = top > innerHeight * 0.45;
  panel.style.top = placeAbove ? 'auto' : 'calc(100% + 10px)';
  panel.style.bottom = placeAbove ? 'calc(100% + 10px)' : 'auto';
  panel.style.left = left < innerWidth / 2 ? '0' : 'auto';
  panel.style.right = left < innerWidth / 2 ? 'auto' : '0';
  savedPosition = { left, top };
  if (save) safeExtensionCall(() => chrome.storage.local.set({ pomiberryWidgetPosition: savedPosition }));
}

function draw() {
  const session = state.session;
  const running = ['focus', 'break'].includes(state.status) && session?.targetEndAt > Date.now();
  const isFocus = running && state.status === 'focus';
  const hasExpiredSession = ['focus', 'break'].includes(state.status) && Number.isFinite(session?.targetEndAt) && session.targetEndAt <= Date.now();
  const time = running ? fmt(session.targetEndAt - Date.now()) : state.status === 'completed' || hasExpiredSession ? '00:00' : fmt((state.settings?.focusMinutes || 25) * 60_000);
  window.pomiberryDrawPixelTimer?.(timeDisplay, time, 3);
  window.pomiberryDrawPixelTimer?.(panelTime, time, 6);
  launcher.title = `POMIBERRY ${time} - drag to move or click to open`;
  shadow.querySelector('.status').textContent = running && state.status === 'focus' ? 'FOCUS TIME' : running ? 'A GENTLE BREAK' : state.status === 'completed' || hasExpiredSession ? 'SESSION COMPLETE' : 'READY WHEN YOU ARE';
  shadow.querySelector('.task').textContent = running && state.taskTitle ? state.taskTitle : 'A little time for yourself';
  const minuteLeft = isFocus && session.targetEndAt - Date.now() <= 60_000;
  shadow.querySelector('.message').textContent = minuteLeft ? 'One minute left! You’ve got this!' : state.status === 'break' ? 'You deserve a moment to recharge.' : 'One little step is plenty for now.';
  shadow.querySelector('.today b').textContent = `${todayFocusMinutes} min`;
  if (!isFocus) {
    announcedMinuteSession = null;
    dialogue.hidden = true;
    clearTimeout(dialogueTimeout);
  } else if (minuteLeft && announcedMinuteSession !== (session.id || session.targetEndAt)) {
    announcedMinuteSession = session.id || session.targetEndAt;
    dialogue.textContent = 'One minute left! You’ve got this!';
    dialogue.hidden = false;
    clearTimeout(dialogueTimeout);
    dialogueTimeout = setTimeout(() => { dialogue.hidden = true; }, 8000);
  }
  const actions = shadow.querySelector('.panel-actions');
  actions.innerHTML = running && state.status === 'focus'
    ? '<button data-action="end-session">End</button><button class="secondary" data-action="start-break">Break</button>'
    : running && state.status === 'break'
      ? '<button data-action="end-session">End</button><button class="quiet" data-action="open-app">Open app</button>'
      : '<button data-action="open-app">Open POMIBERRY</button>';

  let shouldShield = false;
  try {
    const current = new URL(location.href);
    const hostname = current.hostname.toLowerCase();
    const app = (hostname === '127.0.0.1' || hostname === 'localhost') && current.port === '4173';
    const allowed = (enforcement.allowedDomains || []).some(domain => hostname === domain || hostname.endsWith(`.${domain}`));
    const restricted = (enforcement.restrictedDomains || []).some(domain => hostname === domain || hostname.endsWith(`.${domain}`));
    shouldShield = !app && restricted && !allowed;
  } catch { shouldShield = false; }

  const protectedNow = isFocus && state.settings?.protection === 'websites' && enforcement.protectionActive;
  shieldHost.style.display = protectedNow && shouldShield ? 'block' : 'none';
}

function beginDrag(event) {
  if (event.button !== 0) return;
  const rect = host.getBoundingClientRect();
  drag = { id: event.pointerId, x: event.clientX, y: event.clientY, left: rect.left, top: rect.top, moved: false };
  try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* Keep click and drag usable if pointer capture is unavailable. */ }
}
launcher.addEventListener('pointerdown', beginDrag);
shadow.querySelector('.drag-label').addEventListener('pointerdown', beginDrag);

host.addEventListener('pointermove', event => {
  if (!drag || event.pointerId !== drag.id) return;
  const dx = event.clientX - drag.x;
  const dy = event.clientY - drag.y;
  if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
  if (drag.moved) setPosition(drag.left + dx, drag.top + dy, false);
});

host.addEventListener('pointerup', event => {
  if (!drag || event.pointerId !== drag.id) return;
  moved = drag.moved;
  if (moved) {
    safeExtensionCall(() => chrome.storage.local.set({ pomiberryWidgetPosition: savedPosition }));
    setTimeout(() => { moved = false; }, 180);
  }
  drag = null;
});

launcher.addEventListener('click', () => {
  if (moved) return;
  panel.hidden = !panel.hidden;
  draw();
});
shadow.querySelector('.close').addEventListener('click', () => { panel.hidden = true; });
shadow.querySelector('.panel-head .brand').addEventListener('click', () => safeExtensionCall(() => chrome.runtime.sendMessage({ type: 'POMIBERRY_APP_ACTION', action: 'open-app' })));
shadow.querySelector('.panel-actions').addEventListener('click', event => {
  const action = event.target.closest('[data-action]')?.dataset.action;
  if (!action) return;
  panel.hidden = true;
  safeExtensionCall(() => chrome.runtime.sendMessage({ type: 'POMIBERRY_APP_ACTION', action }));
});

chrome.runtime.onMessage.addListener(message => {
  if (message?.type === 'POMIBERRY_WIDGET_STATE') {
    state = message.state || state;
    enforcement = message.status || enforcement;
    if (Number.isFinite(message.todayFocusMinutes)) todayFocusMinutes = message.todayFocusMinutes;
    draw();
  }
});

safeExtensionCall(() => chrome.runtime.sendMessage({ type: 'POMIBERRY_GET_STATE' }, response => {
  if (response?.state) {
    state = response.state;
    enforcement = response.status || enforcement;
    if (Number.isFinite(response.todayFocusMinutes)) todayFocusMinutes = response.todayFocusMinutes;
    draw();
  }
}));

safeExtensionCall(() => chrome.storage.local.get('pomiberryWidgetPosition', data => {
  if (data.pomiberryWidgetPosition) setPosition(data.pomiberryWidgetPosition.left, data.pomiberryWidgetPosition.top, false);
}));

safeExtensionCall(() => chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.pomiberryWidgetPosition?.newValue) {
    const pos = changes.pomiberryWidgetPosition.newValue;
    if (savedPosition?.left !== pos.left || savedPosition?.top !== pos.top) setPosition(pos.left, pos.top, false);
  }
}));

window.addEventListener('resize', () => {
  if (savedPosition) setPosition(savedPosition.left, savedPosition.top, false);
});

setInterval(draw, 1000);
(document.documentElement || document.body).append(host);
document.documentElement.append(shieldHost);
const initialRect = host.getBoundingClientRect();
setPosition(initialRect.left, initialRect.top, false);
