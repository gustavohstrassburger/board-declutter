const CLOAK_ATTRIBUTE = 'data-bd-cloak'
/** The board must go this long without GitHub changing it before it counts as settled. */
export const QUIET_MS = 150
/** Past this the board shows as it is, so a long column still loading never keeps it blank. */
export const MAX_CLOAK_MS = 5000

export interface BoardState {
  /** The preloader is still fetching a column. */
  loading: boolean
  hasColumns: boolean
  /** Milliseconds since GitHub last changed the page. */
  quietFor: number
}

/** The board is worth showing once it has columns, nothing is left to preload and GitHub has stopped changing it:
 *  hiding cards pulls more card shells into view, which GitHub then renders and the rules may hide in turn. */
export function settled(state: BoardState): boolean {
  return state.hasColumns && !state.loading && state.quietFor >= QUIET_MS
}

/** Keeps the board invisible (see content.css) while the extension sorts, filters and preloads it, so a load or
 *  a view switch shows one finished board instead of every intermediate step. The board stays in the layout, so
 *  GitHub keeps rendering and loading cards behind it. */
export class Cloak {
  private since: number | undefined
  private timer: ReturnType<typeof setTimeout> | undefined

  /** `recheck` runs another pass once the board may have settled, in case GitHub changes nothing meanwhile. */
  constructor(
    private root: HTMLElement,
    private recheck: () => void,
  ) {}

  hide(now: number): void {
    if (this.since !== undefined) return
    this.since = now
    this.root.setAttribute(CLOAK_ATTRIBUTE, '')
    this.later(MAX_CLOAK_MS)
  }

  show(): void {
    this.since = undefined
    clearTimeout(this.timer)
    this.root.removeAttribute(CLOAK_ATTRIBUTE)
  }

  /** Shows the board once it has settled or the time limit has passed. */
  update(state: BoardState, now: number): void {
    if (this.since === undefined) return
    if (settled(state) || now - this.since >= MAX_CLOAK_MS) this.show()
    else this.later(QUIET_MS)
  }

  private later(ms: number): void {
    clearTimeout(this.timer)
    this.timer = setTimeout(this.recheck, ms)
  }
}
