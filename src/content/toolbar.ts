import type { Mode, Settings } from '../core/types'
import { setText } from './apply'

export interface ToolbarState {
  total: number
  hidden: number
  dimmed: number
}

const MODE_LABEL: Record<Mode, string> = { show: 'show', dim: 'dim', hide: 'hide' }
const NEXT_MODE: Record<Mode, Mode> = { show: 'dim', dim: 'hide', hide: 'show' }

/** A floating panel appended to <body>, deliberately outside the React-managed board tree. */
export class Toolbar {
  private root: HTMLElement
  private summary: HTMLElement
  private buttons = new Map<string, HTMLButtonElement>()

  constructor(
    private settings: Settings,
    private onChange: (patch: Partial<Settings>) => Promise<void>,
  ) {
    this.root = document.createElement('div')
    this.root.className = 'bd-toolbar'
    this.root.setAttribute('role', 'toolbar')
    this.root.setAttribute('aria-label', 'Board Declutter')

    this.summary = document.createElement('span')
    this.summary.className = 'bd-toolbar__summary'
    this.root.appendChild(this.summary)

    this.addToggle(
      'enabled',
      () => (this.settings.enabled ? 'On' : 'Off'),
      () => ({ enabled: !this.settings.enabled }),
    )
    this.addToggle(
      'unassignedMode',
      () => `Unassigned: ${MODE_LABEL[this.settings.unassignedMode]}`,
      () => ({ unassignedMode: NEXT_MODE[this.settings.unassignedMode] }),
    )
    this.addToggle(
      'otherTeamsMode',
      () => `Other teams: ${MODE_LABEL[this.settings.otherTeamsMode]}`,
      () => ({ otherTeamsMode: NEXT_MODE[this.settings.otherTeamsMode] }),
    )
    this.addToggle(
      'compact',
      () => (this.settings.compact ? 'Compact ✓' : 'Compact'),
      () => ({ compact: !this.settings.compact }),
    )
    this.addToggle(
      'groupByAssignee',
      () => (this.settings.groupByAssignee ? 'By assignee ✓' : 'By assignee'),
      () => ({ groupByAssignee: !this.settings.groupByAssignee }),
    )

    const options = document.createElement('button')
    options.type = 'button'
    options.className = 'bd-toolbar__btn bd-toolbar__btn--icon'
    options.title = 'Board Declutter settings'
    options.textContent = '⚙'
    options.addEventListener('click', () => chrome.runtime.sendMessage({ type: 'open-options' }))
    this.root.appendChild(options)

    document.body.appendChild(this.root)
    this.render()
  }

  private addToggle(key: string, label: () => string, patch: () => Partial<Settings>): void {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'bd-toolbar__btn'
    btn.addEventListener('click', () => void this.onChange(patch()))
    this.buttons.set(key, btn)
    this.root.appendChild(btn)
    btn.textContent = label()
    ;(btn as HTMLButtonElement & { bdLabel: () => string }).bdLabel = label
  }

  setSettings(settings: Settings): void {
    this.settings = settings
    this.render()
  }

  update(state: ToolbarState): void {
    setText(this.summary, `${state.hidden} hidden · ${state.dimmed} dimmed · ${state.total} cards`)
  }

  private render(): void {
    this.root.toggleAttribute('data-disabled', !this.settings.enabled)
    for (const btn of this.buttons.values()) {
      setText(btn, (btn as HTMLButtonElement & { bdLabel: () => string }).bdLabel())
    }
  }
}
