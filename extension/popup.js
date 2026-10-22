chrome.runtime.sendMessage({ type: 'POMIBERRY_GET_STATE' }, response => {
  const s=response?.state, active=s?.status==='focus'&&s?.session?.type==='focus';
  document.querySelector('#state').textContent=active?'Focus session is running. Website focus is '+(response?.status?.protectionActive?'active.':'off.'):'No focus session is running.';
});
document.querySelector('#open').addEventListener('click',()=>chrome.tabs.create({url:'http://127.0.0.1:4173'}));
