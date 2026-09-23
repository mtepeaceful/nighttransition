import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isValidDomain, normalizeSite, sanitizeSettings } from '../src/utils/validation.js';
import { DEFAULT_SETTINGS, MAX_BLOCKED_SITES } from '../src/utils/constants.js';

test('normalizeSite remove protocolo, www e caminho', () => {
  assert.equal(normalizeSite('  HTTPS://www.YouTube.com/watch?v=1 '), 'youtube.com');
});

test('isValidDomain rejeita entradas maliciosas', () => {
  for (const value of ['', '<script>', 'javascript:alert(1)', 'localhost', 'a..com', '-x.com']) {
    assert.equal(isValidDomain(value), false, value);
  }
  assert.equal(isValidDomain('sub.example.co'), true);
});

test('sanitizeSettings usa defaults para lixo', () => {
  assert.deepEqual(sanitizeSettings(null), { ...DEFAULT_SETTINGS, blockedSites: [...DEFAULT_SETTINGS.blockedSites] });
  assert.deepEqual(sanitizeSettings('texto'), sanitizeSettings(undefined));
});

test('sanitizeSettings valida horários', () => {
  const result = sanitizeSettings({ startTime: '25:00', endTime: '7:00' });
  assert.equal(result.startTime, DEFAULT_SETTINGS.startTime);
  assert.equal(result.endTime, DEFAULT_SETTINGS.endTime);
  assert.equal(sanitizeSettings({ startTime: '23:45' }).startTime, '23:45');
});

test('sanitizeSettings limita e converte números', () => {
  const result = sanitizeSettings({
    targetKelvin: 99999,
    transitionMinutes: '-10',
    reminderThresholdMinutes: 'abc',
    countdownSeconds: Number.NaN,
  });
  assert.equal(result.targetKelvin, 6500);
  assert.equal(sanitizeSettings({ targetKelvin: 500 }).targetKelvin, 1900);
  assert.equal(sanitizeSettings({ targetKelvin: '3456' }).targetKelvin, 3500);
  assert.equal(sanitizeSettings({ targetKelvin: 'quente' }).targetKelvin, DEFAULT_SETTINGS.targetKelvin);
  assert.equal(sanitizeSettings({ progressiveWarming: 'sim' }).progressiveWarming, false);
  assert.equal(sanitizeSettings({ progressiveWarming: true }).progressiveWarming, true);
  assert.equal(result.transitionMinutes, 0);
  assert.equal(result.reminderThresholdMinutes, DEFAULT_SETTINGS.reminderThresholdMinutes);
  assert.equal(result.countdownSeconds, DEFAULT_SETTINGS.countdownSeconds);
});

test('sanitizeSettings filtra, deduplica e limita sites', () => {
  const many = Array.from({ length: MAX_BLOCKED_SITES + 20 }, (_, i) => `site${i}.com`);
  assert.equal(sanitizeSettings({ blockedSites: many }).blockedSites.length, MAX_BLOCKED_SITES);
  assert.deepEqual(
    sanitizeSettings({ blockedSites: ['x.com', 'https://www.x.com', '<img onerror=1>', 42] }).blockedSites,
    ['x.com'],
  );
  assert.deepEqual(sanitizeSettings({ blockedSites: 'x.com' }).blockedSites, DEFAULT_SETTINGS.blockedSites);
});

test('sanitizeSettings descarta campos extras e prototype pollution', () => {
  const payload = JSON.parse('{"__proto__": {"polluted": true}, "constructor": {"x": 1}, "extra": 1}');
  const result = sanitizeSettings(payload);
  assert.deepEqual(Object.keys(result).sort(), Object.keys(DEFAULT_SETTINGS).sort());
  assert.equal(Object.getPrototypeOf(result), Object.prototype);
  assert.equal({}.polluted, undefined);
});
