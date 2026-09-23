import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  describeFilter,
  describeRitual,
  describeSiteReminder,
  temperatureName,
} from '../src/utils/filter-status.js';
import { effectiveWhitePoint, estimateColorTemperature } from '../src/utils/color-temperature.js';
import { computeOverlay } from '../src/utils/night-phase.js';
import { DEFAULT_SETTINGS } from '../src/utils/constants.js';

const settings = { ...DEFAULT_SETTINGS, blockedSites: [...DEFAULT_SETTINGS.blockedSites] };
const fixed = (targetKelvin) => ({ ...settings, targetKelvin, progressiveWarming: false });
const progressive = (targetKelvin) => ({ ...settings, targetKelvin, progressiveWarming: true });
const at = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(2026, 0, 1, h, m);
};
const displayed = (s, windowProgress, progress = 1) =>
  estimateColorTemperature(computeOverlay({ phase: 'active', progress, windowProgress }, s));

test('sem filtro a temperatura é a neutra de 6.500 K', () => {
  assert.equal(estimateColorTemperature({ r: 255, g: 191, b: 0, alpha: 0 }), 6500);
  assert.deepEqual(effectiveWhitePoint({ r: 0, g: 0, b: 0, alpha: 0 }), [1, 1, 1]);
});

test('temperatura escolhida vale a qualquer hora da noite no modo fixo', () => {
  for (const windowProgress of [0, 0.1, 0.5, 0.9, 1]) {
    assert.equal(displayed(fixed(1900), windowProgress), 1900);
    assert.equal(displayed(fixed(3400), windowProgress), 3400);
  }
});

test('temperatura exibida acompanha a temperatura escolhida', () => {
  let previous = Infinity;
  for (let kelvin = 6500; kelvin >= 1900; kelvin -= 100) {
    const shown = displayed(fixed(kelvin), 0.3);
    assert.ok(Math.abs(shown - kelvin) <= 100, `escolhido ${kelvin} K, exibido ${shown} K`);
    assert.ok(shown <= previous);
    previous = shown;
  }
});

test('temperatura nunca sobe enquanto a transição de entrada avança', () => {
  for (const kelvin of [1900, 2700, 3400, 4500]) {
    let previous = Infinity;
    for (let step = 0; step <= 20; step += 1) {
      const shown = displayed(fixed(kelvin), 0, step / 20);
      assert.ok(shown <= previous, `${kelvin} K: ${shown} K após ${previous} K em ${step / 20}`);
      previous = shown;
    }
    assert.equal(previous, kelvin);
  }
});

test('modo progressivo esquenta ao longo da noite e chega à temperatura escolhida no fim', () => {
  for (const kelvin of [1900, 2700, 3400]) {
    let previous = Infinity;
    for (let step = 0; step <= 20; step += 1) {
      const shown = displayed(progressive(kelvin), step / 20);
      assert.ok(shown <= previous, `${kelvin} K: ${shown} K após ${previous} K em ${step / 20}`);
      previous = shown;
    }
    assert.equal(previous, kelvin);
    assert.ok(displayed(progressive(kelvin), 0) > kelvin + 300);
  }
});

test('intensidade é a fração do caminho entre 6.500 K e a temperatura escolhida', () => {
  const ramp = describeFilter({ phase: 'transitioning', progress: 0.5, windowProgress: 0 }, fixed(1900));
  assert.equal(ramp.intensityPercent, 50);
  assert.equal(ramp.targetKelvin, 1900);
  assert.equal(ramp.stageKelvin, 1900);
  assert.equal(ramp.stage, 'Luz de vela');
  assert.ok(ramp.kelvin > 1900 && ramp.kelvin < 6500);

  const full = describeFilter({ phase: 'active', progress: 1, windowProgress: 0.1 }, fixed(1900));
  assert.equal(full.intensityPercent, 100);
  assert.equal(full.kelvin, 1900);

  const startOfNight = describeFilter({ phase: 'active', progress: 1, windowProgress: 0 }, progressive(1900));
  assert.equal(startOfNight.intensityPercent, 25);
  const endOfNight = describeFilter({ phase: 'active', progress: 1, windowProgress: 1 }, progressive(1900));
  assert.equal(endOfNight.intensityPercent, 100);

  const neutral = describeFilter({ phase: 'active', progress: 1, windowProgress: 0.5 }, fixed(6500));
  assert.equal(neutral.intensityPercent, 100);
});

test('filtro desligado reporta neutro e intensidade zero', () => {
  const off = describeFilter({ phase: 'inactive', progress: 0, windowProgress: 0 }, fixed(1900));
  assert.equal(off.intensityPercent, 0);
  assert.equal(off.stage, null);
  assert.equal(off.stageKelvin, null);
  assert.equal(off.kelvin, 6500);
  assert.deepEqual(off.swatch, { r: 255, g: 255, b: 255 });
});

test('nomes das faixas de temperatura', () => {
  assert.equal(temperatureName(6500), 'Luz do dia');
  assert.equal(temperatureName(4500), 'Branco-quente');
  assert.equal(temperatureName(3400), 'Âmbar');
  assert.equal(temperatureName(1900), 'Luz de vela');
});

test('ritual: contagem até o início', () => {
  assert.deepEqual(describeRitual(settings, null, at('19:45')), {
    status: 'upcoming',
    startTime: '22:00',
    endTime: '06:00',
    minutesUntilStart: 135,
    manuallyActive: false,
  });
  assert.equal(describeRitual(settings, null, at('06:00')).minutesUntilStart, 960);
  assert.equal(describeRitual(settings, true, at('14:00')).manuallyActive, true);
});

test('ritual: em andamento, pausado e sem horário', () => {
  assert.equal(describeRitual(settings, null, at('23:00')).status, 'running');
  assert.equal(describeRitual(settings, false, at('23:00')).status, 'paused');
  assert.equal(describeRitual({ ...settings, endTime: '22:00' }, null, at('23:00')).status, 'unscheduled');
});

test('lembrete do site: fora da lista não aparece', () => {
  const usage = { activeMs: 0, lastDismissedAtMs: 0 };
  assert.equal(describeSiteReminder({ hostname: 'wikipedia.org', settings, usage, nightModeActive: true }), null);
  assert.equal(describeSiteReminder({ hostname: '', settings, usage, nightModeActive: true }), null);
});

test('lembrete do site: de dia só avisa que a contagem é noturna', () => {
  const usage = { activeMs: 0, lastDismissedAtMs: 0 };
  assert.deepEqual(describeSiteReminder({ hostname: 'youtube.com', settings, usage, nightModeActive: false }), {
    hostname: 'youtube.com',
    counting: false,
  });
});

test('lembrete do site: tempo restante desde o último fechamento', () => {
  const s = { ...settings, reminderThresholdMinutes: 30 };
  const usage = { activeMs: 50 * 60000, lastDismissedAtMs: 30 * 60000 };
  const result = describeSiteReminder({ hostname: 'm.youtube.com', settings: s, usage, nightModeActive: true });
  assert.equal(result.remainingMs, 10 * 60000);
  assert.equal(result.elapsedMs, 20 * 60000);
  assert.equal(result.thresholdMs, 30 * 60000);

  const due = describeSiteReminder({
    hostname: 'youtube.com',
    settings: s,
    usage: { activeMs: 90 * 60000, lastDismissedAtMs: 0 },
    nightModeActive: true,
  });
  assert.equal(due.remainingMs, 0);
  assert.equal(due.elapsedMs, due.thresholdMs);
});
