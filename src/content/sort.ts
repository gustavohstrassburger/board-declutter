const SORT_FIELD = 'sortedBy[columnId]'
const SORT_DIRECTION = 'sortedBy[direction]'
const REDIRECT_STAMP = 'bd-sort-redirect'
const REDIRECT_COOLDOWN_MS = 10 * 1000

/** The board URL with GitHub's own "sort by Assignees" applied, or undefined when nothing needs to change:
 *  the URL is not a project view, or it already carries a sort (ours or one the user picked). */
export function withAssigneeSort(href: string): string | undefined {
  const url = new URL(href)
  if (!/\/projects\/\d+/.test(url.pathname)) return undefined
  if (url.searchParams.has(SORT_FIELD)) return undefined
  url.searchParams.set(SORT_DIRECTION, 'asc')
  url.searchParams.set(SORT_FIELD, 'Assignees')
  return url.toString()
}

/** Reloads the page with the assignee sort when a board view lacks one. Returns true when a navigation started.
 *  The stamp stops a loop if GitHub ever strips the parameter again. */
export function ensureAssigneeSort(board: Element): boolean {
  if (!board.querySelector('[data-board-column]')) return false
  const target = withAssigneeSort(location.href)
  if (!target) return false

  let stamp: { path: string; at: number } | undefined
  try {
    stamp = JSON.parse(sessionStorage.getItem(REDIRECT_STAMP) ?? 'null') ?? undefined
  } catch {
    stamp = undefined
  }
  if (stamp && stamp.path === location.pathname && Date.now() - stamp.at < REDIRECT_COOLDOWN_MS)
    return false

  try {
    sessionStorage.setItem(
      REDIRECT_STAMP,
      JSON.stringify({ path: location.pathname, at: Date.now() }),
    )
  } catch {
    // private mode or full storage: still navigate once
  }
  location.assign(target)
  return true
}
