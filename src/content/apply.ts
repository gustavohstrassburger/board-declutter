import type { Card, Decision } from '../core/types'
import { isRendered, SELECTORS } from './dom'

/** Decisions are stamped with the settings version they were made under.
 *  GitHub's virtualiser turns a hidden (display: none) card into an empty placeholder, which we can no longer
 *  parse; the stamp lets `resetStaleDecisions` release those cards when the rules change so they render again. */
export function applyDecision(el: Element, decision: Decision, version: number): void {
  if (decision.mode === 'show') el.removeAttribute('data-bd-mode')
  else el.setAttribute('data-bd-mode', decision.mode)

  if (decision.highlight) el.setAttribute('data-bd-highlight', '')
  else el.removeAttribute('data-bd-highlight')

  if (decision.reasons.length) el.setAttribute('data-bd-reasons', decision.reasons.join(' · '))
  else el.removeAttribute('data-bd-reasons')

  el.setAttribute('data-bd-v', String(version))
}

export function clearDecision(el: Element): void {
  el.removeAttribute('data-bd-mode')
  el.removeAttribute('data-bd-highlight')
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
  if (!resizeObserver && typeof ResizeObserver !== 'undefined')
    resizeObserver = new ResizeObserver(() => onResize())
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
      const next = clampOffset(
        state.offsets[stack] + event.deltaY * step,
        state.heights[stack],
        rect.height,
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

/** Label the first visible card of every run of equal assignees inside each column.
 *  GitHub does the actual ordering (see `sort.ts`); placeholders are skipped and re-evaluated once rendered. */
export function markAssigneeGroups(root: ParentNode, entries: { el: Element; card: Card }[]): void {
  const byEl = new Map(entries.map((e) => [e.el, e.card]))
  for (const column of root.querySelectorAll(SELECTORS.column)) {
    let previous: string | undefined
    for (const el of column.querySelectorAll(SELECTORS.card)) {
      const card = byEl.get(el)
      if (!card || el.getAttribute('data-bd-mode') === 'hide') {
        setGroup(el, undefined)
        continue
      }
      const group = assigneeGroup(card)
      setGroup(el, group !== previous ? card : undefined)
      previous = group
    }
  }
}

/** A small header inserted as the card's first child: the assignees' avatars and the group name.
 *  React only ever touches its own inner box, so a sibling in front of it survives re-renders. */
function setGroup(el: Element, card: Card | undefined): void {
  let header = el.querySelector<HTMLElement>(':scope > .bd-group-header')
  if (!card) {
    el.removeAttribute('data-bd-group')
    header?.remove()
    return
  }
  const group = assigneeGroup(card)
  if (el.getAttribute('data-bd-group') === group && header) return
  el.setAttribute('data-bd-group', group)
  if (!header) {
    header = document.createElement('div')
    header.className = 'bd-group-header'
    el.prepend(header)
  }
  header.replaceChildren()
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
  name.textContent = group
  header.appendChild(name)
}

export function clearAssigneeGroups(root: ParentNode): void {
  for (const el of root.querySelectorAll('[data-bd-group]')) el.removeAttribute('data-bd-group')
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
  for (const el of root.querySelectorAll<HTMLElement>('[data-bd-shifted]')) {
    el.style.transform = ''
    el.removeAttribute('data-bd-shifted')
  }
  resetStackScroll()
  clearAssigneeGroups(root)
  document.documentElement.removeAttribute('data-bd-compact')
  document.documentElement.removeAttribute('data-bd-focus')
}
