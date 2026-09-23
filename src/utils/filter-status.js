import { computeOverlay, isScheduledActive, kelvinAt } from './night-phase.js';
import { NEUTRAL_KELVIN, effectiveWhitePoint, estimateColorTemperature } from './color-temperature.js';
import { isBlockedHostname } from './site-usage.js';

function minutesSinceMidnight(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

const toMired = (kelvin) => 1e6 / kelvin;

export function temperatureName(kelvin) {
  if (kelvin >= 5500) return 'Luz do dia';
  if (kelvin >= 4000) return 'Branco-quente';
  if (kelvin >= 2600) return 'Âmbar';
  return 'Luz de vela';
}

function intensityTowardsTarget(phase, stageKelvin, targetKelvin) {
  const fullPath = toMired(targetKelvin) - toMired(NEUTRAL_KELVIN);
  if (fullPath <= 0) return 100;
  const reached = (toMired(stageKelvin) - toMired(NEUTRAL_KELVIN)) / fullPath;
  return Math.round(Math.min(1, Math.max(0, reached)) * phase.progress * 100);
}

export function describeFilter(phase, settings) {
  const overlay = computeOverlay(phase, settings);
  const isOn = phase.phase !== 'inactive';
  const whitePoint = effectiveWhitePoint(overlay).map((channel) => Math.round(channel * 255));
  const stageKelvin = kelvinAt(phase.windowProgress, settings);

  return {
    stage: isOn ? temperatureName(stageKelvin) : null,
    stageKelvin: isOn ? Math.round(stageKelvin) : null,
    kelvin: estimateColorTemperature(overlay),
    intensityPercent: isOn ? intensityTowardsTarget(phase, stageKelvin, settings.targetKelvin) : 0,
    targetKelvin: settings.targetKelvin,
    swatch: { r: whitePoint[0], g: whitePoint[1], b: whitePoint[2] },
  };
}

export function describeRitual(settings, manualOverride, now = new Date()) {
  const { startTime, endTime } = settings;
  if (startTime === endTime) return { status: 'unscheduled', startTime, endTime };

  if (isScheduledActive(settings, now)) {
    return { status: manualOverride === false ? 'paused' : 'running', startTime, endTime };
  }

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const delta = minutesSinceMidnight(startTime) - nowMinutes;
  return {
    status: 'upcoming',
    startTime,
    endTime,
    minutesUntilStart: delta > 0 ? delta : delta + 1440,
    manuallyActive: manualOverride === true,
  };
}

export function describeSiteReminder({
  hostname,
  settings,
  usage,
  nightModeActive,
  ticking = false,
  connected = false,
}) {
  if (!isBlockedHostname(hostname, settings.blockedSites)) return null;
  if (!nightModeActive) return { hostname, counting: false };

  const thresholdMs = settings.reminderThresholdMinutes * 60 * 1000;
  const sinceLastMs = usage.activeMs - usage.lastDismissedAtMs;
  return {
    hostname,
    counting: true,
    connected,
    ticking: connected && ticking,
    thresholdMs,
    elapsedMs: Math.min(sinceLastMs, thresholdMs),
    remainingMs: Math.max(0, thresholdMs - sinceLastMs),
  };
}
