import { afterEach, beforeEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { BOUNDARY_ALARM, CHECK_ALARM, MESSAGE_TYPES } from '../src/utils/constants.js';
import { computeNightColor } from '../src/utils/night-phase.js';

const EXTENSION_ID = 'ext';
const POPUP = {
  id: EXTENSION_ID,
  origin: `chrome-extension://${EXTENSION_ID}`,
  url: `chrome-extension://${EXTENSION_ID}/src/ui/popup/popup.html`,
};
const tabOn = (url) => ({ id: EXTENSION_ID, origin: new URL(url).origin, url, tab: { id: 7 } });
const YOUTUBE = tabOn('https://www.youtube.com/watch?v=1');
const WIKIPEDIA = tabOn('https://pt.wikipedia.org/wiki/Sono');

let instance = 0;

function at(hhmm, day = 1) {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(2026, 0, day, h, m).getTime();
}

async function loadWorker() {
  const areas = { sync: {}, local: {} };
  const listeners = {};
  const broadcasts = [];
  const notifications = [];
  const activeTab = { id: 1, url: undefined };
  const alarms = {};
  const area = (name) => ({
    get: async (key) => (key in areas[name] ? { [key]: structuredClone(areas[name][key]) } : {}),
    set: async (value) => {
      await new Promise((resolve) => setImmediate(resolve));
      Object.assign(areas[name], structuredClone(value));
    },
  });
  const event = (name) => ({ addListener: (fn) => (listeners[name] = fn) });

  globalThis.chrome = {
    runtime: {
      id: EXTENSION_ID,
      getURL: (path) => `chrome-extension://${EXTENSION_ID}/${path}`,
      onMessage: event('message'),
      onInstalled: event('installed'),
      onStartup: event('startup'),
    },
    storage: { sync: area('sync'), local: area('local') },
    alarms: {
      get: async (name) => alarms[name],
      create: async (name, info) => {
        alarms[name] = { name, ...info };
      },
      clear: async (name) => delete alarms[name],
      onAlarm: event('alarm'),
    },
    notifications: { create: (_id, options) => notifications.push(options) },
    tabs: {
      query: async (filter) => (filter.active ? [activeTab] : [activeTab, { id: 2 }]),
      sendMessage: async (tabId, message) => {
        if (message.type === MESSAGE_TYPES.GET_PENDING_ACTIVE_TIME) {
          if (tabId !== activeTab.id || !activeTab.pending) throw new Error('Receiving end does not exist');
          return activeTab.pending;
        }
        broadcasts.push(message);
      },
    },
  };

  instance += 1;
  await import(`../src/background/service-worker.js?instance=${instance}`);

  const send = (message, sender) =>
    new Promise((resolve) => {
      const keepOpen = listeners.message(message, sender, resolve);
      if (keepOpen !== true) resolve(undefined);
    });

  return {
    areas,
    activeTab,
    alarms,
    fireBoundary: async () => {
      mock.timers.setTime(alarms[BOUNDARY_ALARM].when);
      await listeners.alarm({ name: BOUNDARY_ALARM });
    },
    popupState: async () => (await send({ type: MESSAGE_TYPES.GET_POPUP_STATE }, POPUP)).data,
    broadcasts,
    notifications,
    send,
    state: () => ({ nightModeActive: false, siteUsage: {}, manualOverride: null, ...areas.local.state }),
    install: () => listeners.installed(),
    tick: () => listeners.alarm({ name: CHECK_ALARM }),
    report: (sender, elapsedMs = 15000) =>
      send({ type: MESSAGE_TYPES.REPORT_ACTIVE_TIME, payload: { elapsedMs } }, sender),
    saveSettings: (payload) => send({ type: MESSAGE_TYPES.SAVE_SETTINGS, payload }, POPUP),
  };
}

beforeEach(() => mock.timers.enable({ apis: ['Date'], now: at('21:59') }));
afterEach(() => mock.timers.reset());

test('modo noturno liga no horário, notifica uma vez e desliga no fim', async () => {
  const sw = await loadWorker();
  await sw.install();
  assert.equal(sw.state().nightModeActive, false);
  assert.equal(sw.notifications.length, 0);

  mock.timers.setTime(at('22:00'));
  await sw.tick();
  assert.equal(sw.state().nightModeActive, true);
  assert.equal(sw.notifications.length, 1);
  assert.ok(sw.broadcasts.some((m) => m.type === MESSAGE_TYPES.APPLY_OVERLAY));

  mock.timers.setTime(at('22:01'));
  await sw.tick();
  assert.equal(sw.notifications.length, 1);

  mock.timers.setTime(at('06:00', 2));
  await sw.tick();
  assert.equal(sw.state().nightModeActive, false);
});

test('overlay acompanha a rampa de transição configurada', async () => {
  const sw = await loadWorker();
  await sw.saveSettings({ startTime: '22:00', endTime: '06:00', transitionMinutes: 20, targetKelvin: 1900 });

  mock.timers.setTime(at('22:10'));
  await sw.tick();
  const half = sw.broadcasts.at(-1).overlay.alpha;

  mock.timers.setTime(at('22:20'));
  await sw.tick();
  const full = sw.broadcasts.at(-1).overlay.alpha;

  assert.ok(half > 0 && half < full, `${half} deveria estar entre 0 e ${full}`);
  assert.ok(Math.abs(full / half - 2) < 0.1, 'na metade da rampa a intensidade deve ser ~50%');
});

test('lembrete aparece após o limiar de tempo ativo, não antes', async () => {
  const sw = await loadWorker();
  await sw.saveSettings({ reminderThresholdMinutes: 1, countdownSeconds: 5 });
  mock.timers.setTime(at('22:30'));
  await sw.tick();

  for (let i = 0; i < 3; i += 1) {
    assert.equal((await sw.report(YOUTUBE)).data.reminder, null);
  }
  const { reminder } = (await sw.report(YOUTUBE)).data;
  assert.deepEqual(reminder, { hostname: 'youtube.com', activeMs: 60000, countdownSeconds: 5 });
});

test('lembrete repete a cada limiar depois de fechado', async () => {
  const sw = await loadWorker();
  await sw.saveSettings({ reminderThresholdMinutes: 1 });
  mock.timers.setTime(at('23:00'));
  await sw.tick();

  for (let i = 0; i < 4; i += 1) await sw.report(YOUTUBE);
  assert.notEqual((await sw.report(YOUTUBE, 0)).data.reminder, null);

  await sw.send({ type: MESSAGE_TYPES.REMINDER_DISMISSED }, YOUTUBE);
  for (let i = 0; i < 3; i += 1) {
    assert.equal((await sw.report(YOUTUBE)).data.reminder, null);
  }
  assert.notEqual((await sw.report(YOUTUBE)).data.reminder, null);
});

test('recarregar a página sem fechar o lembrete não o pula', async () => {
  const sw = await loadWorker();
  await sw.saveSettings({ reminderThresholdMinutes: 1 });
  mock.timers.setTime(at('23:00'));
  await sw.tick();

  for (let i = 0; i < 4; i += 1) await sw.report(YOUTUBE);
  assert.notEqual((await sw.report(YOUTUBE, 0)).data.reminder, null);
});

test('tempo de dia e de sites fora da lista não é contado', async () => {
  const sw = await loadWorker();
  await sw.saveSettings({ reminderThresholdMinutes: 1 });
  await sw.tick();

  for (let i = 0; i < 8; i += 1) assert.equal((await sw.report(YOUTUBE)).data.reminder, null);
  assert.deepEqual(sw.state().siteUsage, {});

  mock.timers.setTime(at('22:30'));
  await sw.tick();
  for (let i = 0; i < 8; i += 1) assert.equal((await sw.report(WIKIPEDIA)).data.reminder, null);
  assert.deepEqual(sw.state().siteUsage, {});
});

test('site bloqueado é rastreado mesmo se a página abriu antes da noite', async () => {
  const sw = await loadWorker();
  await sw.tick();
  const page = await sw.send({ type: MESSAGE_TYPES.GET_PAGE_STATE }, YOUTUBE);
  assert.equal(page.data.trackUsage, true);
  assert.equal((await sw.send({ type: MESSAGE_TYPES.GET_PAGE_STATE }, WIKIPEDIA)).data.trackUsage, false);
});

test('relatórios simultâneos de várias abas não se perdem', async () => {
  const sw = await loadWorker();
  mock.timers.setTime(at('23:00'));
  await sw.tick();

  const twitch = tabOn('https://www.twitch.tv/x');
  await Promise.all([
    ...Array.from({ length: 10 }, () => sw.report(YOUTUBE, 1000)),
    ...Array.from({ length: 10 }, () => sw.report(twitch, 2000)),
  ]);
  assert.equal(sw.state().siteUsage['youtube.com'].activeMs, 10000);
  assert.equal(sw.state().siteUsage['twitch.tv'].activeMs, 20000);
});

test('tempo acumulado zera quando a noite termina', async () => {
  const sw = await loadWorker();
  mock.timers.setTime(at('23:00'));
  await sw.tick();
  await sw.report(YOUTUBE);
  assert.equal(sw.state().siteUsage['youtube.com'].activeMs, 15000);

  mock.timers.setTime(at('06:00', 2));
  await sw.tick();
  assert.deepEqual(sw.state().siteUsage, {});
});

test('ativação manual de dia vale até o fim da próxima janela e usa âmbar', async () => {
  const sw = await loadWorker();
  mock.timers.setTime(at('14:00'));
  await sw.tick();

  const toggled = await sw.send({ type: MESSAGE_TYPES.TOGGLE_NIGHT_MODE }, POPUP);
  assert.equal(toggled.data.phase.phase, 'active');
  const { r, g, b } = sw.broadcasts.at(-1).overlay;
  const chosen = computeNightColor(1, { targetKelvin: 3400, progressiveWarming: false });
  assert.deepEqual([r, g, b], [chosen.r, chosen.g, chosen.b]);

  mock.timers.setTime(at('22:30'));
  await sw.tick();
  assert.equal(sw.state().manualOverride, null);
  assert.equal(sw.state().nightModeActive, true);

  mock.timers.setTime(at('06:00', 2));
  await sw.tick();
  assert.equal(sw.state().nightModeActive, false);
});

test('desativar à noite não vaza para a noite seguinte, mesmo com o navegador fechado de dia', async () => {
  const sw = await loadWorker();
  mock.timers.setTime(at('23:00'));
  await sw.tick();

  const toggled = await sw.send({ type: MESSAGE_TYPES.TOGGLE_NIGHT_MODE }, POPUP);
  assert.equal(toggled.data.phase.phase, 'inactive');

  mock.timers.setTime(at('02:00', 2));
  await sw.tick();
  assert.equal(sw.state().nightModeActive, false);

  mock.timers.setTime(at('22:00', 2));
  await sw.tick();
  assert.equal(sw.state().nightModeActive, true);
});

test('lista de sites é salva na hora e sanitizada', async () => {
  const sw = await loadWorker();
  const result = await sw.send(
    { type: MESSAGE_TYPES.UPDATE_BLOCKED_SITES, payload: { blockedSites: ['https://www.Reddit.com/r/x', '<b>'] } },
    POPUP,
  );
  assert.deepEqual(result.data.settings.blockedSites, ['reddit.com']);
  assert.deepEqual(sw.areas.sync.settings.blockedSites, ['reddit.com']);
});

test('content script não consegue alterar configurações', async () => {
  const sw = await loadWorker();
  const response = await sw.send({ type: MESSAGE_TYPES.SAVE_SETTINGS, payload: { targetKelvin: 6500 } }, YOUTUBE);
  assert.equal(response, undefined);
  assert.equal(sw.areas.sync.settings, undefined);
});

test('popup mostra filtro, ritual e lembrete do site da aba ativa', async () => {
  const sw = await loadWorker();
  await sw.saveSettings({ reminderThresholdMinutes: 10, targetKelvin: 1900 });

  mock.timers.setTime(at('20:30'));
  await sw.tick();
  sw.activeTab.url = 'https://www.youtube.com/watch?v=1';
  let popup = await sw.popupState();
  assert.equal(popup.filter.intensityPercent, 0);
  assert.equal(popup.filter.kelvin, 6500);
  assert.deepEqual(popup.ritual, {
    status: 'upcoming',
    startTime: '22:00',
    endTime: '06:00',
    minutesUntilStart: 90,
    manuallyActive: false,
  });
  assert.deepEqual(popup.siteReminder, { hostname: 'youtube.com', counting: false });

  mock.timers.setTime(at('23:00'));
  await sw.tick();
  for (let i = 0; i < 12; i += 1) await sw.report(YOUTUBE);
  popup = await sw.popupState();
  assert.equal(popup.filter.intensityPercent, 100);
  assert.equal(popup.filter.kelvin, 1900);
  assert.equal(popup.filter.targetKelvin, 1900);
  assert.equal(popup.ritual.status, 'running');
  assert.equal(popup.siteReminder.remainingMs, 7 * 60000);
  assert.equal(popup.siteReminder.ticking, false);
  assert.equal(popup.siteReminder.connected, false, 'aba sem content script é marcada como desconectada');

  sw.activeTab.pending = { visible: true, pendingMs: 12000 };
  popup = await sw.popupState();
  assert.equal(popup.siteReminder.remainingMs, 7 * 60000 - 12000);
  assert.equal(popup.siteReminder.ticking, true);
  assert.equal(popup.siteReminder.connected, true);
  assert.equal(sw.state().siteUsage['youtube.com'].activeMs, 3 * 60000, 'consulta não grava tempo pendente');

  sw.activeTab.pending = { visible: false, pendingMs: 0 };
  popup = await sw.popupState();
  assert.equal(popup.siteReminder.ticking, false);
  assert.equal(popup.siteReminder.connected, true);

  sw.activeTab.pending = { visible: 'sim', pendingMs: 'muito' };
  assert.equal((await sw.popupState()).siteReminder.remainingMs, 7 * 60000);

  sw.activeTab.url = 'https://pt.wikipedia.org/';
  assert.equal((await sw.popupState()).siteReminder, null);

  sw.activeTab.url = undefined;
  assert.equal((await sw.popupState()).siteReminder, null);
});

test('filtro ligado manualmente de dia ainda dispara o aviso no início do ritual', async () => {
  const sw = await loadWorker();
  mock.timers.setTime(at('15:00'));
  await sw.tick();
  await sw.send({ type: MESSAGE_TYPES.TOGGLE_NIGHT_MODE }, POPUP);
  assert.equal(sw.notifications.length, 0);

  mock.timers.setTime(at('22:00'));
  await sw.tick();
  assert.equal(sw.notifications.length, 1);
  assert.equal(sw.state().nightModeActive, true);
  assert.equal((await sw.popupState()).ritual.status, 'running');
});
function atSeconds(hhmm, seconds, day = 1) {
  return at(hhmm, day) + seconds * 1000;
}

test('início daqui a 1 minuto liga o filtro exatamente no horário', async () => {
  const sw = await loadWorker();
  mock.timers.setTime(atSeconds('14:30', 40));
  await sw.saveSettings({ startTime: '14:31', endTime: '14:33', gradualTransition: false });

  assert.equal(sw.alarms[BOUNDARY_ALARM].when, at('14:31'));
  assert.equal(sw.state().nightModeActive, false);

  await sw.fireBoundary();
  assert.equal(sw.state().nightModeActive, true);
  assert.ok(sw.broadcasts.at(-1).overlay.alpha > 0, 'overlay visível no minuto do início');
  assert.equal(sw.notifications.length, 1);
  assert.equal(sw.alarms[BOUNDARY_ALARM].when, at('14:33'), 'próximo alarme é o fim');

  await sw.fireBoundary();
  assert.equal(sw.state().nightModeActive, false);
  assert.equal(sw.broadcasts.at(-1).overlay.alpha, 0, 'overlay removido no minuto do fim');
  assert.equal(sw.alarms[BOUNDARY_ALARM].when, at('14:31', 2));
});

test('mudar o horário cancela um "Desativar agora" anterior', async () => {
  const sw = await loadWorker();
  mock.timers.setTime(at('23:00'));
  await sw.tick();
  await sw.send({ type: MESSAGE_TYPES.TOGGLE_NIGHT_MODE }, POPUP);
  assert.equal(sw.state().manualOverride, false);

  mock.timers.setTime(atSeconds('23:10', 20));
  await sw.saveSettings({ startTime: '23:11', endTime: '23:40', gradualTransition: false });
  assert.equal(sw.state().manualOverride, null);

  await sw.fireBoundary();
  assert.equal(sw.state().nightModeActive, true);
  assert.ok(sw.broadcasts.at(-1).overlay.alpha > 0);
});

test('mudar o horário cancela um "Ativar agora" anterior', async () => {
  const sw = await loadWorker();
  mock.timers.setTime(at('14:00'));
  await sw.tick();
  await sw.send({ type: MESSAGE_TYPES.TOGGLE_NIGHT_MODE }, POPUP);
  assert.equal(sw.state().nightModeActive, true);

  await sw.saveSettings({ startTime: '20:00', endTime: '05:00' });
  assert.equal(sw.state().manualOverride, null);
  assert.equal(sw.state().nightModeActive, false);
  assert.equal(sw.broadcasts.at(-1).overlay.alpha, 0);
});

test('salvar sem mudar o horário mantém a ação manual', async () => {
  const sw = await loadWorker();
  mock.timers.setTime(at('23:00'));
  await sw.tick();
  await sw.send({ type: MESSAGE_TYPES.TOGGLE_NIGHT_MODE }, POPUP);

  await sw.saveSettings({ startTime: '22:00', endTime: '06:00', targetKelvin: 2700 });
  assert.equal(sw.state().manualOverride, false);
});

test('alarme de fronteira também encerra a ação manual no horário certo', async () => {
  const sw = await loadWorker();
  mock.timers.setTime(at('14:00'));
  await sw.tick();
  await sw.send({ type: MESSAGE_TYPES.TOGGLE_NIGHT_MODE }, POPUP);
  assert.equal(sw.alarms[BOUNDARY_ALARM].when, at('22:00'));

  await sw.fireBoundary();
  assert.equal(sw.state().manualOverride, null);
  assert.equal(sw.state().nightModeActive, true);
  assert.equal(sw.notifications.length, 1);
});

test('início igual ao fim não agenda alarme de fronteira', async () => {
  const sw = await loadWorker();
  await sw.saveSettings({ startTime: '22:00', endTime: '22:00' });
  assert.equal(sw.alarms[BOUNDARY_ALARM], undefined);
});
test('1.900 K logo no começo da noite, sem esperar o fim', async () => {
  const sw = await loadWorker();
  await sw.saveSettings({ targetKelvin: 1900, progressiveWarming: false, transitionMinutes: 10 });

  mock.timers.setTime(at('22:10'));
  await sw.tick();
  assert.equal((await sw.popupState()).filter.kelvin, 1900);

  mock.timers.setTime(at('01:00', 2));
  await sw.tick();
  assert.equal((await sw.popupState()).filter.kelvin, 1900);
});

test('mudar a temperatura aplica na hora em todas as abas', async () => {
  const sw = await loadWorker();
  mock.timers.setTime(at('23:30'));
  await sw.tick();

  await sw.saveSettings({ targetKelvin: 1900 });
  const overlay = sw.broadcasts.at(-1).overlay;
  const expected = computeNightColor(1, { targetKelvin: 1900, progressiveWarming: false });
  assert.deepEqual([overlay.r, overlay.g, overlay.b, overlay.alpha], [expected.r, expected.g, expected.b, 1]);
});