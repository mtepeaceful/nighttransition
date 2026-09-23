import { NEUTRAL_KELVIN, blackbodyColor, interpolateKelvin } from './color-temperature.js';

function minutesSinceMidnight(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function computeNightPhase(settings, manualOverride, now = new Date()) {
  if (manualOverride === true) return { phase: 'active', progress: 1, windowProgress: 1, minutesRemaining: 0 };
  if (manualOverride === false) return { phase: 'inactive', progress: 0, windowProgress: 0, minutesRemaining: 0 };

  const { startTime, endTime, transitionMinutes, gradualTransition } = settings;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const start = minutesSinceMidnight(startTime);
  const end = minutesSinceMidnight(endTime);

  if (start === end) return { phase: 'inactive', progress: 0, windowProgress: 0, minutesRemaining: 0 };

  const windowLength = start < end ? end - start : 1440 - start + end;
  const withinWindow = start < end ? nowMinutes >= start && nowMinutes < end : nowMinutes >= start || nowMinutes < end;

  if (!withinWindow) return { phase: 'inactive', progress: 0, windowProgress: 0, minutesRemaining: 0 };

  const elapsed = nowMinutes >= start ? nowMinutes - start : 1440 - start + nowMinutes;
  const windowProgress = Math.min(1, Math.max(0, elapsed / windowLength));
  const rampMinutes = gradualTransition === false ? 0 : Math.min(Math.max(transitionMinutes, 0), windowLength);

  if (rampMinutes > 0 && elapsed < rampMinutes) {
    return {
      phase: 'transitioning',
      progress: elapsed / rampMinutes,
      windowProgress,
      minutesRemaining: Math.ceil(rampMinutes - elapsed),
    };
  }

  return {
    phase: 'active',
    progress: 1,
    windowProgress,
    minutesRemaining: Math.ceil(windowLength - elapsed),
  };
}

export function isScheduledActive(settings, now = new Date()) {
  return computeNightPhase(settings, null, now).phase !== 'inactive';
}

export function nextScheduleBoundary(settings, now = new Date()) {
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const minutesAhead = Math.min(
    ...[settings.startTime, settings.endTime].map((time) => {
      const delta = minutesSinceMidnight(time) - nowMinutes;
      return delta > 0 ? delta : delta + 1440;
    }),
  );
  const boundary = new Date(now);
  boundary.setSeconds(0, 0);
  boundary.setMinutes(boundary.getMinutes() + minutesAhead);
  return boundary.getTime();
}

export const PROGRESSIVE_START_FRACTION = 0.25;

export function kelvinAt(windowProgress, { targetKelvin, progressiveWarming }) {
  if (!progressiveWarming) return targetKelvin;
  const p = Math.min(1, Math.max(0, windowProgress));
  const startKelvin = interpolateKelvin(NEUTRAL_KELVIN, targetKelvin, PROGRESSIVE_START_FRACTION);
  return interpolateKelvin(startKelvin, targetKelvin, p);
}

export function computeNightColor(windowProgress, settings) {
  const kelvin = kelvinAt(windowProgress, settings);
  return { ...blackbodyColor(kelvin), alpha: 1, kelvin: Math.round(kelvin) };
}

export function computeOverlay(phase, settings) {
  const { r, g, b, alpha } = computeNightColor(phase.windowProgress, settings);
  return { r, g, b, alpha: alpha * phase.progress };
}
