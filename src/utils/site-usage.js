import { MAX_REPORTED_ACTIVE_MS } from './constants.js';

const EMPTY_USAGE = Object.freeze({ activeMs: 0, lastDismissedAtMs: 0 });

export function hostnameFromUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function isBlockedHostname(hostname, blockedSites) {
  if (!hostname) return false;
  return blockedSites.some((site) => hostname === site || hostname.endsWith(`.${site}`));
}

export function getUsage(siteUsage, hostname) {
  return { ...EMPTY_USAGE, ...siteUsage[hostname] };
}

export function addActiveTime(usage, elapsedMs) {
  const safeElapsed = Math.min(Math.max(Number(elapsedMs) || 0, 0), MAX_REPORTED_ACTIVE_MS);
  return { ...usage, activeMs: usage.activeMs + safeElapsed };
}

export function isReminderDue(usage, thresholdMinutes) {
  return usage.activeMs - usage.lastDismissedAtMs >= thresholdMinutes * 60 * 1000;
}

export function dismissReminder(usage) {
  return { ...usage, lastDismissedAtMs: usage.activeMs };
}
