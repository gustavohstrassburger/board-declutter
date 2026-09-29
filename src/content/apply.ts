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

export function applyCollapsedColumns(root: ParentNode, collapsed: string[]): void {
  const names = new Set(collapsed.map((c) => c.toLowerCase()))
  for (const column of root.querySelectorAll(SELECTORS.column)) {
    const name = column.getAttribute('data-board-column')?.toLowerCase() ?? ''
    if (names.has(name)) column.setAttribute('data-bd-collapsed', '')
    else column.removeAttribute('data-bd-collapsed')
  }
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
  clearAssigneeGroups(root)
  document.documentElement.removeAttribute('data-bd-compact')
}
