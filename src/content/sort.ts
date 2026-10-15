import { isProjectPath } from './view'

const SORT_FIELD = 'sortedBy[columnId]'
const SORT_DIRECTION = 'sortedBy[direction]'
const REDIRECT_STAMP = 'bd-sort-redirect'
const REDIRECT_COOLDOWN_MS = 10 * 1000

export interface Sort {
  columnId: string
  direction: 'asc' | 'desc'
}

export const ASSIGNEE_SORT: Sort = { columnId: 'Assignees', direction: 'asc' }
export const NEWEST_SORT: Sort = { columnId: 'Created', direction: 'desc' }

/** Sorts the extension applies itself. One of these in the URL may be replaced; any other sort is the user's.
 *  "Parent issue" was applied by earlier builds that grouped by parent. */
const OWN_SORTS = new Set([ASSIGNEE_SORT.columnId, 'Parent issue', NEWEST_SORT.columnId])

/** The board URL with GitHub's own sort applied, or undefined when nothing needs to change: not a project view,
 *  the sort is already there, or the user picked a sort of their own. */
export function withSort(href: string, desired: Sort): string | undefined {
  const url = new URL(href)
  if (!isProjectPath(url.pathname)) return undefined
  const current = url.searchParams.get(SORT_FIELD)
  if (current === desired.columnId && url.searchParams.get(SORT_DIRECTION) === desired.direction)
    return undefined
  if (current && !OWN_SORTS.has(current)) return undefined
  url.searchParams.set(SORT_DIRECTION, desired.direction)
  url.searchParams.set(SORT_FIELD, desired.columnId)
  return url.toString()
}

/** Applies `desired` when a board view lacks it. Returns true when the sort changed.
 *  GitHub's router re-reads the URL on popstate, so swapping the URL in place re-sorts the board without the
 *  reload a real navigation would cause. The stamp stops a loop if GitHub ever strips the parameter again. */
export function ensureSort(board: Element, desired: Sort): boolean {
  if (!board.querySelector('[data-board-column]')) return false
  const target = withSort(location.href, desired)
  if (!target) return false

  const key = `${location.pathname}|${desired.columnId}`
  let stamp: { key: string; at: number } | undefined
  try {
    stamp = JSON.parse(sessionStorage.getItem(REDIRECT_STAMP) ?? 'null') ?? undefined
  } catch {
    stamp = undefined
  }
  if (stamp && stamp.key === key && Date.now() - stamp.at < REDIRECT_COOLDOWN_MS) return false

  try {
    sessionStorage.setItem(REDIRECT_STAMP, JSON.stringify({ key, at: Date.now() }))
  } catch {
    // private mode or full storage: still navigate once
  }
  history.replaceState(history.state, '', target)
  dispatchEvent(new PopStateEvent('popstate', { state: history.state }))
  return true
}
