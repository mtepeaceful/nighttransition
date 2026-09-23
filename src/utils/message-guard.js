import { MAX_REPORTED_ACTIVE_MS, MESSAGE_TYPES } from './constants.js';

function isPlainObject(value) {
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

const noPayload = (payload) => payload === undefined;

const UI_ROUTES = {
  [MESSAGE_TYPES.GET_POPUP_STATE]: noPayload,
  [MESSAGE_TYPES.TOGGLE_NIGHT_MODE]: noPayload,
  [MESSAGE_TYPES.SAVE_SETTINGS]: isPlainObject,
  [MESSAGE_TYPES.UPDATE_BLOCKED_SITES]: (payload) =>
    isPlainObject(payload) && Array.isArray(payload.blockedSites),
};

const CONTENT_ROUTES = {
  [MESSAGE_TYPES.GET_PAGE_STATE]: noPayload,
  [MESSAGE_TYPES.REMINDER_DISMISSED]: noPayload,
  [MESSAGE_TYPES.REPORT_ACTIVE_TIME]: (payload) =>
    isPlainObject(payload) &&
    Number.isFinite(payload.elapsedMs) &&
    payload.elapsedMs >= 0 &&
    payload.elapsedMs <= MAX_REPORTED_ACTIVE_MS,
};

export function resolveRoute(message, sender, { extensionId, extensionOrigin }) {
  if (!isPlainObject(message) || typeof message.type !== 'string') return null;
  if (!sender || sender.id !== extensionId) return null;

  const fromExtensionPage = sender.origin === extensionOrigin && !sender.tab;
  const fromContentScript = Boolean(sender.tab) && typeof sender.url === 'string';

  if (fromExtensionPage && Object.hasOwn(UI_ROUTES, message.type)) {
    return UI_ROUTES[message.type](message.payload) ? 'ui' : null;
  }
  if (fromContentScript && Object.hasOwn(CONTENT_ROUTES, message.type)) {
    return CONTENT_ROUTES[message.type](message.payload) ? 'content' : null;
  }
  return null;
}
