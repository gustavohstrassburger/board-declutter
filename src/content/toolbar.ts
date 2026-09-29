import type { Mode, Settings } from '../core/types'
import { setText } from './apply'

export interface ToolbarState {
  total: number
  hidden: number
  dimmed: number
  /** Column names on the current board, in board order, hidden ones included. */
  columns: string[]
}

const MODE_LABEL: Record<Mode, string> = { show: 'show', dim: 'dim', hide: 'hide' }
const NEXT_MODE: Record<Mode, Mode> = { show: 'dim', dim: 'hide', hide: 'show' }

/** A floating panel appended to <body>, deliberately outside the React-managed board tree. */
export class Toolbar {
  private root: HTMLElement
  private summary: HTMLElement
  private buttons = new Map<string, HTMLButtonElement>()
  private columnsMenu: HTMLElement
  private columns: string[] = []

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
      'focus',
      () => (this.settings.focus ? 'Focus ✓' : 'Focus'),
      () => ({ focus: !this.settings.focus }),
    )
    this.addToggle(
      'groupByAssignee',
      () => (this.settings.groupByAssignee ? 'By assignee ✓' : 'By assignee'),
      () => ({ groupByAssignee: !this.settings.groupByAssignee }),
    )

    this.columnsMenu = this.addColumnsMenu()

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

  /** "Columns" opens a checklist of the board's columns; unticking one hides it. Closes on any outside click. */
  private addColumnsMenu(): HTMLElement {
    const wrapper = document.createElement('div')
    wrapper.className = 'bd-toolbar__dropdown'

    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'bd-toolbar__btn'
    btn.setAttribute('aria-haspopup', 'true')
    btn.setAttribute('aria-expanded', 'false')
    wrapper.appendChild(btn)
    this.buttons.set('columns', btn)
    ;(btn as HTMLButtonElement & { bdLabel: () => string }).bdLabel = () => {
      const n = this.settings.hiddenColumns.length
      return n ? `Columns (${n} hidden)` : 'Columns'
    }

    const menu = document.createElement('div')
    menu.className = 'bd-toolbar__menu'
    menu.setAttribute('role', 'group')
    menu.setAttribute('aria-label', 'Visible columns')
    menu.hidden = true
    wrapper.appendChild(menu)

    btn.addEventListener('click', () => {
      menu.hidden = !menu.hidden
      btn.setAttribute('aria-expanded', String(!menu.hidden))
    })
    document.addEventListener('click', (event) => {
      if (!menu.hidden && !wrapper.contains(event.target as Node)) {
        menu.hidden = true
        btn.setAttribute('aria-expanded', 'false')
      }
    })

    this.root.appendChild(wrapper)
    return menu
  }

  private renderColumnsMenu(): void {
    const hidden = new Set(this.settings.hiddenColumns.map((c) => c.trim().toLowerCase()))
    const wanted = this.columns
      .map((name) => `${name}\u0000${hidden.has(name.trim().toLowerCase())}`)
      .join('|')
    if (this.columnsMenu.dataset.rendered === wanted) return
    this.columnsMenu.dataset.rendered = wanted
    this.columnsMenu.replaceChildren()
    if (this.columns.length === 0) {
      const empty = document.createElement('span')
      empty.className = 'bd-toolbar__menu-empty'
      empty.textContent = 'No board columns found'
      this.columnsMenu.appendChild(empty)
      return
    }
    for (const name of this.columns) {
      const label = document.createElement('label')
      label.className = 'bd-toolbar__menu-item'
      const box = document.createElement('input')
      box.type = 'checkbox'
      box.checked = !hidden.has(name.trim().toLowerCase())
      box.addEventListener('change', () => {
        const next = this.settings.hiddenColumns.filter(
          (c) => c.trim().toLowerCase() !== name.trim().toLowerCase(),
        )
        if (!box.checked) next.push(name)
        void this.onChange({ hiddenColumns: next })
      })
      label.appendChild(box)
      label.appendChild(document.createTextNode(` ${name}`))
      this.columnsMenu.appendChild(label)
    }
  }

  setSettings(settings: Settings): void {
    this.settings = settings
    this.render()
  }

  update(state: ToolbarState): void {
    setText(this.summary, `${state.hidden} hidden · ${state.dimmed} dimmed · ${state.total} cards`)
    this.columns = state.columns
    this.renderColumnsMenu()
  }

  private render(): void {
    this.root.toggleAttribute('data-disabled', !this.settings.enabled)
    for (const btn of this.buttons.values()) {
      setText(btn, (btn as HTMLButtonElement & { bdLabel: () => string }).bdLabel())
    }
    this.renderColumnsMenu()
  }
}
