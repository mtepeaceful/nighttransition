import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveRoute } from '../src/utils/message-guard.js';
import { MESSAGE_TYPES } from '../src/utils/constants.js';

const ctx = { extensionId: 'abc', extensionOrigin: 'chrome-extension://abc' };
const popup = { id: 'abc', origin: 'chrome-extension://abc', url: 'chrome-extension://abc/src/ui/popup/popup.html' };
const content = { id: 'abc', origin: 'https://site.com', url: 'https://site.com/page', tab: { id: 1 } };
const settingsPayload = { payload: { startTime: '22:00' } };

test('popup: caminhos legítimos', () => {
  assert.equal(resolveRoute({ type: MESSAGE_TYPES.GET_POPUP_STATE }, popup, ctx), 'ui');
  assert.equal(resolveRoute({ type: MESSAGE_TYPES.TOGGLE_NIGHT_MODE }, popup, ctx), 'ui');
  assert.equal(resolveRoute({ type: MESSAGE_TYPES.SAVE_SETTINGS, ...settingsPayload }, popup, ctx), 'ui');
});

test('content script: caminhos legítimos', () => {
  assert.equal(resolveRoute({ type: MESSAGE_TYPES.GET_PAGE_STATE }, content, ctx), 'content');
  assert.equal(resolveRoute({ type: MESSAGE_TYPES.REMINDER_DISMISSED }, content, ctx), 'content');
  assert.equal(
    resolveRoute({ type: MESSAGE_TYPES.REPORT_ACTIVE_TIME, payload: { elapsedMs: 15000 } }, content, ctx),
    'content',
  );
});

test('popup atualiza lista de sites com array', () => {
  const ok = { type: MESSAGE_TYPES.UPDATE_BLOCKED_SITES, payload: { blockedSites: ['x.com'] } };
  assert.equal(resolveRoute(ok, popup, ctx), 'ui');
  assert.equal(resolveRoute(ok, content, ctx), null);
  assert.equal(
    resolveRoute({ type: MESSAGE_TYPES.UPDATE_BLOCKED_SITES, payload: { blockedSites: 'x.com' } }, popup, ctx),
    null,
  );
});

test('REPORT_ACTIVE_TIME rejeita tempos inválidos ou inflados', () => {
  for (const elapsedMs of [-1, Number.NaN, Infinity, 60001, '1000']) {
    const message = { type: MESSAGE_TYPES.REPORT_ACTIVE_TIME, payload: { elapsedMs } };
    assert.equal(resolveRoute(message, content, ctx), null, String(elapsedMs));
  }
  assert.equal(resolveRoute({ type: MESSAGE_TYPES.REPORT_ACTIVE_TIME }, content, ctx), null);
  assert.equal(
    resolveRoute({ type: MESSAGE_TYPES.REPORT_ACTIVE_TIME, payload: { elapsedMs: 1 } }, popup, ctx),
    null,
  );
});

test('rejeita outra extensão', () => {
  const foreign = { ...popup, id: 'evil', origin: 'chrome-extension://evil' };
  assert.equal(resolveRoute({ type: MESSAGE_TYPES.GET_POPUP_STATE }, foreign, ctx), null);
  assert.equal(resolveRoute({ type: MESSAGE_TYPES.GET_PAGE_STATE }, { ...content, id: 'evil' }, ctx), null);
});

test('content script não pode executar comandos da UI', () => {
  assert.equal(resolveRoute({ type: MESSAGE_TYPES.SAVE_SETTINGS, ...settingsPayload }, content, ctx), null);
  assert.equal(resolveRoute({ type: MESSAGE_TYPES.TOGGLE_NIGHT_MODE }, content, ctx), null);
  assert.equal(resolveRoute({ type: MESSAGE_TYPES.GET_POPUP_STATE }, content, ctx), null);
});

test('popup não pode fingir ser content script', () => {
  assert.equal(resolveRoute({ type: MESSAGE_TYPES.GET_PAGE_STATE }, popup, ctx), null);
});

test('página com origem da extensão mas dentro de aba não é tratada como UI', () => {
  const inTab = { ...popup, tab: { id: 2 } };
  assert.equal(resolveRoute({ type: MESSAGE_TYPES.SAVE_SETTINGS, ...settingsPayload }, inTab, ctx), null);
});

test('rejeita mensagens malformadas', () => {
  for (const message of [null, undefined, 'GET_POPUP_STATE', [], {}, { type: 1 }, { type: 'DESCONHECIDO' }]) {
    assert.equal(resolveRoute(message, popup, ctx), null, JSON.stringify(message));
  }
  assert.equal(resolveRoute({ type: MESSAGE_TYPES.GET_POPUP_STATE }, undefined, ctx), null);
});

test('valida a forma do payload', () => {
  assert.equal(resolveRoute({ type: MESSAGE_TYPES.SAVE_SETTINGS }, popup, ctx), null);
  assert.equal(resolveRoute({ type: MESSAGE_TYPES.SAVE_SETTINGS, payload: 'x' }, popup, ctx), null);
  assert.equal(resolveRoute({ type: MESSAGE_TYPES.SAVE_SETTINGS, payload: [] }, popup, ctx), null);
  assert.equal(resolveRoute({ type: MESSAGE_TYPES.TOGGLE_NIGHT_MODE, payload: {} }, popup, ctx), null);
});
