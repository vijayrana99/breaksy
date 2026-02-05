// Breaksy Extension - TypeScript Types
// Version 2.0.0 - Multi-reminder support

// ============================================================================
// REMINDER TYPES
// ============================================================================

/**
 * Supported reminder types for healthy computer use
 * Extendable for future: 'posture' | 'stretch' | 'walk'
 */
export type ReminderType = 'eye' | 'water';

/**
 * Array of all reminder types for iteration
 */
export const REMINDER_TYPES: ReminderType[] = ['eye', 'water'];

// ============================================================================
// V2 DATA MODELS
// ============================================================================

/**
 * Settings for an individual reminder type
 */
export interface ReminderSettings {
  /** Whether this reminder is enabled */
  enabled: boolean;
  /** How often to show reminders (in minutes) */
  intervalMinutes: number;
  /** How long to snooze when user clicks snooze (in minutes) */
  snoozeMinutes: number;
  /** Notification title template */
  title: string;
  /** Notification message template */
  message: string;
}

/**
 * Runtime state for an individual reminder type
 */
export interface ReminderRuntimeState {
  /** Whether this specific reminder is paused by user action */
  isPaused: boolean;
  /** Milliseconds remaining until next notification */
  remainingMs: number;
  /** Absolute timestamp when timer expires (for persistence across restarts) */
  timerEndsAt: number | null;
  /** When next alarm is scheduled (for debug/UI) */
  nextAlarmAt: number | null;
  /** When notification should trigger */
  nextNotificationAt: number | null;
  /** Last notification timestamp (per-reminder anti-spam) */
  lastNotifiedAt: number | null;
  /** Currently active notification ID for this reminder */
  activeNotificationId: string | null;
}

/**
 * UI preferences stored in settings
 */
export interface UIPreferences {
  /** Last selected reminder type in popup/options */
  lastSelectedReminder?: ReminderType;
}

/**
 * Settings schema version 2 - Multi-reminder support
 */
export interface SettingsV2 {
  /** Schema version for migration */
  version: 2;
  /** Global idle detection threshold (seconds) */
  idleThresholdSeconds: number;
  /** Per-reminder settings keyed by type */
  reminders: Record<ReminderType, ReminderSettings>;
  /** UI preferences */
  ui?: UIPreferences;
}

/**
 * Runtime state schema version 2 - Multi-reminder support
 */
export interface RuntimeStateV2 {
  /** Schema version for migration */
  version: 2;
  /** Global idle state (applies to all reminders) */
  isIdle: boolean;
  /** Timestamp of last user activity */
  lastActiveAt: number;
  /** Per-reminder runtime state keyed by type */
  reminders: Record<ReminderType, ReminderRuntimeState>;
}

// ============================================================================
// LEGACY V1 TYPES (for migration)
// ============================================================================

/**
 * Legacy Settings schema (V1) - Single reminder
 */
export interface SettingsV1 {
  intervalMinutes: number;
  idleThresholdSeconds: number;
  snoozeMinutes: number;
}

/**
 * Legacy RuntimeState schema (V1) - Single reminder
 */
export interface RuntimeStateV1 {
  isPaused: boolean;
  isIdle: boolean;
  remainingMs: number;
  lastActiveAt: number;
  timerEndsAt: number | null;
  nextAlarmAt: number | null;
  nextNotificationAt: number | null;
  lastNotifiedAt: number | null;
  activeNotificationId: string | null;
}

// ============================================================================
// TYPE ALIASES (for cleaner code)
// ============================================================================

/** Current settings type */
export type Settings = SettingsV2;
/** Current runtime state type */
export type RuntimeState = RuntimeStateV2;

// ============================================================================
// DEFAULT VALUES
// ============================================================================

/**
 * Default settings for eye break reminder
 */
export const DEFAULT_EYE_SETTINGS: ReminderSettings = {
  enabled: true,
  intervalMinutes: 20,
  snoozeMinutes: 5,
  title: 'Time for an eye break 👀',
  message: 'Look at something ~20 ft / 6 m away for 20 seconds.',
};

/**
 * Default settings for water reminder
 */
export const DEFAULT_WATER_SETTINGS: ReminderSettings = {
  enabled: false,
  intervalMinutes: 60,
  snoozeMinutes: 10,
  title: 'Time to hydrate 💧',
  message: 'Drink a glass of water.',
};

/**
 * Factory function for default reminder settings
 */
export function getDefaultReminderSettings(type: ReminderType): ReminderSettings {
  switch (type) {
    case 'eye':
      return { ...DEFAULT_EYE_SETTINGS };
    case 'water':
      return { ...DEFAULT_WATER_SETTINGS };
    default:
      return { ...DEFAULT_EYE_SETTINGS };
  }
}

/**
 * Factory function for default reminder runtime state
 */
export function getDefaultReminderState(intervalMinutes: number): ReminderRuntimeState {
  return {
    isPaused: false,
    remainingMs: intervalMinutes * 60 * 1000,
    timerEndsAt: null,
    nextAlarmAt: null,
    nextNotificationAt: null,
    lastNotifiedAt: null,
    activeNotificationId: null,
  };
}

/**
 * Default V2 settings
 */
export const DEFAULT_SETTINGS_V2: SettingsV2 = {
  version: 2,
  idleThresholdSeconds: 60,
  reminders: {
    eye: { ...DEFAULT_EYE_SETTINGS },
    water: { ...DEFAULT_WATER_SETTINGS },
  },
  ui: {
    lastSelectedReminder: 'eye',
  },
};

/**
 * Default V2 runtime state
 */
export const DEFAULT_STATE_V2: RuntimeStateV2 = {
  version: 2,
  isIdle: false,
  lastActiveAt: Date.now(),
  reminders: {
    eye: getDefaultReminderState(DEFAULT_EYE_SETTINGS.intervalMinutes),
    water: getDefaultReminderState(DEFAULT_WATER_SETTINGS.intervalMinutes),
  },
};

// ============================================================================
// LEGACY DEFAULTS (V1 - for reference during migration)
// ============================================================================

export const DEFAULT_SETTINGS_V1: SettingsV1 = {
  intervalMinutes: 20,
  idleThresholdSeconds: 60,
  snoozeMinutes: 5,
};

export const DEFAULT_STATE_V1: RuntimeStateV1 = {
  isPaused: false,
  isIdle: false,
  remainingMs: DEFAULT_SETTINGS_V1.intervalMinutes * 60 * 1000,
  lastActiveAt: Date.now(),
  timerEndsAt: null,
  nextAlarmAt: null,
  nextNotificationAt: null,
  lastNotifiedAt: null,
  activeNotificationId: null,
};

// ============================================================================
// CONSTANTS
// ============================================================================

/** Validation: Minimum interval in minutes */
export const MIN_INTERVAL = 5;
/** Validation: Maximum interval in minutes */
export const MAX_INTERVAL = 240;
/** Validation: Minimum idle threshold in seconds */
export const MIN_IDLE_THRESHOLD = 15;
/** Validation: Maximum idle threshold in seconds */
export const MAX_IDLE_THRESHOLD = 600;
/** Validation: Minimum snooze in minutes */
export const MIN_SNOOZE = 1;
/** Validation: Maximum snooze in minutes */
export const MAX_SNOOZE = 60;

/** Anti-spam window: Minimum time between notifications (60 seconds) */
export const ANTI_SPAM_WINDOW_MS = 60000;

/** Alarm name prefix for all reminders */
export const ALARM_PREFIX = 'breaksy-reminder:';

/**
 * Get full alarm name for a reminder type
 */
export function getAlarmName(type: ReminderType): string {
  return `${ALARM_PREFIX}${type}`;
}

/**
 * Parse reminder type from alarm name
 * Returns null if not a valid reminder alarm
 */
export function parseAlarmType(name: string): ReminderType | null {
  if (!name.startsWith(ALARM_PREFIX)) return null;
  const type = name.slice(ALARM_PREFIX.length) as ReminderType;
  return REMINDER_TYPES.includes(type) ? type : null;
}

/**
 * Parse reminder type from notification ID
 * Format: breaksy-{type}-{timestamp}
 */
export function parseNotificationType(notificationId: string): ReminderType | null {
  for (const type of REMINDER_TYPES) {
    if (notificationId.startsWith(`breaksy-${type}-`)) {
      return type;
    }
  }
  return null;
}

/** Preset interval values for dropdowns */
export const PRESET_INTERVALS = [20, 30, 45, 60, 90, 120];

/** Idle check interval (seconds) */
export const IDLE_CHECK_INTERVAL = 30;

// ============================================================================
// MESSAGING
// ============================================================================

/**
 * Message payload for type-aware commands
 */
export interface MessagePayload {
  reminderType?: ReminderType;
  interval?: number;
  snooze?: number;
  idleThresholdSeconds?: number;
  [key: string]: unknown;
}

/**
 * Message structure for background communication
 */
export interface Message {
  type: string;
  payload?: MessagePayload;
}

/**
 * Type-aware message types
 */
export type MessageType =
  // State queries
  | 'GET_STATE'
  // Type-aware reminder commands
  | 'SET_REMINDER_INTERVAL'
  | 'SET_REMINDER_SNOOZE'
  | 'TOGGLE_REMINDER_PAUSE'
  | 'TOGGLE_REMINDER_ENABLED'
  | 'REMINDER_TRIGGER_NOW'
  | 'REMINDER_SNOOZE'
  // Global commands
  | 'SET_IDLE_THRESHOLD'
  | 'RESET'
  | 'CHECK_NOTIFICATION'
  // Legacy (backward compatibility - map to 'eye')
  | 'SET_INTERVAL'
  | 'SET_SNOOZE'
  | 'TOGGLE_PAUSE'
  | 'TAKE_BREAK_NOW'
  | 'SNOOZE'
  | 'RESUME';

/**
 * Response shape for GET_STATE
 */
export interface StateResponse {
  settings: SettingsV2;
  state: RuntimeStateV2;
  remainingSecondsByType: Record<ReminderType, number>;
}

// ============================================================================
// NOTIFICATION CONTENT
// ============================================================================

/**
 * Get notification content for a reminder type
 */
export function getNotificationContent(type: ReminderType): { title: string; message: string } {
  switch (type) {
    case 'eye':
      return {
        title: 'Time for an eye break 👀',
        message: 'Look at something ~20 ft / 6 m away for 20 seconds.',
      };
    case 'water':
      return {
        title: 'Time to hydrate 💧',
        message: 'Drink a glass of water.',
      };
    default:
      return {
        title: 'Breaksy Reminder',
        message: 'Time for a break!',
      };
  }
}

/**
 * Get action button text for a reminder type
 */
export function getActionButtonText(type: ReminderType): { trigger: string; snooze: string } {
  switch (type) {
    case 'eye':
      return { trigger: 'Take Break Now', snooze: 'Snooze' };
    case 'water':
      return { trigger: 'Drink Water Now', snooze: 'Snooze' };
    default:
      return { trigger: 'Take Break Now', snooze: 'Snooze' };
  }
}
