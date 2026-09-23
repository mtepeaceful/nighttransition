import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  blackbodyColor,
  correlatedColorTemperature,
  effectiveWhitePoint,
  estimateColorTemperature,
  interpolateKelvin,
} from '../src/utils/color-temperature.js';
import { PROGRESSIVE_START_FRACTION, computeOverlay, kelvinAt } from '../src/utils/night-phase.js';

const DUV_TOLERANCE = 0.006;
const overlayFor = (targetKelvin, progress = 1) =>
  computeOverlay({ phase: 'active', progress, windowProgress: 1 }, { targetKelvin, progressiveWarming: false });
const cct = (overlay) => correlatedColorTemperature(effectiveWhitePoint(overlay));

test('cores de corpo negro batem com referências conhecidas', () => {
  const close = (actual, expected) =>
    ['r', 'g', 'b'].forEach((c, i) => assert.ok(Math.abs(actual[c] - expected[i]) <= 2, `${c}: ${actual[c]}`));
  close(blackbodyColor(6500), [255, 249, 253]);
  close(blackbodyColor(4500), [255, 222, 188]);
  close(blackbodyColor(3400), [255, 196, 134]);
  close(blackbodyColor(1900), [255, 132, 0]);
});

test('branco puro corresponde a ~6.500 K (D65)', () => {
  const { kelvin, duv } = correlatedColorTemperature([1, 1, 1]);
  assert.ok(Math.abs(kelvin - 6500) <= 20, `${kelvin} K`);
  assert.ok(Math.abs(duv) < 0.004);
});

test('qualquer temperatura escolhida entre 1.900 e 6.500 K é atingida exatamente', () => {
  for (let target = 1900; target <= 6500; target += 100) {
    const { kelvin } = cct(overlayFor(target));
    assert.ok(Math.abs(kelvin - target) <= 30, `alvo ${target} K, obtido ${kelvin} K`);
  }
});

test('o branco resultante fica sobre a curva de temperatura em qualquer combinação', () => {
  for (let target = 1900; target <= 6500; target += 200) {
    for (let progress = 0.05; progress <= 1.0001; progress += 0.05) {
      const { duv } = cct(overlayFor(target, progress));
      assert.ok(Math.abs(duv) <= DUV_TOLERANCE, `Duv ${duv.toFixed(4)} em ${target} K a ${progress.toFixed(2)}`);
    }
  }
});

test('interpolação em mired', () => {
  assert.equal(Math.round(interpolateKelvin(4500, 3400, 0)), 4500);
  assert.equal(Math.round(interpolateKelvin(4500, 3400, 1)), 3400);
  const middle = interpolateKelvin(4500, 3400, 0.5);
  assert.ok(Math.abs(1e6 / middle - (1e6 / 4500 + 1e6 / 3400) / 2) < 1e-9);
});

test('modo progressivo começa a 25% do caminho e termina na temperatura escolhida', () => {
  const s = { targetKelvin: 1900, progressiveWarming: true };
  assert.equal(kelvinAt(0, s), interpolateKelvin(6500, 1900, PROGRESSIVE_START_FRACTION));
  assert.equal(Math.round(kelvinAt(1, s)), 1900);
  assert.equal(kelvinAt(0.3, { targetKelvin: 1900, progressiveWarming: false }), 1900);
});

test('estimativa exibida é arredondada a 100 K e limitada a 6.500 K', () => {
  assert.equal(estimateColorTemperature({ r: 255, g: 132, b: 0, alpha: 0 }), 6500);
  assert.equal(estimateColorTemperature(overlayFor(1900)), 1900);
  assert.equal(estimateColorTemperature(overlayFor(3400)), 3400);
  assert.equal(estimateColorTemperature(overlayFor(4500)), 4500);
});
