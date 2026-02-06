import {
  ReminderType,
  REMINDER_TYPES,
  PRESET_INTERVALS,
  MIN_INTERVAL,
  MAX_INTERVAL,
  Message,
  StateResponse,
  getActionButtonText,
  DEFAULT_SETTINGS_V2,
} from '../shared/types';

// ============================================================================
// DOM ELEMENTS
// ============================================================================

const ELEMENTS = {
  // Segmented control
  segmentEye: document.getElementById('segment-eye') as HTMLButtonElement,
  segmentWater: document.getElementById('segment-water') as HTMLButtonElement,

  // Counters
  counterEyeTime: document.getElementById('counter-eye-time') as HTMLElement,
  counterEyeStatus: document.getElementById('counter-eye-status') as HTMLElement,
  counterWaterTime: document.getElementById('counter-water-time') as HTMLElement,
  counterWaterStatus: document.getElementById('counter-water-status') as HTMLElement,

  // Buttons
  btnTrigger: document.getElementById('btn-trigger') as HTMLButtonElement,
  btnSnooze: document.getElementById('btn-snooze') as HTMLButtonElement,
  btnPause: document.getElementById('btn-pause') as HTMLButtonElement,

  // Interval controls
  intervalSelect: document.getElementById('interval-select') as HTMLSelectElement,
  intervalCustom: document.getElementById('interval-custom') as HTMLInputElement,

  // Footer
  linkSettings: document.getElementById('link-settings') as HTMLAnchorElement,
} as const;

// ============================================================================
// STATE
// ============================================================================

let currentState: StateResponse | null = null;
let currentReminderType: ReminderType = 'eye';
let countdownInterval: ReturnType<typeof setInterval> | null = null;
let isLoading: boolean = true;

// ============================================================================
// INITIALIZATION
// ============================================================================

async function init(): Promise<void> {
  showLoadingState();
  await refreshState();
  setupEventListeners();
  startCountdown();
  isLoading = false;
}

document.addEventListener('DOMContentLoaded', init);

function showLoadingState(): void {
  ELEMENTS.counterEyeTime.textContent = 'Next in: --:-- min';
  ELEMENTS.counterEyeStatus.textContent = 'Loading...';
  ELEMENTS.counterWaterTime.textContent = 'Next in: --:-- min';
  ELEMENTS.counterWaterStatus.textContent = 'Loading...';
}

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

async function refreshState(): Promise<void> {
  try {
    console.log('[Popup] Requesting state from background...');
    const response = await chrome.runtime.sendMessage({ type: 'GET_STATE' }) as StateResponse;
    console.log('[Popup] Received state:', response);
    
    // Validate response has required properties
    if (!response || !response.settings || !response.state) {
      console.error('[Popup] Invalid state response:', response);
      showErrorState('Invalid state');
      return;
    }
    
    // Ensure reminders object exists
    if (!response.state.reminders) {
      console.error('[Popup] State missing reminders:', response.state);
      showErrorState('Initializing...');
      // Try to refresh after a short delay
      setTimeout(refreshState, 500);
      return;
    }
    
    currentState = response;

    // Update local countdown from new state
    updateLocalCountdown();

    // Determine which reminder type to show
    const savedType = response.settings?.ui?.lastSelectedReminder;
    if (savedType && REMINDER_TYPES.includes(savedType)) {
      currentReminderType = savedType;
    } else {
      currentReminderType = 'eye';
    }

    // Update UI
    updateUI();
    
  } catch (error) {
    console.error('[Popup] Failed to refresh state:', error);
    showErrorState(String(error));
  }
}

function showErrorState(message: string): void {
  ELEMENTS.counterEyeTime.textContent = 'Error';
  ELEMENTS.counterEyeStatus.textContent = message;
  ELEMENTS.counterWaterTime.textContent = 'Error';
  ELEMENTS.counterWaterStatus.textContent = message;
}

// ============================================================================
// UI UPDATES
// ============================================================================

function updateUI(): void {
  if (!currentState || isLoading) return;
  
  // Safely get settings and state with defaults
  const settings = currentState.settings || DEFAULT_SETTINGS_V2;
  const state = currentState.state || { version: 2, isIdle: false, lastActiveAt: Date.now(), reminders: {} };
  
  // Ensure reminders object exists
  if (!state.reminders) {
    state.reminders = {} as typeof state.reminders;
  }
  
  // Safely get reminder-specific settings with defaults
  const reminderSettings = settings.reminders?.[currentReminderType] || {
    enabled: currentReminderType === 'eye',
    intervalMinutes: currentReminderType === 'eye' ? 20 : 60,
    snoozeMinutes: currentReminderType === 'eye' ? 5 : 10,
    title: '',
    message: ''
  };
  
  // Safely get reminder-specific state with defaults
  const reminderState = state.reminders?.[currentReminderType] || {
    isPaused: false,
    remainingMs: reminderSettings.intervalMinutes * 60 * 1000,
    timerEndsAt: null,
    nextAlarmAt: null,
    nextNotificationAt: null,
    lastNotifiedAt: null,
    activeNotificationId: null
  };
  
  // Update segmented control
  updateSegmentedControl();

  // Update both counters
  updateCounter('eye');
  updateCounter('water');

  // Update interval selector
  updateIntervalSelector(reminderSettings.intervalMinutes);

  // Update button labels
  updateButtons(reminderSettings, reminderState, state.isIdle);
}

function updateSegmentedControl(): void {
  // Update eye segment
  if (currentReminderType === 'eye') {
    ELEMENTS.segmentEye.classList.add('active');
    ELEMENTS.segmentWater.classList.remove('active');
  } else {
    ELEMENTS.segmentEye.classList.remove('active');
    ELEMENTS.segmentWater.classList.add('active');
  }
}

function updateCounter(type: ReminderType): void {
  updateCounterDisplay(type);
}

function updateIntervalSelector(interval: number): void {
  if (PRESET_INTERVALS.includes(interval)) {
    ELEMENTS.intervalSelect.value = interval.toString();
    ELEMENTS.intervalCustom.classList.add('hidden');
  } else {
    ELEMENTS.intervalSelect.value = 'custom';
    ELEMENTS.intervalCustom.value = interval.toString();
    ELEMENTS.intervalCustom.classList.remove('hidden');
  }
}

function updateButtons(
  reminderSettings: { snoozeMinutes: number },
  reminderState: { isPaused: boolean },
  isIdle: boolean
): void {
  // Update trigger button text
  const actionText = getActionButtonText(currentReminderType);
  ELEMENTS.btnTrigger.textContent = actionText.trigger;
  
  // Update snooze button
  ELEMENTS.btnSnooze.textContent = `Snooze ${reminderSettings.snoozeMinutes} min`;
  
  // Update pause button
  const isPaused = reminderState.isPaused || isIdle;
  ELEMENTS.btnPause.textContent = isPaused ? 'Resume' : 'Pause';
}

// ============================================================================
// COUNTDOWN TIMER
// ============================================================================

// Track remaining seconds locally for countdown
let localRemainingSeconds: Record<ReminderType, number> = {
  eye: 0,
  water: 0,
};

function updateLocalCountdown(): void {
  if (!currentState) return;

  // Update local countdown from state
  for (const type of REMINDER_TYPES) {
    const counterInfo = currentState.counterInfo?.[type];
    if (counterInfo && counterInfo.status === 'active') {
      localRemainingSeconds[type] = Math.max(0, counterInfo.remainingSeconds);
    } else if (counterInfo) {
      // For paused, idle, disabled, notification - use the state value
      localRemainingSeconds[type] = counterInfo.remainingSeconds;
    }
  }
}

function startCountdown(): void {
  if (countdownInterval) clearInterval(countdownInterval);

  // Initialize local countdown
  updateLocalCountdown();

  countdownInterval = setInterval(async () => {
    if (!currentState || isLoading) return;

    let needsRefresh = false;

    // Decrement active timers
    for (const type of REMINDER_TYPES) {
      const counterInfo = currentState.counterInfo?.[type];
      if (counterInfo?.status === 'active' && localRemainingSeconds[type] > 0) {
        localRemainingSeconds[type]--;

        // Check if timer reached zero
        if (localRemainingSeconds[type] <= 0) {
          needsRefresh = true;
        }
      }
    }

    if (needsRefresh) {
      // Timer reached zero, refresh state from background
      await refreshState();
      updateLocalCountdown();
    } else {
      // Just update the display with local countdown
      updateCounterDisplay('eye');
      updateCounterDisplay('water');
    }
  }, 1000);
}

function updateCounterDisplay(type: ReminderType): void {
  if (!currentState) return;

  const counterInfo = currentState.counterInfo?.[type];
  if (!counterInfo) return;

  const isEye = type === 'eye';
  const timeEl = isEye ? ELEMENTS.counterEyeTime : ELEMENTS.counterWaterTime;
  const statusEl = isEye ? ELEMENTS.counterEyeStatus : ELEMENTS.counterWaterStatus;

  if (counterInfo.status === 'disabled') {
    timeEl.textContent = 'Next in: --:-- min';
    statusEl.textContent = 'Disabled';
    statusEl.className = 'counter-status status-disabled';
  } else if (counterInfo.status === 'notification') {
    timeEl.textContent = 'Next in: 00:00 min';
    statusEl.textContent = 'Notification!';
    statusEl.className = 'counter-status status-notification';
  } else {
    // Use local remaining seconds for active countdown
    const remainingSecs = localRemainingSeconds[type];
    const minutes = Math.floor(remainingSecs / 60);
    const seconds = remainingSecs % 60;
    timeEl.textContent = `Next in: ${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')} min`;

    // Simple status text
    if (counterInfo.status === 'active') {
      statusEl.textContent = 'Active';
      statusEl.className = 'counter-status status-active';
    } else if (counterInfo.status === 'paused') {
      statusEl.textContent = 'Paused';
      statusEl.className = 'counter-status status-paused';
    } else if (counterInfo.status === 'idle') {
      statusEl.textContent = 'Idle';
      statusEl.className = 'counter-status status-idle';
    }
  }
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

function setupEventListeners(): void {
  // Segmented control - Eye
  ELEMENTS.segmentEye.addEventListener('click', async () => {
    if (currentReminderType !== 'eye') {
      currentReminderType = 'eye';
      await sendMessage('SET_LAST_SELECTED_REMINDER', { reminderType: 'eye' });
      await refreshState();
    }
  });
  
  // Segmented control - Water
  ELEMENTS.segmentWater.addEventListener('click', async () => {
    if (currentReminderType !== 'water') {
      currentReminderType = 'water';
      await sendMessage('SET_LAST_SELECTED_REMINDER', { reminderType: 'water' });
      await refreshState();
    }
  });
  
  // Interval selector
  ELEMENTS.intervalSelect.addEventListener('change', async () => {
    const value = ELEMENTS.intervalSelect.value;
    
    if (value === 'custom') {
      ELEMENTS.intervalCustom.classList.remove('hidden');
      ELEMENTS.intervalCustom.focus();
    } else {
      ELEMENTS.intervalCustom.classList.add('hidden');
      const interval = parseInt(value, 10);
      if (validateInterval(interval)) {
        await sendMessage('SET_REMINDER_INTERVAL', {
          reminderType: currentReminderType,
          interval,
        });
      }
    }
  });
  
  // Interval custom input
  ELEMENTS.intervalCustom.addEventListener('change', async () => {
    const value = parseInt(ELEMENTS.intervalCustom.value, 10);
    if (validateInterval(value)) {
      await sendMessage('SET_REMINDER_INTERVAL', {
        reminderType: currentReminderType,
        interval: value,
      });
      ELEMENTS.intervalSelect.value = 'custom';
    } else {
      // Revert to previous valid value
      if (currentState?.settings?.reminders?.[currentReminderType]) {
        const prevInterval = currentState.settings.reminders[currentReminderType].intervalMinutes;
        ELEMENTS.intervalCustom.value = prevInterval.toString();
      }
    }
  });
  
  // Trigger now button
  ELEMENTS.btnTrigger.addEventListener('click', async () => {
    await sendMessage('REMINDER_TRIGGER_NOW', { reminderType: currentReminderType });
  });
  
  // Snooze button
  ELEMENTS.btnSnooze.addEventListener('click', async () => {
    await sendMessage('REMINDER_SNOOZE', { reminderType: currentReminderType });
  });
  
  // Pause/Resume button
  ELEMENTS.btnPause.addEventListener('click', async () => {
    if (!currentState) return;
    
    const reminderState = currentState.state?.reminders?.[currentReminderType];
    const isPaused = reminderState?.isPaused || currentState.state?.isIdle;
    
    if (isPaused) {
      await sendMessage('RESUME', { reminderType: currentReminderType });
    } else {
      await sendMessage('TOGGLE_REMINDER_PAUSE', { reminderType: currentReminderType });
    }
  });
  
  // Settings link
  ELEMENTS.linkSettings.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });
}

// ============================================================================
// MESSAGE HELPERS
// ============================================================================

async function sendMessage(type: string, payload?: Record<string, unknown>): Promise<void> {
  try {
    console.log('[Popup] Sending message:', type, payload);
    const message: Message = { type, payload };
    await chrome.runtime.sendMessage(message);
    console.log('[Popup] Message sent successfully');
    await refreshState();
  } catch (error) {
    console.error(`[Popup] Failed to send message ${type}:`, error);
  }
}

// ============================================================================
// VALIDATION
// ============================================================================

function validateInterval(value: number): boolean {
  return !isNaN(value) && value >= MIN_INTERVAL && value <= MAX_INTERVAL;
}
