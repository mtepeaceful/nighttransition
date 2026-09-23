import { BOUNDARY_ALARM, CHECK_ALARM, MESSAGE_TYPES } from '../utils/constants.js';
import { getSettings, getState, saveSettings, setState } from '../utils/storage.js';
import {
  computeNightPhase,
  computeOverlay,
  isScheduledActive,
  nextScheduleBoundary,
} from '../utils/night-phase.js';
import { sanitizeSettings } from '../utils/validation.js';
import { resolveRoute } from '../utils/message-guard.js';
import { describeFilter, describeRitual, describeSiteReminder } from '../utils/filter-status.js';
import {
  addActiveTime,
  dismissReminder,
  getUsage,
  hostnameFromUrl,
  isBlockedHostname,
  isReminderDue,
} from '../utils/site-usage.js';

const EXTENSION_ORIGIN = chrome.runtime.getURL('').replace(/\/$/, '');

let pendingWrite = Promise.resolve();

function serialized(task) {
  const run = pendingWrite.then(task);
  pendingWrite = run.catch(() => {});
  return run;
}

function notifyRitual() {
  chrome.notifications.create(`night-transition-${Date.now()}`, {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('assets/icons/icon-128.png'),
    title: 'Hora de desacelerar',
    message: 'O modo noturno foi ativado. Que tal encerrar as telas, respirar fundo e se preparar para dormir?',
    priority: 1,
  });
}

function activeOverride(state) {
  return Date.now() < state.overrideUntil ? state.manualOverride : null;
}

function describe(settings, state) {
  const phase = computeNightPhase(settings, activeOverride(state));
  return { phase, overlay: computeOverlay(phase, settings) };
}

async function broadcastOverlay(overlay) {
  const tabs = await chrome.tabs.query({});
  await Promise.allSettled(
    tabs
      .filter((tab) => tab.id >= 0)
      .map((tab) => chrome.tabs.sendMessage(tab.id, { type: MESSAGE_TYPES.APPLY_OVERLAY, overlay })),
  );
}

async function checkAndUpdateState() {
  const settings = await getSettings();
  let state = await getState();
  let changed = false;
  const scheduledActive = isScheduledActive(settings);

  if (state.manualOverride !== null) {
    if (Date.now() < state.overrideUntil) {
      if (state.nightModeActive !== state.manualOverride) {
        state = await setState({ nightModeActive: state.manualOverride });
        changed = true;
      }
      return { settings, state, changed };
    }
    const endedManualActivation = state.manualOverride === true;
    state = await setState({ manualOverride: null, overrideUntil: null });
    changed = true;

    if (endedManualActivation && scheduledActive) {
      state = await setState({ nightModeActive: true, siteUsage: {} });
      notifyRitual();
      return { settings, state, changed };
    }
  }

  if (scheduledActive !== state.nightModeActive) {
    state = await setState({ nightModeActive: scheduledActive, siteUsage: {} });
    if (scheduledActive) notifyRitual();
    changed = true;
  }

  return { settings, state, changed };
}

async function scheduleBoundaryAlarm(settings, state) {
  const candidates = [];
  if (settings.startTime !== settings.endTime) candidates.push(nextScheduleBoundary(settings));
  if (state.manualOverride !== null && state.overrideUntil > Date.now()) candidates.push(state.overrideUntil);

  if (candidates.length === 0) {
    await chrome.alarms.clear(BOUNDARY_ALARM);
    return;
  }
  await chrome.alarms.create(BOUNDARY_ALARM, { when: Math.min(...candidates) });
}

async function runScheduledCheck() {
  const { settings, state, changed } = await serialized(checkAndUpdateState);
  const { phase, overlay } = describe(settings, state);
  await scheduleBoundaryAlarm(settings, state);
  if (changed || phase.phase !== 'inactive') await broadcastOverlay(overlay);
}

async function ensureAlarm() {
  const alarm = await chrome.alarms.get(CHECK_ALARM);
  if (!alarm) await chrome.alarms.create(CHECK_ALARM, { periodInMinutes: 1 });
}

async function handleGetPageState(_message, sender) {
  const settings = await getSettings();
  const state = await getState();
  const hostname = hostnameFromUrl(sender.url);
  return {
    overlay: describe(settings, state).overlay,
    trackUsage: isBlockedHostname(hostname, settings.blockedSites),
  };
}

async function handleReportActiveTime(message, sender) {
  const hostname = hostnameFromUrl(sender.url);
  const settings = await getSettings();

  return serialized(async () => {
    const state = await getState();
    if (!state.nightModeActive || !isBlockedHostname(hostname, settings.blockedSites)) {
      return { reminder: null };
    }

    const usage = addActiveTime(getUsage(state.siteUsage, hostname), message.payload.elapsedMs);
    await setState({ siteUsage: { ...state.siteUsage, [hostname]: usage } });

    if (!isReminderDue(usage, settings.reminderThresholdMinutes)) return { reminder: null };
    return {
      reminder: { hostname, activeMs: usage.activeMs, countdownSeconds: settings.countdownSeconds },
    };
  });
}

async function handleReminderDismissed(_message, sender) {
  const hostname = hostnameFromUrl(sender.url);

  return serialized(async () => {
    const state = await getState();
    if (!Object.hasOwn(state.siteUsage, hostname)) return {};
    const usage = dismissReminder(getUsage(state.siteUsage, hostname));
    await setState({ siteUsage: { ...state.siteUsage, [hostname]: usage } });
    return {};
  });
}

async function getActiveTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    return tab ?? null;
  } catch {
    return null;
  }
}

async function getPendingActiveTime(tabId) {
  try {
    const response = await chrome.tabs.sendMessage(tabId, { type: MESSAGE_TYPES.GET_PENDING_ACTIVE_TIME });
    if (typeof response?.visible !== 'boolean' || !Number.isFinite(response.pendingMs)) return null;
    return response;
  } catch {
    return null;
  }
}

async function buildPopupState() {
  const settings = await getSettings();
  const state = await getState();
  const override = activeOverride(state);
  const phase = computeNightPhase(settings, override);
  const tab = await getActiveTab();
  const hostname = hostnameFromUrl(tab?.url ?? '');

  let usage = getUsage(state.siteUsage, hostname);
  let ticking = false;
  let connected = false;
  if (state.nightModeActive && isBlockedHostname(hostname, settings.blockedSites) && tab.id >= 0) {
    const pending = await getPendingActiveTime(tab.id);
    if (pending) {
      usage = addActiveTime(usage, pending.pendingMs);
      ticking = pending.visible;
      connected = true;
    }
  }

  return {
    settings,
    phase,
    filter: describeFilter(phase, settings),
    ritual: describeRitual(settings, override),
    siteReminder: describeSiteReminder({
      hostname,
      settings,
      usage,
      nightModeActive: state.nightModeActive,
      ticking,
      connected,
    }),
  };
}

async function handleGetPopupState() {
  return buildPopupState();
}

async function handleSaveSettings(message) {
  const { settings, state } = await serialized(async () => {
    const previous = await getSettings();
    const next = await saveSettings(sanitizeSettings(message.payload));
    if (previous.startTime !== next.startTime || previous.endTime !== next.endTime) {
      await setState({ manualOverride: null, overrideUntil: null });
    }
    return checkAndUpdateState();
  });
  await scheduleBoundaryAlarm(settings, state);
  await broadcastOverlay(describe(settings, state).overlay);
  return buildPopupState();
}

async function handleUpdateBlockedSites(message) {
  return serialized(async () => {
    const current = await getSettings();
    const settings = await saveSettings(
      sanitizeSettings({ ...current, blockedSites: message.payload.blockedSites }),
    );
    return { settings };
  });
}

async function handleToggleNightMode() {
  const { settings, state } = await serialized(async () => {
    const currentSettings = await getSettings();
    const current = await getState();
    const currentlyActive = computeNightPhase(currentSettings, activeOverride(current)).phase !== 'inactive';
    const scheduledActive = isScheduledActive(currentSettings);
    const nextActive = !currentlyActive;
    const matchesSchedule = nextActive === scheduledActive;

    const nextState = await setState({
      nightModeActive: nextActive,
      manualOverride: matchesSchedule ? null : nextActive,
      overrideUntil: matchesSchedule ? null : nextScheduleBoundary(currentSettings),
      siteUsage: {},
    });
    return { settings: currentSettings, state: nextState };
  });
  await scheduleBoundaryAlarm(settings, state);
  await broadcastOverlay(describe(settings, state).overlay);
  return buildPopupState();
}

const HANDLERS = {
  [MESSAGE_TYPES.GET_POPUP_STATE]: handleGetPopupState,
  [MESSAGE_TYPES.SAVE_SETTINGS]: handleSaveSettings,
  [MESSAGE_TYPES.UPDATE_BLOCKED_SITES]: handleUpdateBlockedSites,
  [MESSAGE_TYPES.TOGGLE_NIGHT_MODE]: handleToggleNightMode,
  [MESSAGE_TYPES.GET_PAGE_STATE]: handleGetPageState,
  [MESSAGE_TYPES.REPORT_ACTIVE_TIME]: handleReportActiveTime,
  [MESSAGE_TYPES.REMINDER_DISMISSED]: handleReminderDismissed,
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const route = resolveRoute(message, sender, {
    extensionId: chrome.runtime.id,
    extensionOrigin: EXTENSION_ORIGIN,
  });
  const handler = route ? HANDLERS[message.type] : null;
  if (!handler) {
    console.warn('Mensagem rejeitada: origem ou tipo não autorizado.', message?.type);
    return false;
  }

  handler(message, sender)
    .then((data) => sendResponse({ ok: true, data }))
    .catch((error) => {
      console.error(error);
      sendResponse({ ok: false, error: 'internal_error' });
    });
  return true;
});

chrome.runtime.onInstalled.addListener(async () => {
  await ensureAlarm();
  await runScheduledCheck();
});

chrome.runtime.onStartup.addListener(async () => {
  await ensureAlarm();
  await runScheduledCheck();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === CHECK_ALARM || alarm.name === BOUNDARY_ALARM) return runScheduledCheck();
});

ensureAlarm();
