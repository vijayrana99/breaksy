import { Settings, RuntimeState, DEFAULT_SETTINGS, DEFAULT_STATE } from './types';

const STORAGE_KEYS = {
  SETTINGS: 'breaksy-settings',
  STATE: 'breaksy-state',
} as const;

export async function getSettings(): Promise<Settings> {
  const result = await chrome.storage.sync.get(STORAGE_KEYS.SETTINGS);
  return (result[STORAGE_KEYS.SETTINGS] as Settings) || { ...DEFAULT_SETTINGS };
}

export async function setSettings(settings: Partial<Settings>): Promise<void> {
  const current = await getSettings();
  const merged = { ...current, ...settings };
  await chrome.storage.sync.set({ [STORAGE_KEYS.SETTINGS]: merged });
}

export async function getState(): Promise<RuntimeState> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.STATE);
  return (result[STORAGE_KEYS.STATE] as RuntimeState) || { ...DEFAULT_STATE };
}

export async function setState(state: Partial<RuntimeState>): Promise<void> {
  const current = await getState();
  const merged = { ...current, ...state };
  await chrome.storage.local.set({ [STORAGE_KEYS.STATE]: merged });
}

export async function getAll(): Promise<{ settings: Settings; state: RuntimeState }> {
  const [settings, state] = await Promise.all([getSettings(), getState()]);
  return { settings, state };
}

export async function resetToDefaults(): Promise<void> {
  await Promise.all([
    chrome.storage.sync.set({ [STORAGE_KEYS.SETTINGS]: { ...DEFAULT_SETTINGS } }),
    chrome.storage.local.set({ [STORAGE_KEYS.STATE]: { ...DEFAULT_STATE } }),
  ]);
}
