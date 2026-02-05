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
  
  // Status display
  statusWord: document.getElementById('status-word') as HTMLElement,
  statusTime: document.getElementById('status-time') as HTMLElement,
  statusSuffix: document.getElementById('status-suffix') as HTMLElement,
  
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
let displaySeconds: number = 0;
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
  ELEMENTS.statusTime.textContent = '--:--';
  ELEMENTS.statusWord.textContent = 'Loading...';
  ELEMENTS.statusSuffix.classList.add('hidden');
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
    
    // Determine which reminder type to show
    const savedType = response.settings?.ui?.lastSelectedReminder;
    if (savedType && REMINDER_TYPES.includes(savedType)) {
      currentReminderType = savedType;
    } else {
      currentReminderType = 'eye';
    }
    
    // Update display seconds for selected type
    const seconds = response.remainingSecondsByType?.[currentReminderType];
    displaySeconds = typeof seconds === 'number' ? seconds : 0;
    
    // Update UI
    updateUI();
    
  } catch (error) {
    console.error('[Popup] Failed to refresh state:', error);
    showErrorState(String(error));
  }
}

function showErrorState(message: string): void {
  ELEMENTS.statusTime.textContent = 'Error';
  ELEMENTS.statusWord.textContent = message;
  ELEMENTS.statusSuffix.classList.add('hidden');
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
  
  // Update status display
  updateStatusDisplay(settings, state, reminderSettings, reminderState);
  
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

function updateStatusDisplay(
  _settings: StateResponse['settings'],
  state: StateResponse['state'],
  reminderSettings: { enabled: boolean },
  reminderState: { isPaused: boolean }
): void {
  // Clear previous status classes
  ELEMENTS.statusWord.className = 'status-word';
  
  if (!reminderSettings.enabled) {
    // Disabled state
    ELEMENTS.statusWord.textContent = 'Disabled';
    ELEMENTS.statusWord.classList.add('status-disabled');
    ELEMENTS.statusTime.textContent = '--:--';
    ELEMENTS.statusSuffix.classList.add('hidden');
  } else if (state.isIdle) {
    // Idle state
    ELEMENTS.statusWord.textContent = 'Idle';
    ELEMENTS.statusWord.classList.add('status-idle');
    ELEMENTS.statusTime.textContent = formatTime(displaySeconds);
    ELEMENTS.statusSuffix.classList.remove('hidden');
    ELEMENTS.statusSuffix.textContent = 'remaining';
  } else if (reminderState.isPaused) {
    // Paused state
    ELEMENTS.statusWord.textContent = 'Paused';
    ELEMENTS.statusWord.classList.add('status-paused');
    ELEMENTS.statusTime.textContent = formatTime(displaySeconds);
    ELEMENTS.statusSuffix.classList.remove('hidden');
    ELEMENTS.statusSuffix.textContent = 'remaining';
  } else {
    // Active state
    ELEMENTS.statusWord.textContent = '';
    ELEMENTS.statusTime.textContent = formatTime(displaySeconds);
    ELEMENTS.statusSuffix.classList.remove('hidden');
    ELEMENTS.statusSuffix.textContent = 'remaining';
  }
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

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// ============================================================================
// COUNTDOWN TIMER
// ============================================================================

function startCountdown(): void {
  if (countdownInterval) clearInterval(countdownInterval);
  
  countdownInterval = setInterval(async () => {
    if (!currentState || isLoading) return;
    
    const state = currentState.state;
    const settings = currentState.settings;
    
    // Safely get reminder state
    const reminderSettings = settings?.reminders?.[currentReminderType];
    const reminderState = state?.reminders?.[currentReminderType];
    
    // Only decrement if enabled, not paused, and not idle
    if (reminderSettings?.enabled && !reminderState?.isPaused && !state?.isIdle) {
      displaySeconds = Math.max(0, displaySeconds - 1);
      
      // Check if timer reached zero
      if (displaySeconds <= 0) {
        // Trigger check for this reminder
        await chrome.runtime.sendMessage({
          type: 'CHECK_NOTIFICATION',
          payload: { reminderType: currentReminderType },
        });
        // Refresh state to get new timer
        await refreshState();
      } else {
        // Just update the display
        updateUI();
      }
    }
  }, 1000);
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
