import { DEFAULT_SETTINGS, DEFAULT_STATE } from './constants.js';

export async function getSettings() {
  const { settings } = await chrome.storage.sync.get('settings');
  return { ...DEFAULT_SETTINGS, ...settings };
}

export async function saveSettings(settings) {
  await chrome.storage.sync.set({ settings });
  return settings;
}

export async function getState() {
  const { state } = await chrome.storage.local.get('state');
  return { ...DEFAULT_STATE, ...state };
}

export async function setState(patch) {
  const next = { ...(await getState()), ...patch };
  await chrome.storage.local.set({ state: next });
  return next;
}
