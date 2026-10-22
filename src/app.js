import { clearHistory, loadState, saveState } from './storage.js';
import { finishSession, makeSession, reconcile, remainingMs, startSession, validateDuration } from './timer.js';

let state = loadState();
let page = 'home';
let timerHandle;
let toastHandle;
let selectedMinutes = state.settings.focusMinutes;
let selectedTaskId = state.tasks.find(t => !t.completed)?.id || '';
let widgetPosition = readWidgetPosition();
let protectionStatus = { connected: false, protectionActive: false };
let minuteDialogueSessionId = null;
let minuteDialogueHandle;

const WEBSITE_GROUPS = [
  { key: 'academic', label: 'Academic Tabs', sites: [
    { key: 'academic-google', label: 'Google Workspace (Search, Docs, Forms, Calendar, Meet, Drive, Classroom, Maps, Scholar)', domains: ['www.google.com', 'docs.google.com', 'forms.google.com', 'calendar.google.com', 'meet.google.com', 'drive.google.com', 'classroom.google.com', 'maps.google.com', 'scholar.google.com'] },
    { key: 'academic-canva', label: 'Canva', domains: ['canva.com'] },
  ] },
  { key: 'social', label: 'Social Media', sites: [
    { key: 'social-facebook', label: 'Facebook', domains: ['facebook.com'] },
    { key: 'social-instagram', label: 'Instagram', domains: ['instagram.com'] },
    { key: 'social-x', label: 'X / Twitter', domains: ['x.com', 'twitter.com'] },
    { key: 'social-youtube', label: 'YouTube', domains: ['youtube.com'] },
  ] },
  { key: 'workspace', label: 'Workspace', sites: [
    { key: 'workspace-linkedin', label: 'LinkedIn', domains: ['linkedin.com'] },
    { key: 'workspace-canva', label: 'Canva', domains: ['canva.com'] },
    { key: 'workspace-google', label: 'Google Workspace (Search, Docs, Forms, Calendar, Meet, Drive, Classroom, Maps, Scholar)', domains: ['www.google.com', 'docs.google.com', 'forms.google.com', 'calendar.google.com', 'meet.google.com', 'drive.google.com', 'classroom.google.com', 'maps.google.com', 'scholar.google.com'] },
  ] },
  { key: 'ai', label: 'AI Space', sites: [
    { key: 'ai-gemini', label: 'Gemini AI', domains: ['gemini.google.com'] },
    { key: 'ai-chatgpt', label: 'ChatGPT', domains: ['chatgpt.com'] },
    { key: 'ai-claude', label: 'Claude AI', domains: ['claude.ai'] },
    { key: 'ai-copilot', label: 'Microsoft Copilot', domains: ['copilot.microsoft.com'] },
    { key: 'ai-perplexity', label: 'Perplexity', domains: ['perplexity.ai'] },
    { key: 'ai-deepseek', label: 'DeepSeek', domains: ['chat.deepseek.com'] },
  ] },
];
const WEBSITE_CHOICES = WEBSITE_GROUPS.flatMap(group => group.sites);

const $ = (q, root = document) => root.querySelector(q);
const $$ = (q, root = document) => [...root.querySelectorAll(q)];
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const fmt = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${String(Math.floor(s / 60)).padStart(2,'0')}:${String(s % 60).padStart(2,'0')}`; };
const fmtMins = ms => { const m = Math.max(0, Math.round(ms / 60_000)); return m < 60 ? `${m} min` : `${Math.floor(m/60)} hr${m%60 ? ` ${m%60} min` : ''}`; };
const byId = id => state.tasks.find(t => t.id === id);
const active = () => ['focus','break'].includes(state.status) && state.session;

const recovered = reconcile(state);
state = recovered.state;
persist();
if (recovered.expired) {
  notifyEnded(state.history[0]);
  showToast('Your session finished while you were away. Welcome back.');
}

function persist() {
  const okay = saveState(state);
  if (!okay) showToast('This browser could not save locally. Check available storage.');
}
function showToast(message) {
  const el = $('#toast'); if (!el) return;
  el.textContent = message; el.classList.add('show');
  clearTimeout(toastHandle); toastHandle = setTimeout(() => el.classList.remove('show'), 2800);
}
function notify(title, body) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try { new Notification(title, { body, icon: './assets/strawberry.svg', tag: 'pomiberry-session' }); } catch { /* Notifications can be unavailable in a browser context. */ }
}
async function prepareNotifications() {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission !== 'default') return false;
  try { return (await Notification.requestPermission()) === 'granted'; } catch { return false; }
}
function notifyEnded(session) {
  if (!session) return;
  if (session.type === 'focus' && state.settings.notifyFocus) notify('A little progress, POMIBERRY', 'You did it! Another little step forward.');
  if (session.type === 'break' && state.settings.notifyBreak) notify('Break complete', 'Ready to ease back in when you are.');
}
function todayHistory() {
  const today = new Date().toDateString();
  return state.history.filter(h => new Date(h.startedAt).toDateString() === today);
}
function todayFocusMs() {
  const logged = todayHistory().filter(h => h.type === 'focus').reduce((sum,h) => sum + (h.actualDurationMs || 0), 0);
  return logged + (active() && state.session.type === 'focus' ? Math.max(0, Math.min(Date.now(), state.session.targetEndAt) - state.session.startedAt) : 0);
}
function completedToday() { return todayHistory().filter(h => h.type === 'focus' && h.completed).length; }
function greeting() {
  const h = new Date().getHours();
  const name = String(state.settings.nickname || '').trim() || 'focus friend';
  const greeting = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  return `${greeting}, ${escapeHtml(name)}!`;
}
function taskTitle() { return byId(state.session?.taskId)?.title || 'A little time for yourself'; }

function render() {
  $$('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.page === page));
  $('#task-count').textContent = state.tasks.filter(t => !t.completed).length;
  $('#today-label').textContent = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date());
  $('#page-crumb').textContent = ({home:'YOUR COZY CORNER',tasks:'A LITTLE LIST',stats:'GROWING AT YOUR PACE',settings:'MAKE IT YOURS'})[page];
  $('#content').innerHTML = page === 'home' ? homeView() : page === 'tasks' ? tasksView() : page === 'stats' ? statsView() : settingsView();
  renderWidget(); updateTimerDisplay(); bindView(); updateProtectionStatus();
}

function updateProtectionStatus() {
  const target=$('#extension-status');if(!target)return;
  if(!protectionStatus.connected){target.textContent='Chrome extension not connected. Your saved allowlist is not being enforced.';target.className='notice';return;}
  if(protectionStatus.error){target.textContent=`Not active: ${protectionStatus.error}`;target.className='notice';return;}
  if(protectionStatus.protectionActive){const domains=protectionStatus.allowedDomains?.join(', ');target.textContent=`Active in Chrome. Allowed this session: ${domains||'No domains reported'}.`;target.className='notice good';return;}
  target.textContent='Connected. Website restrictions are currently off.';target.className='notice';
}

function taskOptions() {
  const options = state.tasks.filter(t => !t.completed);
  return `<option value="">No task picked yet</option>${options.map(t => `<option value="${escapeHtml(t.id)}" ${selectedTaskId === t.id ? 'selected' : ''}>${escapeHtml(t.title)}</option>`).join('')}`;
}
function homeView() {
  const session = state.session;
  const currentTask = session?.taskId ? byId(session.taskId) : byId(selectedTaskId);
  const isDone = state.status === 'completed';
  const timerLabel = session ? fmt(remainingMs(session)) : isDone ? '00:00' : `${String(state.settings.focusMinutes).padStart(2,'0')}:00`;
  const modeLabel = session?.type === 'break' ? 'A GENTLE BREAK' : session?.type === 'focus' ? 'FOCUS TIME' : isDone ? 'SESSION COMPLETE' : 'READY WHEN YOU ARE';
  const duration = session?.durationMinutes || (session?.type === 'break' ? state.settings.breakMinutes : state.settings.focusMinutes);
  const contract = session?.contract ? `<div class="contract-line">“${escapeHtml(session.contract)}”</div>` : '';
  let mainAction;
  if (session) mainAction = `<button class="button danger" data-action="end-session">End session</button>${session.type === 'focus' ? `<button class="button secondary" data-action="start-break">Take a break</button>` : ''}`;
  else if (isDone) mainAction = `<button class="button primary" data-action="quick-focus">Start another focus</button>${state.history[0]?.type === 'focus' ? `<button class="button secondary" data-action="start-break">Start a break</button>` : ''}`;
  else mainAction = `<button class="button primary" data-action="start-focus">${selectedMinutes === state.settings.focusMinutes ? 'Start focus' : `Start ${selectedMinutes}-min focus`}</button><button class="button secondary" data-action="open-focus-setup">Set up</button>`;
  return `<div class="welcome-row"><div><p class="eyebrow">A FRESH LITTLE MOMENT</p><h1 class="greeting">${greeting()}</h1><p class="subgreeting">One thing at a time. You’re right where you need to be.</p></div><img class="greeting-berry" src="./assets/strawberry.svg" alt="A cheerful pixel strawberry"/></div>
    <div class="home-grid"><section class="card focus-card" aria-labelledby="focus-title"><div class="card-head"><h2 id="focus-title">Your focus nook</h2><span class="status-pill ${session?.type || ''}">${modeLabel}</span></div>
      <div class="timer-layout"><div class="timer-dial" aria-label="Session countdown"><svg viewBox="0 0 180 180" aria-hidden="true"><circle class="timer-track" cx="90" cy="90" r="82"/><circle class="timer-progress ${session?.type || ''}" id="main-progress" cx="90" cy="90" r="82"/></svg><div class="timer-text"><div class="time-value" id="main-time" aria-live="off">${timerLabel}</div><div class="time-caption">${session ? 'LEFT ON THE CLOCK' : isDone ? 'NICELY DONE' : 'MINUTES OF POSSIBILITY'}</div></div></div>
      <div class="timer-aside"><img class="little-berry" src="./assets/strawberry.svg" alt=""/><p class="eyebrow">${session?.type === 'break' ? 'RESTING WITH' : 'A LITTLE TIME FOR'}</p><p class="task-name" id="main-task-name">${escapeHtml(session ? taskTitle() : currentTask?.title || 'Choose a tiny task')}</p><p class="muted">${escapeHtml(session?.type === 'break' ? 'You deserve a moment to recharge.' : currentTask?.description || (session ? 'You’re showing up for yourself.' : 'Pick one thing to begin.'))}</p>${contract}</div></div>
      <div class="focus-actions">${mainAction}</div></section>
    <section class="card task-card"><div class="task-card-top"><h2>What’s on your plate?</h2><button class="text-button" data-go="tasks">See all tasks</button></div><div class="task-card-inner"><div><div class="task-highlight"><h3>${escapeHtml(session ? taskTitle() : currentTask?.title || 'Nothing just yet')}</h3><p>${escapeHtml(session ? 'Your task is here whenever you need a little reminder.' : currentTask?.description || 'You can choose a tiny task or simply focus on being here.')}</p></div><label class="sr-only" for="home-task-select">Choose a task</label><select class="task-select" id="home-task-select" ${session ? 'disabled' : ''}>${taskOptions()}</select></div><div class="stats-row"><div class="stat-mini"><span>FOCUS TODAY</span><b id="today-focus">${fmtMins(todayFocusMs())}</b></div><div class="stat-mini"><span>FINISHED SESSIONS</span><b>${completedToday()}</b></div></div></div></section></div>
    <div class="section-row"><h2>Pick your next little step</h2><button class="text-button" data-go="settings">Change your defaults</button></div><div class="quick-grid">
      <button class="card quick-card" data-action="preset-focus" data-minutes="5"><span class="quick-icon">♡</span><span><b>Just five minutes</b><small>A tiny start is still a start</small></span></button>
      <button class="card quick-card" data-action="start-break"><span class="quick-icon">☘</span><span><b>Take a breather</b><small>${state.settings.breakMinutes} minute reset</small></span></button>
      <button class="card quick-card" data-go="tasks"><span class="quick-icon">＋</span><span><b>Make a little list</b><small>Add or organize a task</small></span></button></div>`;
}

function tasksView() {
  const tasks = state.tasks;
  return `<div class="page-heading"><div><p class="eyebrow">SMALL STEPS, ALL IN ONE PLACE</p><h1>My little list</h1><p>Every task can be a little smaller than it feels.</p></div><button class="button primary" data-action="new-task">＋ Add a task</button></div>
    ${tasks.length ? `<div class="task-list">${tasks.map(t => `<article class="card task-row ${t.completed?'done':''}"><input class="task-check" type="checkbox" data-toggle-task="${escapeHtml(t.id)}" ${t.completed?'checked':''} aria-label="Mark ${escapeHtml(t.title)} ${t.completed?'not done':'done'}"/><div class="task-main"><h3>${escapeHtml(t.title)}</h3>${t.description?`<p>${escapeHtml(t.description)}</p>`:''}</div><div class="task-actions">${!t.completed?`<button class="icon-button" data-action="task-start" data-id="${escapeHtml(t.id)}">Focus</button>`:''}<button class="icon-button" data-action="edit-task" data-id="${escapeHtml(t.id)}">Edit</button><button class="icon-button" data-action="delete-task" data-id="${escapeHtml(t.id)}">Remove</button></div></article>`).join('')}</div>` : `<section class="card empty-state"><img src="./assets/strawberry.svg" alt=""/><h3>Nothing on your plate yet.</h3><p>Let’s add one tiny task, or start with five quiet minutes for yourself.</p><button class="button primary" data-action="new-task">Add a task</button><button class="button secondary" data-action="quick-focus">Start five minutes</button></section>`}`;
}
function statsView() {
  const recent = todayHistory().filter(h => h.type === 'focus');
  const focusTotal = todayFocusMs();
  const completed = completedToday();
  const max = Math.max(60, ...state.history.filter(h=>h.type==='focus').map(h=>h.actualDurationMs||0));
  return `<div class="page-heading"><div><p class="eyebrow">GROWING AT YOUR OWN PACE</p><h1>Your progress</h1><p>No streaks, no pressure. Just the time you’ve given yourself.</p></div></div>
    <div class="progress-cards"><div class="card progress-card"><span class="eyebrow">FOCUS TIME TODAY</span><div class="big">${fmtMins(focusTotal)}</div><small>A little time adds up.</small></div><div class="card progress-card"><span class="eyebrow">COMPLETED FOCUS SESSIONS</span><div class="big">${completed}</div><small>Each one counts.</small></div><div class="card progress-card"><span class="eyebrow">TASKS ON YOUR LIST</span><div class="big">${state.tasks.filter(t=>!t.completed).length}</div><small>Ready for one when you are.</small></div></div>
    <div class="section-row"><h2>Today’s focus sessions</h2></div>${recent.length?`<div class="history-list">${recent.map(h=>`<div class="card history-row"><span><b>${escapeHtml(byId(h.taskId)?.title || 'A little time for yourself')}</b><br/><small>${new Intl.DateTimeFormat(undefined,{hour:'numeric',minute:'2-digit'}).format(new Date(h.startedAt))}${h.completed?' · completed':' · ended early'}</small></span><span>${fmtMins(h.actualDurationMs||0)}</span></div>`).join('')}</div>`:`<section class="card empty-state"><img src="./assets/strawberry.svg" alt=""/><h3>Your story starts whenever you’re ready.</h3><p>Your sessions will show up here. No numbers are made up or filled in.</p><button class="button primary" data-go="home">Back to home</button></section>`}
    <div class="section-row"><h2>Recent sessions</h2></div>${state.history.length?`<div class="history-list">${state.history.slice(0,8).map(h=>`<div class="card history-row"><span><b>${h.type==='break'?'Break':'Focus'}${h.taskId&&byId(h.taskId)?` · ${escapeHtml(byId(h.taskId).title)}`:''}</b><br/><small>${new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(h.startedAt))} · ${h.completed?'completed':'ended early'}</small></span><span>${fmtMins(h.actualDurationMs||0)}</span></div>`).join('')}</div>`:`<p class="muted">No sessions recorded so far.</p>`}`;
}
function settingsView() {
  const s=state.settings;
  const focusStandard=[5,10,15,25,45].includes(s.focusMinutes),breakStandard=[5,10,15].includes(s.breakMinutes);
  return `<div class="page-heading"><div><p class="eyebrow">MAKE YOUR SPACE FEEL LIKE YOURS</p><h1>Settings</h1><p>A few gentle defaults to make starting easier.</p></div></div><form id="settings-form"><div class="settings-grid">
    <section class="card settings-card"><h2>Focus &amp; break</h2><div class="inline-fields"><div class="field"><label for="focus-min">Focus duration</label><select id="focus-min" name="focusMinutes">${[5,10,15,25,45].map(m=>`<option value="${m}" ${s.focusMinutes===m?'selected':''}>${m} minutes</option>`).join('')}<option value="custom" ${focusStandard?'':'selected'}>Custom (${s.focusMinutes} minutes)</option></select><input id="focus-custom" name="focusCustom" type="number" min="1" max="180" step="1" aria-label="Custom focus duration in minutes" value="${s.focusMinutes}" ${focusStandard?'hidden':''}/></div><div class="field"><label for="break-min">Break duration</label><select id="break-min" name="breakMinutes">${[5,10,15].map(m=>`<option value="${m}" ${s.breakMinutes===m?'selected':''}>${m} minutes</option>`).join('')}<option value="custom" ${breakStandard?'':'selected'}>Custom (${s.breakMinutes} minutes)</option></select><input id="break-custom" name="breakCustom" type="number" min="1" max="180" step="1" aria-label="Custom break duration in minutes" value="${s.breakMinutes}" ${breakStandard?'hidden':''}/></div></div><label class="toggle-row"><span>Offer an optional focus contract<small>A short, kind intention before starting.</small></span><input type="checkbox" name="contractEnabled" ${s.contractEnabled?'checked':''}/></label></section>
    <section class="card settings-card"><h2>Website focus</h2><div class="field"><label for="protection">When a focus session starts</label><select id="protection" name="protection"><option value="gentle" ${s.protection==='gentle'?'selected':''}>Gentle — no websites blocked</option><option value="websites" ${s.protection==='websites'?'selected':''}>Choose websites for each focus session</option></select></div><div class="field"><label for="allowed-domains">Custom websites you can choose</label><textarea id="allowed-domains" name="allowedDomains" placeholder="example.com">${escapeHtml(s.allowedDomains.join('\n'))}</textarea><span class="field-hint">Add custom domains here. They appear under Workspace in the focus website choices.</span></div><div class="field"><label for="support-domains">Sign-in or helper domains (optional)</label><textarea id="support-domains" name="supportDomains" placeholder="accounts.google.com">${escapeHtml(s.supportDomains.join('\n'))}</textarea><span class="field-hint">These remain available during website focus for sign-in pages or required services.</span></div><div id="extension-status" class="notice">Checking Chrome extension…</div><p class="field-hint">During website focus, only unchecked websites in the four focus groups are blocked. Other website domains remain open. Breaks turn filtering off. Chrome internal pages and other apps are not restricted.</p></section>
    <section class="card settings-card"><h2>Gentle reminders</h2><label class="toggle-row"><span>Focus notifications<small>When a focus session finishes.</small></span><input type="checkbox" name="notifyFocus" ${s.notifyFocus?'checked':''}/></label><label class="toggle-row"><span>Break notifications<small>When a break is finished.</small></span><input type="checkbox" name="notifyBreak" ${s.notifyBreak?'checked':''}/></label><label class="toggle-row"><span>Reduced motion<small>Keep transitions calm and minimal.</small></span><input type="checkbox" name="reducedMotion" ${s.reducedMotion?'checked':''}/></label></section>
    <section class="card settings-card"><h2>Your information</h2><div class="field"><label for="nickname">What should POMIBERRY call you?</label><input id="nickname" name="nickname" type="text" maxlength="32" autocomplete="nickname" placeholder="Your nickname" value="${escapeHtml(s.nickname||'')}"/><span class="field-hint">Your greeting will use this name. Leave it blank to say “focus friend.”</span></div><div class="notice good">Tasks, preferences and session history are saved locally. POMIBERRY does not collect unrelated browsing history, passwords or keystrokes.</div><p class="muted">This browser preview stores your data in this browser. Clearing its site data removes it.</p><button class="button danger small" type="button" data-action="clear-history">Clear session history</button></section>
    <section class="card settings-card"><h2>About protection &amp; AI</h2><div class="notice">Website filtering requires the optional Chrome extension in the extension/ folder. It is not active until you install that extension and Chrome confirms that rules were applied. The local AI assistant is not implemented.</div></section></div><div class="modal-actions"><button class="button primary" type="submit">Save settings</button></div></form>`;
}

function renderWidget() {
  const el=$('#float-widget');
  if(widgetPosition){el.style.left=`${widgetPosition.x}px`;el.style.top=`${widgetPosition.y}px`;el.style.right='auto';el.style.bottom='auto';}
  const session=state.session;
  $('#widget-panel').hidden=!session && !el.classList.contains('expanded') ? true : $('#widget-panel').hidden;
  const panel=$('#widget-panel');
  if(panel.hidden) return;
  panel.innerHTML=`<div class="widget-drag" id="widget-drag">DRAG YOUR LITTLE WIDGET</div><div class="widget-panel-head"><b>POMIBERRY</b><button class="widget-close" data-action="widget-close" aria-label="Collapse widget">×</button></div><div class="widget-status">${session?.type==='focus'?'FOCUS TIME':session?.type==='break'?'A GENTLE BREAK':state.status==='completed'?'SESSION COMPLETE':'READY WHEN YOU ARE'}</div><div class="widget-countdown" id="widget-countdown">${session?fmt(remainingMs(session)):state.status==='completed'?'00:00':`${String(state.settings.focusMinutes).padStart(2,'0')}:00`}</div><p class="widget-task">${escapeHtml(session?taskTitle():byId(selectedTaskId)?.title||'A little time for yourself')}</p><div class="widget-message">${session?.type==='focus'&&remainingMs(session)<=60_000?'One minute left! You’ve got this!':session?.type==='break'?'You deserve a moment to recharge.':'One little step is plenty for now.'}</div><div class="widget-buttons">${session?`<button class="button danger" data-action="end-session">End</button>${session.type==='focus'?`<button class="button green-button" data-action="start-break">Break</button>`:''}`:`<button class="button primary" data-action="quick-focus">${state.status==='completed'?'Focus again':'Start focus'}</button><button class="button secondary" data-go="home">Open home</button>`}</div><div class="widget-today"><span>Today’s focus</span><b>${fmtMins(todayFocusMs())}</b></div>`;
  window.pomiberryDrawPixelText?.($('.widget-panel-head b',panel),'POMIBERRY',2);
}
function updateMinuteDialogue(session, remaining) {
  const dialogue=$('#widget-dialogue');
  if(!dialogue)return;
  if(session?.type!=='focus'){
    minuteDialogueSessionId=null;dialogue.hidden=true;clearTimeout(minuteDialogueHandle);return;
  }
  const id=session.id||session.targetEndAt;
  if(remaining>0&&remaining<=60_000&&minuteDialogueSessionId!==id){
    minuteDialogueSessionId=id;dialogue.textContent='One minute left! You’ve got this!';dialogue.hidden=false;
    clearTimeout(minuteDialogueHandle);minuteDialogueHandle=setTimeout(()=>{dialogue.hidden=true;},8000);
  }
}
function updateTimerDisplay() {
  const s=state.session;
  const ms=s?remainingMs(s):null;
  const main=$('#main-time'); if(main) main.textContent=s?fmt(ms):state.status==='completed'?'00:00':`${String(state.settings.focusMinutes).padStart(2,'0')}:00`;
  const progress=$('#main-progress');
  if(progress){const ratio=s?Math.min(1,Math.max(0,ms/(s.durationMinutes*60_000))):0;progress.style.strokeDashoffset=String(515*(1-ratio));progress.classList.toggle('break',s?.type==='break');}
  const widgetTime=s?fmt(ms):state.status==='completed'?'00:00':`${String(state.settings.focusMinutes).padStart(2,'0')}:00`;
  const w=$('#widget-countdown');if(w)window.pomiberryDrawPixelTimer?.(w,widgetTime,5);
  const wt=$('#widget-mini-time');if(wt)window.pomiberryDrawPixelTimer?.(wt,s?fmt(ms):'',1);
  updateMinuteDialogue(s,ms??0);
  const widgetMessage=$('.widget-message');
  if(widgetMessage)widgetMessage.textContent=s?.type==='focus'&&ms<=60_000&&ms>0?'One minute left! You’ve got this!':s?.type==='break'?'You deserve a moment to recharge.':'One little step is plenty for now.';
  const wr=$('#widget-ring');if(wr){const ratio=s?Math.min(1,Math.max(0,ms/(s.durationMinutes*60_000))):0;wr.style.strokeDashoffset=String(201*(1-ratio));wr.style.stroke=s?.type==='break'?'#91c96b':'#f45b69';}
  const td=$('#today-focus');if(td)td.textContent=fmtMins(todayFocusMs());
  if(s&&ms<=0){const result=reconcile(state);if(result.expired){state=result.state;persist();render();notifyEnded(state.history[0]);showToast(state.history[0].type==='focus'?'You did it! Another little step forward.':'Break complete. Ready to ease back in?');}}
}
function bindView() {
  $('#home-task-select')?.addEventListener('change',e=>{selectedTaskId=e.target.value;render();});
  $('#settings-form')?.addEventListener('submit',saveSettings);
  for(const key of ['focus','break'])$(`#${key}-min`)?.addEventListener('change',e=>{const input=$(`#${key}-custom`);input.hidden=e.target.value!=='custom';if(!input.hidden)input.focus();});
  $$('[data-toggle-task]').forEach(input=>input.addEventListener('change',()=>{const task=byId(input.dataset.toggleTask);if(task){task.completed=input.checked;persist();render();}}));
  $$('[data-action]').forEach(btn=>btn.addEventListener('click',()=>handleAction(btn)));
  $$('[data-go]').forEach(btn=>btn.addEventListener('click',()=>go(btn.dataset.go)));
}

function go(where){page=where;render();window.scrollTo({top:0,behavior:state.settings.reducedMotion?'instant':'smooth'});}
function showDialog(title,body,submitLabel,onSubmit) {
  const root=$('#dialog-root');
  root.innerHTML=`<div class="modal-backdrop" role="presentation"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><div class="modal-head"><h2 id="dialog-title">${title}</h2><button class="close-button" type="button" aria-label="Close dialog" data-dialog-close>×</button></div>${body}<div class="modal-actions"><button type="button" class="button secondary" data-dialog-close>Cancel</button><button type="button" class="button primary" id="dialog-submit">${submitLabel}</button></div></section></div>`;
  $$('[data-dialog-close]',root).forEach(b=>b.onclick=()=>root.innerHTML='');
  $('.modal-backdrop',root).addEventListener('click',e=>{if(e.target.classList.contains('modal-backdrop'))root.innerHTML='';});
  $('#dialog-submit',root).onclick=()=>onSubmit(root);
  setTimeout(()=>$('.modal input,.modal textarea',root)?.focus(),0);
}
function taskDialog(task=null) {
  const t=task||{};
  showDialog(task?'Edit your task':'Add a little task',`<div class="field"><label for="task-title">Task name</label><input id="task-title" maxlength="120" required placeholder="e.g. Sketch the first page" value="${escapeHtml(t.title||'')}"/><span class="field-hint">Keep it small and kind to yourself.</span></div><div class="field"><label for="task-description">A few details (optional)</label><textarea id="task-description" maxlength="500" placeholder="What would help you get started?">${escapeHtml(t.description||'')}</textarea></div>`,task?'Save changes':'Add task',root=>{
    const titleInput=$('#task-title',root),title=titleInput.value.trim();titleInput.setCustomValidity('');if(!title){titleInput.setCustomValidity('Add a task name to continue.');titleInput.reportValidity();return;}
    const description=$('#task-description',root).value.trim();
    if(task){task.title=title;task.description=description;}else{const created={id:crypto.randomUUID(),title,description,createdAt:Date.now(),completed:false};state.tasks.unshift(created);selectedTaskId=created.id;}
    persist();root.innerHTML='';render();showToast(task?'Your task was updated.':'A new little task is ready.');
  });
}
function startSetup(type='focus',forcedDuration=null) {
  const isFocus=type==='focus', defaults=state.settings;
  const presets=isFocus?[5,10,15,25,45]:[5,10,15];
  const start=forcedDuration|| (isFocus?selectedMinutes:defaults.breakMinutes);
  const presetHtml=presets.map(m=>`<button type="button" class="preset ${m===start?'selected':''}" data-duration="${m}">${m} min</button>`).join('');
  const websiteFocus=isFocus&&defaults.protection==='websites';
  const customSites=(defaults.allowedDomains||[]).filter(domain=>!WEBSITE_CHOICES.some(site=>site.domains.includes(domain))).map(domain=>({key:`custom:${domain}`,label:domain,domains:[domain]}));
  const websiteGroups=WEBSITE_GROUPS.map(group=>({...group,sites:group.key==='workspace'?[...group.sites,...customSites]:group.sites}));
  const websiteField=websiteFocus?`<div class="field website-fieldset"><h3>Websites for this focus session</h3>${websiteGroups.map(group=>`<fieldset class="website-group"><legend>${escapeHtml(group.label)}</legend><div class="website-check-list">${group.sites.map(site=>`<label class="website-check"><input type="checkbox" name="session-websites" value="${escapeHtml(`preset:${site.key}`)}"/><span>${escapeHtml(site.label)}</span></label>`).join('')}</div></fieldset>`).join('')}<span class="field-hint">Choose the sites you want available. Other websites outside these choices remain open during your focus session.</span></div>`:'';
  showDialog(isFocus?'Make a little focus plan':'Take a little breather',`<div class="field"><span class="field-label">${isFocus?'How long feels good?':'Choose a break'}</span><div class="preset-row">${presetHtml}</div></div><div class="inline-fields"><div class="field"><label for="session-duration">Custom minutes (1–180)</label><input id="session-duration" type="number" min="1" max="180" step="1" value="${start}" /></div><div class="field"><label for="session-task">A task for this time</label><select id="session-task"><option value="">No task</option>${state.tasks.filter(t=>!t.completed).map(t=>`<option value="${escapeHtml(t.id)}" ${(selectedTaskId===t.id||state.session?.taskId===t.id)?'selected':''}>${escapeHtml(t.title)}</option>`).join('')}</select></div></div>${websiteField}${isFocus&&state.settings.contractEnabled?`<div class="field"><label for="focus-contract">A tiny intention (optional)</label><input id="focus-contract" maxlength="180" placeholder="Spend 15 minutes drafting the intro"/><span class="field-hint">You don’t need to finish everything. Just begin.</span></div>`:''}`,isFocus?'Begin focus':'Start break',async root=>{
    const input=$('#session-duration',root),mins=Number(input.value);input.setCustomValidity('');if(!validateDuration(mins)){input.setCustomValidity('Enter a whole number from 1 to 180.');input.reportValidity();return;}
    const websiteChoices=$$('input[name="session-websites"]:checked',root).map(input=>input.value);
    if(websiteFocus&&!websiteChoices.length){showToast('Choose at least one website for this focus session.');return;}
    const taskId=$('#session-task',root).value||null;const contract=$('#focus-contract',root)?.value||'';
    await prepareNotifications();
    try{state=startSession(state,type,mins,taskId,contract);if(websiteFocus){const allSites=[...WEBSITE_CHOICES,...customSites];const allDomains=[...new Set(allSites.flatMap(site=>site.domains))];const chosenDomains=websiteChoices.flatMap(choice=>{const preset=allSites.find(site=>`preset:${site.key}`===choice);return preset?.domains||[];});state.session.websiteDomains=[...new Set([...chosenDomains,...(defaults.supportDomains||[])])];state.session.websiteBlockDomains=allDomains.filter(domain=>!state.session.websiteDomains.some(allowed=>allowed===domain||allowed.endsWith(`.${domain}`)));}selectedTaskId=taskId||selectedTaskId;selectedMinutes=mins;persist();root.innerHTML='';page='home';render();notify(type==='focus'?'Focus time!':'A gentle break',type==='focus'?"Let's take it one step at a time.":'Take a moment to recharge.');}
    catch(err){showToast(err.message);}
  });
  $('#open-website-settings')?.addEventListener('click',()=>{$('#dialog-root').innerHTML='';go('settings');});
  $$('.preset', $('#dialog-root')).forEach(btn=>btn.onclick=()=>{$$('.preset',$('#dialog-root')).forEach(x=>x.classList.toggle('selected',x===btn));$('#session-duration').value=btn.dataset.duration;});
}
function handleAction(btn){
  const action=btn.dataset.action,id=btn.dataset.id;
  if(action==='new-task')return taskDialog();
  if(action==='edit-task')return taskDialog(byId(id));
  if(action==='delete-task'){const t=byId(id);if(!t)return;showDialog('Remove this task?',`<p class="muted">“${escapeHtml(t.title)}” will be removed from your list. Any past sessions stay in your history.</p>`,'Remove task',root=>{state.tasks=state.tasks.filter(x=>x.id!==id);if(selectedTaskId===id)selectedTaskId='';persist();root.innerHTML='';render();});return;}
  if(action==='task-start'){selectedTaskId=id;selectedMinutes=state.settings.focusMinutes;startSetup('focus');return;}
  if(action==='start-focus'){selectedMinutes=state.settings.focusMinutes;startSetup('focus');return;}
  if(action==='open-focus-setup')return startSetup('focus');
  if(action==='quick-focus'){selectedMinutes=state.status==='completed'?state.settings.focusMinutes:5;startSetup('focus',selectedMinutes);return;}
  if(action==='preset-focus'){selectedMinutes=Number(btn.dataset.minutes);startSetup('focus',selectedMinutes);return;}
  if(action==='start-break'){startSetup('break');return;}
  if(action==='end-session'){
    const current=reconcile(state);if(current.expired){state=current.state;persist();render();notifyEnded(state.history[0]);showToast('Your session finished. Nicely done.');return;}
    const type=state.session?.type;showDialog('End this session early?',`<p class="muted">Your time will be saved as a partial session, not marked as completed. It’s okay to stop when you need to.</p>`,'End session',root=>{try{state=finishSession(state,Date.now(),false);persist();root.innerHTML='';render();showToast('Session saved. Thank you for showing up.');}catch(e){showToast(e.message);}});return;
  }
  if(action==='clear-history'){
    showDialog('Clear your session history?',`<p class="muted">This removes recorded focus and break sessions from this device. Your tasks and settings stay as they are.</p>`,'Clear history',root=>{state=clearHistory(state);persist();root.innerHTML='';render();showToast('Session history cleared.');});return;
  }
  if(action==='widget-close'){closeWidget();return;}
}
function saveSettings(event){
  event.preventDefault();const form=event.currentTarget,fd=new FormData(form);
  const focusRaw=String(fd.get('focusMinutes')),breakRaw=String(fd.get('breakMinutes'));
  const focus=focusRaw==='custom'?Number(fd.get('focusCustom')):Number(focusRaw),brk=breakRaw==='custom'?Number(fd.get('breakCustom')):Number(breakRaw);
  if(!validateDuration(focus)||!validateDuration(brk)){showToast('Choose a whole number of minutes from 1 to 180.');return;}
  const domains=String(fd.get('allowedDomains')||'').split(/[\n,]+/).map(x=>x.trim().toLowerCase()).filter(Boolean);
  const supportDomains=String(fd.get('supportDomains')||'').split(/[\n,]+/).map(x=>x.trim().toLowerCase()).filter(Boolean);
  const validDomain=/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
  if([...domains,...supportDomains].some(domain=>!validDomain.test(domain))){showToast('Enter domains like mail.google.com, without https:// or a path.');return;}
  const nickname=String(fd.get('nickname')||'').trim().replace(/\s+/g,' ').slice(0,32);
  state.settings={...state.settings,focusMinutes:focus,breakMinutes:brk,nickname,protection:fd.get('protection')==='websites'?'websites':'gentle',allowedDomains:[...new Set(domains)],supportDomains:[...new Set(supportDomains)],contractEnabled:fd.has('contractEnabled'),notifyFocus:fd.has('notifyFocus'),notifyBreak:fd.has('notifyBreak'),reducedMotion:fd.has('reducedMotion')};
  persist();render();showToast('Your cozy defaults are saved.');
}

function readWidgetPosition(){try{const p=JSON.parse(localStorage.getItem('pomiberry.widget.v1'));return p&&Number.isFinite(p.x)&&Number.isFinite(p.y)?p:null;}catch{return null;}}
function saveWidgetPosition(x,y){widgetPosition={x,y};try{localStorage.setItem('pomiberry.widget.v1',JSON.stringify(widgetPosition));}catch{}}
function closeWidget(){$('#float-widget').classList.remove('expanded');$('#widget-panel').hidden=true;}
let suppressWidgetClick=false;
$('#widget-compact').addEventListener('click',()=>{if(suppressWidgetClick)return;const panel=$('#widget-panel');if(panel.hidden){$('#float-widget').classList.add('expanded');panel.hidden=false;renderWidget();bindView();}else closeWidget();});
function bindWidgetDrag(){
  const widget=$('#float-widget');let drag=null;
  widget.addEventListener('pointerdown',e=>{if(!e.target.closest('#widget-drag,#widget-compact'))return;const rect=widget.getBoundingClientRect();drag={dx:e.clientX-rect.left,dy:e.clientY-rect.top,pointer:e.pointerId,startX:e.clientX,startY:e.clientY,moved:false};widget.setPointerCapture(e.pointerId);});
  widget.addEventListener('pointermove',e=>{if(!drag||drag.pointer!==e.pointerId)return;if(Math.abs(e.clientX-drag.startX)+Math.abs(e.clientY-drag.startY)>4)drag.moved=true;if(!drag.moved)return;const x=Math.max(0,Math.min(innerWidth-widget.offsetWidth,e.clientX-drag.dx));const y=Math.max(0,Math.min(innerHeight-widget.offsetHeight,e.clientY-drag.dy));widget.style.left=`${x}px`;widget.style.top=`${y}px`;widget.style.right='auto';widget.style.bottom='auto';saveWidgetPosition(x,y);});
  widget.addEventListener('pointerup',()=>{if(drag?.moved){suppressWidgetClick=true;setTimeout(()=>suppressWidgetClick=false,180);}drag=null;});
}
bindWidgetDrag();
$$('.nav-item').forEach(btn=>btn.addEventListener('click',()=>go(btn.dataset.page)));
$('#avatar-button')?.addEventListener('click',()=>go('settings'));
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('#dialog-root').innerHTML)$('#dialog-root').innerHTML='';});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){const check=reconcile(state);if(check.expired){state=check.state;persist();render();notifyEnded(state.history[0]);}}});
window.addEventListener('message',event=>{
  if(event.source===window&&event.origin===location.origin&&event.data?.source==='pomiberry-extension-action'){
    const action=event.data.action;
    if(['end-session','start-break','quick-focus'].includes(action))document.querySelector(`#content [data-action="${action}"]`)?.click();
    return;
  }
  if(event.source!==window||event.origin!==location.origin||event.data?.source!=='pomiberry-extension')return;
  protectionStatus=event.data.status||{connected:false,protectionActive:false};
  updateProtectionStatus();
});
window.addEventListener('focus',()=>{const check=reconcile(state);if(check.expired){state=check.state;persist();render();notifyEnded(state.history[0]);}});
window.addEventListener('resize',()=>{if(widgetPosition){const x=Math.max(0,Math.min(innerWidth-70,widgetPosition.x)),y=Math.max(0,Math.min(innerHeight-70,widgetPosition.y));saveWidgetPosition(x,y);const w=$('#float-widget');w.style.left=`${x}px`;w.style.top=`${y}px`;}});
if(state.settings.reducedMotion)document.documentElement.style.scrollBehavior='auto';
render();
timerHandle=setInterval(()=>{if(active()){const check=reconcile(state);if(check.expired){state=check.state;persist();render();notifyEnded(state.history[0]);}else updateTimerDisplay();}else if(page==='home')updateTimerDisplay();},250);
