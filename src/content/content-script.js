const MESSAGE_TYPES = Object.freeze({
  GET_PAGE_STATE: 'GET_PAGE_STATE',
  REPORT_ACTIVE_TIME: 'REPORT_ACTIVE_TIME',
  REMINDER_DISMISSED: 'REMINDER_DISMISSED',
  APPLY_OVERLAY: 'APPLY_OVERLAY',
  GET_PENDING_ACTIVE_TIME: 'GET_PENDING_ACTIVE_TIME',
});
const OVERLAY_ID = 'nt-overlay';
const HEARTBEAT_MS = 15 * 1000;
const MAX_REPORTED_ACTIVE_MS = 60 * 1000;

let visibleSince = null;
let heartbeatId = null;
let isReminderOpen = false;

function isExtensionContextValid() {
  try {
    return Boolean(chrome.runtime?.id);
  } catch {
    return false;
  }
}

function createElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
}

function ensureOverlay() {
  let overlay = document.getElementById(OVERLAY_ID);
  if (!overlay) {
    overlay = createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.style.transition = 'none';
    document.documentElement.appendChild(overlay);
    requestAnimationFrame(() => requestAnimationFrame(() => overlay.style.removeProperty('transition')));
  }
  return overlay;
}

function applyOverlay({ r, g, b, alpha }) {
  const channels = [r, g, b, alpha].map(Number);
  if (channels.some((value) => !Number.isFinite(value))) return;
  ensureOverlay().style.backgroundColor = `rgba(${channels.join(', ')})`;
}

function formatElapsed(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function isValidReminder(reminder) {
  return (
    typeof reminder?.hostname === 'string' &&
    Number.isFinite(reminder.activeMs) &&
    Number.isFinite(reminder.countdownSeconds)
  );
}

function notifyDismissed() {
  chrome.runtime.sendMessage({ type: MESSAGE_TYPES.REMINDER_DISMISSED }).catch(() => {});
}

function showReminder({ hostname, activeMs, countdownSeconds }) {
  isReminderOpen = true;
  const shownAt = Date.now();

  const backdrop = createElement('div', 'nt-reminder-backdrop');
  const box = createElement('div', 'nt-reminder-box');
  const siteLine = createElement('p', 'nt-site', 'Você está em ');
  const elapsedLine = createElement('p', 'nt-elapsed', 'Tempo neste site hoje à noite: ');
  const elapsedEl = createElement('strong');
  const continueBtn = createElement('button', null, `Aguarde (${countdownSeconds}s)`);

  box.setAttribute('role', 'alertdialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-label', 'Pausa consciente');
  siteLine.appendChild(createElement('strong', null, hostname));
  elapsedLine.appendChild(elapsedEl);
  continueBtn.type = 'button';
  continueBtn.disabled = true;
  box.append(createElement('h2', null, 'Pausa consciente'), siteLine, elapsedLine, continueBtn);
  backdrop.appendChild(box);
  document.documentElement.appendChild(backdrop);

  const updateElapsed = () => {
    elapsedEl.textContent = formatElapsed(activeMs + Date.now() - shownAt);
  };
  updateElapsed();
  const elapsedTimer = setInterval(updateElapsed, 1000);

  let remaining = countdownSeconds;
  const countdownTimer = setInterval(() => {
    remaining -= 1;
    if (remaining > 0) {
      continueBtn.textContent = `Aguarde (${remaining}s)`;
      return;
    }
    clearInterval(countdownTimer);
    continueBtn.disabled = false;
    continueBtn.textContent = 'Voltar para o site';
    continueBtn.focus();
  }, 1000);

  continueBtn.addEventListener('click', () => {
    clearInterval(elapsedTimer);
    clearInterval(countdownTimer);
    backdrop.remove();
    isReminderOpen = false;
    notifyDismissed();
  });
}

function pendingVisibleMs() {
  if (visibleSince === null) return 0;
  return Math.min(Math.max(Date.now() - visibleSince, 0), MAX_REPORTED_ACTIVE_MS);
}

function takeVisibleElapsed() {
  const elapsed = pendingVisibleMs();
  if (visibleSince !== null) visibleSince = document.visibilityState === 'visible' ? Date.now() : null;
  return elapsed;
}

function stopTracking() {
  if (heartbeatId !== null) clearInterval(heartbeatId);
  heartbeatId = null;
  visibleSince = null;
  document.removeEventListener('visibilitychange', onVisibilityChange);
  window.removeEventListener('pagehide', reportActiveTime);
}

async function reportActiveTime() {
  if (!isExtensionContextValid()) {
    stopTracking();
    return;
  }

  const elapsedMs = takeVisibleElapsed();
  try {
    const response = await chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.REPORT_ACTIVE_TIME,
      payload: { elapsedMs },
    });
    const reminder = response?.ok ? response.data.reminder : null;
    if (!isReminderOpen && document.visibilityState === 'visible' && isValidReminder(reminder)) {
      showReminder(reminder);
    }
  } catch {
    stopTracking();
  }
}

function onVisibilityChange() {
  if (document.visibilityState === 'visible') visibleSince = Date.now();
  reportActiveTime();
}

function startTracking() {
  visibleSince = document.visibilityState === 'visible' ? Date.now() : null;
  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('pagehide', reportActiveTime);
  heartbeatId = setInterval(() => {
    if (visibleSince !== null) reportActiveTime();
  }, HEARTBEAT_MS);
  reportActiveTime();
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return;
  if (message?.type === MESSAGE_TYPES.APPLY_OVERLAY) applyOverlay(message.overlay);
  if (message?.type === MESSAGE_TYPES.GET_PENDING_ACTIVE_TIME) {
    sendResponse({ visible: visibleSince !== null, pendingMs: pendingVisibleMs() });
  }
});

async function init() {
  try {
    const response = await chrome.runtime.sendMessage({ type: MESSAGE_TYPES.GET_PAGE_STATE });
    if (!response?.ok) return;
    applyOverlay(response.data.overlay);
    if (response.data.trackUsage === true) startTracking();
  } catch {}
}

init();
