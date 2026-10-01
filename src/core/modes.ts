import type { BoardMode, Settings } from './types'

export interface ModePreset {
  label: string
  /** One line on what the mode does, shown in the toolbar's mode menu and on the options page. */
  description: string
  /** Settings the mode sets when it is picked; changing a view setting by hand leaves the mode (see `applyChange`). */
  settings: Partial<Settings>
  /** Columns the mode removes from view. */
  hiddenColumns: string[]
  /** Columns the mode makes visible (neither hidden nor collapsed). */
  shownColumns: string[]
}

/** The card rules. Every mode but Normal sets all of them, so a value left behind by another mode or by hand
 *  never changes what a mode shows. */
export const RULE_KEYS = [
  'aiMode',
  'nonAiMode',
  'unassignedMode',
  'otherTeamsMode',
  'notMineMode',
] as const satisfies readonly (keyof Settings)[]

export const MODE_PRESETS: Record<BoardMode, ModePreset> = {
  normal: {
    label: 'Normal',
    description: 'Your own settings.',
    settings: {},
    hiddenColumns: [],
    shownColumns: [],
  },
  planning: {
    label: 'Planning',
    description:
      "Your team's human work only: other teams and AI cards hidden, unassigned cards highlighted (yours are not), full-screen board and issue/PR split on, Done hidden.",
    settings: {
      // Only the ownerless cards should stand out while planning; a second marker colour would compete.
      highlightMine: false,
      otherTeamsMode: 'hide',
      aiMode: 'hide',
      nonAiMode: 'show',
      unassignedMode: 'highlight',
      notMineMode: 'show',
      focus: true,
      split: true,
    },
    hiddenColumns: ['Done'],
    shownColumns: ['No Status'],
  },
  // Bots open PRs for every team, so other teams stay visible; the unassigned ones are those nobody picked up.
  botTriage: {
    label: 'Bot triage',
    description:
      'AI cards only, from every team: everything else hidden, unassigned ones highlighted, full-screen board and issue/PR split on, Done hidden.',
    settings: {
      aiMode: 'show',
      nonAiMode: 'hide',
      otherTeamsMode: 'show',
      unassignedMode: 'highlight',
      notMineMode: 'show',
      focus: true,
      split: true,
    },
    hiddenColumns: ['Done'],
    shownColumns: ['No Status'],
  },
  // Every card left is yours, so the marker would only add noise; the other rules must not hide any of them.
  myCards: {
    label: 'My cards',
    description:
      'Only cards assigned to you, from every team, AI or not: full-screen board on, Done hidden. Needs your GitHub login in the options.',
    settings: {
      notMineMode: 'hide',
      highlightMine: false,
      aiMode: 'show',
      nonAiMode: 'show',
      otherTeamsMode: 'show',
      unassignedMode: 'show',
      focus: true,
      split: false,
    },
    hiddenColumns: ['Done'],
    shownColumns: ['No Status'],
  },
}

export const BOARD_MODES = Object.keys(MODE_PRESETS) as BoardMode[]

function normalizeColumn(name: string): string {
  return name.trim().toLowerCase()
}

function applyPreset(settings: Settings, preset: ModePreset): Settings {
  const forced = new Set(
    [...preset.hiddenColumns, ...preset.shownColumns].map((c) => normalizeColumn(c)),
  )
  const shown = new Set(preset.shownColumns.map((c) => normalizeColumn(c)))
  return {
    ...settings,
    ...preset.settings,
    hiddenColumns: [
      ...settings.hiddenColumns.filter((c) => !forced.has(normalizeColumn(c))),
      ...preset.hiddenColumns,
    ],
    collapsedColumns: settings.collapsedColumns.filter((c) => !shown.has(normalizeColumn(c))),
  }
}

/** Leave the current mode, putting back the values it replaced, then enter `next`: its preset becomes the
 *  settings and the values it replaces are kept in `modeSnapshot` for when another mode is picked. */
export function switchMode(settings: Settings, next: BoardMode): Settings {
  const restored: Settings = { ...settings, ...settings.modeSnapshot, modeSnapshot: {} }
  if (next === 'normal') return { ...restored, mode: 'normal' }
  const preset = MODE_PRESETS[next]
  const touched = [
    ...(Object.keys(preset.settings) as (keyof Settings)[]),
    'hiddenColumns',
    'collapsedColumns',
  ] as const
  const snapshot = Object.fromEntries(touched.map((key) => [key, restored[key]]))
  return { ...applyPreset(restored, preset), mode: next, modeSnapshot: snapshot }
}

/** The settings that shape what the board shows (the ones in the toolbar's ⚙ panel). Changing one by hand means
 *  the board is no longer what the mode set up; profile settings (login, team, labels, views) and On/Off are not
 *  among them. */
const VIEW_KEYS: (keyof Settings)[] = [
  ...RULE_KEYS,
  'compact',
  'focus',
  'split',
  'highlightMine',
  'preloadColumns',
  'groupBy',
  'hiddenColumns',
  'collapsedColumns',
]

/** Apply a change made by hand. Inside a mode, changing a view setting leaves the mode for Normal, keeping what
 *  is on the board (the change included) as the new own settings. Switching modes goes through `switchMode`. */
export function applyChange(settings: Settings, patch: Partial<Settings>): Settings {
  const next = { ...settings, ...patch }
  if (settings.mode === 'normal' || (patch.mode !== undefined && patch.mode !== settings.mode)) {
    return next
  }
  const changed = VIEW_KEYS.some(
    (key) => key in patch && JSON.stringify(patch[key]) !== JSON.stringify(settings[key]),
  )
  return changed ? { ...next, mode: 'normal', modeSnapshot: {} } : next
}
