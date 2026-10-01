import { BOARD_MODES, MODE_PRESETS, switchMode } from '../core/modes'
import type { GroupBy, Mode, Settings, UnassignedMode } from '../core/types'
import { setText } from './apply'

export interface ToolbarState {
  /** Column names on the current board, in board order, hidden ones included. */
  columns: string[]
  /** False when the view hides the Labels field, which blinds the AI rule. */
  labelsVisible: boolean
}

const MODES: Mode[] = ['show', 'dim', 'hide']
const UNASSIGNED_MODES: UnassignedMode[] = ['show', 'highlight', 'dim', 'hide']
const GROUPS: GroupBy[] = ['none', 'assignee']
const GROUP_LABEL: Record<GroupBy, string> = { none: 'off', assignee: 'assignee' }

/** Redraws one control from the current settings. */
type Renderer = (settings: Settings) => void

function button(className: string, text: string): HTMLButtonElement {
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = className
  btn.textContent = text
  return btn
}

/** A floating bar appended to <body>, deliberately outside the React-managed board tree: the mode switch, a
 *  status that only shows when there is something to say, and a settings panel. */
export class Toolbar {
  private root: HTMLElement
  private status: HTMLElement
  private columnsList!: HTMLElement
  private groupNote!: HTMLElement
  private columns: string[] = []
  private renderers = new Map<keyof Settings | 'mode', Renderer>()
  private lastState: ToolbarState = { columns: [], labelsVisible: true }

  constructor(
    private settings: Settings,
    private onChange: (patch: Partial<Settings>) => Promise<void>,
  ) {
    this.root = document.createElement('div')
    this.root.className = 'bd-toolbar'
    this.root.setAttribute('role', 'toolbar')
    this.root.setAttribute('aria-label', 'Board Declutter')

    // First: switching modes is the main thing the toolbar is for.
    this.addModeMenu()

    this.status = document.createElement('span')
    this.status.className = 'bd-toolbar__status'
    this.status.setAttribute('role', 'status')
    this.root.appendChild(this.status)

    this.addSettingsPanel()

    document.body.appendChild(this.root)
    this.render()
  }

  /** A button that opens a popover above the toolbar; the popover closes on any outside click. */
  private addDropdown(
    key: string,
    text: string,
    popupRole: 'menu' | 'dialog',
    popupLabel: string,
  ): { wrapper: HTMLElement; btn: HTMLButtonElement; popup: HTMLElement; close: () => void } {
    const wrapper = document.createElement('div')
    wrapper.className = 'bd-toolbar__dropdown'

    const btn = button('bd-toolbar__btn', text)
    btn.dataset.key = key
    btn.setAttribute('aria-haspopup', popupRole)
    btn.setAttribute('aria-expanded', 'false')
    wrapper.appendChild(btn)

    const popup = document.createElement('div')
    popup.className = 'bd-toolbar__menu'
    popup.setAttribute('role', popupRole)
    popup.setAttribute('aria-label', popupLabel)
    popup.hidden = true
    wrapper.appendChild(popup)

    const setOpen = (open: boolean): void => {
      popup.hidden = !open
      btn.setAttribute('aria-expanded', String(open))
    }
    btn.addEventListener('click', () => setOpen(popup.hidden))
    document.addEventListener('click', (event) => {
      if (!popup.hidden && !wrapper.contains(event.target as Node)) setOpen(false)
    })

    this.root.appendChild(wrapper)
    return { wrapper, btn, popup, close: () => setOpen(false) }
  }

  /** "Mode" opens the list of modes, each with what it does; picking one switches to it. */
  private addModeMenu(): void {
    const { wrapper, btn, popup, close } = this.addDropdown('mode', '', 'menu', 'Board mode')
    wrapper.classList.add('bd-toolbar__mode')
    popup.classList.add('bd-toolbar__menu--modes')
    const items = BOARD_MODES.map((mode) => {
      const item = button('bd-toolbar__menu-item bd-toolbar__mode-item', '')
      item.setAttribute('role', 'menuitemradio')
      const name = document.createElement('span')
      name.textContent = MODE_PRESETS[mode].label
      const description = document.createElement('small')
      description.textContent = MODE_PRESETS[mode].description
      item.append(name, description)
      item.addEventListener('click', () => {
        close()
        if (mode !== this.settings.mode) void this.onChange(switchMode(this.settings, mode))
      })
      popup.appendChild(item)
      return [mode, item] as const
    })
    this.renderers.set('mode', () => {
      setText(btn, `Mode: ${MODE_PRESETS[this.settings.mode].label} ▾`)
      for (const [mode, item] of items) {
        item.setAttribute('aria-checked', String(mode === this.settings.mode))
      }
    })
  }

  /** ⚙ opens every setting at once, grouped: the rules, the layout and the board's columns. */
  private addSettingsPanel(): void {
    const { popup } = this.addDropdown('settings', '⚙ ▾', 'dialog', 'Board Declutter settings')
    popup.classList.add('bd-toolbar__panel')

    const rules = this.addSection(popup, 'Rules')
    this.addSegmented(rules, 'aiMode', 'AI', MODES)
    this.addSegmented(rules, 'nonAiMode', 'Not AI', MODES)
    this.addSegmented(rules, 'unassignedMode', 'Unassigned', UNASSIGNED_MODES)
    this.addSegmented(rules, 'otherTeamsMode', 'Other teams', MODES)

    const layout = this.addSection(popup, 'Layout')
    const switches = document.createElement('div')
    switches.className = 'bd-toolbar__switches'
    layout.appendChild(switches)
    this.addSwitch(
      switches,
      'compact',
      'Compact',
      'One-line titles, no labels or other field chips under them',
    )
    this.addSwitch(
      switches,
      'focus',
      'Full-screen board',
      "Hide GitHub's header, the project title and the view tabs; push the mouse against the top edge to bring them back",
    )
    this.addSwitch(
      switches,
      'split',
      'Split issues / PRs',
      'Issues on the left, pull requests on the right, newest first, in the columns listed under "Columns to split" on the options page (No Status by default)',
    )
    this.addSwitch(
      switches,
      'highlightMine',
      'Highlight mine',
      'Blue marker on cards assigned to you',
    )
    this.addSwitch(
      switches,
      'preloadColumns',
      'Preload cards',
      'Disable lazy-loading: fetch every card of each column when the board opens, instead of as you scroll',
    )
    this.addSegmented(layout, 'groupBy', 'Group by', GROUPS, (g) => GROUP_LABEL[g])
    // Groups come from GitHub's sort over the cards it has loaded; without preloading, the rest only joins
    // its group once a scroll loads it.
    this.groupNote = document.createElement('p')
    this.groupNote.className = 'bd-toolbar__note'
    this.groupNote.textContent =
      '⚠ Turn on Preload cards while grouping: cards not loaded yet are not grouped or shown until they load.'
    layout.appendChild(this.groupNote)

    const columns = this.addSection(popup, 'Columns')
    this.columnsList = document.createElement('div')
    this.columnsList.className = 'bd-toolbar__columns'
    this.columnsList.setAttribute('role', 'group')
    this.columnsList.setAttribute('aria-label', 'Visible columns')
    columns.appendChild(this.columnsList)

    const footer = document.createElement('div')
    footer.className = 'bd-toolbar__panel-footer'
    this.addSwitch(footer, 'enabled', 'On')
    const options = button('bd-toolbar__link', 'Options page ↗')
    options.addEventListener('click', () => chrome.runtime.sendMessage({ type: 'open-options' }))
    footer.appendChild(options)
    popup.appendChild(footer)
  }

  private addSection(panel: HTMLElement, title: string): HTMLElement {
    const section = document.createElement('section')
    section.className = 'bd-toolbar__section'
    const heading = document.createElement('h2')
    heading.textContent = title
    section.appendChild(heading)
    panel.appendChild(section)
    return section
  }

  /** A row with one button per value, the one in force pressed. Shows every option of a setting at once. */
  private addSegmented<K extends keyof Settings>(
    parent: HTMLElement,
    key: K,
    label: string,
    values: Settings[K][],
    text: (value: Settings[K]) => string = String,
  ): void {
    const row = document.createElement('div')
    row.className = 'bd-toolbar__row'
    const name = document.createElement('span')
    name.textContent = label
    const group = document.createElement('div')
    group.className = 'bd-toolbar__segmented'
    group.dataset.key = key
    group.setAttribute('role', 'group')
    group.setAttribute('aria-label', label)
    const buttons = values.map((value) => {
      const btn = button('bd-toolbar__segment', text(value))
      btn.dataset.value = String(value)
      btn.addEventListener('click', () => {
        if (this.settings[key] !== value) void this.onChange({ [key]: value } as Partial<Settings>)
      })
      group.appendChild(btn)
      return [value, btn] as const
    })
    row.append(name, group)
    parent.appendChild(row)
    this.renderers.set(key, (settings) => {
      for (const [value, btn] of buttons) {
        btn.setAttribute('aria-pressed', String(settings[key] === value))
      }
    })
  }

  private addSwitch(parent: HTMLElement, key: keyof Settings, label: string, tip = ''): void {
    const btn = button('bd-toolbar__switch', label)
    btn.dataset.key = key
    btn.setAttribute('role', 'switch')
    btn.title = tip
    btn.addEventListener('click', () => void this.onChange({ [key]: !this.settings[key] }))
    parent.appendChild(btn)
    this.renderers.set(key, (settings) => {
      btn.setAttribute('aria-checked', String(Boolean(settings[key])))
    })
  }

  private renderColumns(): void {
    const hidden = new Set(this.settings.hiddenColumns.map((c) => c.trim().toLowerCase()))
    const wanted = this.columns
      .map((name) => `${name}\u0000${hidden.has(name.trim().toLowerCase())}`)
      .join('|')
    if (this.columnsList.dataset.rendered === wanted) return
    this.columnsList.dataset.rendered = wanted
    this.columnsList.replaceChildren()
    if (this.columns.length === 0) {
      const empty = document.createElement('span')
      empty.className = 'bd-toolbar__empty'
      empty.textContent = 'No board columns found'
      this.columnsList.appendChild(empty)
      return
    }
    for (const name of this.columns) {
      const label = document.createElement('label')
      label.className = 'bd-toolbar__column'
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
      const text = document.createElement('span')
      text.textContent = name
      label.append(box, text)
      this.columnsList.appendChild(label)
    }
  }

  setSettings(settings: Settings): void {
    this.settings = settings
    this.render()
  }

  update(state: ToolbarState): void {
    this.lastState = state
    this.columns = state.columns
    this.renderStatus()
    this.renderColumns()
  }

  /** "Off", or a warning about something the view keeps from the rules; empty (and hidden) otherwise. */
  private renderStatus(): void {
    let text = ''
    let tip = ''
    if (!this.settings.enabled) {
      text = 'Off'
    } else if (
      (this.settings.aiMode !== 'show' || this.settings.nonAiMode !== 'show') &&
      !this.lastState.labelsVisible
    ) {
      text = '⚠ labels hidden'
      tip =
        'This view does not show the Labels field, so the AI rule cannot see the "self-driving" label. Enable it under View → Fields → Labels.'
    }
    setText(this.status, text)
    this.status.hidden = text === ''
    if (this.status.title !== tip) this.status.title = tip
  }

  private render(): void {
    this.root.toggleAttribute('data-disabled', !this.settings.enabled)
    this.root.toggleAttribute('data-mode-active', this.settings.mode !== 'normal')
    for (const render of this.renderers.values()) render(this.settings)
    this.groupNote.hidden = this.settings.groupBy === 'none' || this.settings.preloadColumns
    this.renderStatus()
    this.renderColumns()
  }
}
