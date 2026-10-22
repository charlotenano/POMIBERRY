chrome.runtime.sendMessage({ type: 'POMIBERRY_GET_STATE' }, response => {
  const state = response?.state;
  const allowed = response?.status?.allowedDomains || state?.settings?.allowedDomains || [];
  document.querySelector('#allowed-sites').textContent = allowed.length
    ? `Allowed for this session: ${allowed.join(', ')}`
    : 'POMIBERRY has no allowed website list for this session. Reload the extension and start a new focus session.';

  if (state?.status === 'focus' && state.session) {
    const task = state.taskTitle || 'your current task';
    const taskLine = document.querySelector('#task');
    const updateCountdown = () => {
      const seconds = Math.max(0, Math.ceil((state.session.targetEndAt - Date.now()) / 1000));
      const time = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
      taskLine.textContent = seconds > 0
        ? `You’re focusing on: ${task}. ${time} left.`
        : `Your focus time is up. ${task} is ready when you are.`;
    };
    updateCountdown();
    const countdown = setInterval(() => {
      updateCountdown();
      if (Date.now() >= state.session.targetEndAt) clearInterval(countdown);
    }, 1000);
  }
});

document.querySelector('#back').addEventListener('click', () => history.back());
document.querySelector('#open').addEventListener('click', () => chrome.tabs.create({ url: 'http://127.0.0.1:4173' }));
document.querySelector('#override').addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'POMIBERRY_OVERRIDE' }, result => {
    document.querySelector('#message').textContent = result?.ok
      ? 'Website blocks are paused for five minutes. You can return to focus anytime.'
      : 'The override could not be started. Open POMIBERRY to end the session.';
  });
});
