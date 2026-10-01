import { MODE_PRESETS, switchMode } from './modes'
import type { Settings } from './types'

export const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  // The PostHog Feature Flags board view that shows the Labels field, which the AI rules and modes rely on.
  views: ['https://github.com/orgs/PostHog/projects/112/views/6'],
  mode: 'normal',
  modeSnapshot: {},
  aiLabels: ['self-driving'],
  aiMode: 'dim',
  nonAiMode: 'show',
  unassignedMode: 'show',
  teamMembers: [],
  teamLabels: [],
  otherTeamsMode: 'show',
  notMineMode: 'show',
  titlePatterns: [],
  collapsedColumns: [],
  hiddenColumns: [],
  compact: false,
  groupBy: 'none',
  focus: false,
  split: false,
  splitColumns: ['No Status'],
  preloadColumns: true,
  noPreloadColumns: ['Done'],
  me: '',
  highlightMine: true,
}

const STORAGE_KEY = 'settings'

/** Merge stored values over defaults so new settings keys get a value after an upgrade. */
export function mergeSettings(stored: Partial<Settings> | undefined): Settings {
  const legacy = stored as (Partial<Settings> & { groupByAssignee?: boolean }) | undefined
  const merged = { ...DEFAULT_SETTINGS, ...(stored ?? {}) }
  // Earlier builds had a boolean for grouping by assignee.
  if (legacy?.groupByAssignee && !legacy.groupBy) merged.groupBy = 'assignee'
  // Grouping by parent issue was removed: it relied on a sort and a field token GitHub did not reliably give.
  if ((merged.groupBy as string) === 'parent') merged.groupBy = 'none'
  // A mode removed in a later build is left, which puts back the values it replaced.
  if (!Object.hasOwn(MODE_PRESETS, merged.mode)) return switchMode(merged, 'normal')
  return merged
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
