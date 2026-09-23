export const CHECK_ALARM = 'night-transition-check';
export const BOUNDARY_ALARM = 'night-transition-boundary';

export const DEFAULT_SETTINGS = Object.freeze({
  startTime: '22:00',
  endTime: '06:00',
  blockedSites: ['youtube.com', 'tiktok.com', 'twitch.tv'],
  targetKelvin: 3400,
  progressiveWarming: false,
  reminderThresholdMinutes: 33,
  countdownSeconds: 5,
  transitionMinutes: 25,
  gradualTransition: true,
});

export const DEFAULT_STATE = Object.freeze({
  nightModeActive: false,
  siteUsage: {},
  manualOverride: null,
  overrideUntil: null,
});

export const MESSAGE_TYPES = Object.freeze({
  GET_PAGE_STATE: 'GET_PAGE_STATE',
  REPORT_ACTIVE_TIME: 'REPORT_ACTIVE_TIME',
  REMINDER_DISMISSED: 'REMINDER_DISMISSED',
  GET_POPUP_STATE: 'GET_POPUP_STATE',
  SAVE_SETTINGS: 'SAVE_SETTINGS',
  UPDATE_BLOCKED_SITES: 'UPDATE_BLOCKED_SITES',
  TOGGLE_NIGHT_MODE: 'TOGGLE_NIGHT_MODE',
  APPLY_OVERLAY: 'APPLY_OVERLAY',
  GET_PENDING_ACTIVE_TIME: 'GET_PENDING_ACTIVE_TIME',
});

export const MAX_BLOCKED_SITES = 100;
export const MIN_TARGET_KELVIN = 1900;
export const MAX_TARGET_KELVIN = 6500;
export const MAX_REPORTED_ACTIVE_MS = 60 * 1000;
