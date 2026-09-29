import { githubColumnCount } from './apply'
import { SELECTORS } from './dom'

const MAX_ATTEMPTS = 4
const ATTEMPT_WINDOW_MS = 60 * 1000
const SETTLE_MS = 700

interface Attempt {
  count: number
  at: number
}

/** Whether a column is worth nudging: it has fewer card shells than GitHub's counter says it holds, and we have
 *  not already tried a few times in the last minute (a view filter can make the counter unreachable). */
export function needsPreload(
  shells: number,
  counter: number | undefined,
  attempt: Attempt | undefined,
  now: number,
): boolean {
  if (counter === undefined || shells >= counter) return false
  if (attempt && attempt.count >= MAX_ATTEMPTS && now - attempt.at < ATTEMPT_WINDOW_MS) return false
  return true
}

/** GitHub only fetches a column's next page when its list is scrolled to the bottom. Scrolling there and back
 *  programmatically loads every page without the user touching the column. One column at a time. */
export class ColumnPreloader {
  private attempts = new Map<string, Attempt>()
  private busy = false

  constructor(private onLoaded: () => void) {}

  run(board: Element): void {
    if (this.busy) return
    const now = Date.now()
    for (const column of board.querySelectorAll(SELECTORS.column)) {
      const name = column.getAttribute('data-board-column') ?? ''
      const zone = column.querySelector<HTMLElement>('[data-dnd-drop-type="card"]')
      if (!zone) continue
      const shells = zone.querySelectorAll(SELECTORS.card).length
      const attempt = this.attempts.get(name)
      if (
        !needsPreload(
          shells,
          githubColumnCount(column),
          attempt?.count === undefined ? undefined : attempt,
          now,
        )
      )
        continue
      const previous = attempt && now - attempt.at < ATTEMPT_WINDOW_MS ? attempt.count : 0
      this.attempts.set(name, { count: previous + 1, at: now })
      void this.nudge(zone)
      return
    }
  }

  private async nudge(zone: HTMLElement): Promise<void> {
    this.busy = true
    const restore = zone.scrollTop
    try {
      zone.scrollTop = zone.scrollHeight
      await new Promise((resolve) => setTimeout(resolve, SETTLE_MS))
      zone.scrollTop = restore
    } finally {
      this.busy = false
    }
    this.onLoaded()
  }
}
