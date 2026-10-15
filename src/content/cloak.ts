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
  private deadline: ReturnType<typeof setTimeout> | undefined
  private pending: ReturnType<typeof setTimeout> | undefined

  /** `recheck` runs another pass once the board may have settled, in case GitHub changes nothing meanwhile. */
  constructor(
    private root: HTMLElement,
    private recheck: () => void,
  ) {}

  /** The time limit runs on its own timer, so the board shows even if no pass ever reports it settled (a pass
   *  that stops early, or throws). */
  hide(): void {
    if (this.deadline !== undefined) return
    this.root.setAttribute(CLOAK_ATTRIBUTE, '')
    this.deadline = setTimeout(() => this.show(), MAX_CLOAK_MS)
  }

  show(): void {
    clearTimeout(this.deadline)
    clearTimeout(this.pending)
    this.deadline = undefined
    this.root.removeAttribute(CLOAK_ATTRIBUTE)
  }

  /** Shows the board once it has settled, or checks again after a quiet spell. */
  update(state: BoardState): void {
    if (this.deadline === undefined) return
    if (settled(state)) {
      this.show()
      return
    }
    clearTimeout(this.pending)
    this.pending = setTimeout(this.recheck, QUIET_MS)
  }
}
