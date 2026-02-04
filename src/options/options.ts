import {
  PRESET_INTERVALS,
  MIN_INTERVAL,
  MAX_INTERVAL,
  MIN_IDLE_THRESHOLD,
  MAX_IDLE_THRESHOLD,
  MIN_SNOOZE,
  MAX_SNOOZE,
  Message,
} from '../shared/types';

const ELEMENTS = {
  intervalPreset: document.getElementById('interval-preset') as HTMLSelectElement,
  intervalCustom: document.getElementById('interval-custom') as HTMLInputElement,
  idleThreshold: document.getElementById('idle-threshold') as HTMLInputElement,
  snoozeDuration: document.getElementById('snooze-duration') as HTMLInputElement,
  btnReset: document.getElementById('btn-reset') as HTMLButtonElement,
} as const;

async function loadSettings(): Promise<void> {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_STATE' }) as {
      settings: {
        intervalMinutes: number;
        idleThresholdSeconds: number;
        snoozeMinutes: number;
      };
    };
    const settings = response.settings;

    ELEMENTS.intervalPreset.value = PRESET_INTERVALS.includes(settings.intervalMinutes)
      ? settings.intervalMinutes.toString()
      : 'custom';
    ELEMENTS.intervalCustom.value = settings.intervalMinutes.toString();
    ELEMENTS.intervalCustom.classList.toggle('hidden', PRESET_INTERVALS.includes(settings.intervalMinutes));
    ELEMENTS.idleThreshold.value = settings.idleThresholdSeconds.toString();
    ELEMENTS.snoozeDuration.value = settings.snoozeMinutes.toString();
  } catch (error) {
    console.error('Failed to load settings:', error);
  }
}

async function sendMessage(type: string, payload?: Record<string, unknown>): Promise<void> {
  try {
    await chrome.runtime.sendMessage({ type, payload } as Message);
  } catch (error) {
    console.error(`Failed to send message ${type}:`, error);
  }
}

function setupEventListeners(): void {
  ELEMENTS.intervalPreset.addEventListener('change', async () => {
    const value = ELEMENTS.intervalPreset.value;
    if (value === 'custom') {
      ELEMENTS.intervalCustom.classList.remove('hidden');
      ELEMENTS.intervalCustom.focus();
    } else {
      ELEMENTS.intervalCustom.classList.add('hidden');
      const interval = parseInt(value, 10);
      if (interval >= MIN_INTERVAL && interval <= MAX_INTERVAL) {
        await sendMessage('SET_INTERVAL', { interval });
      }
    }
  });

  ELEMENTS.intervalCustom.addEventListener('change', async () => {
    const value = parseInt(ELEMENTS.intervalCustom.value, 10);
    if (value >= MIN_INTERVAL && value <= MAX_INTERVAL) {
      await sendMessage('SET_INTERVAL', { interval: value });
      ELEMENTS.intervalPreset.value = 'custom';
    } else {
      ELEMENTS.intervalCustom.value = ELEMENTS.intervalPreset.value !== 'custom'
        ? ELEMENTS.intervalPreset.value
        : '20';
    }
  });

  ELEMENTS.idleThreshold.addEventListener('change', async () => {
    const value = parseInt(ELEMENTS.idleThreshold.value, 10);
    if (value >= MIN_IDLE_THRESHOLD && value <= MAX_IDLE_THRESHOLD) {
      await sendMessage('SET_SETTINGS', { idleThresholdSeconds: value });
    } else {
      ELEMENTS.idleThreshold.value = '60';
    }
  });

  ELEMENTS.snoozeDuration.addEventListener('change', async () => {
    const value = parseInt(ELEMENTS.snoozeDuration.value, 10);
    if (value >= MIN_SNOOZE && value <= MAX_SNOOZE) {
      await sendMessage('SET_SNOOZE', { snooze: value });
    } else {
      ELEMENTS.snoozeDuration.value = '2';
    }
  });

  ELEMENTS.btnReset.addEventListener('click', async () => {
    if (confirm('Are you sure you want to reset all settings to defaults?')) {
      await sendMessage('RESET');
      await loadSettings();
    }
  });
}

async function init(): Promise<void> {
  await loadSettings();
  setupEventListeners();
}

document.addEventListener('DOMContentLoaded', init);
