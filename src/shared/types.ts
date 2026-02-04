export interface Settings {
  intervalMinutes: number;
  idleThresholdSeconds: number;
  snoozeMinutes: number;
}

export interface RuntimeState {
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

export interface Message {
  type: string;
  payload?: Record<string, unknown>;
}

export type MessageType =
  | 'GET_STATE'
  | 'SET_INTERVAL'
  | 'SET_SNOOZE'
  | 'TOGGLE_PAUSE'
  | 'TAKE_BREAK_NOW'
  | 'SNOOZE'
  | 'RESUME'
  | 'RESET'
  | 'CHECK_NOTIFICATION';

export interface StateResponse {
  settings: Settings;
  state: RuntimeState;
  remainingSeconds: number;
}

export const DEFAULT_SETTINGS: Settings = {
  intervalMinutes: 20,
  idleThresholdSeconds: 60,
  snoozeMinutes: 1,
};

export const DEFAULT_STATE: RuntimeState = {
  isPaused: false,
  isIdle: false,
  remainingMs: DEFAULT_SETTINGS.intervalMinutes * 60 * 1000,
  lastActiveAt: Date.now(),
  timerEndsAt: null,
  nextAlarmAt: null,
  nextNotificationAt: null,
  lastNotifiedAt: null,
  activeNotificationId: null,
};

export const PRESET_INTERVALS = [20, 30, 45, 60, 90, 120];
export const MIN_INTERVAL = 1;
export const MAX_INTERVAL = 240;
export const MIN_IDLE_THRESHOLD = 15;
export const MAX_IDLE_THRESHOLD = 600;
export const MIN_SNOOZE = 1;
export const MAX_SNOOZE = 60;
export const ANTI_SPAM_WINDOW_MS = 60000;
export const ALARM_NAME = 'breakio-reminder';
export const IDLE_CHECK_INTERVAL = 30;
