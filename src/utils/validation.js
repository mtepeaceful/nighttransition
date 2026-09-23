import { DEFAULT_SETTINGS, MAX_BLOCKED_SITES, MAX_TARGET_KELVIN, MIN_TARGET_KELVIN } from './constants.js';

const DOMAIN_PATTERN = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/i;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export function normalizeSite(rawValue) {
  return String(rawValue)
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0];
}

export function isValidDomain(value) {
  return DOMAIN_PATTERN.test(value);
}

function clampInteger(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

function sanitizeTime(value, fallback) {
  return typeof value === 'string' && TIME_PATTERN.test(value) ? value : fallback;
}

function sanitizeSites(value) {
  if (!Array.isArray(value)) return [...DEFAULT_SETTINGS.blockedSites];
  const sites = value.map(normalizeSite).filter(isValidDomain);
  return [...new Set(sites)].slice(0, MAX_BLOCKED_SITES);
}

export function sanitizeSettings(input) {
  const raw = input && typeof input === 'object' ? input : {};
  return {
    startTime: sanitizeTime(raw.startTime, DEFAULT_SETTINGS.startTime),
    endTime: sanitizeTime(raw.endTime, DEFAULT_SETTINGS.endTime),
    gradualTransition: raw.gradualTransition !== false,
    transitionMinutes: clampInteger(raw.transitionMinutes, 0, 120, DEFAULT_SETTINGS.transitionMinutes),
    targetKelvin:
      Math.round(
        clampInteger(raw.targetKelvin, MIN_TARGET_KELVIN, MAX_TARGET_KELVIN, DEFAULT_SETTINGS.targetKelvin) / 100,
      ) * 100,
    progressiveWarming: raw.progressiveWarming === true,
    reminderThresholdMinutes: clampInteger(
      raw.reminderThresholdMinutes,
      1,
      180,
      DEFAULT_SETTINGS.reminderThresholdMinutes,
    ),
    countdownSeconds: clampInteger(raw.countdownSeconds, 1, 60, DEFAULT_SETTINGS.countdownSeconds),
    blockedSites: sanitizeSites(raw.blockedSites),
  };
}
