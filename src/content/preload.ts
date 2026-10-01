import { githubColumnCount } from './apply'
import { loadMoreSentinels, SELECTORS } from './dom'

const MAX_ATTEMPTS = 4
const ATTEMPT_WINDOW_MS = 60 * 1000
const SETTLE_MS = 700

export interface Attempt {
  /** Attempts in a row that brought no new card shell. */
  count: number
  at: number
  /** Card shells in the column when the last attempt started. */
  shells: number
}

/** Whether a column is worth nudging: it has fewer card shells than GitHub's counter says it holds, and the last
 *  few attempts in the past minute were not all fruitless (a view filter can make the counter unreachable).
 *  An attempt that brought cards does not count against the limit, so long columns load all the way. */
export function needsPreload(
  shells: number,
  counter: number | undefined,
  attempt: Attempt | undefined,
  now: number,
): boolean {
  if (counter === undefined || shells >= counter) return false
  if (!attempt || shells > attempt.shells) return true
  return attempt.count < MAX_ATTEMPTS || now - attempt.at >= ATTEMPT_WINDOW_MS
}

/** The count to record for an attempt starting now: reset by progress or by a quiet minute. */
export function nextAttemptCount(
  attempt: Attempt | undefined,
  shells: number,
  now: number,
): number {
  if (!attempt || shells > attempt.shells || now - attempt.at >= ATTEMPT_WINDOW_MS) return 1
  return attempt.count + 1
}

function frames(n: number): Promise<void> {
  return new Promise((resolve) => {
    const step = (left: number): void => {
      if (left === 0) resolve()
      else requestAnimationFrame(() => step(left - 1))
    }
    step(n)
  })
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Loads the rest of each column without scrolling it. GitHub fetches a column's next page when a sentinel at
 *  the end of its list comes into view, and an intersection observer only reports changes: once rules hide
 *  most cards, the list is too short to scroll and the sentinel never leaves the view, so nothing loads.
 *  Taking the sentinel out of the layout for a couple of frames and putting it back makes it enter the view
 *  again, which triggers the same fetch as scrolling. If that brings nothing, scrolling the list to the bottom
 *  and back is the fallback, for lists that load on scroll position instead. One column at a time. */
export class ColumnPreloader {
  private attempts = new Map<string, Attempt>()
  private busy = false

  constructor(private onLoaded: () => void) {}

  run(board: Element): void {
    if (this.busy) return
    const now = Date.now()
    for (const column of board.querySelectorAll(SELECTORS.column)) {
      // Nothing to see in a hidden or folded column, so nothing worth fetching for it.
      if (column.matches('[data-bd-hidden-column], [data-bd-collapsed]')) continue
      const name = column.getAttribute('data-board-column') ?? ''
      const zone = column.querySelector<HTMLElement>('[data-dnd-drop-type="card"]')
      if (!zone) continue
      const shells = zone.querySelectorAll(SELECTORS.card).length
      const attempt = this.attempts.get(name)
      if (!needsPreload(shells, githubColumnCount(column), attempt, now)) continue
      this.attempts.set(name, { count: nextAttemptCount(attempt, shells, now), at: now, shells })
      void this.nudge(zone, shells)
      return
    }
  }

  private async nudge(zone: HTMLElement, shells: number): Promise<void> {
    this.busy = true
    try {
      const sentinels = loadMoreSentinels(zone)
      for (const el of sentinels) el.style.setProperty('display', 'none', 'important')
      await frames(2)
      for (const el of sentinels) el.style.removeProperty('display')
      await wait(SETTLE_MS)

      // A split column lays its stacks out with transforms and pins the sentinel in view, so scrolling its list
      // would only make both stacks jump.
      if (
        zone.querySelectorAll(SELECTORS.card).length === shells &&
        !zone.closest('[data-bd-split]') &&
        zone.scrollHeight > zone.clientHeight
      ) {
        const restore = zone.scrollTop
        zone.scrollTop = zone.scrollHeight
        await wait(SETTLE_MS)
        zone.scrollTop = restore
      }
    } finally {
      this.busy = false
    }
    this.onLoaded()
  }
}
