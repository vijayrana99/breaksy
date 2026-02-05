# BREAKSY TECHNICAL MANUAL
## Chrome Extension Architecture Documentation

**Version:** 1.0.0  
**Last Updated:** February 5, 2026  
**Extension Version:** 1.0.0

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [File Structure](#2-file-structure)
3. [Extension Permissions](#3-extension-permissions)
4. [Core Data Models](#4-core-data-models)
5. [Storage Architecture](#5-storage-architecture)
6. [Background Script Architecture](#6-background-script-architecture)
7. [Message Passing API](#7-message-passing-api)
8. [Popup Interface](#8-popup-interface)
9. [Options Page](#9-options-page)
10. [Build System](#10-build-system)
11. [Extension Points for New Features](#11-extension-points-for-new-features)
12. [Key Design Patterns](#12-key-design-patterns)
13. [Debugging](#13-debugging)
14. [Chrome APIs Used](#14-chrome-apis-used)
15. [Next Steps for AI Assistance](#15-next-steps-for-ai-assistance)

---

## 1. PROJECT OVERVIEW

**Breaksy** is a Chrome extension that provides healthy computer-use break reminders using the 20-20-20 rule: every 20 minutes, look at something 20 feet away for 20 seconds.

### Current Features
- Customizable break intervals (5-240 minutes)
- Push notifications with snooze and pause actions
- Idle time detection (pauses countdown when away)
- Simple and lightweight Chrome extension (Manifest V3)
- Persistent state across browser restarts

### Tech Stack
- **TypeScript** - Type-safe JavaScript
- **Vite** - Build tool and bundler
- **Chrome Extensions API** - Manifest V3
- **No external runtime dependencies**

---

## 2. FILE STRUCTURE

```
breaksy/
├── src/
│   ├── manifest.json              # Extension manifest (permissions, entry points)
│   ├── background/
│   │   ├── service_worker.ts      # Main background logic (TypeScript source)
│   │   └── background.js          # Compiled service worker (JavaScript)
│   ├── popup/
│   │   ├── popup.html             # Popup UI HTML
│   │   ├── popup.ts               # Popup logic and event handling
│   │   └── popup.css              # Popup styles
│   ├── options/
│   │   ├── options.html           # Settings page HTML
│   │   ├── options.ts             # Settings logic
│   │   └── options.css            # Settings styles
│   ├── shared/
│   │   ├── types.ts               # TypeScript interfaces and constants
│   │   └── storage.ts             # Chrome storage wrappers
│   └── assets/
│       └── icons/                 # Extension icons (16px, 48px, 128px)
├── dist/                          # Build output directory
├── docs/                          # Documentation
│   └── ARCHITECTURE.md            # This file
├── package.json                   # NPM dependencies and scripts
├── vite.config.ts                 # Vite build configuration
├── tsconfig.json                  # TypeScript configuration
└── README.md                      # User documentation
```

---

## 3. EXTENSION PERMISSIONS

### Manifest Configuration (`src/manifest.json`)

```json
{
  "manifest_version": 3,
  "name": "Breaksy",
  "version": "1.0.0",
  "description": "Healthy computer-use break reminders with push notifications",
  "permissions": [
    "alarms",        // Schedule reminder alarms (reliable background timing)
    "notifications", // Display break reminder notifications
    "storage",       // Persist settings and runtime state
    "idle"           // Detect user inactivity (pause countdown when away)
  ],
  "action": {
    "default_popup": "src/popup/popup.html",
    "default_icon": {
      "16": "src/assets/icon16.png",
      "48": "src/assets/icon48.png",
      "128": "src/assets/icon128.png"
    }
  },
  "options_page": "src/options/options.html",
  "background": {
    "service_worker": "src/background/background.js"
  },
  "icons": {
    "16": "src/assets/icon16.png",
    "48": "src/assets/icon48.png",
    "128": "src/assets/icon128.png"
  }
}
```

### Permission Details

| Permission | Purpose | Usage Location |
|------------|---------|----------------|
| `alarms` | Schedule reliable background timers | `service_worker.ts` |
| `notifications` | Show break reminder popups | `service_worker.ts` |
| `storage` | Persist settings and state | `storage.ts` |
| `idle` | Detect when user is inactive | `service_worker.ts` |

**Privacy Note:** No host permissions are requested. The extension does not access any websites or browsing data.

---

## 4. CORE DATA MODELS

### 4.1 Settings Interface

**Location:** `src/shared/types.ts` (lines 1-5)

```typescript
export interface Settings {
  intervalMinutes: number;        // Break interval (5-240 minutes, default: 20)
  idleThresholdSeconds: number;   // Idle detection threshold (15-600 seconds, default: 60)
  snoozeMinutes: number;          // Snooze duration (1-60 minutes, default: 5)
}
```

**Default Values:**
```typescript
export const DEFAULT_SETTINGS: Settings = {
  intervalMinutes: 20,
  idleThresholdSeconds: 60,
  snoozeMinutes: 5,
};
```

### 4.2 Runtime State Interface

**Location:** `src/shared/types.ts` (lines 7-17)

```typescript
export interface RuntimeState {
  isPaused: boolean;              // User manually paused reminders
  isIdle: boolean;                // System detected idle state
  remainingMs: number;            // Milliseconds remaining until next break
  lastActiveAt: number;           // Timestamp of last user activity
  timerEndsAt: number | null;     // When current timer expires
  nextAlarmAt: number | null;     // When next alarm is scheduled
  nextNotificationAt: number | null;  // When notification should show
  lastNotifiedAt: number | null;      // Last notification timestamp (anti-spam)
  activeNotificationId: string | null; // Currently shown notification ID
}
```

**Default Values:**
```typescript
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
```

### 4.3 Constants

**Location:** `src/shared/types.ts` (lines 59-68)

```typescript
export const PRESET_INTERVALS = [20, 30, 45, 60, 90, 120];
export const MIN_INTERVAL = 5;
export const MAX_INTERVAL = 240;
export const MIN_IDLE_THRESHOLD = 15;
export const MAX_IDLE_THRESHOLD = 600;
export const MIN_SNOOZE = 1;
export const MAX_SNOOZE = 60;
export const ANTI_SPAM_WINDOW_MS = 60000;  // 60 seconds
export const ALARM_NAME = 'breaksy-reminder';
export const IDLE_CHECK_INTERVAL = 30;
```

### 4.4 Message Types

**Location:** `src/shared/types.ts` (lines 24-33)

```typescript
export type MessageType =
  | 'GET_STATE'           // Retrieve current settings and state
  | 'SET_INTERVAL'        // Change break interval
  | 'SET_SNOOZE'          // Change snooze duration
  | 'TOGGLE_PAUSE'        // Pause/resume reminders
  | 'TAKE_BREAK_NOW'      // Trigger immediate break
  | 'SNOOZE'              // Snooze current reminder
  | 'RESUME'              // Resume from pause/idle
  | 'CHECK_NOTIFICATION'  // Check if notification should trigger
  | 'RESET';              // Reset to defaults
```

### 4.5 State Response Interface

**Location:** `src/shared/types.ts` (lines 35-39)

```typescript
export interface StateResponse {
  settings: Settings;
  state: RuntimeState;
  remainingSeconds: number;
}
```

---

## 5. STORAGE ARCHITECTURE

### 5.1 Storage Strategy

**Location:** `src/shared/storage.ts`

Two storage areas are used:
- **`chrome.storage.sync`** - User settings (synced across devices)
- **`chrome.storage.local`** - Runtime state (device-specific, not synced)

### 5.2 Storage Keys

```typescript
const STORAGE_KEYS = {
  SETTINGS: 'breaksy-settings',
  STATE: 'breaksy-state',
} as const;
```

### 5.3 Storage API Functions

| Function | Description | Storage Type |
|----------|-------------|--------------|
| `getSettings()` | Retrieve user settings | sync |
| `setSettings(settings)` | Update user settings | sync |
| `getState()` | Retrieve runtime state | local |
| `setState(state)` | Update runtime state | local |
| `getAll()` | Get settings and state in parallel | both |
| `resetToDefaults()` | Reset everything to defaults | both |

### 5.4 Usage Example

```typescript
import { getSettings, setSettings, getState, setState } from './shared/storage';

// Get current settings
const settings = await getSettings();

// Update interval
await setSettings({ intervalMinutes: 30 });

// Get runtime state
const state = await getState();

// Update state
await setState({ isPaused: true });
```

---

## 6. BACKGROUND SCRIPT ARCHITECTURE

### 6.1 Service Worker Lifecycle

**Location:** `src/background/service_worker.ts`

**Initialization Events:**

1. **Extension Install/Update** (lines 15-19)
   ```typescript
   chrome.runtime.onInstalled.addListener(async () => {
     console.log('[Breaksy] Extension installed');
     await initializeExtension();
     setupIdleListener();
   });
   ```

2. **Browser Startup** (lines 21-25)
   ```typescript
   chrome.runtime.onStartup.addListener(async () => {
     console.log('[Breaksy] Extension startup');
     await restoreState();
     setupIdleListener();
   });
   ```

### 6.2 Key Functions

| Function | Line | Purpose |
|----------|------|---------|
| `initializeExtension()` | 27-50 | Set up defaults, schedule first alarm |
| `restoreState()` | 52-80 | Recover timer state after browser restart |
| `setupIdleListener()` | 82-87 | Register idle state change listener |
| `handleIdleStateChange()` | 89-113 | Handle idle/active transitions |
| `scheduleReminder()` | 115-149 | Schedule next alarm |
| `clearAlarm()` | 151-154 | Cancel scheduled alarm |
| `showNotification()` | 176-224 | Display break reminder |

### 6.3 Alarm System

**Alarm Scheduling** (lines 115-149):
```typescript
async function scheduleReminder(delayMs?: number): Promise<void> {
  // Calculate delay
  const timerEndsAt = now + requestedDelay;
  
  // Persist state
  await setState({
    timerEndsAt,
    remainingMs: requestedDelay,
    nextAlarmAt: timerEndsAt,
    nextNotificationAt: nextNotificationTime,
  });
  
  // Create alarm (minimum 1 minute)
  await chrome.alarms.clear(ALARM_NAME);
  const delayMinutes = Math.max(1, requestedDelay / 60000);
  await chrome.alarms.create(ALARM_NAME, { delayInMinutes: delayMinutes });
}
```

**Alarm Handler** (lines 156-174):
```typescript
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM_NAME) return;
  
  const { settings, state } = await getAll();
  if (state.isPaused || state.isIdle) return;
  
  await showNotification();
  
  // Reset timer and schedule next
  const timerEndsAt = Date.now() + settings.intervalMinutes * 60 * 1000;
  await setState({ /* ... */ });
  await scheduleReminder();
});
```

### 6.4 Idle Detection

**Setup** (lines 82-87):
```typescript
function setupIdleListener(): void {
  if (idleListenerAdded) return;
  idleListenerAdded = true;
  chrome.idle.onStateChanged.addListener(handleIdleStateChange);
}
```

**Handler** (lines 89-113):
```typescript
async function handleIdleStateChange(state: IdleState): Promise<void> {
  // States: 'active', 'idle', 'locked'
  
  if (state === 'idle' || state === 'locked') {
    // Save remaining time and pause
    await setState({ isIdle: true, remainingMs: remaining });
    await clearAlarm();
  } else if (state === 'active') {
    // Resume from saved remaining time
    await setState({ isIdle: false });
    await scheduleReminder(currentState.remainingMs);
  }
}
```

### 6.5 Notification System

**Show Notification** (lines 176-224):
```typescript
async function showNotification(): Promise<void> {
  // Anti-spam check
  if (state.lastNotifiedAt && now - state.lastNotifiedAt < ANTI_SPAM_WINDOW_MS) {
    return; // Skip if within 60 seconds
  }
  
  const notificationId = `breaksy-${Date.now()}`;
  const buttons = [
    { title: `Snooze ${settings.snoozeMinutes} min` },
    { title: 'Pause' },
  ];
  
  await chrome.notifications.create(notificationId, {
    type: 'basic',
    title: 'Time for an eye break 👀',
    message: 'Look at something ~20 ft / 6 m away for 20 seconds.',
    iconUrl: chrome.runtime.getURL('src/assets/icon128.png'),
    buttons,
    requireInteraction: true,
  });
  
  await setState({ activeNotificationId: notificationId, lastNotifiedAt: now });
}
```

**Notification Button Handlers** (lines 226-249):
```typescript
chrome.notifications.onButtonClicked.addListener(async (notificationId, buttonIndex) => {
  if (buttonIndex === 0) await handleSnooze();
  else if (buttonIndex === 1) await handlePauseToggle();
});

chrome.notifications.onClicked.addListener(async (notificationId) => {
  await setState({ activeNotificationId: null });
});

chrome.notifications.onClosed.addListener(async (notificationId, byUser) => {
  await setState({ activeNotificationId: null });
});
```

### 6.6 Browser Restart Recovery

**Restore State** (lines 52-80):
```typescript
async function restoreState(): Promise<void> {
  const { settings, state } = await getAll();
  const now = Date.now();
  
  if (state.isPaused) {
    await clearAlarm();
    return;
  }
  
  if (state.isIdle) {
    await scheduleReminder(state.remainingMs);
    return;
  }
  
  // Calculate remaining time from persisted timerEndsAt
  const remaining = state.timerEndsAt ? Math.max(0, state.timerEndsAt - now) : state.remainingMs;
  
  if (remaining <= 0) {
    // Timer elapsed during restart - show notification
    await showNotification();
    await scheduleReminder();
  } else {
    // Resume countdown
    await scheduleReminder(remaining);
  }
}
```

---

## 7. MESSAGE PASSING API

### 7.1 Message Handler Overview

**Location:** `src/background/service_worker.ts` (lines 316-428)

All communication between popup/options and background script uses `chrome.runtime.sendMessage()`.

### 7.2 Message Handler Structure

```typescript
chrome.runtime.onMessage.addListener((message: Message, sender, sendResponse) => {
  (async () => {
    try {
      switch (message.type) {
        case 'GET_STATE': { /* ... */ }
        case 'SET_INTERVAL': { /* ... */ }
        // ... other cases
      }
    } catch (error) {
      console.error('[Breaksy] Message handler error:', error);
      sendResponse({ error: String(error) });
    }
  })();
  return true; // Keep channel open for async response
});
```

### 7.3 Message Types Detail

#### GET_STATE
Retrieves current settings and runtime state.

**Request:**
```typescript
{ type: 'GET_STATE' }
```

**Response:**
```typescript
{
  settings: Settings,
  state: RuntimeState,
  remainingSeconds: number
}
```

#### SET_INTERVAL
Changes the break interval.

**Request:**
```typescript
{ type: 'SET_INTERVAL', payload: { interval: number } }
```

**Behavior:**
- Validates interval is within MIN_INTERVAL and MAX_INTERVAL
- Updates settings
- If not paused and not idle, resets timer with new interval
- Schedules new alarm

#### SET_SNOOZE
Changes the snooze duration.

**Request:**
```typescript
{ type: 'SET_SNOOZE', payload: { snooze: number } }
```

**Behavior:**
- Updates snoozeMinutes in settings

#### TOGGLE_PAUSE
Toggles pause/resume state.

**Request:**
```typescript
{ type: 'TOGGLE_PAUSE' }
```

**Behavior:**
- If paused: resumes countdown
- If active: pauses countdown and clears alarm

#### TAKE_BREAK_NOW
Triggers immediate break notification.

**Request:**
```typescript
{ type: 'TAKE_BREAK_NOW' }
```

**Behavior:**
- Checks anti-spam window (60 seconds)
- Shows notification immediately
- Resets timer to full interval

#### SNOOZE
Delays current reminder.

**Request:**
```typescript
{ type: 'SNOOZE' }
```

**Behavior:**
- Clears active notification
- Sets timer to snooze duration
- Schedules new alarm

#### RESUME
Resumes from pause or idle state.

**Request:**
```typescript
{ type: 'RESUME' }
```

**Behavior:**
- Sets isPaused to false
- If remaining time <= 0, resets to full interval
- Schedules alarm if not idle

#### CHECK_NOTIFICATION
Checks if notification should be shown (used by popup countdown).

**Request:**
```typescript
{ type: 'CHECK_NOTIFICATION' }
```

**Response:**
```typescript
{ triggered: boolean, reason?: string }
```

**Behavior:**
- Checks if paused/idle
- Checks if nextNotificationAt has passed
- Checks anti-spam window
- Shows notification if all conditions met

#### RESET
Resets all settings and state to defaults.

**Request:**
```typescript
{ type: 'RESET' }
```

**Behavior:**
- Clears all storage
- Reinitializes with defaults
- Schedules new alarm

---

## 8. POPUP INTERFACE

### 8.1 HTML Structure

**Location:** `src/popup/popup.html`

```html
<div class="container">
  <header class="header">
    <h1 class="title">Breaksy</h1>
    <p class="tagline">Healthy breaks for your eyes</p>
  </header>

  <div class="status-card">
    <div id="status-text" class="status-text">
      <span id="status-label" class="status-label"></span>
      <span id="status-time" class="status-time">--:--</span>
    </div>
    <div id="status-subtext" class="status-subtext"></div>
  </div>

  <div class="controls">
    <div class="control-group">
      <label class="label" for="interval-select">Interval</label>
      <div class="input-row">
        <select id="interval-select" class="select">
          <option value="20">20 min</option>
          <option value="30">30 min</option>
          <option value="45">45 min</option>
          <option value="60">60 min</option>
          <option value="90">90 min</option>
          <option value="120">120 min</option>
          <option value="custom">Custom...</option>
        </select>
        <input type="number" id="interval-custom" class="input input-number hidden" min="5" max="240" value="20">
      </div>
    </div>
  </div>

  <div class="buttons">
    <button id="btn-take-break" class="btn btn-primary">Take Break Now</button>
    <button id="btn-snooze" class="btn btn-secondary">Snooze 2 min</button>
    <button id="btn-pause" class="btn btn-secondary">Pause</button>
  </div>

  <footer class="footer">
    <a href="#" id="link-settings" class="link">Settings</a>
  </footer>
</div>
```

### 8.2 Key Features

**Location:** `src/popup/popup.ts`

| Feature | Description |
|---------|-------------|
| Status Display | Shows "Next break in: MM:SS" or "Paused" or "Idle" |
| Countdown Timer | Real-time countdown that syncs with background |
| Interval Selector | Dropdown with presets + custom input |
| Take Break Now | Immediate notification trigger |
| Snooze Button | Delays reminder by configured snooze duration |
| Pause/Resume | Toggle countdown state |
| Settings Link | Opens options page |

### 8.3 Countdown Implementation

```typescript
let countdownInterval: ReturnType<typeof setInterval> | null = null;
let displaySeconds = 0;

function startCountdown(): void {
  if (countdownInterval) clearInterval(countdownInterval);
  
  displaySeconds = currentState?.remainingSeconds ?? 0;
  
  countdownInterval = setInterval(async () => {
    if (!currentState) return;
    const { state } = currentState;
    
    if (state.isPaused || state.isIdle) return;
    
    displaySeconds = Math.max(0, displaySeconds - 1);
    updateDisplay();
    
    // Check if time is up
    if (displaySeconds <= 0) {
      await sendMessage('CHECK_NOTIFICATION');
      await refreshState();
    }
  }, 1000);
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}
```

### 8.4 Event Handlers

```typescript
// Interval selection
ELEMENTS.intervalSelect.addEventListener('change', async () => {
  const value = ELEMENTS.intervalSelect.value;
  if (value === 'custom') {
    ELEMENTS.intervalCustom.classList.remove('hidden');
  } else {
    await sendMessage('SET_INTERVAL', { interval: parseInt(value, 10) });
  }
});

// Take break now
ELEMENTS.btnTakeBreak.addEventListener('click', async () => {
  await sendMessage('TAKE_BREAK_NOW');
});

// Snooze
ELEMENTS.btnSnooze.addEventListener('click', async () => {
  await sendMessage('SNOOZE');
});

// Pause/Resume
ELEMENTS.btnPause.addEventListener('click', async () => {
  if (currentState?.state.isPaused || currentState?.state.isIdle) {
    await sendMessage('RESUME');
  } else {
    await sendMessage('TOGGLE_PAUSE');
  }
});
```

---

## 9. OPTIONS PAGE

### 9.1 HTML Structure

**Location:** `src/options/options.html`

```html
<div class="container">
  <header class="header">
    <h1 class="title">Breaksy Settings</h1>
    <p class="tagline">Configure your break reminders</p>
  </header>

  <section class="section">
    <h2 class="section-title">Reminder Settings</h2>
    <div class="field">
      <label class="label" for="interval-preset">Interval (minutes)</label>
      <div class="input-row">
        <select id="interval-preset" class="select">
          <option value="20">20 minutes</option>
          <option value="30">30 minutes</option>
          <option value="45">45 minutes</option>
          <option value="60">60 minutes</option>
          <option value="90">90 minutes</option>
          <option value="120">120 minutes</option>
          <option value="custom">Custom...</option>
        </select>
        <input type="number" id="interval-custom" class="input input-number hidden" min="5" max="240" value="20">
      </div>
      <p class="hint">How often to remind you to take a break (5-240 minutes)</p>
    </div>
  </section>

  <section class="section">
    <h2 class="section-title">Idle Detection</h2>
    <div class="field">
      <label class="label" for="idle-threshold">Idle threshold (seconds)</label>
      <input type="number" id="idle-threshold" class="input" min="15" max="600" value="60">
      <p class="hint">Pause countdown after this many seconds of inactivity</p>
    </div>
  </section>

  <section class="section">
    <h2 class="section-title">Snooze</h2>
    <div class="field">
      <label class="label" for="snooze-duration">Snooze duration (minutes)</label>
      <input type="number" id="snooze-duration" class="input" min="1" max="60" value="5">
      <p class="hint">How long to snooze when you click "Snooze"</p>
    </div>
  </section>

  <section class="section section-actions">
    <button id="btn-reset" class="btn btn-danger">Reset to Defaults</button>
  </section>

  <footer class="footer">
    <p class="privacy-note">🔒 No data leaves your device</p>
  </footer>
</div>
```

### 9.2 Key Features

**Location:** `src/options/options.ts`

| Setting | Range | Default | Description |
|---------|-------|---------|-------------|
| Interval | 5-240 min | 20 min | How often to show reminders |
| Idle Threshold | 15-600 sec | 60 sec | Inactivity time before pausing |
| Snooze Duration | 1-60 min | 5 min | Snooze delay duration |
| Reset Button | - | - | Restore all defaults |

### 9.3 Validation

All inputs validated against min/max constants before saving:

```typescript
const value = parseInt(ELEMENTS.intervalCustom.value, 10);
if (value >= MIN_INTERVAL && value <= MAX_INTERVAL) {
  await sendMessage('SET_INTERVAL', { interval: value });
} else {
  // Revert to previous valid value
  ELEMENTS.intervalCustom.value = currentState?.settings.intervalMinutes.toString() || '20';
}
```

---

## 10. BUILD SYSTEM

### 10.1 Package Configuration

**Location:** `package.json`

```json
{
  "name": "breaksy",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "build": "vite build && mkdir -p dist/src/background && cp src/manifest.json dist/ && cp src/background/background.js dist/src/background/ && cp -r src/assets/* dist/src/assets/",
    "watch": "vite build --watch",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "@types/chrome": "^0.0.258",
    "typescript": "^5.3.3",
    "vite": "^5.0.10"
  }
}
```

### 10.2 Build Scripts

| Script | Command | Purpose |
|--------|---------|---------|
| `build` | `npm run build` | Production build |
| `watch` | `npm run watch` | Development with auto-rebuild |
| `typecheck` | `npm run typecheck` | TypeScript type checking |

### 10.3 Build Process

1. **Vite Build**
   - Compiles TypeScript files to JavaScript
   - Bundles popup.ts, options.ts, etc.
   - Outputs to `dist/` directory

2. **Copy Static Assets**
   - `manifest.json` → `dist/`
   - `background.js` (pre-compiled) → `dist/src/background/`
   - Icons → `dist/src/assets/`

### 10.4 TypeScript Configuration

**Location:** `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "lib": ["ES2020", "DOM"],
    "types": ["chrome"]
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

### 10.5 Loading Extension in Chrome

1. Run `npm run build`
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" (toggle in top-right)
4. Click "Load unpacked"
5. Select the `dist` folder
6. Extension is now loaded and active

---

## 11. EXTENSION POINTS FOR NEW FEATURES

### 11.1 Adding Multiple Reminder Types

**Use Case:** Water drinking reminders, posture check reminders, etc.

**Required Changes:**

1. **Update Types** (`src/shared/types.ts`):
   ```typescript
   export type ReminderType = 'eye' | 'water' | 'posture';
   
   export interface Settings {
     reminders: {
       [key in ReminderType]: ReminderSettings;
     };
     idleThresholdSeconds: number;
   }
   ```

2. **Add Multiple Alarms** (`src/background/service_worker.ts`):
   ```typescript
   export const ALARM_EYE = 'breaksy-eye';
   export const ALARM_WATER = 'breaksy-water';
   
   // In alarm handler
   chrome.alarms.onAlarm.addListener(async (alarm) => {
     const type = alarm.name === ALARM_EYE ? 'eye' : 'water';
     await handleReminder(type);
   });
   ```

3. **Update Storage** (`src/shared/storage.ts`):
   - Migrate existing single-reminder settings to new format
   - Handle backward compatibility

4. **Update UI** (`src/popup/`, `src/options/`):
   - Add toggle switches for each reminder type
   - Per-reminder interval settings
   - Tabbed interface or sections

**Complexity:** Medium (requires careful state management for concurrent timers)

### 11.2 Adding Daily Statistics

**Use Case:** Track breaks taken, snooze count, pause duration.

**Required Changes:**

1. **Add Stats to State** (`src/shared/types.ts`):
   ```typescript
   export interface DailyStats {
     date: string;  // YYYY-MM-DD
     breaksTaken: number;
     snoozes: number;
     pauseDurationMinutes: number;
   }
   
   export interface RuntimeState {
     // ... existing fields
     dailyStats: DailyStats;
   }
   ```

2. **Track Events** (`src/background/service_worker.ts`):
   - Increment breaksTaken when notification shown
   - Increment snoozes when snooze clicked
   - Track pause duration

3. **Daily Reset Alarm**:
   ```typescript
   // Schedule alarm for midnight
   await chrome.alarms.create('daily-reset', {
     when: getNextMidnight()
   });
   
   chrome.alarms.onAlarm.addListener(async (alarm) => {
     if (alarm.name === 'daily-reset') {
       await resetDailyStats();
     }
   });
   ```

4. **Display Stats** (`src/popup/popup.ts`):
   - Show today's stats in popup
   - Weekly/monthly history in options page

**Complexity:** Low-Medium

### 11.3 Adding Sound Alerts

**Use Case:** Play sound along with notification.

**Required Changes:**

1. **Add Audio Assets**:
   - Add sound files to `src/assets/sounds/`
   - Update manifest to include web_accessible_resources if needed

2. **Update Notification** (`src/background/service_worker.ts`):
   ```typescript
   async function showNotification(): Promise<void> {
     // ... existing code
     await playNotificationSound();
   }
   
   async function playNotificationSound(): Promise<void> {
     const audio = new Audio(chrome.runtime.getURL('src/assets/sounds/alert.mp3'));
     await audio.play();
   }
   ```

3. **Add Volume/Mute Setting** (`src/shared/types.ts`):
   ```typescript
   export interface Settings {
     // ... existing fields
     soundEnabled: boolean;
     soundVolume: number;  // 0-100
   }
   ```

**Complexity:** Low (no new permissions needed)

### 11.4 Adding Do Not Disturb Schedule

**Use Case:** Automatically pause during meetings or sleep hours.

**Required Changes:**

1. **Add Schedule Settings** (`src/shared/types.ts`):
   ```typescript
   export interface DoNotDisturbSchedule {
     enabled: boolean;
     startTime: string;  // "22:00"
     endTime: string;    // "08:00"
     days: number[];     // [0, 1, 2, 3, 4, 5, 6] (0 = Sunday)
   }
   ```

2. **Check Schedule** (`src/background/service_worker.ts`):
   ```typescript
   function isInDoNotDisturb(): boolean {
     const now = new Date();
     const currentTime = `${now.getHours()}:${now.getMinutes()}`;
     const currentDay = now.getDay();
     
     // Check if current time is within DND window
     // and current day is in enabled days
   }
   
   // In alarm handler
   if (isInDoNotDisturb()) {
     // Skip notification, reschedule for after DND ends
   }
   ```

**Complexity:** Low-Medium

### 11.5 Adding Keyboard Shortcuts

**Use Case:** Quick actions via keyboard (e.g., Ctrl+Shift+B for break now).

**Required Changes:**

1. **Add to Manifest** (`src/manifest.json`):
   ```json
   {
     "commands": {
       "take-break": {
         "suggested_key": {
           "default": "Ctrl+Shift+B"
         },
         "description": "Take a break now"
       }
     }
   }
   ```

2. **Handle Commands** (`src/background/service_worker.ts`):
   ```typescript
   chrome.commands.onCommand.addListener(async (command) => {
     if (command === 'take-break') {
       await handleTakeBreakNow();
     }
   });
   ```

**Complexity:** Low

### 11.6 Adding Integration with Health Apps

**Use Case:** Sync with Apple Health, Google Fit, etc.

**Required Changes:**

1. **New Permissions**:
   - Requires `identity` permission for OAuth
   - External API calls (no new manifest permissions)

2. **OAuth Flow**:
   - Authenticate with health platform
   - Store access token securely

3. **Data Sync**:
   - Periodically sync break data
   - Convert breaks to health platform format

**Complexity:** High (requires external API integration)

---

## 12. KEY DESIGN PATTERNS

### 12.1 Single Source of Truth

**Pattern:** All state lives in Chrome storage. UI layers are views that read from storage.

**Implementation:**
- Background script owns timer logic and state mutations
- Popup/options only read from storage and send commands
- State changes trigger UI updates via message passing

**Benefit:** No state synchronization issues, consistent behavior across all UI contexts.

### 12.2 Defensive Programming

**Pattern:** Validate all inputs, handle errors gracefully, never crash.

**Implementation:**
```typescript
// Input validation
const interval = message.payload?.interval as number;
if (typeof interval !== 'number') return;
if (interval < MIN_INTERVAL || interval > MAX_INTERVAL) return;

// Error handling
try {
  await chrome.alarms.create(ALARM_NAME, { delayInMinutes });
} catch (error) {
  console.error('[Breaksy] Failed to schedule alarm:', error);
}
```

### 12.3 Anti-Spam Protection

**Pattern:** Prevent rapid-fire notifications.

**Implementation:**
```typescript
if (state.lastNotifiedAt && now - state.lastNotifiedAt < ANTI_SPAM_WINDOW_MS) {
  console.log('[Breaksy] Skipping notification - within anti-spam window');
  return;
}
```

### 12.4 Browser Restart Recovery

**Pattern:** Persist critical timer state to survive browser restarts.

**Implementation:**
- Store `timerEndsAt` timestamp
- On startup, calculate remaining time from persisted timestamp
- Resume countdown or trigger missed notification

### 12.5 Event-Driven Architecture

**Pattern:** Use Chrome extension events for all major actions.

**Events Used:**
- `chrome.runtime.onInstalled` / `onStartup`
- `chrome.alarms.onAlarm`
- `chrome.idle.onStateChanged`
- `chrome.notifications.onButtonClicked` / `onClicked` / `onClosed`
- `chrome.runtime.onMessage`

### 12.6 Modular TypeScript

**Pattern:** Strict typing with shared interfaces.

**Implementation:**
- Central types in `src/shared/types.ts`
- Reused across all modules
- No `any` types (strict mode enabled)

---

## 13. DEBUGGING

### 13.1 Viewing Extension Logs

**Method 1: Service Worker Console**
1. Navigate to `chrome://extensions/`
2. Enable "Developer mode"
3. Find Breaksy extension
4. Click on "service worker" link (under "Inspect views")
5. Console tab shows background script logs

**Method 2: Popup Console**
1. Click the Breaksy extension icon
2. Right-click on the popup
3. Select "Inspect"
4. Console tab shows popup logs

### 13.2 Common Log Prefixes

All logs use consistent prefixes for filtering:

| Prefix | Source | Example |
|--------|--------|---------|
| `[Breaksy]` | Background script | `[Breaksy] Alarm scheduled in 1200s` |
| `[Background]` | Message handler | `[Background] Received message: GET_STATE` |
| `[Popup]` | Popup script | `[Popup] Requesting state from background...` |

### 13.3 Useful Debugging Commands

**In Service Worker Console:**
```javascript
// Check current alarm
await chrome.alarms.getAll();

// Check storage
await chrome.storage.sync.get();
await chrome.storage.local.get();

// Clear all alarms
await chrome.alarms.clearAll();

// Reset extension
chrome.runtime.reload();
```

### 13.4 Testing Checklist

- [ ] Extension loads without errors
- [ ] Popup shows correct countdown
- [ ] Interval changes update timer
- [ ] Notifications appear at correct time
- [ ] Snooze delays next notification
- [ ] Pause stops countdown
- [ ] Resume continues countdown
- [ ] Idle detection pauses timer
- [ ] After browser restart, timer resumes correctly
- [ ] Anti-spam prevents duplicate notifications

---

## 14. CHROME APIs USED

### 14.1 API Reference Table

| API | Purpose | Permission | Key Methods |
|-----|---------|------------|-------------|
| `chrome.alarms` | Schedule reliable background timers | `alarms` | `create()`, `clear()`, `onAlarm` |
| `chrome.notifications` | Show break reminder popups | `notifications` | `create()`, `clear()`, button events |
| `chrome.storage.sync` | Persist settings cross-device | `storage` | `get()`, `set()` |
| `chrome.storage.local` | Persist runtime state | `storage` | `get()`, `set()` |
| `chrome.idle` | Detect user inactivity | `idle` | `onStateChanged`, `queryState()` |
| `chrome.runtime` | Message passing, lifecycle | - | `sendMessage()`, `onMessage`, `onInstalled` |

### 14.2 API Quotas and Limitations

| API | Quota/Limit | Notes |
|-----|-------------|-------|
| `chrome.alarms` | No explicit limit | Alarms fire even when computer is asleep |
| `chrome.notifications` | User-dismissible | `requireInteraction: true` for persistent |
| `chrome.storage.sync` | 102,400 bytes | Suitable for small settings objects |
| `chrome.storage.local` | 10,485,760 bytes | 10MB limit, more suitable for state |
| `chrome.idle` | 15-second minimum | Cannot detect idle faster than 15 seconds |

### 14.3 Service Worker Lifecycle

**Important:** Service workers in Manifest V3 have event-driven lifecycle:
- **Active:** When event handlers are executing
- **Inactive:** After ~30 seconds of inactivity (suspended)
- **Wake:** Chrome wakes service worker when events occur

**Implication:** Never rely on in-memory state. Always persist to storage.

---

## 15. NEXT STEPS FOR AI ASSISTANCE

### 15.1 How to Use This Manual

When working with AI to add features, provide:

1. **This manual** - Reference this file
2. **Specific requirements** - Exactly what feature to add
3. **File paths** - Which files need modification
4. **Constraints** - Any specific requirements or limitations

### 15.2 Example Prompts

#### Adding Water Reminder
```
Based on the Breaksy manual, add a water drinking reminder feature:
- New reminder type alongside existing eye breaks
- Every 60 minutes by default (configurable 15-240 min)
- Enable/disable independently from eye breaks
- Shows "Time to hydrate 💧 - Drink a glass of water" notification
- Separate snooze duration (default 10 min)
- Update both popup and options pages
- Maintain backward compatibility with existing settings

Key files to modify:
- src/shared/types.ts - Add water reminder types
- src/shared/storage.ts - Handle migration
- src/background/service_worker.ts - Support multiple alarms
- src/options/options.html - Add water settings section
- src/options/options.ts - Handle water settings
- src/popup/popup.html - Add water status
- src/popup/popup.ts - Show water countdown
```

#### Adding Sound Alerts
```
Based on the Breaksy manual, add optional sound alerts:
- Play sound when notification appears
- Add soundEnabled boolean to settings (default true)
- Add soundVolume to settings (0-100, default 50)
- Add sound file (bell.mp3) to assets
- Update notification handler to play sound
- Add sound settings to options page
- No new permissions needed

Key files:
- src/shared/types.ts - Add sound settings
- src/background/service_worker.ts - Play sound in showNotification
- src/options/options.html - Add sound controls
- src/options/options.ts - Handle sound settings
```

#### Adding Daily Stats
```
Based on the Breaksy manual, add daily statistics tracking:
- Track: breaks taken, snoozes clicked, pause duration
- Reset stats daily at midnight
- Show today's stats in popup footer
- Show weekly stats in options page
- Persist stats in local storage

Key files:
- src/shared/types.ts - Add DailyStats interface
- src/background/service_worker.ts - Track events, schedule daily reset
- src/popup/popup.html - Add stats display area
- src/popup/popup.ts - Show current stats
- src/options/options.html - Add stats section
- src/options/options.ts - Display historical stats
```

### 15.3 Important Notes for AI

1. **Always validate:** Ensure AI validates all inputs against constants
2. **Error handling:** Require try-catch blocks for all async operations
3. **Storage:** Remind AI to persist all state changes
4. **Migration:** If changing data models, require migration logic
5. **Testing:** Ask AI to suggest test cases for new features
6. **Permissions:** If new permissions needed, update manifest.json
7. **TypeScript:** Maintain strict typing, no `any` types
8. **Logging:** Use `[Breaksy]` prefix for all console logs

---

## APPENDIX A: FILE LINE REFERENCES

Quick reference for key code locations:

| File | Line | Content |
|------|------|---------|
| `types.ts` | 1-5 | Settings interface |
| `types.ts` | 7-17 | RuntimeState interface |
| `types.ts` | 19-22 | Message interface |
| `types.ts` | 24-33 | MessageType union |
| `types.ts` | 41-45 | DEFAULT_SETTINGS |
| `types.ts` | 59-68 | Constants |
| `storage.ts` | 3-6 | STORAGE_KEYS |
| `storage.ts` | 8-11 | getSettings() |
| `service_worker.ts` | 15-19 | onInstalled listener |
| `service_worker.ts` | 27-50 | initializeExtension() |
| `service_worker.ts` | 52-80 | restoreState() |
| `service_worker.ts` | 89-113 | handleIdleStateChange() |
| `service_worker.ts` | 115-149 | scheduleReminder() |
| `service_worker.ts` | 156-174 | alarms.onAlarm listener |
| `service_worker.ts` | 176-224 | showNotification() |
| `service_worker.ts` | 316-428 | onMessage listener |
| `popup.ts` | 49-78 | startCountdown() |
| `popup.ts` | 80-100 | refreshState() |
| `options.ts` | 20-41 | loadSettings() |

---

## APPENDIX B: COMMON MESSAGES

Message passing patterns used throughout:

```typescript
// Get state
const response = await chrome.runtime.sendMessage({ type: 'GET_STATE' });

// Update interval
await chrome.runtime.sendMessage({
  type: 'SET_INTERVAL',
  payload: { interval: 30 }
});

// Toggle pause
await chrome.runtime.sendMessage({ type: 'TOGGLE_PAUSE' });

// Immediate break
await chrome.runtime.sendMessage({ type: 'TAKE_BREAK_NOW' });

// Snooze
await chrome.runtime.sendMessage({ type: 'SNOOZE' });

// Resume
await chrome.runtime.sendMessage({ type: 'RESUME' });

// Reset all
await chrome.runtime.sendMessage({ type: 'RESET' });
```

---

**End of Technical Manual**

---

*For updates or questions about this documentation, refer to the codebase or ask an AI assistant with this manual as context.*
