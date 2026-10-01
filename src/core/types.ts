/** What the extension knows about one board card, read from the board's own DOM. */
export interface Card {
  /** `data-board-card-id` on the card element */
  id: string
  column: string
  title: string
  /** "PostHog/posthog" when the card links to an issue or PR */
  repo?: string
  number?: number
  type: 'issue' | 'pull_request' | 'draft'
  assignees: string[]
  /** Avatar URL per assignee login, when the card shows them. */
  avatars?: Record<string, string>
  labels: string[]
}

export type GroupBy = 'none' | 'assignee'

export type Mode = 'show' | 'dim' | 'hide'

/** Unassigned cards can also be highlighted: shown, with an attention marker, so ownerless work stands out. */
export type UnassignedMode = Mode | 'highlight'

/** A board mode is a set of defaults applied when it is picked (see `modes.ts`); 'normal' is your own settings. */
export type BoardMode = 'normal' | 'planning' | 'botTriage' | 'myCards'

export interface Settings {
  enabled: boolean
  /** Project views the extension runs on, as URLs or paths; anywhere else it does nothing. Empty means every board. */
  views: string[]
  mode: BoardMode
  /** The values the active mode replaced, put back when it is left. Empty in normal mode. */
  modeSnapshot: Partial<Settings>
  /** Labels that mark a card as AI-generated, e.g. "self-driving" on PRs opened by the PostHog bot. */
  aiLabels: string[]
  aiMode: Mode
  /** What to do with cards that carry none of `aiLabels`, i.e. human work; 'hide' leaves only the bots' cards. */
  nonAiMode: Mode
  unassignedMode: UnassignedMode
  /** Logins of the people on your team. */
  teamMembers: string[]
  /** Labels that mark a card as belonging to your team, e.g. "team/feature-flags". */
  teamLabels: string[]
  /** What to do with cards that are not the team's: assigned to no team member, or unassigned without a team label. */
  otherTeamsMode: Mode
  /** What to do with cards not assigned to you (`me`); ignored until `me` is set. */
  notMineMode: Mode
  /** Regexes; cards whose title matches are hidden. */
  titlePatterns: string[]
  /** Column names to fold into a thin strip (e.g. "Done"). */
  collapsedColumns: string[]
  /** Column names removed from view entirely; managed from the toolbar's Columns menu. */
  hiddenColumns: string[]
  compact: boolean
  /** Sort every column by assignee (GitHub's own sort, via the URL) and title each run. */
  groupBy: GroupBy
  /** Hide everything on the page that is not the board; moving the mouse to the top edge reveals it. */
  focus: boolean
  /** Lay `splitColumns` out as two stacks, issues left and PRs right, newest first (GitHub's sort by Created). */
  split: boolean
  splitColumns: string[]
  /** Fetch every page of each column as soon as the board opens, instead of on scroll. */
  preloadColumns: boolean
  /** Columns left to GitHub's own lazy-loading even with `preloadColumns`, e.g. a "Done" with hundreds of cards. */
  noPreloadColumns: string[]
  /** Your GitHub login: cards assigned to you get highlighted. */
  me: string
  /** Give cards assigned to you the blue marker. */
  highlightMine: boolean
}

export interface Decision {
  mode: Mode
  highlight: boolean
  /** A rule asked for the card to stand out (e.g. unassigned cards in planning). */
  attention: boolean
  /** The card carries one of the AI labels; it gets an "AI" chip next to its number. */
  ai: boolean
  /** Human-readable reasons, shown on the card. */
  reasons: string[]
}

export const MODE_RANK: Record<Mode, number> = { show: 0, dim: 1, hide: 2 }
