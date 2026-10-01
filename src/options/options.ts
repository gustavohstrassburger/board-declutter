import { applyChange, BOARD_MODES, MODE_PRESETS, switchMode } from '../core/modes'
import {
  DEFAULT_SETTINGS,
  loadSettings,
  onSettingsChange,
  parseList,
  saveSettings,
} from '../core/settings'
import type { BoardMode, GroupBy, Mode, Settings, UnassignedMode } from '../core/types'

const MODES: Mode[] = ['show', 'dim', 'hide']
const UNASSIGNED_MODES: UnassignedMode[] = ['show', 'highlight', 'dim', 'hide']
const LIST_FIELDS = [
  'views',
  'teamMembers',
  'teamLabels',
  'aiLabels',
  'titlePatterns',
  'collapsedColumns',
  'splitColumns',
] as const
const MODE_FIELDS = ['aiMode', 'nonAiMode', 'otherTeamsMode', 'notMineMode'] as const

const form = document.querySelector<HTMLFormElement>('#form')!
const status = document.querySelector<HTMLElement>('#status')!
/** The settings the form was last filled from (or last saved). Save only sends the fields edited since, so
 *  changes made meanwhile from the toolbar survive. */
let filled: Settings | undefined

function field<T extends HTMLElement>(name: string): T {
  return form.elements.namedItem(name) as unknown as T
}

function addOptions(select: HTMLSelectElement, values: string[], label = (v: string) => v): void {
  for (const value of values) {
    const option = document.createElement('option')
    option.value = value
    option.textContent = label(value)
    select.appendChild(option)
  }
}

for (const select of form.querySelectorAll<HTMLSelectElement>('select[data-mode]')) {
  addOptions(select, select.name === 'unassignedMode' ? UNASSIGNED_MODES : MODES)
}
addOptions(field<HTMLSelectElement>('mode'), BOARD_MODES, (m) => MODE_PRESETS[m as BoardMode].label)

function fill(settings: Settings): void {
  filled = settings
  field<HTMLSelectElement>('mode').value = settings.mode
  document.querySelector('#mode-description')!.textContent = MODE_PRESETS[settings.mode].description
  field<HTMLInputElement>('me').value = settings.me
  field<HTMLInputElement>('highlightMine').checked = settings.highlightMine
  field<HTMLInputElement>('compact').checked = settings.compact
  field<HTMLSelectElement>('groupBy').value = settings.groupBy
  field<HTMLInputElement>('focus').checked = settings.focus
  field<HTMLInputElement>('split').checked = settings.split
  field<HTMLInputElement>('preloadColumns').checked = settings.preloadColumns
  field<HTMLSelectElement>('unassignedMode').value = settings.unassignedMode
  for (const name of MODE_FIELDS) field<HTMLSelectElement>(name).value = settings[name]
  for (const name of LIST_FIELDS) field<HTMLTextAreaElement>(name).value = settings[name].join('\n')
}

/** The form's values over `current`. The mode is not among them: it is saved as soon as it is picked. */
function read(current: Settings): Settings {
  const next: Settings = {
    ...current,
    me: field<HTMLInputElement>('me').value.trim(),
    highlightMine: field<HTMLInputElement>('highlightMine').checked,
    compact: field<HTMLInputElement>('compact').checked,
    groupBy: field<HTMLSelectElement>('groupBy').value as GroupBy,
    focus: field<HTMLInputElement>('focus').checked,
    split: field<HTMLInputElement>('split').checked,
    preloadColumns: field<HTMLInputElement>('preloadColumns').checked,
  }
  next.unassignedMode = field<HTMLSelectElement>('unassignedMode').value as UnassignedMode
  for (const name of MODE_FIELDS) next[name] = field<HTMLSelectElement>(name).value as Mode
  for (const name of LIST_FIELDS) next[name] = parseList(field<HTMLTextAreaElement>(name).value)
  return next
}

function changedFields(before: Settings, after: Settings): Partial<Settings> {
  return Object.fromEntries(
    Object.entries(after).filter(
      ([key, value]) => JSON.stringify(value) !== JSON.stringify(before[key as keyof Settings]),
    ),
  ) as Partial<Settings>
}

function flash(text: string): void {
  status.textContent = text
  setTimeout(() => (status.textContent = ''), 2000)
}

async function persist(settings: Settings): Promise<void> {
  try {
    await saveSettings(settings)
    flash('Saved')
  } catch (err) {
    flash(`Could not save: ${err instanceof Error ? err.message : String(err)}`)
  }
}

// Handlers are attached synchronously: a submit that lands before the async load would otherwise be a native
// GET submission that reloads the page with every field in the URL.
form.addEventListener('submit', async (event) => {
  event.preventDefault()
  if (!filled) return
  // Only what was edited here goes over the latest stored settings, so the toolbar's changes are kept.
  const edited = read(filled)
  const edits = changedFields(filled, edited)
  filled = edited
  await persist(applyChange(await loadSettings(), edits))
})

document.querySelector('#reset')!.addEventListener('click', async () => {
  const settings = { ...DEFAULT_SETTINGS, me: field<HTMLInputElement>('me').value.trim() }
  fill(settings)
  await persist(settings)
})

// The mode is a switch, like on the toolbar: it applies at once rather than waiting for Save, and the form
// then shows the defaults it set.
field<HTMLSelectElement>('mode').addEventListener('change', async () => {
  const mode = field<HTMLSelectElement>('mode').value as BoardMode
  await persist(switchMode(await loadSettings(), mode))
})

// A mode switch (here or on the toolbar) rewrites many fields at once; show them, so a later Save does not
// undo the switch. Other changes are left alone: refilling would throw away edits not saved yet.
onSettingsChange((settings) => {
  if (settings.mode !== filled?.mode) fill(settings)
})

void loadSettings().then(fill)
