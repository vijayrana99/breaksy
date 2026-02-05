import {
  ReminderType,
  REMINDER_TYPES,
  PRESET_INTERVALS,
  MIN_INTERVAL,
  MAX_INTERVAL,
  MIN_IDLE_THRESHOLD,
  MAX_IDLE_THRESHOLD,
  MIN_SNOOZE,
  MAX_SNOOZE,
  Message,
  SettingsV2,
  StateResponse,
  getNotificationContent,
} from '../shared/types';

// ============================================================================
// DOM ELEMENTS
// ============================================================================

const ELEMENTS = {
  // Reminder type selector
  reminderTypeSelect: document.getElementById('reminder-type-select') as HTMLSelectElement,
  
  // Reminder-specific UI elements
  reminderSettingsTitle: document.getElementById('reminder-settings-title') as HTMLElement,
  reminderEnabled: document.getElementById('reminder-enabled') as HTMLInputElement,
  enabledLabel: document.getElementById('enabled-label') as HTMLElement,
  enabledHint: document.getElementById('enabled-hint') as HTMLElement,
  intervalPreset: document.getElementById('interval-preset') as HTMLSelectElement,
  intervalCustom: document.getElementById('interval-custom') as HTMLInputElement,
  snoozeDuration: document.getElementById('snooze-duration') as HTMLInputElement,
  
  // Preview
  previewTitle: document.getElementById('preview-title') as HTMLElement,
  previewMessage: document.getElementById('preview-message') as HTMLElement,
  
  // Info boxes
  eyeInfo: document.getElementById('eye-info') as HTMLElement,
  waterInfo: document.getElementById('water-info') as HTMLElement,
  
  // Global settings
  idleThreshold: document.getElementById('idle-threshold') as HTMLInputElement,
  
  // Actions
  btnReset: document.getElementById('btn-reset') as HTMLButtonElement,
} as const;

// ============================================================================
// STATE
// ============================================================================

let currentSettings: SettingsV2 | null = null;
let currentReminderType: ReminderType = 'eye';

// ============================================================================
// INITIALIZATION
// ============================================================================

async function init(): Promise<void> {
  await loadSettings();
  setupEventListeners();
  updateUI();
}

document.addEventListener('DOMContentLoaded', init);

// ============================================================================
// DATA LOADING
// ============================================================================

async function loadSettings(): Promise<void> {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_STATE' }) as StateResponse;
    currentSettings = response.settings;
    
    // Determine which reminder type to show
    const savedType = currentSettings.ui?.lastSelectedReminder;
    if (savedType && REMINDER_TYPES.includes(savedType)) {
      currentReminderType = savedType;
    } else {
      currentReminderType = 'eye';
    }
    
    ELEMENTS.reminderTypeSelect.value = currentReminderType;
    
    console.log('[Options] Loaded settings:', currentSettings);
  } catch (error) {
    console.error('[Options] Failed to load settings:', error);
  }
}

// ============================================================================
// UI UPDATES
// ============================================================================

function updateUI(): void {
  if (!currentSettings) return;
  
  const reminderSettings = currentSettings.reminders[currentReminderType];
  
  // Update title
  ELEMENTS.reminderSettingsTitle.textContent = 
    currentReminderType === 'eye' ? 'Eye Break Settings' : 'Hydration Settings';
  
  // Update enabled toggle
  ELEMENTS.reminderEnabled.checked = reminderSettings.enabled;
  updateEnabledLabel(reminderSettings.enabled);
  
  // Update interval
  const interval = reminderSettings.intervalMinutes;
  if (PRESET_INTERVALS.includes(interval)) {
    ELEMENTS.intervalPreset.value = interval.toString();
    ELEMENTS.intervalCustom.classList.add('hidden');
  } else {
    ELEMENTS.intervalPreset.value = 'custom';
    ELEMENTS.intervalCustom.value = interval.toString();
    ELEMENTS.intervalCustom.classList.remove('hidden');
  }
  
  // Update snooze
  ELEMENTS.snoozeDuration.value = reminderSettings.snoozeMinutes.toString();
  
  // Update preview
  const content = getNotificationContent(currentReminderType);
  ELEMENTS.previewTitle.textContent = content.title;
  ELEMENTS.previewMessage.textContent = content.message;
  
  // Update info boxes
  if (currentReminderType === 'eye') {
    ELEMENTS.eyeInfo.classList.remove('hidden');
    ELEMENTS.waterInfo.classList.add('hidden');
  } else {
    ELEMENTS.eyeInfo.classList.add('hidden');
    ELEMENTS.waterInfo.classList.remove('hidden');
  }
  
  // Update global settings
  ELEMENTS.idleThreshold.value = currentSettings.idleThresholdSeconds.toString();
}

function updateEnabledLabel(enabled: boolean): void {
  ELEMENTS.enabledLabel.textContent = enabled ? 'Enabled' : 'Disabled';
  ELEMENTS.enabledHint.textContent = enabled 
    ? 'Turn off to stop receiving notifications for this reminder'
    : 'Turn on to receive notifications for this reminder';
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
      
      // Reload settings and update UI
      await loadSettings();
      updateUI();
    }
  });
  
  // Enabled toggle
  ELEMENTS.reminderEnabled.addEventListener('change', async () => {
    const enabled = ELEMENTS.reminderEnabled.checked;
    updateEnabledLabel(enabled);
    
    await sendMessage('TOGGLE_REMINDER_ENABLED', {
      reminderType: currentReminderType,
      enabled,
    });
  });
  
  // Interval preset
  ELEMENTS.intervalPreset.addEventListener('change', async () => {
    const value = ELEMENTS.intervalPreset.value;
    
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
    } else {
      // Revert to previous valid value
      if (currentSettings) {
        const prevInterval = currentSettings.reminders[currentReminderType].intervalMinutes;
        ELEMENTS.intervalCustom.value = prevInterval.toString();
      }
    }
  });
  
  // Snooze duration
  ELEMENTS.snoozeDuration.addEventListener('change', async () => {
    const value = parseInt(ELEMENTS.snoozeDuration.value, 10);
    if (validateSnooze(value)) {
      await sendMessage('SET_REMINDER_SNOOZE', {
        reminderType: currentReminderType,
        snooze: value,
      });
    } else {
      // Revert to default
      ELEMENTS.snoozeDuration.value = currentReminderType === 'eye' ? '5' : '10';
    }
  });
  
  // Idle threshold (global)
  ELEMENTS.idleThreshold.addEventListener('change', async () => {
    const value = parseInt(ELEMENTS.idleThreshold.value, 10);
    if (validateIdleThreshold(value)) {
      await sendMessage('SET_IDLE_THRESHOLD', {
        idleThresholdSeconds: value,
      });
    } else {
      ELEMENTS.idleThreshold.value = '60';
    }
  });
  
  // Reset button
  ELEMENTS.btnReset.addEventListener('click', async () => {
    if (confirm('Are you sure you want to reset all settings to defaults? This will reset both eye break and water reminders.')) {
      await sendMessage('RESET');
      await loadSettings();
      updateUI();
    }
  });
}

// ============================================================================
// MESSAGE HELPERS
// ============================================================================

async function sendMessage(type: string, payload?: Record<string, unknown>): Promise<void> {
  try {
    const message: Message = { type, payload };
    await chrome.runtime.sendMessage(message);
    console.log('[Options] Sent message:', type, payload);
  } catch (error) {
    console.error(`[Options] Failed to send message ${type}:`, error);
  }
}

// ============================================================================
// VALIDATION
// ============================================================================

function validateInterval(value: number): boolean {
  return !isNaN(value) && value >= MIN_INTERVAL && value <= MAX_INTERVAL;
}

function validateSnooze(value: number): boolean {
  return !isNaN(value) && value >= MIN_SNOOZE && value <= MAX_SNOOZE;
}

function validateIdleThreshold(value: number): boolean {
  return !isNaN(value) && value >= MIN_IDLE_THRESHOLD && value <= MAX_IDLE_THRESHOLD;
}
