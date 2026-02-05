import {
  ReminderType,
  REMINDER_TYPES,
  Message,
  StateResponse,
  getAlarmName,
  parseAlarmType,
  parseNotificationType,
  getNotificationContent,
  ANTI_SPAM_WINDOW_MS,
  RuntimeStateV2,
  DEFAULT_SETTINGS_V2,
} from '../shared/types';
import {
  getSettings,
  setSettings,
  getState,
  setState,
  getAll,
  calculateRemainingSeconds,
  updateReminderState,
} from '../shared/storage';

let idleListenerAdded = false;

// ============================================================================
// LIFECYCLE EVENTS
// ============================================================================

chrome.runtime.onInstalled.addListener(async () => {
  console.log('[Breaksy] Extension installed');
  await initializeExtension();
  setupIdleListener();
});

chrome.runtime.onStartup.addListener(async () => {
  console.log('[Breaksy] Extension startup');
  await restoreState();
  setupIdleListener();
});

// ============================================================================
// INITIALIZATION & STATE RESTORATION
// ============================================================================

/**
 * Initialize extension on first install
 * Sets up defaults and schedules alarms for enabled reminders
 */
async function initializeExtension(): Promise<void> {
  const { settings, state } = await getAll();
  
  // Schedule alarms for all enabled, non-paused reminders
  for (const type of REMINDER_TYPES) {
    const reminderSettings = settings.reminders[type];
    const reminderState = state.reminders[type];
    
    if (reminderSettings.enabled && !reminderState.isPaused && !state.isIdle) {
      const delayMs = reminderState.remainingMs > 0 
        ? reminderState.remainingMs 
        : reminderSettings.intervalMinutes * 60 * 1000;
      
      await scheduleReminder(type, delayMs);
      console.log(`[Breaksy] Initialized ${type} reminder with ${Math.round(delayMs / 1000)}s`);
    }
  }
  
  console.log('[Breaksy] Extension initialized');
}

/**
 * Restore state after browser restart
 * Recalculates remaining time and schedules appropriate alarms
 */
async function restoreState(): Promise<void> {
  const { settings, state } = await getAll();
  const now = Date.now();
  
  console.log('[Breaksy] Restoring state...');
  
  // Handle global idle state
  if (state.isIdle) {
    console.log('[Breaksy] System was idle on shutdown, preserving remaining times');
    // Don't schedule alarms while idle - wait for idle state change
    return;
  }
  
  // Restore each reminder independently
  for (const type of REMINDER_TYPES) {
    const reminderSettings = settings.reminders[type];
    const reminderState = state.reminders[type];
    
    // Skip disabled reminders
    if (!reminderSettings.enabled) {
      await clearReminderAlarm(type);
      continue;
    }
    
    // Skip paused reminders
    if (reminderState.isPaused) {
      console.log(`[Breaksy] ${type} reminder is paused`);
      await clearReminderAlarm(type);
      continue;
    }
    
    // Calculate remaining time
    let remainingMs: number;
    
    if (reminderState.timerEndsAt) {
      remainingMs = Math.max(0, reminderState.timerEndsAt - now);
    } else {
      remainingMs = reminderState.remainingMs;
    }
    
    if (remainingMs <= 0) {
      // Timer elapsed during restart - show notification (respect anti-spam)
      console.log(`[Breaksy] ${type} timer elapsed during restart`);
      
      if (shouldShowNotification(reminderState)) {
        await showReminderNotification(type);
      }
      
      // Reset timer and schedule next
      const intervalMs = reminderSettings.intervalMinutes * 60 * 1000;
      await updateReminderState(type, {
        remainingMs: intervalMs,
        timerEndsAt: now + intervalMs,
      });
      await scheduleReminder(type, intervalMs);
    } else {
      // Resume countdown from remaining time
      console.log(`[Breaksy] ${type} reminder resuming with ${Math.round(remainingMs / 1000)}s remaining`);
      await scheduleReminder(type, remainingMs);
    }
  }
  
  console.log('[Breaksy] State restoration complete');
}

// ============================================================================
// ALARM MANAGEMENT
// ============================================================================

/**
 * Schedule an alarm for a specific reminder type
 * Only schedules if reminder is enabled, not paused, and not idle
 */
async function scheduleReminder(type: ReminderType, delayMs?: number): Promise<void> {
  const { settings, state } = await getAll();
  const reminderSettings = settings.reminders[type];
  const reminderState = state.reminders[type];
  
  // Don't schedule if disabled
  if (!reminderSettings.enabled) {
    await clearReminderAlarm(type);
    return;
  }
  
  // Don't schedule if paused
  if (reminderState.isPaused) {
    await clearReminderAlarm(type);
    return;
  }
  
  // Don't schedule if system is idle
  if (state.isIdle) {
    await clearReminderAlarm(type);
    return;
  }
  
  const now = Date.now();
  
  // Calculate delay to use
  let delayToUse = delayMs;
  if (!delayToUse && reminderState.timerEndsAt) {
    delayToUse = Math.max(0, reminderState.timerEndsAt - now);
  }
  
  const finalDelay = delayToUse ?? reminderSettings.intervalMinutes * 60 * 1000;
  
  if (finalDelay <= 0) {
    await clearReminderAlarm(type);
    return;
  }
  
  const timerEndsAt = now + finalDelay;
  const alarmName = getAlarmName(type);
  
  // Update state
  await updateReminderState(type, {
    remainingMs: finalDelay,
    timerEndsAt,
    nextAlarmAt: timerEndsAt,
    nextNotificationAt: timerEndsAt,
  });
  
  // Schedule alarm (minimum 1 minute for chrome.alarms)
  try {
    await chrome.alarms.clear(alarmName);
    const delayMinutes = Math.max(1, finalDelay / 60000);
    await chrome.alarms.create(alarmName, { delayInMinutes: delayMinutes });
    console.log(`[Breaksy] Scheduled ${type} alarm in ${Math.round(finalDelay / 1000)}s`);
  } catch (error) {
    console.error(`[Breaksy] Failed to schedule ${type} alarm:`, error);
  }
}

/**
 * Clear alarm for a specific reminder type
 */
async function clearReminderAlarm(type: ReminderType): Promise<void> {
  const alarmName = getAlarmName(type);
  await chrome.alarms.clear(alarmName);
  
  // Update state to reflect no alarm scheduled
  const state = await getState();
  if (state.reminders[type].nextAlarmAt !== null) {
    await updateReminderState(type, {
      nextAlarmAt: null,
    });
  }
}

/**
 * Handle alarm firing
 */
chrome.alarms.onAlarm.addListener(async (alarm) => {
  const type = parseAlarmType(alarm.name);
  if (!type) return; // Not our alarm
  
  console.log(`[Breaksy] ${type} alarm fired`);
  
  const { settings, state } = await getAll();
  const reminderSettings = settings.reminders[type];
  const reminderState = state.reminders[type];
  
  // Guards - don't proceed if conditions aren't right
  if (!reminderSettings.enabled) {
    console.log(`[Breaksy] ${type} reminder disabled, clearing alarm`);
    await clearReminderAlarm(type);
    return;
  }
  
  if (reminderState.isPaused) {
    console.log(`[Breaksy] ${type} reminder paused, skipping`);
    return;
  }
  
  if (state.isIdle) {
    console.log(`[Breaksy] System idle, deferring ${type} reminder`);
    return;
  }
  
  // Check if timer actually expired (handle timing drift)
  const now = Date.now();
  if (reminderState.timerEndsAt && now < reminderState.timerEndsAt - 5000) {
    // Timer hasn't actually expired yet (within 5 second tolerance)
    console.log(`[Breaksy] ${type} alarm fired early, rescheduling`);
    await scheduleReminder(type, reminderState.timerEndsAt - now);
    return;
  }
  
  // Handle the reminder
  await handleReminderFired(type);
});

/**
 * Process a fired reminder
 */
async function handleReminderFired(type: ReminderType): Promise<void> {
  const { settings } = await getAll();
  const reminderSettings = settings.reminders[type];
  
  // Show notification
  await showReminderNotification(type);
  
  // Schedule next occurrence
  const intervalMs = reminderSettings.intervalMinutes * 60 * 1000;
  const now = Date.now();
  
  await updateReminderState(type, {
    remainingMs: intervalMs,
    timerEndsAt: now + intervalMs,
    nextNotificationAt: null,
  });
  
  await scheduleReminder(type, intervalMs);
  console.log(`[Breaksy] ${type} reminder handled, next in ${reminderSettings.intervalMinutes}min`);
}

// ============================================================================
// NOTIFICATIONS
// ============================================================================

/**
 * Check if notification should be shown (anti-spam)
 */
function shouldShowNotification(reminderState: RuntimeStateV2['reminders'][ReminderType]): boolean {
  if (!reminderState.lastNotifiedAt) return true;
  const now = Date.now();
  return now - reminderState.lastNotifiedAt >= ANTI_SPAM_WINDOW_MS;
}

/**
 * Show notification for a specific reminder type
 */
async function showReminderNotification(type: ReminderType): Promise<void> {
  const { settings, state } = await getAll();
  const reminderSettings = settings.reminders[type];
  const reminderState = state.reminders[type];
  const now = Date.now();
  
  // Check for existing notification
  if (reminderState.activeNotificationId) {
    const notifications = await new Promise<{ [key: string]: chrome.notifications.NotificationOptions }>((resolve) => {
      chrome.notifications.getAll((items) => resolve(items as { [key: string]: chrome.notifications.NotificationOptions }));
    });
    if (notifications[reminderState.activeNotificationId]) {
      console.log(`[Breaksy] ${type} notification already active`);
      return;
    }
    // Notification was cleared but state not updated
    await updateReminderState(type, { activeNotificationId: null });
  }
  
  // Anti-spam check
  if (!shouldShowNotification(reminderState)) {
    console.log(`[Breaksy] Skipping ${type} notification - within anti-spam window`);
    return;
  }
  
  // Get notification content
  const content = getNotificationContent(type);
  const notificationId = `breaksy-${type}-${now}`;
  
  // Create buttons with specific snooze duration
  const buttons: chrome.notifications.ButtonOptions[] = [
    { title: `Snooze ${reminderSettings.snoozeMinutes} min` },
    { title: 'Pause' },
  ];
  
  try {
    await chrome.notifications.create(notificationId, {
      type: 'basic',
      title: content.title,
      message: content.message,
      iconUrl: chrome.runtime.getURL('src/assets/icons/icon128.png'),
      buttons,
      requireInteraction: true,
    });
    
    // Update state
    await updateReminderState(type, {
      activeNotificationId: notificationId,
      lastNotifiedAt: now,
    });
    
    console.log(`[Breaksy] ${type} notification shown`);
  } catch (error) {
    console.error(`[Breaksy] Failed to show ${type} notification:`, error);
  }
}

/**
 * Handle notification button clicks
 */
chrome.notifications.onButtonClicked.addListener(async (notificationId, buttonIndex) => {
  const type = parseNotificationType(notificationId);
  if (!type) return; // Not our notification
  
  const state = await getState();
  if (notificationId !== state.reminders[type].activeNotificationId) {
    return; // Old notification
  }
  
  if (buttonIndex === 0) {
    // Snooze button
    await handleSnooze(type);
  } else if (buttonIndex === 1) {
    // Pause button
    await pauseReminder(type);
  }
});

/**
 * Handle notification click (dismiss)
 */
chrome.notifications.onClicked.addListener(async (notificationId) => {
  const type = parseNotificationType(notificationId);
  if (!type) return;
  
  const state = await getState();
  if (notificationId === state.reminders[type].activeNotificationId) {
    await updateReminderState(type, { activeNotificationId: null });
  }
});

/**
 * Handle notification closed
 */
chrome.notifications.onClosed.addListener(async (notificationId, _byUser) => {
  const type = parseNotificationType(notificationId);
  if (!type) return;
  
  const state = await getState();
  if (notificationId === state.reminders[type].activeNotificationId) {
    await updateReminderState(type, { activeNotificationId: null });
  }
});

// ============================================================================
// REMINDER ACTIONS
// ============================================================================

/**
 * Snooze a reminder
 */
async function handleSnooze(type: ReminderType): Promise<void> {
  const { settings } = await getAll();
  const reminderSettings = settings.reminders[type];
  const snoozeMs = reminderSettings.snoozeMinutes * 60 * 1000;
  const timerEndsAt = Date.now() + snoozeMs;
  
  await updateReminderState(type, {
    activeNotificationId: null,
    remainingMs: snoozeMs,
    timerEndsAt,
  });
  
  await scheduleReminder(type, snoozeMs);
  console.log(`[Breaksy] ${type} snoozed for ${reminderSettings.snoozeMinutes} min`);
}

/**
 * Pause a specific reminder
 */
async function pauseReminder(type: ReminderType): Promise<void> {
  await updateReminderState(type, {
    isPaused: true,
    activeNotificationId: null,
  });
  
  await clearReminderAlarm(type);
  console.log(`[Breaksy] ${type} reminder paused`);
}

/**
 * Resume a specific reminder
 */
async function resumeReminder(type: ReminderType): Promise<void> {
  const { settings, state } = await getAll();
  const reminderSettings = settings.reminders[type];
  const reminderState = state.reminders[type];
  
  await updateReminderState(type, {
    isPaused: false,
  });
  
  // Calculate remaining time
  let remainingMs = reminderState.remainingMs;
  if (reminderState.timerEndsAt) {
    remainingMs = Math.max(0, reminderState.timerEndsAt - Date.now());
  }
  
  // If timer expired while paused, reset to full interval
  if (remainingMs <= 0) {
    remainingMs = reminderSettings.intervalMinutes * 60 * 1000;
    await updateReminderState(type, {
      remainingMs,
      timerEndsAt: Date.now() + remainingMs,
    });
  }
  
  // Schedule if not idle
  if (!state.isIdle) {
    await scheduleReminder(type, remainingMs);
  }
  
  console.log(`[Breaksy] ${type} reminder resumed`);
}

/**
 * Toggle pause state for a reminder
 */
async function toggleReminderPause(type: ReminderType): Promise<void> {
  const state = await getState();
  const reminderState = state.reminders[type];
  
  if (reminderState.isPaused) {
    await resumeReminder(type);
  } else {
    await pauseReminder(type);
  }
}

/**
 * Trigger a reminder immediately
 */
async function triggerReminderNow(type: ReminderType): Promise<void> {
  const state = await getState();
  const reminderState = state.reminders[type];
  const now = Date.now();
  
  // Check anti-spam
  if (reminderState.lastNotifiedAt && now - reminderState.lastNotifiedAt < ANTI_SPAM_WINDOW_MS) {
    console.log(`[Breaksy] ${type} trigger ignored - within anti-spam window`);
    return;
  }
  
  // Clear any existing notification
  await updateReminderState(type, {
    activeNotificationId: null,
    lastNotifiedAt: null,
  });
  
  // Show notification
  await showReminderNotification(type);
  console.log(`[Breaksy] ${type} reminder triggered manually`);
}

// ============================================================================
// IDLE DETECTION
// ============================================================================

/**
 * Setup idle state change listener
 */
function setupIdleListener(): void {
  if (idleListenerAdded) return;
  idleListenerAdded = true;
  chrome.idle.onStateChanged.addListener(handleIdleStateChange);
  console.log('[Breaksy] Idle listener registered');
}

/**
 * Handle idle state changes
 */
async function handleIdleStateChange(idleState: chrome.idle.IdleState): Promise<void> {
  const { settings, state } = await getAll();
  console.log(`[Breaksy] Idle state changed: ${idleState}`);
  
  if (idleState === 'idle' || idleState === 'locked') {
    // System became idle - pause all reminders
    if (state.isIdle) return; // Already idle
    
    const now = Date.now();
    
    // Save remaining times for each reminder
    for (const type of REMINDER_TYPES) {
      const reminderState = state.reminders[type];
      let remainingMs = reminderState.remainingMs;
      
      if (reminderState.timerEndsAt) {
        remainingMs = Math.max(0, reminderState.timerEndsAt - now);
      }
      
      await updateReminderState(type, {
        remainingMs,
      });
      
      // Clear alarm
      await clearReminderAlarm(type);
    }
    
    // Update global idle state
    await setState({
      isIdle: true,
      lastActiveAt: now,
    });
    
    console.log('[Breaksy] All reminders paused due to idle');
    
  } else if (idleState === 'active') {
    // System became active - resume all reminders
    if (!state.isIdle) return; // Wasn't idle
    
    // Update global idle state
    await setState({ isIdle: false });
    
    // Resume each enabled, non-paused reminder
    for (const type of REMINDER_TYPES) {
      const reminderSettings = settings.reminders[type];
      const reminderState = state.reminders[type];
      
      if (reminderSettings.enabled && !reminderState.isPaused) {
        await scheduleReminder(type, reminderState.remainingMs);
        console.log(`[Breaksy] ${type} reminder resumed after idle`);
      }
    }
    
    console.log('[Breaksy] Reminders resumed after idle');
  }
}

// ============================================================================
// MESSAGE API
// ============================================================================

chrome.runtime.onMessage.addListener((message: Message, _sender, sendResponse) => {
  console.log('[Background] Received message:', message.type, message.payload);
  
  (async () => {
    try {
      switch (message.type) {
        case 'GET_STATE': {
          const { settings, state } = await getAll();
          const remainingSecondsByType = calculateRemainingSeconds(state);
          
          sendResponse({
            settings,
            state,
            remainingSecondsByType,
          } as StateResponse);
          break;
        }
        
        case 'SET_REMINDER_INTERVAL': {
          const type = message.payload?.reminderType as ReminderType;
          const interval = message.payload?.interval as number;
          
          if (!type || !REMINDER_TYPES.includes(type) || typeof interval !== 'number') {
            sendResponse({ error: 'Invalid parameters' });
            return;
          }
          
          // Update settings
          const currentSettings = await getSettings();
          const updatedReminders = {
            ...currentSettings.reminders,
            [type]: {
              ...currentSettings.reminders[type],
              intervalMinutes: interval,
            },
          };
          await setSettings({ reminders: updatedReminders });
          
          // If not paused and not idle, reset timer
          const currentState = await getState();
          if (!currentState.reminders[type].isPaused && !currentState.isIdle) {
            const intervalMs = interval * 60 * 1000;
            await updateReminderState(type, {
              remainingMs: intervalMs,
              timerEndsAt: Date.now() + intervalMs,
            });
            await scheduleReminder(type, intervalMs);
          }
          
          sendResponse({ success: true });
          break;
        }
        
        case 'SET_REMINDER_SNOOZE': {
          const type = message.payload?.reminderType as ReminderType;
          const snooze = message.payload?.snooze as number;
          
          if (!type || !REMINDER_TYPES.includes(type) || typeof snooze !== 'number') {
            sendResponse({ error: 'Invalid parameters' });
            return;
          }
          
          const currentSettings = await getSettings();
          const updatedReminders = {
            ...currentSettings.reminders,
            [type]: {
              ...currentSettings.reminders[type],
              snoozeMinutes: snooze,
            },
          };
          await setSettings({ reminders: updatedReminders });
          
          sendResponse({ success: true });
          break;
        }
        
        case 'TOGGLE_REMINDER_ENABLED': {
          const type = message.payload?.reminderType as ReminderType;
          const enabled = message.payload?.enabled as boolean;
          
          if (!type || !REMINDER_TYPES.includes(type) || typeof enabled !== 'boolean') {
            sendResponse({ error: 'Invalid parameters' });
            return;
          }
          
          const currentSettings = await getSettings();
          const updatedReminders = {
            ...currentSettings.reminders,
            [type]: {
              ...currentSettings.reminders[type],
              enabled,
            },
          };
          await setSettings({ reminders: updatedReminders });
          
          if (enabled) {
            // Enable - schedule if appropriate
            const currentState = await getState();
            if (!currentState.reminders[type].isPaused && !currentState.isIdle) {
              const intervalMs = currentSettings.reminders[type].intervalMinutes * 60 * 1000;
              await updateReminderState(type, {
                remainingMs: intervalMs,
                timerEndsAt: Date.now() + intervalMs,
              });
              await scheduleReminder(type, intervalMs);
            }
          } else {
            // Disable - clear alarm
            await clearReminderAlarm(type);
          }
          
          sendResponse({ success: true });
          break;
        }
        
        case 'TOGGLE_REMINDER_PAUSE':
        case 'TOGGLE_PAUSE': {
          // Support both new and legacy message types
          const type = (message.payload?.reminderType as ReminderType) ?? 'eye';
          await toggleReminderPause(type);
          sendResponse({ success: true });
          break;
        }
        
        case 'REMINDER_TRIGGER_NOW':
        case 'TAKE_BREAK_NOW': {
          // Support both new and legacy message types
          const type = (message.payload?.reminderType as ReminderType) ?? 'eye';
          await triggerReminderNow(type);
          sendResponse({ success: true });
          break;
        }
        
        case 'REMINDER_SNOOZE':
        case 'SNOOZE': {
          // Support both new and legacy message types
          const type = (message.payload?.reminderType as ReminderType) ?? 'eye';
          await handleSnooze(type);
          sendResponse({ success: true });
          break;
        }
        
        case 'RESUME': {
          const type = (message.payload?.reminderType as ReminderType) ?? 'eye';
          await resumeReminder(type);
          sendResponse({ success: true });
          break;
        }
        
        case 'SET_IDLE_THRESHOLD': {
          const threshold = message.payload?.idleThresholdSeconds as number;
          if (typeof threshold !== 'number') {
            sendResponse({ error: 'Invalid threshold' });
            return;
          }
          await setSettings({ idleThresholdSeconds: threshold });
          sendResponse({ success: true });
          break;
        }
        
        case 'SET_LAST_SELECTED_REMINDER': {
          const type = message.payload?.reminderType as ReminderType;
          if (!type || !REMINDER_TYPES.includes(type)) {
            sendResponse({ error: 'Invalid reminder type' });
            return;
          }
          await setSettings({
            ui: { lastSelectedReminder: type },
          });
          sendResponse({ success: true });
          break;
        }
        
        case 'CHECK_NOTIFICATION': {
          const type = (message.payload?.reminderType as ReminderType) ?? 'eye';
          const { settings, state } = await getAll();
          const now = Date.now();
          
          const reminderSettings = settings.reminders[type];
          const reminderState = state.reminders[type];
          
          // Check conditions
          if (!reminderSettings.enabled) {
            sendResponse({ triggered: false, reason: 'disabled' });
            return;
          }
          
          if (reminderState.isPaused) {
            sendResponse({ triggered: false, reason: 'paused' });
            return;
          }
          
          if (state.isIdle) {
            sendResponse({ triggered: false, reason: 'idle' });
            return;
          }
          
          if (!reminderState.nextNotificationAt || now < reminderState.nextNotificationAt) {
            sendResponse({ triggered: false, reason: 'not yet time' });
            return;
          }
          
          if (reminderState.activeNotificationId) {
            const notifications = await new Promise<{ [key: string]: chrome.notifications.NotificationOptions }>((resolve) => {
              chrome.notifications.getAll((items) => resolve(items as { [key: string]: chrome.notifications.NotificationOptions }));
            });
            if (notifications[reminderState.activeNotificationId]) {
              sendResponse({ triggered: false, reason: 'already shown' });
              return;
            }
            await updateReminderState(type, { activeNotificationId: null });
          }
          
          if (!shouldShowNotification(reminderState)) {
            sendResponse({ triggered: false, reason: 'anti-spam' });
            return;
          }
          
          // Show notification
          await showReminderNotification(type);
          
          // Reset timer
          const intervalMs = reminderSettings.intervalMinutes * 60 * 1000;
          await updateReminderState(type, {
            remainingMs: intervalMs,
            timerEndsAt: now + intervalMs,
            nextNotificationAt: null,
          });
          await scheduleReminder(type, intervalMs);
          
          sendResponse({ triggered: true });
          break;
        }
        
        case 'RESET': {
          // Clear all alarms first
          for (const type of REMINDER_TYPES) {
            await clearReminderAlarm(type);
          }
          
          // Reset storage
          await setSettings({ ...DEFAULT_SETTINGS_V2 });
          await setState({
            version: 2,
            isIdle: false,
            lastActiveAt: Date.now(),
            reminders: {
              eye: {
                isPaused: false,
                remainingMs: DEFAULT_SETTINGS_V2.reminders.eye.intervalMinutes * 60 * 1000,
                timerEndsAt: null,
                nextAlarmAt: null,
                nextNotificationAt: null,
                lastNotifiedAt: null,
                activeNotificationId: null,
              },
              water: {
                isPaused: false,
                remainingMs: DEFAULT_SETTINGS_V2.reminders.water.intervalMinutes * 60 * 1000,
                timerEndsAt: null,
                nextAlarmAt: null,
                nextNotificationAt: null,
                lastNotifiedAt: null,
                activeNotificationId: null,
              },
            },
          });
          
          // Reinitialize
          await initializeExtension();
          
          sendResponse({ success: true });
          break;
        }
        
        default: {
          sendResponse({ error: `Unknown message type: ${message.type}` });
          break;
        }
      }
    } catch (error) {
      console.error('[Breaksy] Message handler error:', error);
      sendResponse({ error: String(error) });
    }
  })();
  
  return true; // Keep channel open for async response
});

console.log('[Breaksy] Service worker loaded');
