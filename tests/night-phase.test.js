import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeNightColor,
  computeNightPhase,
  computeOverlay,
  isScheduledActive,
  nextScheduleBoundary,
} from '../src/utils/night-phase.js';
import { blackbodyColor } from '../src/utils/color-temperature.js';

const base = { startTime: '22:00', endTime: '06:00', transitionMinutes: 30, gradualTransition: true };
const at = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(2026, 0, 1, h, m);
};

test('fora da janela é inativo', () => {
  assert.equal(computeNightPhase(base, null, at('12:00')).phase, 'inactive');
  assert.equal(isScheduledActive(base, at('21:59')), false);
});

test('janela que cruza a meia-noite', () => {
  assert.equal(isScheduledActive(base, at('23:30')), true);
  assert.equal(isScheduledActive(base, at('03:00')), true);
  assert.equal(isScheduledActive(base, at('06:00')), false);
});

test('início igual ao fim nunca ativa', () => {
  const settings = { ...base, startTime: '22:00', endTime: '22:00' };
  assert.equal(computeNightPhase(settings, null, at('22:00')).phase, 'inactive');
});

test('rampa gradual no início da janela', () => {
  const phase = computeNightPhase(base, null, at('22:15'));
  assert.equal(phase.phase, 'transitioning');
  assert.equal(phase.progress, 0.5);
  assert.equal(phase.minutesRemaining, 15);
});

test('sem transição gradual entra direto em ativo', () => {
  const phase = computeNightPhase({ ...base, gradualTransition: false }, null, at('22:01'));
  assert.equal(phase.phase, 'active');
  assert.equal(phase.progress, 1);
});

test('após a rampa fica ativo com minutos até o fim', () => {
  const phase = computeNightPhase(base, null, at('05:00'));
  assert.equal(phase.phase, 'active');
  assert.equal(phase.minutesRemaining, 60);
});

test('override manual prevalece sobre o horário', () => {
  assert.equal(computeNightPhase(base, true, at('12:00')).phase, 'active');
  assert.equal(computeNightPhase(base, false, at('23:30')).phase, 'inactive');
});

test('ativação manual aplica direto a temperatura escolhida, mesmo no modo progressivo', () => {
  const phase = computeNightPhase(base, true, at('12:00'));
  assert.equal(phase.progress, 1);
  for (const progressiveWarming of [false, true]) {
    const overlay = computeOverlay(phase, { targetKelvin: 1900, progressiveWarming });
    const expected = blackbodyColor(1900);
    assert.deepEqual([overlay.r, overlay.g, overlay.b], [expected.r, expected.g, expected.b]);
    assert.equal(overlay.alpha, 1);
  }
});

test('transição de 25 min chega ao máximo exatamente no minuto 25', () => {
  const settings = { ...base, transitionMinutes: 25 };
  assert.equal(computeNightPhase(settings, null, at('22:00')).progress, 0);
  assert.equal(computeNightPhase(settings, null, at('22:24')).phase, 'transitioning');
  assert.equal(computeNightPhase(settings, null, at('22:24')).minutesRemaining, 1);
  assert.equal(computeNightPhase(settings, null, at('22:25')).phase, 'active');
});

test('transição maior que a janela é limitada à janela', () => {
  const settings = { ...base, startTime: '22:00', endTime: '22:30', transitionMinutes: 120 };
  const phase = computeNightPhase(settings, null, at('22:15'));
  assert.equal(phase.phase, 'transitioning');
  assert.equal(phase.progress, 0.5);
});

test('próxima fronteira do agendamento', () => {
  assert.equal(nextScheduleBoundary(base, at('14:30')), at('22:00').getTime());
  assert.equal(nextScheduleBoundary(base, at('23:10')), new Date(2026, 0, 2, 6, 0).getTime());
  assert.equal(nextScheduleBoundary(base, at('22:00')), new Date(2026, 0, 2, 6, 0).getTime());
});

test('modo fixo usa a temperatura escolhida em qualquer momento da noite', () => {
  const s = { targetKelvin: 2700, progressiveWarming: false };
  for (const windowProgress of [0, 0.3, 0.5, 1]) {
    assert.equal(computeNightColor(windowProgress, s).kelvin, 2700);
  }
  assert.equal(computeNightColor(0.5, s).alpha, 1);
});

test('modo progressivo fica entre neutro e o alvo, e satura nos extremos', () => {
  const s = { targetKelvin: 1900, progressiveWarming: true };
  assert.ok(computeNightColor(0, s).kelvin > 3000 && computeNightColor(0, s).kelvin < 6500);
  assert.equal(computeNightColor(1, s).kelvin, 1900);
  assert.deepEqual(computeNightColor(5, s), computeNightColor(1, s));
  assert.deepEqual(computeNightColor(-1, s), computeNightColor(0, s));
});

test('modo progressivo bloqueia cada vez mais azul e verde ao longo da noite', () => {
  const s = { targetKelvin: 1900, progressiveWarming: true };
  const transmission = (windowProgress) => {
    const { g, b, alpha } = computeNightColor(windowProgress, s);
    return { green: 1 - alpha + alpha * (g / 255), blue: 1 - alpha + alpha * (b / 255) };
  };
  let previous = transmission(0);
  for (let step = 1; step <= 20; step += 1) {
    const current = transmission(step / 20);
    assert.ok(current.blue <= previous.blue + 1e-9, `azul voltou a subir em ${step / 20}`);
    assert.ok(current.green <= previous.green + 1e-9, `verde voltou a subir em ${step / 20}`);
    previous = current;
  }
});

test('overlay escala pela rampa de entrada', () => {
  const s = { targetKelvin: 1900, progressiveWarming: false };
  const full = { phase: 'active', progress: 1, windowProgress: 0.5 };
  assert.equal(computeOverlay(full, s).alpha, 1);
  assert.equal(computeOverlay({ ...full, progress: 0.5 }, s).alpha, 0.5);
  assert.equal(computeOverlay({ phase: 'inactive', progress: 0, windowProgress: 0 }, s).alpha, 0);
});
