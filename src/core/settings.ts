import type { Settings } from './types'

export const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  unassignedMode: 'show',
  teamMembers: [],
  teamLabels: [],
  otherTeamsMode: 'show',
  titlePatterns: [],
  collapsedColumns: [],
  hiddenColumns: [],
  compact: false,
  groupByAssignee: false,
  focus: false,
  me: '',
}

const STORAGE_KEY = 'settings'

/** Merge stored values over defaults so new settings keys get a value after an upgrade. */
export function mergeSettings(stored: Partial<Settings> | undefined): Settings {
  return { ...DEFAULT_SETTINGS, ...(stored ?? {}) }
}

export async function loadSettings(): Promise<Settings> {
  const result = await chrome.storage.sync.get(STORAGE_KEY)
  return mergeSettings(result[STORAGE_KEY] as Partial<Settings> | undefined)
}

export async function saveSettings(settings: Settings): Promise<void> {
  await chrome.storage.sync.set({ [STORAGE_KEY]: settings })
}

export function onSettingsChange(listener: (settings: Settings) => void): void {
  chrome.storage.sync.onChanged.addListener((changes) => {
    const change = changes[STORAGE_KEY]
    if (change) listener(mergeSettings(change.newValue as Partial<Settings> | undefined))
  })
}

/** Parse a textarea/list input: one entry per line or comma, trimmed, empties dropped. */
export function parseList(raw: string): string[] {
  return raw
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean)
}
