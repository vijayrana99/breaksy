import {
  SettingsV2,
  RuntimeStateV2,
  SettingsV1,
  RuntimeStateV1,
  DEFAULT_SETTINGS_V2,
  DEFAULT_STATE_V2,
  DEFAULT_COUNTER_DISPLAY_SETTINGS,
  ReminderType,
  REMINDER_TYPES,
  getDefaultReminderSettings,
  getDefaultReminderState,
} from './types';

const STORAGE_KEYS = {
  SETTINGS: 'breaksy-settings',
  STATE: 'breaksy-state',
} as const;

// ============================================================================
// MIGRATION FUNCTIONS
// ============================================================================

/**
 * Check if settings is in V1 format (legacy)
 */
function isSettingsV1(settings: unknown): settings is SettingsV1 {
  if (!settings || typeof settings !== 'object') return false;
  const s = settings as Record<string, unknown>;
  // V1 has intervalMinutes directly, V2 has version and reminders object
  return !('version' in s) && 'intervalMinutes' in s && !('reminders' in s);
}

/**
 * Check if runtime state is in V1 format (legacy)
 */
function isRuntimeStateV1(state: unknown): state is RuntimeStateV1 {
  if (!state || typeof state !== 'object') return false;
  const s = state as Record<string, unknown>;
  // V1 has direct properties, V2 has version and reminders object
  return !('version' in s) && 'isPaused' in s && !('reminders' in s);
}

/**
 * Migrate V1 settings to V2 format
 * Maps old single-reminder settings to eye reminder, adds water with defaults
 */
function migrateSettingsV1ToV2(v1: SettingsV1): SettingsV2 {
  console.log('[Breaksy] Migrating settings from V1 to V2');

  return {
    version: 2,
    idleThresholdSeconds: v1.idleThresholdSeconds ?? 60,
    reminders: {
      eye: {
        enabled: true, // Preserve existing behavior - eye was always enabled in V1
        intervalMinutes: v1.intervalMinutes ?? 20,
        snoozeMinutes: v1.snoozeMinutes ?? 5,
        title: 'Time for an eye break 👀',
        message: 'Look at something ~20 ft / 6 m away for 20 seconds.',
        counterDisplay: { ...DEFAULT_COUNTER_DISPLAY_SETTINGS, badgePriority: 'high' },
      },
      water: {
        enabled: false, // New reminder starts disabled
        intervalMinutes: 60,
        snoozeMinutes: 10,
        title: 'Time to hydrate 💧',
        message: 'Drink a glass of water.',
        counterDisplay: { ...DEFAULT_COUNTER_DISPLAY_SETTINGS, badgePriority: 'low' },
      },
    },
    ui: {
      lastSelectedReminder: 'eye',
    },
  };
}

/**
 * Migrate V1 runtime state to V2 format
 * Maps old single timer state to eye reminder, creates fresh state for water
 */
function migrateRuntimeStateV1ToV2(v1: RuntimeStateV1, settings: SettingsV2): RuntimeStateV2 {
  console.log('[Breaksy] Migrating runtime state from V1 to V2');
  
  // Calculate remaining time from V1 timerEndsAt if available
  const now = Date.now();
  let eyeRemainingMs = v1.remainingMs ?? settings.reminders.eye.intervalMinutes * 60 * 1000;
  
  if (v1.timerEndsAt) {
    eyeRemainingMs = Math.max(0, v1.timerEndsAt - now);
  }
  
  return {
    version: 2,
    isIdle: v1.isIdle ?? false,
    lastActiveAt: v1.lastActiveAt ?? now,
    reminders: {
      eye: {
        isPaused: v1.isPaused ?? false,
        remainingMs: eyeRemainingMs,
        timerEndsAt: v1.timerEndsAt ?? null,
        nextAlarmAt: v1.nextAlarmAt ?? null,
        nextNotificationAt: v1.nextNotificationAt ?? null,
        lastNotifiedAt: v1.lastNotifiedAt ?? null,
        activeNotificationId: v1.activeNotificationId ?? null,
      },
      water: getDefaultReminderState(settings.reminders.water.intervalMinutes),
    },
  };
}

/**
 * Ensure V2 settings has all required reminder keys
 * Fills in any missing reminders with defaults
 */
function ensureCompleteV2Settings(settings: Partial<SettingsV2>): SettingsV2 {
  const complete: SettingsV2 = {
    version: 2,
    idleThresholdSeconds: settings.idleThresholdSeconds ?? 60,
    reminders: {} as Record<ReminderType, ReturnType<typeof getDefaultReminderSettings>>,
    ui: {
      lastSelectedReminder: settings.ui?.lastSelectedReminder ?? 'eye',
    },
  };
  
  // Ensure each reminder type exists
  for (const type of REMINDER_TYPES) {
    if (settings.reminders?.[type]) {
      complete.reminders[type] = {
        ...getDefaultReminderSettings(type),
        ...settings.reminders[type],
      };
    } else {
      complete.reminders[type] = getDefaultReminderSettings(type);
    }
  }
  
  return complete;
}

/**
 * Ensure V2 runtime state has all required reminder keys
 * Fills in any missing reminders with defaults
 */
function ensureCompleteV2State(
  state: Partial<RuntimeStateV2>,
  settings: SettingsV2
): RuntimeStateV2 {
  const complete: RuntimeStateV2 = {
    version: 2,
    isIdle: state.isIdle ?? false,
    lastActiveAt: state.lastActiveAt ?? Date.now(),
    reminders: {} as Record<ReminderType, ReturnType<typeof getDefaultReminderState>>,
  };
  
  // Ensure each reminder type exists
  for (const type of REMINDER_TYPES) {
    if (state.reminders?.[type]) {
      complete.reminders[type] = {
        ...getDefaultReminderState(settings.reminders[type].intervalMinutes),
        ...state.reminders[type],
      };
    } else {
      complete.reminders[type] = getDefaultReminderState(settings.reminders[type].intervalMinutes);
    }
  }
  
  return complete;
}

// ============================================================================
// STORAGE API
// ============================================================================

/**
 * Get settings from storage, migrating from V1 if needed
 * Idempotent - safe to call multiple times
 */
export async function getSettings(): Promise<SettingsV2> {
  try {
    const result = await chrome.storage.sync.get(STORAGE_KEYS.SETTINGS);
    const raw = result[STORAGE_KEYS.SETTINGS];
    
  // No settings exist - return defaults AND save them
  if (!raw) {
    console.log('[Breaksy] No settings found, using defaults');
    const defaults = { ...DEFAULT_SETTINGS_V2 };
    // IMPORTANT: Save defaults to storage so popup can read them
    await chrome.storage.sync.set({ [STORAGE_KEYS.SETTINGS]: defaults });
    return defaults;
  }
    
    // V1 format detected - migrate and save
    if (isSettingsV1(raw)) {
      console.log('[Breaksy] V1 settings detected, migrating');
      const migrated = migrateSettingsV1ToV2(raw);
      await chrome.storage.sync.set({ [STORAGE_KEYS.SETTINGS]: migrated });
      return migrated;
    }
    
    // V2 format - ensure completeness and return
    const settings = ensureCompleteV2Settings(raw as Partial<SettingsV2>);
    
    // If we had to fill in missing data, save it back
    if (JSON.stringify(settings) !== JSON.stringify(raw)) {
      await chrome.storage.sync.set({ [STORAGE_KEYS.SETTINGS]: settings });
    }
    
    return settings;
  } catch (error) {
    console.error('[Breaksy] Failed to get settings:', error);
    return { ...DEFAULT_SETTINGS_V2 };
  }
}

/**
 * Update settings (partial update, merges with existing)
 */
export async function setSettings(settings: Partial<SettingsV2>): Promise<void> {
  try {
    const current = await getSettings();
    const merged: SettingsV2 = {
      ...current,
      ...settings,
      reminders: { ...current.reminders },
    };
    
    // Deep merge reminders if provided
    if (settings.reminders) {
      for (const type of REMINDER_TYPES) {
        if (settings.reminders[type]) {
          merged.reminders[type] = {
            ...current.reminders[type],
            ...settings.reminders[type],
          };
        }
      }
    }
    
    // Deep merge UI if provided
    if (settings.ui) {
      merged.ui = {
        ...current.ui,
        ...settings.ui,
      };
    }
    
    await chrome.storage.sync.set({ [STORAGE_KEYS.SETTINGS]: merged });
  } catch (error) {
    console.error('[Breaksy] Failed to set settings:', error);
    throw error;
  }
}

/**
 * Get runtime state from storage, migrating from V1 if needed
 * Requires settings to properly initialize missing reminders
 */
export async function getState(): Promise<RuntimeStateV2> {
  try {
    // Get settings first (needed for defaults)
    const settings = await getSettings();
    
    const result = await chrome.storage.local.get(STORAGE_KEYS.STATE);
    const raw = result[STORAGE_KEYS.STATE];
    
  // No state exists - return defaults
  if (!raw) {
    console.log('[Breaksy] No runtime state found, using defaults');
    const defaults = { ...DEFAULT_STATE_V2 };
    // Update with current settings intervals
    for (const type of REMINDER_TYPES) {
      defaults.reminders[type].remainingMs = settings.reminders[type].intervalMinutes * 60 * 1000;
    }
    // IMPORTANT: Save defaults to storage so popup can read them
    await chrome.storage.local.set({ [STORAGE_KEYS.STATE]: defaults });
    return defaults;
  }
    
    // V1 format detected - migrate and save
    if (isRuntimeStateV1(raw)) {
      console.log('[Breaksy] V1 runtime state detected, migrating');
      const migrated = migrateRuntimeStateV1ToV2(raw, settings);
      await chrome.storage.local.set({ [STORAGE_KEYS.STATE]: migrated });
      return migrated;
    }
    
    // V2 format - ensure completeness and return
    const state = ensureCompleteV2State(raw as Partial<RuntimeStateV2>, settings);
    
    // If we had to fill in missing data, save it back
    if (JSON.stringify(state) !== JSON.stringify(raw)) {
      await chrome.storage.local.set({ [STORAGE_KEYS.STATE]: state });
    }
    
    return state;
  } catch (error) {
    console.error('[Breaksy] Failed to get runtime state:', error);
    return { ...DEFAULT_STATE_V2 };
  }
}

/**
 * Update runtime state (partial update, merges with existing)
 */
export async function setState(state: Partial<RuntimeStateV2>): Promise<void> {
  try {
    const current = await getState();
    const merged: RuntimeStateV2 = {
      ...current,
      ...state,
      reminders: { ...current.reminders },
    };
    
    // Deep merge reminders if provided
    if (state.reminders) {
      for (const type of REMINDER_TYPES) {
        if (state.reminders[type]) {
          merged.reminders[type] = {
            ...current.reminders[type],
            ...state.reminders[type],
          };
        }
      }
    }
    
    await chrome.storage.local.set({ [STORAGE_KEYS.STATE]: merged });
  } catch (error) {
    console.error('[Breaksy] Failed to set runtime state:', error);
    throw error;
  }
}

/**
 * Get both settings and state in parallel
 */
export async function getAll(): Promise<{ settings: SettingsV2; state: RuntimeStateV2 }> {
  const [settings, state] = await Promise.all([getSettings(), getState()]);
  return { settings, state };
}

/**
 * Reset all settings and state to defaults
 */
export async function resetToDefaults(): Promise<void> {
  try {
    await Promise.all([
      chrome.storage.sync.set({ [STORAGE_KEYS.SETTINGS]: { ...DEFAULT_SETTINGS_V2 } }),
      chrome.storage.local.set({ [STORAGE_KEYS.STATE]: { ...DEFAULT_STATE_V2 } }),
    ]);
    console.log('[Breaksy] Reset to defaults complete');
  } catch (error) {
    console.error('[Breaksy] Failed to reset to defaults:', error);
    throw error;
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Update settings for a specific reminder type
 */
export async function updateReminderSettings(
  type: ReminderType,
  patch: Partial<SettingsV2['reminders'][ReminderType]>
): Promise<void> {
  const current = await getSettings();
  const updated = {
    ...current.reminders[type],
    ...patch,
  };
  
  await setSettings({
    reminders: {
      ...current.reminders,
      [type]: updated,
    },
  });
}

/**
 * Update runtime state for a specific reminder type
 */
export async function updateReminderState(
  type: ReminderType,
  patch: Partial<RuntimeStateV2['reminders'][ReminderType]>
): Promise<void> {
  const current = await getState();
  const updated = {
    ...current.reminders[type],
    ...patch,
  };
  
  await setState({
    reminders: {
      ...current.reminders,
      [type]: updated,
    },
  });
}

/**
 * Update global settings (non-reminder specific)
 */
export async function updateGlobalSettings(
  patch: Pick<SettingsV2, 'idleThresholdSeconds'> & { ui?: SettingsV2['ui'] }
): Promise<void> {
  await setSettings(patch);
}

/**
 * Set the last selected reminder type (for UI persistence)
 */
export async function setLastSelectedReminder(type: ReminderType): Promise<void> {
  await setSettings({
    ui: { lastSelectedReminder: type },
  });
}

/**
 * Get remaining seconds for each reminder type
 */
export function calculateRemainingSeconds(
  state: RuntimeStateV2,
  now: number = Date.now()
): Record<ReminderType, number> {
  const result: Partial<Record<ReminderType, number>> = {};
  
  for (const type of REMINDER_TYPES) {
    const reminderState = state.reminders[type];
    if (reminderState.timerEndsAt) {
      result[type] = Math.max(0, Math.ceil((reminderState.timerEndsAt - now) / 1000));
    } else {
      result[type] = Math.max(0, Math.ceil(reminderState.remainingMs / 1000));
    }
  }
  
  return result as Record<ReminderType, number>;
}
