const STORAGE_KEYS = {
  SETTINGS: 'breakio-settings',
  STATE: 'breakio-state',
};

const DEFAULT_SETTINGS = {
  intervalMinutes: 20,
  breakDurationSeconds: 20,
  idleThresholdSeconds: 60,
  snoozeMinutes: 1,
};

const DEFAULT_STATE = {
  isPaused: false,
  isIdle: false,
  remainingMs: DEFAULT_SETTINGS.intervalMinutes * 60 * 1000,
  lastActiveAt: Date.now(),
  nextAlarmAt: null,
  nextNotificationAt: null,
  lastNotifiedAt: null,
  activeNotificationId: null,
};

const ALARM_NAME = 'breakio-reminder';
const ANTI_SPAM_WINDOW_MS = 60000;

let idleListenerAdded = false;

async function getSettings() {
  const result = await chrome.storage.sync.get(STORAGE_KEYS.SETTINGS);
  return result[STORAGE_KEYS.SETTINGS] || { ...DEFAULT_SETTINGS };
}

async function setSettings(settings) {
  const current = await getSettings();
  const merged = { ...current, ...settings };
  await chrome.storage.sync.set({ [STORAGE_KEYS.SETTINGS]: merged });
}

async function getState() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.STATE);
  return result[STORAGE_KEYS.STATE] || { ...DEFAULT_STATE };
}

async function setState(state) {
  const current = await getState();
  const merged = { ...current, ...state };
  await chrome.storage.local.set({ [STORAGE_KEYS.STATE]: merged });
}

async function getAll() {
  const [settings, state] = await Promise.all([getSettings(), getState()]);
  return { settings, state };
}

async function initializeExtension() {
  const settings = await getSettings();
  if (!settings || Object.keys(settings).length === 0) {
    await setSettings(DEFAULT_SETTINGS);
  }

  const existingState = await getState();
  if (!existingState || Object.keys(existingState).length === 0) {
    await setState({
      isPaused: false,
      isIdle: false,
      remainingMs: DEFAULT_SETTINGS.intervalMinutes * 60 * 1000,
      lastActiveAt: Date.now(),
      nextAlarmAt: null,
      nextNotificationAt: null,
      lastNotifiedAt: null,
      activeNotificationId: null,
    });
  }

  await scheduleReminder();
  console.log('[Breakio] Initialized with defaults');
}

async function restoreState() {
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
    await setState({ remainingMs: settings.intervalMinutes * 60 * 1000, lastActiveAt: now, nextNotificationAt: now });
    await showNotification();
    await scheduleReminder();
  } else {
    console.log(`[Breakio] State restored - ${remaining}ms remaining`);
    await setState({ remainingMs: remaining });
    await scheduleReminder(remaining);
  }
}

function setupIdleListener() {
  if (idleListenerAdded) return;
  idleListenerAdded = true;
  chrome.idle.onStateChanged.addListener(handleIdleStateChange);
  console.log('[Breakio] Idle listener registered');
}

async function handleIdleStateChange(state) {
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

async function scheduleReminder(delayMs) {
  const { settings, state } = await getAll();
  const requestedDelay = delayMs ?? state.remainingMs;

  if (state.isPaused || requestedDelay <= 0) {
    await clearAlarm();
    return;
  }

  const elapsed = Date.now() - state.lastActiveAt;
  const newRemainingMs = Math.max(0, requestedDelay - elapsed);

  const nextNotificationTime = Date.now() + newRemainingMs;

  const nextAt = Date.now() + newRemainingMs;
  await setState({ nextAlarmAt: nextAt, remainingMs: newRemainingMs, nextNotificationAt: nextNotificationTime });

  try {
    await chrome.alarms.clear(ALARM_NAME);
    const delayMinutes = Math.max(1, newRemainingMs / 60000);
    await chrome.alarms.create(ALARM_NAME, { delayInMinutes: delayMinutes });
    console.log(`[Breakio] Alarm scheduled in ${Math.round(newRemainingMs / 1000)}s`);
  } catch (error) {
    console.error('[Breakio] Failed to schedule alarm:', error);
  }
}

async function clearAlarm() {
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
    nextNotificationAt: null,
  });
  await scheduleReminder();
});

async function showNotification() {
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
  const buttons = [
    { title: `Snooze ${settings.snoozeMinutes} min` },
    { title: 'Pause' },
  ];

  try {
    await chrome.notifications.create(notificationId, {
      type: 'basic',
      title: 'Time for an eye break 👀',
      message: `Look at something ~20 ft / 6 m away for ${settings.breakDurationSeconds} seconds.`,
      iconUrl: chrome.runtime.getURL('src/assets/icon128.png'),
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

async function handleSnooze() {
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

async function handlePauseToggle() {
  const { state } = await getAll();

  if (state.isPaused) {
    await handleResume();
  } else {
    await handlePause();
  }
}

async function handlePause() {
  await setState({
    isPaused: true,
    activeNotificationId: null,
  });
  await clearAlarm();
  console.log('[Breakio] Paused');
}

async function handleResume() {
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

async function handleTakeBreakNow() {
  const { settings, state } = await getAll();

  if (state.lastNotifiedAt && Date.now() - state.lastNotifiedAt < ANTI_SPAM_WINDOW_MS) {
    console.log('[Breakio] Take Break Now ignored - within anti-spam window');
    return;
  }

  await setState({
    activeNotificationId: null,
    lastNotifiedAt: null,
    remainingMs: settings.intervalMinutes * 60 * 1000,
    lastActiveAt: Date.now(),
  });
  await showNotification();
  console.log('[Breakio] Take Break Now triggered');
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Background] Received message:', message.type, message.payload);
  (async () => {
    try {
      switch (message.type) {
        case 'GET_STATE': {
          const { settings, state } = await getAll();
          const remainingSeconds = Math.max(0, Math.ceil(state.remainingMs / 1000));
          sendResponse({ settings, state, remainingSeconds });
          break;
        }
        case 'SET_INTERVAL': {
          const interval = message.payload?.interval;
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
          const duration = message.payload?.duration;
          if (typeof duration !== 'number') return;
          await setSettings({ breakDurationSeconds: duration });
          sendResponse({ success: true });
          break;
        }
        case 'SET_SNOOZE': {
          const snooze = message.payload?.snooze;
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
        case 'CHECK_NOTIFICATION': {
          const { settings, state } = await getAll();
          const now = Date.now();

          if (state.isPaused || state.isIdle) {
            sendResponse({ triggered: false, reason: 'paused or idle' });
            break;
          }

          if (!state.nextNotificationAt || now < state.nextNotificationAt) {
            sendResponse({ triggered: false, reason: 'not yet time' });
            break;
          }

          if (state.activeNotificationId) {
            try {
              const notifications = await chrome.notifications.getAll();
              if (notifications[state.activeNotificationId]) {
                sendResponse({ triggered: false, reason: 'already shown' });
                break;
              }
            } catch {
              await setState({ activeNotificationId: null });
            }
          }

          if (state.lastNotifiedAt && now - state.lastNotifiedAt < ANTI_SPAM_WINDOW_MS) {
            sendResponse({ triggered: false, reason: 'anti-spam' });
            break;
          }

          await showNotification();
          await setState({
            remainingMs: settings.intervalMinutes * 60 * 1000,
            lastActiveAt: Date.now(),
            nextNotificationAt: null,
          });
          await scheduleReminder();
          sendResponse({ triggered: true });
          break;
        }
        case 'RESET': {
          await setSettings(DEFAULT_SETTINGS);
          await setState({
            isPaused: false,
            isIdle: false,
            remainingMs: DEFAULT_SETTINGS.intervalMinutes * 60 * 1000,
            lastActiveAt: Date.now(),
            nextAlarmAt: null,
            nextNotificationAt: null,
            lastNotifiedAt: null,
            activeNotificationId: null,
          });
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

console.log('[Breakio] Service worker loaded');
