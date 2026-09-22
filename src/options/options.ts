import { DEFAULT_SETTINGS, loadSettings, parseList, saveSettings } from '../core/settings'
import { loadToken, saveToken } from '../core/token'
import type { Mode, Settings } from '../core/types'

const MODES: Mode[] = ['show', 'dim', 'hide']
const LIST_FIELDS = [
  'botAuthors',
  'teamMembers',
  'teamLabels',
  'titlePatterns',
  'collapsedColumns',
] as const

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
  field<HTMLInputElement>('staleDays').value = String(settings.staleDays)
  field<HTMLInputElement>('compact').checked = settings.compact
  for (const name of [
    'botMode',
    'draftMode',
    'unassignedMode',
    'otherTeamsMode',
    'staleMode',
  ] as const) {
    field<HTMLSelectElement>(name).value = settings[name]
  }
  for (const name of LIST_FIELDS) field<HTMLTextAreaElement>(name).value = settings[name].join('\n')
}

function read(current: Settings): Settings {
  const next: Settings = {
    ...current,
    me: field<HTMLInputElement>('me').value.trim(),
    staleDays: Math.max(0, Number(field<HTMLInputElement>('staleDays').value) || 0),
    compact: field<HTMLInputElement>('compact').checked,
  }
  for (const name of [
    'botMode',
    'draftMode',
    'unassignedMode',
    'otherTeamsMode',
    'staleMode',
  ] as const) {
    next[name] = field<HTMLSelectElement>(name).value as Mode
  }
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
    await saveToken(field<HTMLInputElement>('githubToken').value.trim())
    flash('Saved')
  } catch (err) {
    flash(`Could not save: ${err instanceof Error ? err.message : String(err)}`)
  }
}

async function main(): Promise<void> {
  fill(await loadSettings())
  field<HTMLInputElement>('githubToken').value = await loadToken()

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
