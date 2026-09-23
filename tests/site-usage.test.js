import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addActiveTime,
  dismissReminder,
  getUsage,
  hostnameFromUrl,
  isBlockedHostname,
  isReminderDue,
} from '../src/utils/site-usage.js';

const MINUTE = 60 * 1000;

test('hostnameFromUrl remove www e tolera URL inválida', () => {
  assert.equal(hostnameFromUrl('https://www.youtube.com/watch?v=1'), 'youtube.com');
  assert.equal(hostnameFromUrl('file:///C:/x.html'), '');
  assert.equal(hostnameFromUrl('não é url'), '');
});

test('isBlockedHostname cobre subdomínios sem falso positivo', () => {
  const sites = ['youtube.com'];
  assert.equal(isBlockedHostname('youtube.com', sites), true);
  assert.equal(isBlockedHostname('m.youtube.com', sites), true);
  assert.equal(isBlockedHostname('notyoutube.com', sites), false);
  assert.equal(isBlockedHostname('', sites), false);
});

test('uso começa zerado e acumula só tempo reportado', () => {
  let usage = getUsage({}, 'youtube.com');
  assert.deepEqual(usage, { activeMs: 0, lastDismissedAtMs: 0 });
  usage = addActiveTime(usage, 15000);
  usage = addActiveTime(usage, 15000);
  assert.equal(usage.activeMs, 30000);
});

test('addActiveTime ignora valores negativos e limita saltos', () => {
  const usage = getUsage({}, 'x.com');
  assert.equal(addActiveTime(usage, -5000).activeMs, 0);
  assert.equal(addActiveTime(usage, 10 * MINUTE).activeMs, MINUTE);
  assert.equal(addActiveTime(usage, 'abc').activeMs, 0);
});

test('lembrete dispara ao atingir o limiar de tempo ativo', () => {
  let usage = getUsage({}, 'x.com');
  for (let i = 0; i < 4 * 29; i += 1) usage = addActiveTime(usage, 15000);
  assert.equal(usage.activeMs, 29 * MINUTE);
  assert.equal(isReminderDue(usage, 30), false);
  usage = addActiveTime(usage, MINUTE);
  assert.equal(isReminderDue(usage, 30), true);
});

test('após fechar, o lembrete só volta depois de outro limiar de uso', () => {
  let usage = { activeMs: 30 * MINUTE, lastDismissedAtMs: 0 };
  usage = dismissReminder(usage);
  assert.equal(isReminderDue(usage, 30), false);
  usage = { ...usage, activeMs: usage.activeMs + 29 * MINUTE };
  assert.equal(isReminderDue(usage, 30), false);
  usage = { ...usage, activeMs: usage.activeMs + MINUTE };
  assert.equal(isReminderDue(usage, 30), true);
});

test('visitas curtas espaçadas não disparam o lembrete', () => {
  let usage = getUsage({}, 'x.com');
  usage = addActiveTime(usage, MINUTE);
  assert.equal(isReminderDue(usage, 33), false);
});
