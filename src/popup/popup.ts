import { PRESET_INTERVALS, StateResponse, Message, MessageType } from '../shared/types';

const ELEMENTS = {
  statusText: document.getElementById('status-text') as HTMLElement,
  statusSubtext: document.getElementById('status-subtext') as HTMLElement,
  intervalSelect: document.getElementById('interval-select') as HTMLSelectElement,
  intervalCustom: document.getElementById('interval-custom') as HTMLInputElement,
  breakDuration: document.getElementById('break-duration') as HTMLInputElement,
  btnTakeBreak: document.getElementById('btn-take-break') as HTMLButtonElement,
  btnSnooze: document.getElementById('btn-snooze') as HTMLButtonElement,
  btnPause: document.getElementById('btn-pause') as HTMLButtonElement,
  linkSettings: document.getElementById('link-settings') as HTMLAnchorElement,
} as const;

let countdownInterval: ReturnType<typeof setInterval> | null = null;
let currentState: StateResponse | null = null;

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function updateStatusDisplay(state: StateResponse): void {
  const { state: runtimeState, remainingSeconds, settings } = state;

  if (runtimeState.isPaused) {
    ELEMENTS.statusText.textContent = 'Paused';
    ELEMENTS.statusSubtext.textContent = '';
    ELEMENTS.btnPause.textContent = 'Resume';
  } else if (runtimeState.isIdle) {
    ELEMENTS.statusText.textContent = 'Idle (paused)';
    ELEMENTS.statusSubtext.textContent = `Remaining: ${formatTime(remainingSeconds)}`;
    ELEMENTS.btnPause.textContent = 'Resume';
  } else {
    ELEMENTS.statusText.textContent = `Next break in: ${formatTime(remainingSeconds)}`;
    ELEMENTS.statusSubtext.textContent = '';
    ELEMENTS.btnPause.textContent = 'Pause';
  }

  ELEMENTS.btnSnooze.textContent = `Snooze ${settings.snoozeMinutes} min`;
}

function startCountdown(): void {
  if (countdownInterval) clearInterval(countdownInterval);

  countdownInterval = setInterval(async () => {
    if (!currentState) return;

    const { state, settings, remainingSeconds } = currentState;

    if (state.isPaused || state.isIdle) return;

    const newRemaining = Math.max(0, remainingSeconds - 1);
    ELEMENTS.statusText.textContent = `Next break in: ${formatTime(newRemaining)}`;

    if (newRemaining <= 0) {
      await refreshState();
    }
  }, 1000);
}

async function refreshState(): Promise<void> {
  try {
    const response = await browser.runtime.sendMessage({ type: 'GET_STATE' }) as StateResponse;
    currentState = response;
    updateStatusDisplay(response);

    ELEMENTS.intervalSelect.value = PRESET_INTERVALS.includes(response.settings.intervalMinutes)
      ? response.settings.intervalMinutes.toString()
      : 'custom';
    ELEMENTS.intervalCustom.value = response.settings.intervalMinutes.toString();
    ELEMENTS.intervalCustom.classList.toggle('hidden', PRESET_INTERVALS.includes(response.settings.intervalMinutes));
    ELEMENTS.breakDuration.value = response.settings.breakDurationSeconds.toString();
  } catch (error) {
    console.error('Failed to refresh state:', error);
  }
}

async function sendMessage(type: MessageType, payload?: Record<string, unknown>): Promise<void> {
  try {
    await browser.runtime.sendMessage({ type, payload } as Message);
    await refreshState();
  } catch (error) {
    console.error(`Failed to send message ${type}:`, error);
  }
}

function setupEventListeners(): void {
  ELEMENTS.intervalSelect.addEventListener('change', async () => {
    const value = ELEMENTS.intervalSelect.value;
    if (value === 'custom') {
      ELEMENTS.intervalCustom.classList.remove('hidden');
      ELEMENTS.intervalCustom.focus();
    } else {
      ELEMENTS.intervalCustom.classList.add('hidden');
      await sendMessage('SET_INTERVAL', { interval: parseInt(value, 10) });
    }
  });

  ELEMENTS.intervalCustom.addEventListener('change', async () => {
    const value = parseInt(ELEMENTS.intervalCustom.value, 10);
    if (value >= 1 && value <= 240) {
      await sendMessage('SET_INTERVAL', { interval: value });
      ELEMENTS.intervalSelect.value = 'custom';
    }
  });

  ELEMENTS.breakDuration.addEventListener('change', async () => {
    const value = parseInt(ELEMENTS.breakDuration.value, 10);
    if (value >= 5 && value <= 300) {
      await sendMessage('SET_BREAK_DURATION', { duration: value });
    } else {
      ELEMENTS.breakDuration.value = currentState?.settings.breakDurationSeconds.toString() || '20';
    }
  });

  ELEMENTS.btnTakeBreak.addEventListener('click', async () => {
    await sendMessage('TAKE_BREAK_NOW');
  });

  ELEMENTS.btnSnooze.addEventListener('click', async () => {
    await sendMessage('SNOOZE');
  });

  ELEMENTS.btnPause.addEventListener('click', async () => {
    if (currentState?.state.isPaused || currentState?.state.isIdle) {
      await sendMessage('RESUME');
    } else {
      await sendMessage('TOGGLE_PAUSE');
    }
  });

  ELEMENTS.linkSettings.addEventListener('click', (e) => {
    e.preventDefault();
    browser.runtime.openOptionsPage();
  });
}

async function init(): Promise<void> {
  await refreshState();
  setupEventListeners();
  startCountdown();

  ELEMENTS.statusSubtext.textContent = '';
}

document.addEventListener('DOMContentLoaded', init);
