import { PRESET_INTERVALS, MIN_INTERVAL, MAX_INTERVAL, StateResponse, Message, MessageType } from '../shared/types';

const ELEMENTS = {
  statusText: document.getElementById('status-text') as HTMLElement,
  statusLabel: document.getElementById('status-label') as HTMLElement,
  statusTime: document.getElementById('status-time') as HTMLElement,
  statusSubtext: document.getElementById('status-subtext') as HTMLElement,
  intervalSelect: document.getElementById('interval-select') as HTMLSelectElement,
  intervalCustom: document.getElementById('interval-custom') as HTMLInputElement,
  btnTakeBreak: document.getElementById('btn-take-break') as HTMLButtonElement,
  btnSnooze: document.getElementById('btn-snooze') as HTMLButtonElement,
  btnPause: document.getElementById('btn-pause') as HTMLButtonElement,
  linkSettings: document.getElementById('link-settings') as HTMLAnchorElement,
} as const;

let countdownInterval: ReturnType<typeof setInterval> | null = null;
let displaySeconds = 0;
let currentState: StateResponse | null = null;

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function updateStatusDisplay(state: StateResponse): void {
  const { state: runtimeState, remainingSeconds, settings } = state;

  if (runtimeState.isPaused) {
    ELEMENTS.statusLabel.textContent = '';
    ELEMENTS.statusTime.textContent = 'Paused';
    ELEMENTS.statusSubtext.textContent = '';
    ELEMENTS.btnPause.textContent = 'Resume';
  } else if (runtimeState.isIdle) {
    ELEMENTS.statusLabel.textContent = 'Remaining: ';
    ELEMENTS.statusTime.textContent = formatTime(remainingSeconds);
    ELEMENTS.statusSubtext.textContent = '';
    ELEMENTS.btnPause.textContent = 'Resume';
  } else {
    ELEMENTS.statusLabel.textContent = 'Next break in: ';
    ELEMENTS.statusTime.textContent = formatTime(remainingSeconds);
    ELEMENTS.statusSubtext.textContent = '';
    ELEMENTS.btnPause.textContent = 'Pause';
  }

  ELEMENTS.btnSnooze.textContent = `Snooze ${settings.snoozeMinutes} min`;
}

function startCountdown(): void {
  if (countdownInterval) clearInterval(countdownInterval);

  displaySeconds = currentState?.remainingSeconds ?? 0;

  const updateDisplay = () => {
    if (currentState && !currentState.state.isPaused && !currentState.state.isIdle) {
      ELEMENTS.statusLabel.textContent = 'Next break in: ';
      ELEMENTS.statusTime.textContent = formatTime(displaySeconds);
    }
  };

  updateDisplay();

  countdownInterval = setInterval(async () => {
    if (!currentState) return;

    const { state } = currentState;

    if (state.isPaused || state.isIdle) return;

    displaySeconds = Math.max(0, displaySeconds - 1);
    updateDisplay();

    if (displaySeconds <= 0) {
      await sendMessage('CHECK_NOTIFICATION');
      await refreshState();
    }
  }, 1000);
}

async function refreshState(): Promise<void> {
  try {
    console.log('[Popup] Requesting state from background...');
    const response = await chrome.runtime.sendMessage({ type: 'GET_STATE' }) as StateResponse;
    console.log('[Popup] Received state:', response);
    currentState = response;
    displaySeconds = response.remainingSeconds;
    updateStatusDisplay(response);

    ELEMENTS.intervalSelect.value = PRESET_INTERVALS.includes(response.settings.intervalMinutes)
      ? response.settings.intervalMinutes.toString()
      : 'custom';
    ELEMENTS.intervalCustom.value = response.settings.intervalMinutes.toString();
    ELEMENTS.intervalCustom.classList.toggle('hidden', PRESET_INTERVALS.includes(response.settings.intervalMinutes));
    ELEMENTS.statusSubtext.textContent = '';
  } catch (error) {
    console.error('[Popup] Failed to refresh state:', error);
    ELEMENTS.statusText.textContent = 'Error';
    ELEMENTS.statusSubtext.textContent = String(error);
  }
}

async function sendMessage(type: MessageType, payload?: Record<string, unknown>): Promise<void> {
  try {
    console.log('[Popup] Sending message:', type, payload);
    await chrome.runtime.sendMessage({ type, payload } as Message);
    console.log('[Popup] Message sent successfully');
    await refreshState();
  } catch (error) {
    console.error(`[Popup] Failed to send message ${type}:`, error);
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

  const handleIntervalCustomChange = async () => {
    const value = parseInt(ELEMENTS.intervalCustom.value, 10);
    if (value >= MIN_INTERVAL && value <= MAX_INTERVAL) {
      await sendMessage('SET_INTERVAL', { interval: value });
      ELEMENTS.intervalSelect.value = 'custom';
      ELEMENTS.statusSubtext.textContent = '';
    } else {
      ELEMENTS.statusSubtext.textContent = `Interval must be between ${MIN_INTERVAL} and ${MAX_INTERVAL} minutes`;
      ELEMENTS.intervalCustom.value = currentState?.settings.intervalMinutes.toString() || '20';
    }
  };

  ELEMENTS.intervalCustom.addEventListener('change', handleIntervalCustomChange);
  ELEMENTS.intervalCustom.addEventListener('blur', handleIntervalCustomChange);

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
    chrome.runtime.openOptionsPage();
  });
}

async function init(): Promise<void> {
  await refreshState();
  setupEventListeners();
  startCountdown();

  ELEMENTS.statusSubtext.textContent = '';
}

document.addEventListener('DOMContentLoaded', init);
