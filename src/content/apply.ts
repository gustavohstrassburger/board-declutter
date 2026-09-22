import type { Decision } from '../core/types'
import { isRendered, SELECTORS } from './dom'

/** Decisions are stamped with the settings version they were made under.
 *  GitHub's virtualiser turns a hidden (display: none) card into an empty placeholder, which we can no longer
 *  parse; the stamp lets `resetStaleDecisions` release those cards when the rules change so they render again. */
export function applyDecision(
  el: Element,
  decision: Decision,
  version: number,
  key?: string,
): void {
  if (decision.mode === 'show') el.removeAttribute('data-bd-mode')
  else el.setAttribute('data-bd-mode', decision.mode)

  if (decision.highlight) el.setAttribute('data-bd-highlight', '')
  else el.removeAttribute('data-bd-highlight')

  if (decision.reasons.length) el.setAttribute('data-bd-reasons', decision.reasons.join(' · '))
  else el.removeAttribute('data-bd-reasons')

  el.setAttribute('data-bd-v', String(version))
  if (key) el.setAttribute('data-bd-key', key)
  else el.removeAttribute('data-bd-key')
}

export function clearDecision(el: Element): void {
  el.removeAttribute('data-bd-mode')
  el.removeAttribute('data-bd-highlight')
  el.removeAttribute('data-bd-reasons')
  el.removeAttribute('data-bd-v')
  el.removeAttribute('data-bd-key')
}

/** Un-hide placeholder cards decided under an older settings version so the board renders them for re-evaluation. */
export function resetStaleDecisions(root: ParentNode, version: number): void {
  for (const el of root.querySelectorAll(SELECTORS.card)) {
    if (!isRendered(el) && el.getAttribute('data-bd-v') !== String(version)) clearDecision(el)
  }
}

/** Release hidden placeholders whose enrichment just arrived: the new data may downgrade hide to dim (e.g. it is mine). */
export function releasePlaceholders(root: ParentNode, keys: Set<string>): void {
  for (const el of root.querySelectorAll(SELECTORS.card)) {
    const key = el.getAttribute('data-bd-key')
    if (key && keys.has(key) && !isRendered(el)) clearDecision(el)
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

/** Shows "N hidden" next to the column title. The header is static React output, so appending one span is safe. */
export function applyColumnStats(column: Element, stats: ColumnStats): void {
  const header = column.firstElementChild
  if (!header) return
  let badge = header.querySelector<HTMLElement>('.bd-col-count')
  if (stats.hidden === 0 && stats.dimmed === 0) {
    badge?.remove()
    return
  }
  if (!badge) {
    badge = document.createElement('span')
    badge.className = 'bd-col-count'
    header.appendChild(badge)
  }
  const parts: string[] = []
  if (stats.hidden) parts.push(`${stats.hidden} hidden`)
  if (stats.dimmed) parts.push(`${stats.dimmed} dimmed`)
  setText(badge, parts.join(', '))
}

export function applyCollapsedColumns(root: ParentNode, collapsed: string[]): void {
  const names = new Set(collapsed.map((c) => c.toLowerCase()))
  for (const column of root.querySelectorAll(SELECTORS.column)) {
    const name = column.getAttribute('data-board-column')?.toLowerCase() ?? ''
    if (names.has(name)) column.setAttribute('data-bd-collapsed', '')
    else column.removeAttribute('data-bd-collapsed')
  }
}

export function clearAll(root: ParentNode): void {
  for (const el of root.querySelectorAll(SELECTORS.card)) clearDecision(el)
  for (const el of root.querySelectorAll('.bd-col-count')) el.remove()
  for (const el of root.querySelectorAll('[data-bd-collapsed]'))
    el.removeAttribute('data-bd-collapsed')
  document.documentElement.removeAttribute('data-bd-compact')
}
