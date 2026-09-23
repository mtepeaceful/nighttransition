import { MESSAGE_TYPES } from '../../utils/constants.js';
import { isValidDomain, normalizeSite } from '../../utils/validation.js';
import { temperatureName } from '../../utils/filter-status.js';

const PHASE_LABELS = {
  inactive: 'inativo',
  transitioning: 'em transição',
  active: 'totalmente ativo',
};

const tabButtons = document.querySelectorAll('.tab-btn');
const views = {
  home: document.getElementById('view-home'),
  settings: document.getElementById('view-settings'),
};

const form = document.getElementById('settings-form');
const startTimeInput = document.getElementById('start-time');
const endTimeInput = document.getElementById('end-time');
const gradualTransitionInput = document.getElementById('gradual-transition');
const transitionMinutesRow = document.getElementById('transition-minutes-row');
const transitionMinutesInput = document.getElementById('transition-minutes');
const targetKelvinInput = document.getElementById('target-kelvin');
const targetKelvinValueEl = document.getElementById('target-kelvin-value');
const targetKelvinNameEl = document.getElementById('target-kelvin-name');
const progressiveWarmingInput = document.getElementById('progressive-warming');
const reminderThresholdInput = document.getElementById('reminder-threshold');
const countdownSecondsInput = document.getElementById('countdown-seconds');
const siteInput = document.getElementById('site-input');
const siteInputError = document.getElementById('site-input-error');
const addSiteBtn = document.getElementById('add-site-btn');
const blockedSitesList = document.getElementById('blocked-sites-list');
const blockedSitesEmpty = document.getElementById('blocked-sites-empty');
const statusEl = document.getElementById('status');
const modeStatusEl = document.getElementById('mode-status');
const toggleBtn = document.getElementById('toggle-btn');
const filterSwatchEl = document.getElementById('filter-swatch');
const filterTemperatureEl = document.getElementById('filter-temperature');
const filterStageEl = document.getElementById('filter-stage');
const filterIntensityCurrentEl = document.getElementById('filter-intensity-current');
const filterIntensityMaxEl = document.getElementById('filter-intensity-max');
const ritualMainEl = document.getElementById('ritual-main');
const ritualDetailEl = document.getElementById('ritual-detail');
const siteReminderEl = document.getElementById('site-reminder');
const siteReminderTextEl = document.getElementById('site-reminder-text');
const siteReminderProgressEl = document.getElementById('site-reminder-progress');
const siteReminderBarEl = document.getElementById('site-reminder-bar');

const kelvinFormat = new Intl.NumberFormat('pt-BR');

let blockedSites = [];

async function request(type, payload) {
  const response = await chrome.runtime.sendMessage({ type, payload });
  if (!response?.ok) throw new Error(response?.error ?? 'no_response');
  return response.data;
}

tabButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    tabButtons.forEach((b) => {
      b.classList.toggle('active', b === btn);
      b.setAttribute('aria-selected', b === btn ? 'true' : 'false');
    });
    Object.entries(views).forEach(([name, el]) => {
      el.hidden = name !== btn.dataset.tab;
    });
  });
});

gradualTransitionInput.addEventListener('change', () => {
  transitionMinutesRow.hidden = !gradualTransitionInput.checked;
});

function renderTargetKelvinLabel(value) {
  const kelvin = Number(value);
  targetKelvinValueEl.textContent = kelvinFormat.format(kelvin);
  targetKelvinNameEl.textContent = temperatureName(kelvin);
  targetKelvinInput.setAttribute('aria-valuetext', `${kelvinFormat.format(kelvin)} K, ${temperatureName(kelvin)}`);
}

targetKelvinInput.addEventListener('input', () => {
  renderTargetKelvinLabel(targetKelvinInput.value);
});

function showSiteInputError(message) {
  siteInput.classList.add('has-error');
  siteInputError.textContent = message;
  siteInputError.hidden = false;
}

function clearSiteInputError() {
  siteInput.classList.remove('has-error');
  siteInputError.hidden = true;
}

function renderBlockedSites() {
  blockedSitesList.replaceChildren();

  blockedSites.forEach((site) => {
    const chip = document.createElement('li');
    chip.className = 'chip';
    chip.textContent = site;

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'chip-remove';
    removeBtn.textContent = '✕';
    removeBtn.setAttribute('aria-label', `Remover ${site}`);
    removeBtn.addEventListener('click', () => {
      persistBlockedSites(blockedSites.filter((s) => s !== site));
    });

    chip.appendChild(removeBtn);
    blockedSitesList.appendChild(chip);
  });

  blockedSitesEmpty.hidden = blockedSites.length > 0;
}

function flashStatus(message) {
  statusEl.textContent = message;
  setTimeout(() => {
    if (statusEl.textContent === message) statusEl.textContent = '';
  }, 2000);
}

async function persistBlockedSites(nextSites) {
  const result = await request(MESSAGE_TYPES.UPDATE_BLOCKED_SITES, { blockedSites: nextSites });
  blockedSites = [...result.settings.blockedSites];
  renderBlockedSites();
  flashStatus('Lista de sites atualizada.');
}

async function addSiteFromInput() {
  const normalized = normalizeSite(siteInput.value);

  if (!normalized) {
    clearSiteInputError();
    return;
  }

  if (!isValidDomain(normalized)) {
    showSiteInputError('Digite um domínio válido, ex: youtube.com');
    return;
  }

  if (blockedSites.includes(normalized)) {
    showSiteInputError('Esse site já está na lista.');
    return;
  }

  clearSiteInputError();
  siteInput.value = '';
  await persistBlockedSites([...blockedSites, normalized]);
  siteInput.focus();
}

addSiteBtn.addEventListener('click', addSiteFromInput);

siteInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    addSiteFromInput();
  }
});

siteInput.addEventListener('input', clearSiteInputError);

function fillSettingsForm(settings) {
  startTimeInput.value = settings.startTime;
  endTimeInput.value = settings.endTime;
  gradualTransitionInput.checked = settings.gradualTransition;
  transitionMinutesInput.value = settings.transitionMinutes;
  transitionMinutesRow.hidden = !settings.gradualTransition;
  targetKelvinInput.value = settings.targetKelvin;
  renderTargetKelvinLabel(settings.targetKelvin);
  progressiveWarmingInput.checked = settings.progressiveWarming;
  reminderThresholdInput.value = settings.reminderThresholdMinutes;
  countdownSecondsInput.value = settings.countdownSeconds;
  blockedSites = [...settings.blockedSites];
  renderBlockedSites();
}

function humanizeMinutes(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

function describePhase(phase, settings) {
  const label = PHASE_LABELS[phase.phase];
  if (phase.phase === 'transitioning') {
    return `${label} — faltam ${humanizeMinutes(phase.minutesRemaining)} p/ intensidade máxima`;
  }
  if (phase.phase === 'active') {
    return `${label} até as ${settings.endTime}`;
  }
  return label;
}

function renderToggle({ settings, phase }) {
  modeStatusEl.textContent = `Modo noturno: ${describePhase(phase, settings)}`;
  toggleBtn.textContent = phase.phase === 'inactive' ? 'Ativar agora' : 'Desativar agora';
  toggleBtn.classList.toggle('is-active-state', phase.phase !== 'inactive');
}

function renderFilter(filter) {
  const { r, g, b } = filter.swatch;
  filterSwatchEl.style.backgroundColor = `rgb(${r}, ${g}, ${b})`;
  filterTemperatureEl.textContent = `${filter.intensityPercent > 0 ? '≈ ' : ''}${kelvinFormat.format(filter.kelvin)} K`;
  filterStageEl.textContent = filter.stage ?? 'Filtro desligado';
  filterIntensityCurrentEl.textContent = `${filter.intensityPercent}%`;
  filterIntensityMaxEl.textContent = `rumo a ${kelvinFormat.format(filter.targetKelvin)} K`;
}

function renderRitual(ritual) {
  if (ritual.status === 'upcoming') {
    ritualMainEl.textContent = `Faltam ${humanizeMinutes(ritual.minutesUntilStart)}`;
    ritualDetailEl.textContent = ritual.manuallyActive
      ? `Filtro ligado manualmente · o ritual começa às ${ritual.startTime}`
      : `Aviso "Hora de desacelerar" às ${ritual.startTime}`;
    return;
  }
  if (ritual.status === 'running') {
    ritualMainEl.textContent = 'Em andamento';
    ritualDetailEl.textContent = `Até as ${ritual.endTime}`;
    return;
  }
  if (ritual.status === 'paused') {
    ritualMainEl.textContent = 'Pausado manualmente';
    ritualDetailEl.textContent = `Volta ao automático às ${ritual.endTime}`;
    return;
  }
  ritualMainEl.textContent = 'Sem horário definido';
  ritualDetailEl.textContent = 'Início e fim estão iguais nas configurações.';
}

let siteReminderSnapshot = null;

function formatClock(ms) {
  const totalSeconds = Math.ceil(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return hours > 0 ? `${hours}:${minutes}:${seconds}` : `${minutes}:${seconds}`;
}

function paintSiteReminder() {
  if (siteReminderSnapshot === null) return;

  const { reminder, receivedAt } = siteReminderSnapshot;
  const drift = reminder.ticking ? Date.now() - receivedAt : 0;
  const remainingMs = Math.max(0, reminder.remainingMs - drift);
  const elapsedMs = Math.min(reminder.thresholdMs, reminder.elapsedMs + drift);
  const percent = Math.round((elapsedMs / reminder.thresholdMs) * 100);

  if (!reminder.connected) {
    siteReminderTextEl.textContent = `Recarregue esta aba para começar a contar o tempo em ${reminder.hostname}.`;
  } else if (remainingMs === 0) {
    siteReminderTextEl.textContent = `Pausa em ${reminder.hostname}: agora`;
  } else {
    const suffix = reminder.ticking ? '' : ' · pausada (aba em segundo plano)';
    siteReminderTextEl.textContent = `Pausa em ${reminder.hostname} em ${formatClock(remainingMs)}${suffix}`;
  }
  siteReminderBarEl.style.width = `${percent}%`;
  siteReminderProgressEl.setAttribute('aria-valuenow', String(percent));
}

function renderSiteReminder(siteReminder) {
  siteReminderEl.hidden = siteReminder === null;
  siteReminderSnapshot = siteReminder?.counting ? { reminder: siteReminder, receivedAt: Date.now() } : null;
  if (siteReminder === null) return;

  siteReminderProgressEl.hidden = !siteReminder.counting;
  if (!siteReminder.counting) {
    siteReminderTextEl.textContent = `${siteReminder.hostname}: o tempo só é contado durante o ritual.`;
    return;
  }
  paintSiteReminder();
}

function renderHome(popupState) {
  renderToggle(popupState);
  renderFilter(popupState.filter);
  renderRitual(popupState.ritual);
  renderSiteReminder(popupState.siteReminder);
}

async function refreshHome() {
  renderHome(await request(MESSAGE_TYPES.GET_POPUP_STATE));
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  if (siteInput.value.trim()) {
    await addSiteFromInput();
  }

  const result = await request(MESSAGE_TYPES.SAVE_SETTINGS, {
    startTime: startTimeInput.value,
    endTime: endTimeInput.value,
    gradualTransition: gradualTransitionInput.checked,
    transitionMinutes: Number(transitionMinutesInput.value),
    targetKelvin: Number(targetKelvinInput.value),
    progressiveWarming: progressiveWarmingInput.checked,
    reminderThresholdMinutes: Number(reminderThresholdInput.value),
    countdownSeconds: Number(countdownSecondsInput.value),
    blockedSites,
  });
  fillSettingsForm(result.settings);
  renderHome(result);
  flashStatus('Configurações salvas.');
});

toggleBtn.addEventListener('click', async () => {
  toggleBtn.classList.add('is-pending');
  toggleBtn.disabled = true;

  try {
    renderHome(await request(MESSAGE_TYPES.TOGGLE_NIGHT_MODE));
  } finally {
    toggleBtn.classList.remove('is-pending');
    toggleBtn.disabled = false;
  }
});

async function init() {
  const popupState = await request(MESSAGE_TYPES.GET_POPUP_STATE);
  fillSettingsForm(popupState.settings);
  renderHome(popupState);
  setInterval(refreshHome, 5000);
  setInterval(paintSiteReminder, 1000);
}

init();
