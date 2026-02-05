import {
  ReminderType,
  REMINDER_TYPES,
  PRESET_INTERVALS,
  MIN_INTERVAL,
  MAX_INTERVAL,
  Message,
  StateResponse,
  getActionButtonText,
} from '../shared/types';

// ============================================================================
// DOM ELEMENTS
// ============================================================================

const ELEMENTS = {
  // Reminder type selector
  reminderTypeSelect: document.getElementById('reminder-type-select') as HTMLSelectElement,
  
  // Status display
  statusLabel: document.getElementById('status-label') as HTMLElement,
  statusTime: document.getElementById('status-time') as HTMLElement,
  statusSubtext: document.getElementById('status-subtext') as HTMLElement,
  statusCard: document.getElementById('status-card') as HTMLElement,
  
  // Interval controls
  intervalSelect: document.getElementById('interval-select') as HTMLSelectElement,
  intervalCustom: document.getElementById('interval-custom') as HTMLInputElement,
  
  // Buttons
  btnTrigger: document.getElementById('btn-trigger') as HTMLButtonElement,
  btnSnooze: document.getElementById('btn-snooze') as HTMLButtonElement,
  btnPause: document.getElementById('btn-pause') as HTMLButtonElement,
  
  // Status indicators
  statusIndicators: document.getElementById('status-indicators') as HTMLElement,
  indicatorEye: document.getElementById('indicator-eye') as HTMLElement,
  indicatorWater: document.getElementById('indicator-water') as HTMLElement,
  statusEye: document.getElementById('status-eye') as HTMLElement,
  statusWater: document.getElementById('status-water') as HTMLElement,
  
  // Footer
  linkSettings: document.getElementById('link-settings') as HTMLAnchorElement,
} as const;

// ============================================================================
// STATE
// ============================================================================

let currentState: StateResponse | null = null;
let currentReminderType: ReminderType = 'eye';
let countdownInterval: ReturnType<typeof setInterval> | null = null;
let displaySecondsByType: Record<ReminderType, number> = { eye: 0, water: 0 };

// ============================================================================
// INITIALIZATION
// ============================================================================

async function init(): Promise<void> {
  await refreshState();
  setupEventListeners();
  startCountdown();
}

document.addEventListener('DOMContentLoaded', init);

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

async function refreshState(): Promise<void> {
  try {
    console.log('[Popup] Requesting state from background...');
    const response = await chrome.runtime.sendMessage({ type: 'GET_STATE' }) as StateResponse;
    console.log('[Popup] Received state:', response);
    
    currentState = response;
    
    // Determine which reminder type to show
    const savedType = response.settings.ui?.lastSelectedReminder;
    if (savedType && REMINDER_TYPES.includes(savedType)) {
      currentReminderType = savedType;
    } else {
      currentReminderType = 'eye';
    }
    
    // Update display seconds for each type
    for (const type of REMINDER_TYPES) {
      displaySecondsByType[type] = response.remainingSecondsByType[type] ?? 0;
    }
    
    // Update UI
    updateUI();
    
  } catch (error) {
    console.error('[Popup] Failed to refresh state:', error);
    ELEMENTS.statusTime.textContent = 'Error';
    ELEMENTS.statusSubtext.textContent = String(error);
  }
}

// ============================================================================
// UI UPDATES
// ============================================================================

function updateUI(): void {
  if (!currentState) return;
  
  const { settings, state } = currentState;
  
  // Update reminder type selector
  ELEMENTS.reminderTypeSelect.value = currentReminderType;
  
  // Update status display for selected reminder
  updateStatusDisplay(currentReminderType);
  
  // Update interval selector
  const reminderSettings = settings.reminders[currentReminderType];
  const interval = reminderSettings.intervalMinutes;
  if (PRESET_INTERVALS.includes(interval)) {
    ELEMENTS.intervalSelect.value = interval.toString();
    ELEMENTS.intervalCustom.classList.add('hidden');
  } else {
    ELEMENTS.intervalSelect.value = 'custom';
    ELEMENTS.intervalCustom.value = interval.toString();
    ELEMENTS.intervalCustom.classList.remove('hidden');
  }
  
  // Update button labels
  const actionText = getActionButtonText(currentReminderType);
  ELEMENTS.btnTrigger.textContent = actionText.trigger;
  ELEMENTS.btnSnooze.textContent = `Snooze ${reminderSettings.snoozeMinutes} min`;
  
  // Update pause button
  const reminderState = state.reminders[currentReminderType];
  if (reminderState.isPaused) {
    ELEMENTS.btnPause.textContent = 'Resume';
  } else if (state.isIdle) {
    ELEMENTS.btnPause.textContent = 'Resume';
  } else {
    ELEMENTS.btnPause.textContent = 'Pause';
  }
  
  // Update mini indicators
  updateMiniIndicators();
}

function updateStatusDisplay(type: ReminderType): void {
  if (!currentState) return;
  
  const { settings, state } = currentState;
  const reminderSettings = settings.reminders[type];
  const reminderState = state.reminders[type];
  const seconds = displaySecondsByType[type];
  
  // Check various states
  if (!reminderSettings.enabled) {
    ELEMENTS.statusLabel.textContent = '';
    ELEMENTS.statusTime.textContent = 'Disabled';
    ELEMENTS.statusSubtext.textContent = 'Enable in settings to use this reminder';
    ELEMENTS.statusCard.className = 'status-card status-disabled';
  } else if (state.isIdle) {
    ELEMENTS.statusLabel.textContent = 'Idle: ';
    ELEMENTS.statusTime.textContent = formatTime(seconds);
    ELEMENTS.statusSubtext.textContent = 'Paused - will resume when you return';
    ELEMENTS.statusCard.className = 'status-card status-idle';
  } else if (reminderState.isPaused) {
    ELEMENTS.statusLabel.textContent = 'Paused: ';
    ELEMENTS.statusTime.textContent = formatTime(seconds);
    ELEMENTS.statusSubtext.textContent = 'Click Resume to continue';
    ELEMENTS.statusCard.className = 'status-card status-paused';
  } else {
    ELEMENTS.statusLabel.textContent = `Next ${type === 'eye' ? 'break' : 'drink'} in: `;
    ELEMENTS.statusTime.textContent = formatTime(seconds);
    ELEMENTS.statusSubtext.textContent = '';
    ELEMENTS.statusCard.className = 'status-card status-active';
  }
}

function updateMiniIndicators(): void {
  if (!currentState) return;
  
  const { settings, state } = currentState;
  
  for (const type of REMINDER_TYPES) {
    const reminderSettings = settings.reminders[type];
    const reminderState = state.reminders[type];
    const seconds = displaySecondsByType[type];
    const statusEl = type === 'eye' ? ELEMENTS.statusEye : ELEMENTS.statusWater;
    const indicatorEl = type === 'eye' ? ELEMENTS.indicatorEye : ELEMENTS.indicatorWater;
    
    if (!reminderSettings.enabled) {
      statusEl.textContent = 'Off';
      indicatorEl.classList.add('indicator-disabled');
      indicatorEl.classList.remove('indicator-paused', 'indicator-active');
    } else if (state.isIdle || reminderState.isPaused) {
      statusEl.textContent = formatTime(seconds);
      indicatorEl.classList.add('indicator-paused');
      indicatorEl.classList.remove('indicator-disabled', 'indicator-active');
    } else {
      statusEl.textContent = formatTime(seconds);
      indicatorEl.classList.add('indicator-active');
      indicatorEl.classList.remove('indicator-disabled', 'indicator-paused');
    }
  }
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
    if (!currentState) return;
    
    const { state } = currentState;
    
    // Decrement each reminder's countdown if active
    for (const type of REMINDER_TYPES) {
      const reminderSettings = currentState.settings.reminders[type];
      const reminderState = state.reminders[type];
      
      // Only decrement if enabled and not paused/idle
      if (reminderSettings.enabled && !reminderState.isPaused && !state.isIdle) {
        displaySecondsByType[type] = Math.max(0, displaySecondsByType[type] - 1);
        
        // Check if timer reached zero
        if (displaySecondsByType[type] <= 0) {
          // Trigger check for this reminder
          await chrome.runtime.sendMessage({
            type: 'CHECK_NOTIFICATION',
            payload: { reminderType: type },
          });
        }
      }
    }
    
    // Update displays
    updateUI();
    
    // Refresh state every 10 seconds to correct drift
    if (Date.now() % 10000 < 1000) {
      await refreshState();
    }
  }, 1000);
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

function setupEventListeners(): void {
  // Reminder type selector
  ELEMENTS.reminderTypeSelect.addEventListener('change', async () => {
    const newType = ELEMENTS.reminderTypeSelect.value as ReminderType;
    if (newType !== currentReminderType && REMINDER_TYPES.includes(newType)) {
      currentReminderType = newType;
      
      // Persist selection
      await sendMessage('SET_LAST_SELECTED_REMINDER', { reminderType: newType });
      
      // Update UI
      updateUI();
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
      if (currentState) {
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
    
    const reminderState = currentState.state.reminders[currentReminderType];
    const isPaused = reminderState.isPaused || currentState.state.isIdle;
    
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
  
  // Click on mini indicators to switch reminder type
  ELEMENTS.indicatorEye.addEventListener('click', async () => {
    currentReminderType = 'eye';
    await sendMessage('SET_LAST_SELECTED_REMINDER', { reminderType: 'eye' });
    updateUI();
  });
  
  ELEMENTS.indicatorWater.addEventListener('click', async () => {
    currentReminderType = 'water';
    await sendMessage('SET_LAST_SELECTED_REMINDER', { reminderType: 'water' });
    updateUI();
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
