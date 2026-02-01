import {
  Settings,
  RuntimeState,
  DEFAULT_SETTINGS,
  Message,
  StateResponse,
  ALARM_NAME,
  IDLE_CHECK_INTERVAL,
  ANTI_SPAM_WINDOW_MS,
} from '../shared/types';
import { getSettings, setSettings, getState, setState, getAll } from '../shared/storage';

let idleListenerAdded = false;

chrome.runtime.onInstalled.addListener(async () => {
  console.log('[Breakio] Extension installed');
  await initializeExtension();
  setupIdleListener();
});

chrome.runtime.onStartup.addListener(async () => {
  console.log('[Breakio] Extension startup');
  await restoreState();
  setupIdleListener();
});

async function initializeExtension(): Promise<void> {
  const settings = await getSettings();
  if (!settings || Object.keys(settings).length === 0) {
    await setSettings(DEFAULT_SETTINGS);
  }
  await setState({
    isPaused: false,
    isIdle: false,
    remainingMs: DEFAULT_SETTINGS.intervalMinutes * 60 * 1000,
    lastActiveAt: Date.now(),
    nextAlarmAt: null,
    lastNotifiedAt: null,
    activeNotificationId: null,
  });
  await scheduleReminder();
  console.log('[Breakio] Initialized with defaults');
}

async function restoreState(): Promise<void> {
  const { settings, state } = await getAll();
  const now = Date.now();

  if (state.isPaused) {
    console.log('[Breakio] State restored - currently paused');
    await clearAlarm();
    return;
  }

  if (state.isIdle) {
    console.log('[Breakio] State restored - currently idle');
    await scheduleReminder(state.remainingMs);
    return;
  }

  const elapsed = now - state.lastActiveAt;
  const remaining = Math.max(0, state.remainingMs - elapsed);

  if (remaining <= 0) {
    console.log('[Breakio] Interval elapsed during restart - showing reminder');
    await setState({ remainingMs: settings.intervalMinutes * 60 * 1000, lastActiveAt: now });
    await showNotification();
    await scheduleReminder();
  } else {
    console.log(`[Breakio] State restored - ${remaining}ms remaining`);
    await setState({ remainingMs: remaining, lastActiveAt: now });
    await scheduleReminder(remaining);
  }
}

function setupIdleListener(): void {
  if (idleListenerAdded) return;
  idleListenerAdded = true;
  chrome.idle.onStateChanged.addListener(handleIdleStateChange);
  console.log('[Breakio] Idle listener registered');
}

async function handleIdleStateChange(state: chrome.idle.IdleState): Promise<void> {
  const { settings, state: currentState } = await getAll();
  console.log(`[Breakio] Idle state changed: ${state}`);

  if (state === 'idle' || state === 'locked') {
    if (currentState.isPaused || currentState.isIdle) return;

    const elapsed = Date.now() - currentState.lastActiveAt;
    const remaining = Math.max(0, currentState.remainingMs - elapsed);

    await setState({
      isIdle: true,
      remainingMs: remaining,
    });
    await clearAlarm();
    console.log(`[Breakio] Paused due to idle - ${remaining}ms remaining`);
  } else if (state === 'active') {
    if (!currentState.isIdle || currentState.isPaused) return;

    await setState({
      isIdle: false,
      lastActiveAt: Date.now(),
    });
    await scheduleReminder(currentState.remainingMs);
    console.log('[Breakio] Resumed after idle');
  }
}

async function scheduleReminder(delayMs?: number): Promise<void> {
  const { settings, state } = await getAll();
  const requestedDelay = delayMs ?? state.remainingMs;

  if (state.isPaused || requestedDelay <= 0) {
    await clearAlarm();
    return;
  }

  const elapsed = Date.now() - state.lastActiveAt;
  const newRemainingMs = Math.max(0, requestedDelay - elapsed);

  if (newRemainingMs <= 0) {
    await showNotification();
    await setState({
      remainingMs: settings.intervalMinutes * 60 * 1000,
      lastActiveAt: Date.now(),
    });
    await scheduleReminder();
    return;
  }

  const nextAt = Date.now() + newRemainingMs;
  await setState({ nextAlarmAt: nextAt, remainingMs: newRemainingMs });

  try {
    await chrome.alarms.clear(ALARM_NAME);
    await chrome.alarms.create(ALARM_NAME, { delayInMinutes: newRemainingMs / 60000 });
    console.log(`[Breakio] Alarm scheduled in ${Math.round(newRemainingMs / 1000)}s`);
  } catch (error) {
    console.error('[Breakio] Failed to schedule alarm:', error);
  }
}

async function clearAlarm(): Promise<void> {
  await chrome.alarms.clear(ALARM_NAME);
  await setState({ nextAlarmAt: null });
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM_NAME) return;
  console.log('[Breakio] Alarm triggered');

  const { settings, state } = await getAll();
  if (state.isPaused || state.isIdle) {
    console.log('[Breakio] Ignoring alarm - paused or idle');
    return;
  }

  await showNotification();
  await setState({
    remainingMs: settings.intervalMinutes * 60 * 1000,
    lastActiveAt: Date.now(),
  });
  await scheduleReminder();
});

async function showNotification(): Promise<void> {
  const { settings, state } = await getAll();
  const now = Date.now();

  if (state.activeNotificationId) {
    try {
      const notifications = await chrome.notifications.getAll();
      if (notifications[state.activeNotificationId]) {
        console.log('[Breakio] Active notification already exists');
        return;
      }
      await setState({ activeNotificationId: null });
    } catch {
      await setState({ activeNotificationId: null });
    }
  }

  if (state.lastNotifiedAt && now - state.lastNotifiedAt < ANTI_SPAM_WINDOW_MS) {
    console.log('[Breakio] Skipping notification - within anti-spam window');
    return;
  }

  const notificationId = `breakio-${Date.now()}`;
  const buttons: chrome.notifications.ButtonOptions[] = [
    { title: `Snooze ${settings.snoozeMinutes} min` },
    { title: 'Pause' },
  ];

  try {
    await chrome.notifications.create(notificationId, {
      type: 'basic',
      title: 'Time for an eye break 👀',
      message: `Look at something ~20 ft / 6 m away for ${settings.breakDurationSeconds} seconds.`,
      iconUrl: 'src/assets/icon128.png',
      buttons,
      requireInteraction: true,
    });

    await setState({
      activeNotificationId: notificationId,
      lastNotifiedAt: now,
    });
    console.log('[Breakio] Notification shown');
  } catch (error) {
    console.error('[Breakio] Failed to show notification:', error);
  }
}

chrome.notifications.onButtonClicked.addListener(async (notificationId, buttonIndex) => {
  const { settings, state } = await getAll();
  if (notificationId !== state.activeNotificationId) return;

  if (buttonIndex === 0) {
    await handleSnooze();
  } else if (buttonIndex === 1) {
    await handlePauseToggle();
  }
});

chrome.notifications.onClicked.addListener(async (notificationId) => {
  const { state } = await getAll();
  if (notificationId === state.activeNotificationId) {
    await setState({ activeNotificationId: null });
  }
});

chrome.notifications.onClosed.addListener(async (notificationId, byUser) => {
  const { state } = await getAll();
  if (notificationId === state.activeNotificationId) {
    await setState({ activeNotificationId: null });
  }
});

async function handleSnooze(): Promise<void> {
  const { settings } = await getAll();
  const snoozeMs = settings.snoozeMinutes * 60 * 1000;

  await setState({
    activeNotificationId: null,
    remainingMs: snoozeMs,
    lastActiveAt: Date.now(),
  });
  await scheduleReminder(snoozeMs);
  console.log(`[Breakio] Snoozed for ${settings.snoozeMinutes} min`);
}

async function handlePauseToggle(): Promise<void> {
  const { state } = await getAll();

  if (state.isPaused) {
    await handleResume();
  } else {
    await handlePause();
  }
}

async function handlePause(): Promise<void> {
  await setState({
    isPaused: true,
    activeNotificationId: null,
  });
  await clearAlarm();
  console.log('[Breakio] Paused');
}

async function handleResume(): Promise<void> {
  const { settings, state } = await getAll();

  await setState({ isPaused: false });

  if (state.remainingMs <= 0) {
    await setState({
      remainingMs: settings.intervalMinutes * 60 * 1000,
      lastActiveAt: Date.now(),
    });
  }

  if (!state.isIdle) {
    await scheduleReminder();
  }
  console.log('[Breakio] Resumed');
}

async function handleTakeBreakNow(): Promise<void> {
  const { settings, state } = await getAll();

  if (state.lastNotifiedAt && Date.now() - state.lastNotifiedAt < ANTI_SPAM_WINDOW_MS) {
    console.log('[Breakio] Take Break Now ignored - within anti-spam window');
    return;
  }

  await setState({ activeNotificationId: null, lastNotifiedAt: null });
  await showNotification();
  console.log('[Breakio] Take Break Now triggered');
}

chrome.runtime.onMessage.addListener((message: Message, sender, sendResponse) => {
  console.log('[Background] Received message:', message.type, message.payload);
  (async () => {
    try {
      switch (message.type) {
        case 'GET_STATE': {
          const { settings, state } = await getAll();
          const remainingSeconds = Math.max(0, Math.ceil(state.remainingMs / 1000));
          sendResponse({
            settings,
            state,
            remainingSeconds,
          } as StateResponse);
          break;
        }
        case 'SET_INTERVAL': {
          const interval = message.payload?.interval as number;
          if (typeof interval !== 'number') return;
          await setSettings({ intervalMinutes: interval });
          const { state } = await getAll();
          if (!state.isPaused && !state.isIdle) {
            await setState({ remainingMs: interval * 60 * 1000, lastActiveAt: Date.now() });
            await scheduleReminder();
          }
          sendResponse({ success: true });
          break;
        }
        case 'SET_BREAK_DURATION': {
          const duration = message.payload?.duration as number;
          if (typeof duration !== 'number') return;
          await setSettings({ breakDurationSeconds: duration });
          sendResponse({ success: true });
          break;
        }
        case 'SET_SNOOZE': {
          const snooze = message.payload?.snooze as number;
          if (typeof snooze !== 'number') return;
          await setSettings({ snoozeMinutes: snooze });
          sendResponse({ success: true });
          break;
        }
        case 'TOGGLE_PAUSE': {
          await handlePauseToggle();
          sendResponse({ success: true });
          break;
        }
        case 'TAKE_BREAK_NOW': {
          await handleTakeBreakNow();
          sendResponse({ success: true });
          break;
        }
        case 'SNOOZE': {
          await handleSnooze();
          sendResponse({ success: true });
          break;
        }
        case 'RESUME': {
          await handleResume();
          sendResponse({ success: true });
          break;
        }
        case 'RESET': {
          await resetToDefaults();
          await initializeExtension();
          sendResponse({ success: true });
          break;
        }
      }
    } catch (error) {
      console.error('[Breakio] Message handler error:', error);
      sendResponse({ error: String(error) });
    }
  })();
  return true;
});

async function resetToDefaults(): Promise<void> {
  const { setSettings: setS, setState: setSt } = await import('../shared/storage');
  await setS(DEFAULT_SETTINGS);
  await setSt({
    isPaused: false,
    isIdle: false,
    remainingMs: DEFAULT_SETTINGS.intervalMinutes * 60 * 1000,
    lastActiveAt: Date.now(),
    nextAlarmAt: null,
    lastNotifiedAt: null,
    activeNotificationId: null,
  });
}

console.log('[Breakio] Service worker loaded');
