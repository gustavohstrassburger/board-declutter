import { DEFAULT_SETTINGS, loadSettings, parseList, saveSettings } from '../core/settings'
import type { Mode, Settings } from '../core/types'

const MODES: Mode[] = ['show', 'dim', 'hide']
const LIST_FIELDS = ['teamMembers', 'teamLabels', 'titlePatterns', 'collapsedColumns'] as const
const MODE_FIELDS = ['unassignedMode', 'otherTeamsMode'] as const

const form = document.querySelector<HTMLFormElement>('#form')!
const status = document.querySelector<HTMLElement>('#status')!

function field<T extends HTMLElement>(name: string): T {
  return form.elements.namedItem(name) as unknown as T
}

for (const select of form.querySelectorAll<HTMLSelectElement>('select[data-mode]')) {
  for (const mode of MODES) {
    const option = document.createElement('option')
    option.value = mode
    option.textContent = mode
    select.appendChild(option)
  }
}

function fill(settings: Settings): void {
  field<HTMLInputElement>('me').value = settings.me
  field<HTMLInputElement>('compact').checked = settings.compact
  field<HTMLInputElement>('groupByAssignee').checked = settings.groupByAssignee
  for (const name of MODE_FIELDS) field<HTMLSelectElement>(name).value = settings[name]
  for (const name of LIST_FIELDS) field<HTMLTextAreaElement>(name).value = settings[name].join('\n')
}

function read(current: Settings): Settings {
  const next: Settings = {
    ...current,
    me: field<HTMLInputElement>('me').value.trim(),
    compact: field<HTMLInputElement>('compact').checked,
    groupByAssignee: field<HTMLInputElement>('groupByAssignee').checked,
  }
  for (const name of MODE_FIELDS) next[name] = field<HTMLSelectElement>(name).value as Mode
  for (const name of LIST_FIELDS) next[name] = parseList(field<HTMLTextAreaElement>(name).value)
  return next
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

async function main(): Promise<void> {
  fill(await loadSettings())

  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    // Re-read storage so fields not on this form (e.g. the toolbar's On/Off) keep their latest value.
    await persist(read(await loadSettings()))
  })

  document.querySelector('#reset')!.addEventListener('click', async () => {
    const settings = { ...DEFAULT_SETTINGS, me: field<HTMLInputElement>('me').value.trim() }
    fill(settings)
    await persist(settings)
  })
}

void main()
