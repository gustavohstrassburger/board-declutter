import type { Card, Decision } from '../core/types'
import { isRendered, loadMoreSentinels, SELECTORS, STACK_LOADER_CLASS } from './dom'

/** Decisions are stamped with the settings version they were made under.
 *  GitHub's virtualiser turns a hidden (display: none) card into an empty placeholder, which we can no longer
 *  parse; the stamp lets `resetStaleDecisions` release those cards when the rules change so they render again. */
export function applyDecision(el: Element, decision: Decision, version: number): void {
  if (decision.mode === 'show') el.removeAttribute('data-bd-mode')
  else el.setAttribute('data-bd-mode', decision.mode)

  if (decision.highlight) el.setAttribute('data-bd-highlight', '')
  else el.removeAttribute('data-bd-highlight')

  if (decision.attention) el.setAttribute('data-bd-attention', '')
  else el.removeAttribute('data-bd-attention')

  if (decision.ai) el.setAttribute('data-bd-ai', '')
  else el.removeAttribute('data-bd-ai')

  if (decision.reasons.length) el.setAttribute('data-bd-reasons', decision.reasons.join(' · '))
  else el.removeAttribute('data-bd-reasons')

  el.setAttribute('data-bd-v', String(version))
}

export function clearDecision(el: Element): void {
  el.removeAttribute('data-bd-mode')
  el.removeAttribute('data-bd-highlight')
  el.removeAttribute('data-bd-attention')
  el.removeAttribute('data-bd-ai')
  el.removeAttribute('data-bd-reasons')
  el.removeAttribute('data-bd-v')
}

/** Un-hide placeholder cards decided under an older settings version so the board renders them for re-evaluation. */
export function resetStaleDecisions(root: ParentNode, version: number): void {
  for (const el of root.querySelectorAll(SELECTORS.card)) {
    if (!isRendered(el) && el.getAttribute('data-bd-v') !== String(version)) clearDecision(el)
  }
}

/** Assigning textContent replaces the text node even when unchanged, which would feed the MutationObserver. */
export function setText(el: Element, text: string): void {
  if (el.textContent !== text) el.textContent = text
}

export interface ColumnStats {
  name: string
  total: number
  hidden: number
  dimmed: number
}

/** Counts every card shell in the column, placeholders included, from the attributes left on them. */
export function collectColumnStats(column: Element): ColumnStats {
  const stats: ColumnStats = {
    name: column.getAttribute('data-board-column') ?? '',
    total: 0,
    hidden: 0,
    dimmed: 0,
  }
  for (const el of column.querySelectorAll(SELECTORS.card)) {
    stats.total++
    const mode = el.getAttribute('data-bd-mode')
    if (mode === 'hide') stats.hidden++
    else if (mode === 'dim') stats.dimmed++
  }
  return stats
}

/** GitHub's own counter for the column ("82"), which covers cards the virtualiser has not put in the DOM. */
export function githubColumnCount(column: Element): number | undefined {
  const label = column.querySelector('[data-component="CounterLabel"]')
  const n = Number(label?.textContent?.trim())
  return Number.isInteger(n) ? n : undefined
}

/** Stats are only worth showing once every card shell of the column is in the DOM and evaluated; before that
 *  the number would drift as the column lazy-loads. */
export function chooseColumnStats(
  dom: ColumnStats,
  githubCount: number | undefined,
): ColumnStats | undefined {
  return githubCount !== undefined && dom.total === githubCount ? dom : undefined
}

/** Shows how many cards are actually visible right after GitHub's counter, e.g. "82" then "36 shown". */
export function applyColumnStats(column: Element, stats: ColumnStats | undefined): void {
  const header = column.firstElementChild
  if (!header) return
  let badge = header.querySelector<HTMLElement>('.bd-col-count')
  if (!stats || stats.hidden === 0) {
    badge?.remove()
    return
  }
  if (!badge) {
    badge = document.createElement('span')
    badge.className = 'bd-col-count'
    const counter = header.querySelector('[data-component="CounterLabel"]')
    if (counter) counter.insertAdjacentElement('afterend', badge)
    else header.appendChild(badge)
  }
  setText(badge, `${Math.max(0, stats.total - stats.hidden)} shown`)
  const details = [`${stats.hidden} hidden`]
  if (stats.dimmed) details.push(`${stats.dimmed} dimmed`)
  badge.title = details.join(', ')
}

function markColumns(root: ParentNode, columnNames: string[], attribute: string): void {
  const names = new Set(columnNames.map((c) => c.trim().toLowerCase()))
  for (const column of root.querySelectorAll(SELECTORS.column)) {
    const name = column.getAttribute('data-board-column')?.trim().toLowerCase() ?? ''
    if (names.has(name)) column.setAttribute(attribute, '')
    else column.removeAttribute(attribute)
  }
}

export function applyCollapsedColumns(root: ParentNode, collapsed: string[]): void {
  markColumns(root, collapsed, 'data-bd-collapsed')
}

export function applyHiddenColumns(root: ParentNode, hidden: string[]): void {
  markColumns(root, hidden, 'data-bd-hidden-column')
}

/** Two stacks inside one column, issues left and PRs right. A CSS grid on the card list does the layout (see
 *  content.css); the card type comes from `data-hovercard-subject-tag`, which even virtualised placeholders
 *  carry. The stack titles are a small row appended to the column header, which is static React output. */
export function applySplitColumns(root: ParentNode, split: string[], onResize: () => void): void {
  markColumns(root, split, 'data-bd-split')
  for (const column of root.querySelectorAll(SELECTORS.column)) {
    const header = column.firstElementChild
    const existing = column.querySelector(':scope > .bd-split-header')
    if (!column.hasAttribute('data-bd-split')) {
      existing?.remove()
      for (const loader of column.querySelectorAll(`.${STACK_LOADER_CLASS}`)) loader.remove()
      for (const card of column.querySelectorAll<HTMLElement>(
        '[data-board-card-id][data-bd-shifted]',
      )) {
        card.style.transform = ''
        card.removeAttribute('data-bd-shifted')
      }
      continue
    }
    compactStacks(column, onResize)
    if (existing || !header) continue
    const row = document.createElement('div')
    row.className = 'bd-split-header'
    for (const text of ['Issues', 'Pull requests']) {
      const cell = document.createElement('span')
      cell.textContent = text
      row.appendChild(cell)
    }
    header.insertAdjacentElement('afterend', row)
  }
}

let resizeObserver: ResizeObserver | undefined
const observedCards = new WeakSet<Element>()
const scrollInstalled = new WeakSet<Element>()

interface StackState {
  /** Scroll offset per stack: 0 = issues, 1 = pull requests. */
  offsets: [number, number]
  /** Content height per stack from the last layout, used to clamp the offsets. */
  heights: [number, number]
}

const stackStates = new Map<string, StackState>()

export function clampOffset(offset: number, stackHeight: number, viewport: number): number {
  return Math.max(0, Math.min(offset, Math.max(0, stackHeight - viewport)))
}

function stateFor(name: string): StackState {
  let state = stackStates.get(name)
  if (!state) {
    state = { offsets: [0, 0], heights: [0, 0] }
    stackStates.set(name, state)
  }
  return state
}

/** Grid rows are shared by both stacks, so each row is as tall as its taller card and the other stack shows a
 *  gap. This pulls every card up to sit right below the previous card of its own stack, minus that stack's own
 *  scroll offset. Transforms do not affect layout, and GitHub's virtualiser renders by visual position, so
 *  cards scrolled into the list's box still render. Heights change as cards render, hence the ResizeObserver. */
function compactStacks(column: Element, onResize: () => void): void {
  const zone = column.querySelector<HTMLElement>('[data-dnd-drop-type="card"]')
  if (!zone) return
  const name = column.getAttribute('data-board-column') ?? ''
  const state = stateFor(name)
  if (!resizeObserver && typeof ResizeObserver !== 'undefined') {
    // Re-layout synchronously (ResizeObserver runs after layout, before paint) so a card that just rendered
    // never shows in the wrong place; then let the regular pass update counts and groups.
    resizeObserver = new ResizeObserver(() => {
      for (const split of document.querySelectorAll('[data-board-column][data-bd-split]')) {
        compactStacks(split, onResize)
      }
      onResize()
    })
  }
  installStackScroll(zone, name, () => compactStacks(column, onResize))

  const tops = [0, 0]
  let base: number | undefined
  for (const el of zone.children) {
    if (!(el instanceof HTMLElement) || !el.hasAttribute('data-board-card-id')) continue
    if (!observedCards.has(el) && resizeObserver) {
      resizeObserver.observe(el)
      observedCards.add(el)
    }
    const height = el.offsetHeight
    if (height === 0) continue // hidden
    base ??= el.offsetTop
    const stack = el.getAttribute('data-hovercard-subject-tag')?.startsWith('pull_request') ? 1 : 0
    const shift = base + tops[stack]! - state.offsets[stack] - el.offsetTop
    const transform = shift ? `translateY(${shift}px)` : ''
    if (el.style.transform !== transform) el.style.transform = transform
    el.setAttribute('data-bd-shifted', '')
    tops[stack]! += height + parseFloat(getComputedStyle(el).marginBottom || '0')
  }
  state.heights = [tops[0]!, tops[1]!]
  const loading =
    stillLoading(column, zone) && loadMoreSentinels(zone).some((el) => el.scrollHeight > 0)
  placeStackLoaders(
    zone,
    loading ? [0, 1].map((s) => (base ?? 0) + tops[s]! - state.offsets[s]!) : undefined,
  )
}

/** The column has cards left to fetch: fewer shells than GitHub's counter. GitHub's own skeleton element keeps
 *  content even when it is not fetching, so it cannot tell on its own. */
function stillLoading(column: Element, zone: Element): boolean {
  const counter = githubColumnCount(column)
  return counter !== undefined && zone.querySelectorAll(SELECTORS.card).length < counter
}

/** GitHub shows one loading skeleton at the end of the list, which a split column would draw across both
 *  stacks; its own element is collapsed (see content.css). While cards are left to load, draw one skeleton at
 *  the end of each stack instead (`ends`, undefined when done), on the same grid tracks as the cards. */
function placeStackLoaders(zone: HTMLElement, ends: number[] | undefined): void {
  const loaders = [...zone.querySelectorAll<HTMLElement>(`:scope > .${STACK_LOADER_CLASS}`)]
  if (!ends) {
    for (const loader of loaders) loader.remove()
    return
  }
  // Absolute boxes are placed from the padding edge, while the grid tracks sit inside the padding.
  const style = getComputedStyle(zone)
  const padLeft = parseFloat(style.paddingLeft) || 0
  const padRight = parseFloat(style.paddingRight) || 0
  const gap = parseFloat(style.columnGap) || 0
  const track = Math.max(0, (zone.clientWidth - padLeft - padRight - gap) / 2)
  ends.forEach((top, stack) => {
    let loader = loaders.find((l) => l.dataset.stack === String(stack))
    if (!loader) {
      loader = document.createElement('div')
      loader.className = STACK_LOADER_CLASS
      loader.dataset.stack = String(stack)
      loader.setAttribute('aria-hidden', 'true')
      for (let i = 0; i < 3; i++) loader.appendChild(document.createElement('span'))
      zone.appendChild(loader)
    }
    const position = {
      top: `${top}px`,
      left: `${padLeft + stack * (track + gap)}px`,
      width: `${track}px`,
    }
    for (const [prop, value] of Object.entries(position)) {
      if (loader.style.getPropertyValue(prop) !== value) loader.style.setProperty(prop, value)
    }
  })
}

/** Each stack scrolls on its own: the wheel moves whichever half of the list the pointer is over. The list
 *  itself no longer scrolls natively (see content.css), so the browser would otherwise scroll the page. */
function installStackScroll(zone: HTMLElement, name: string, relayout: () => void): void {
  if (scrollInstalled.has(zone)) return
  scrollInstalled.add(zone)
  zone.addEventListener(
    'wheel',
    (event) => {
      if (!zone.closest('[data-bd-split]')) return
      const rect = zone.getBoundingClientRect()
      const stack = event.clientX < rect.left + rect.width / 2 ? 0 : 1
      const step = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rect.height : 1
      const state = stateFor(name)
      // GitHub's footer ("Add item") is pinned over the bottom of the list; keep the last card clear of it.
      const footer = Math.max(
        0,
        ...[...zone.children]
          .filter(
            (c) =>
              !c.hasAttribute('data-board-card-id') && !c.classList.contains(STACK_LOADER_CLASS),
          )
          .map((c) => (c as HTMLElement).offsetHeight),
      )
      const next = clampOffset(
        state.offsets[stack] + event.deltaY * step,
        state.heights[stack],
        rect.height - footer,
      )
      if (next === state.offsets[stack]) return
      event.preventDefault()
      state.offsets[stack] = next
      relayout()
    },
    { passive: false },
  )
}

export function resetStackScroll(): void {
  stackStates.clear()
}

export const UNASSIGNED_GROUP = 'Unassigned'

export function assigneeGroup(card: Card): string {
  return card.assignees.length ? card.assignees.join(', ') : UNASSIGNED_GROUP
}

/** Identifies one group in one stack of one column, so collapsing it does not touch the same name elsewhere. */
export function groupKey(column: string, stack: number, group: string): string {
  return [column, stack, group].join('\u0000')
}

export interface GroupCollapse {
  /** Keys (see `groupKey`) of the groups whose cards are folded under their header. */
  collapsed: ReadonlySet<string>
  onToggle: (key: string) => void
}

const NO_COLLAPSE: GroupCollapse = { collapsed: new Set(), onToggle: () => {} }

/** Title the first visible card of every run of equal assignees inside each column, and fold collapsed groups:
 *  the first card keeps only its header, the rest are hidden. GitHub does the actual ordering (see `sort.ts`).
 *  Hidden cards turn into placeholders we cannot parse, so each card carries its group key in
 *  `data-bd-group-key`; a placeholder stays folded until its group is expanded. */
export function markGroups(
  root: ParentNode,
  entries: { el: Element; card: Card }[],
  collapse: GroupCollapse = NO_COLLAPSE,
): void {
  const byEl = new Map(entries.map((e) => [e.el, e.card]))
  for (const column of root.querySelectorAll(SELECTORS.column)) {
    const name = column.getAttribute('data-board-column') ?? ''
    // A split column shows two stacks, and runs are visual: track them per stack, not in DOM order.
    const split = column.hasAttribute('data-bd-split')
    const cards = [...column.querySelectorAll(SELECTORS.card)]
    const keys = new Map<Element, string>()
    const counts = new Map<string, number>()
    for (const el of cards) {
      const card = byEl.get(el)
      const key = card
        ? groupKey(name, split && card.type === 'pull_request' ? 1 : 0, assigneeGroup(card))
        : el.getAttribute('data-bd-group-key')
      if (!key || el.getAttribute('data-bd-mode') === 'hide') continue
      keys.set(el, key)
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }

    const previous: (string | undefined)[] = [undefined, undefined]
    for (const el of cards) {
      const card = byEl.get(el)
      const key = keys.get(el)
      if (!card || !key) {
        setGroup(el, undefined, collapse)
        // A folded placeholder is released once its group is expanded, so it renders and is parsed again.
        if (!key || !collapse.collapsed.has(key)) setFolded(el, undefined)
        continue
      }
      el.setAttribute('data-bd-group-key', key)
      const stack = split && card.type === 'pull_request' ? 1 : 0
      const first = key !== previous[stack]
      previous[stack] = key
      setGroup(el, first ? { card, key, count: counts.get(key) ?? 1 } : undefined, collapse)
      setFolded(el, collapse.collapsed.has(key) ? (first ? 'head' : 'rest') : undefined)
    }
  }
}

function setFolded(el: Element, folded: 'head' | 'rest' | undefined): void {
  if (folded === undefined) el.removeAttribute('data-bd-group-collapsed')
  else if (el.getAttribute('data-bd-group-collapsed') !== folded)
    el.setAttribute('data-bd-group-collapsed', folded)
}

/** A small header inserted as the card's first child: a chevron, the assignees' avatars and names, and the
 *  group's card count. Clicking it folds the group. React only ever touches its own inner box, so a sibling in
 *  front of it survives re-renders. */
function setGroup(
  el: Element,
  run: { card: Card; key: string; count: number } | undefined,
  collapse: GroupCollapse,
): void {
  let header = el.querySelector<HTMLElement>(':scope > .bd-group-header')
  if (!run) {
    el.removeAttribute('data-bd-group')
    header?.remove()
    return
  }
  const { card, key, count } = run
  const group = assigneeGroup(card)
  const folded = collapse.collapsed.has(key)
  const state = `${key}\u0000${count}\u0000${folded}`
  if (header?.dataset.state === state) return
  el.setAttribute('data-bd-group', group)
  if (!header) {
    header = document.createElement('div')
    header.className = 'bd-group-header'
    header.setAttribute('role', 'button')
    header.tabIndex = 0
    // The card under the header opens GitHub's side panel on click and starts a drag on pointer down.
    for (const type of ['pointerdown', 'mousedown']) {
      header.addEventListener(type, (event) => event.stopPropagation())
    }
    const toggle = (event: Event): void => {
      event.stopPropagation()
      event.preventDefault()
      const current = header!.dataset.key
      if (current) collapse.onToggle(current)
    }
    header.addEventListener('click', toggle)
    header.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') toggle(event)
    })
    el.prepend(header)
  }
  header.dataset.state = state
  header.dataset.key = key
  header.setAttribute('aria-expanded', String(!folded))
  header.title = folded ? 'Expand group' : 'Collapse group'
  header.replaceChildren()
  const chevron = document.createElement('i')
  chevron.className = 'bd-group-header__chevron'
  chevron.textContent = folded ? '▸' : '▾'
  header.appendChild(chevron)
  for (const login of card.assignees) {
    const src = card.avatars?.[login]
    if (!src) continue
    const img = document.createElement('img')
    img.src = src
    img.alt = ''
    img.width = 16
    img.height = 16
    header.appendChild(img)
  }
  const name = document.createElement('span')
  name.className = 'bd-group-header__name'
  name.textContent = group
  name.title = group
  const total = document.createElement('small')
  total.className = 'bd-group-header__count'
  total.textContent = String(count)
  header.append(name, total)
}

export function clearAssigneeGroups(root: ParentNode): void {
  for (const attr of ['data-bd-group', 'data-bd-group-key', 'data-bd-group-collapsed']) {
    for (const el of root.querySelectorAll(`[${attr}]`)) el.removeAttribute(attr)
  }
  for (const el of root.querySelectorAll('.bd-group-header')) el.remove()
}

export function clearAll(root: ParentNode): void {
  for (const el of root.querySelectorAll(SELECTORS.card)) clearDecision(el)
  for (const el of root.querySelectorAll('.bd-col-count')) el.remove()
  for (const el of root.querySelectorAll('[data-bd-collapsed]'))
    el.removeAttribute('data-bd-collapsed')
  for (const el of root.querySelectorAll('[data-bd-hidden-column]'))
    el.removeAttribute('data-bd-hidden-column')
  for (const el of root.querySelectorAll('[data-bd-split]')) el.removeAttribute('data-bd-split')
  for (const el of root.querySelectorAll('.bd-split-header')) el.remove()
  for (const el of root.querySelectorAll(`.${STACK_LOADER_CLASS}`)) el.remove()
  for (const el of root.querySelectorAll<HTMLElement>('[data-bd-shifted]')) {
    el.style.transform = ''
    el.removeAttribute('data-bd-shifted')
  }
  resetStackScroll()
  clearAssigneeGroups(root)
  document.documentElement.removeAttribute('data-bd-compact')
  document.documentElement.removeAttribute('data-bd-focus')
}
