import { githubColumnCount } from './apply'
import { loadMoreSentinels, SELECTORS } from './dom'

const MAX_ATTEMPTS = 4
const ATTEMPT_WINDOW_MS = 60 * 1000
/** How long a nudge waits for GitHub's next page before calling the attempt fruitless. */
const LOAD_TIMEOUT_MS = 2000
const POLL_MS = 100

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

/** Resolves as soon as the list holds more card shells than `shells`, or after the timeout; true if it grew.
 *  Moving on as soon as a page lands, rather than after a fixed delay, is what keeps long columns quick. */
async function waitForMore(zone: Element, shells: number): Promise<boolean> {
  for (let waited = 0; waited < LOAD_TIMEOUT_MS; waited += POLL_MS) {
    if (zone.querySelectorAll(SELECTORS.card).length > shells) return true
    await wait(POLL_MS)
  }
  return zone.querySelectorAll(SELECTORS.card).length > shells
}

/** Whether the preloader should fill this column: it is on screen (not hidden or folded) and not one the user
 *  chose to leave to GitHub's own lazy-loading, such as a long "Done". */
export function preloadable(column: Element, skip: string[]): boolean {
  if (column.matches('[data-bd-hidden-column], [data-bd-collapsed]')) return false
  const name = column.getAttribute('data-board-column')?.trim().toLowerCase() ?? ''
  return !skip.some((s) => s.trim().toLowerCase() === name)
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

  run(board: Element, skip: string[]): void {
    if (this.busy) return
    const now = Date.now()
    for (const column of board.querySelectorAll(SELECTORS.column)) {
      if (!preloadable(column, skip)) continue
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
      const loaded = await waitForMore(zone, shells)

      // A split column lays its stacks out with transforms and pins the sentinel in view, so scrolling its list
      // would only make both stacks jump.
      if (!loaded && !zone.closest('[data-bd-split]') && zone.scrollHeight > zone.clientHeight) {
        const restore = zone.scrollTop
        zone.scrollTop = zone.scrollHeight
        await waitForMore(zone, shells)
        zone.scrollTop = restore
      }
    } finally {
      this.busy = false
    }
    this.onLoaded()
  }
}
