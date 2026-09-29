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

export type Mode = 'show' | 'dim' | 'hide'

export interface Settings {
  enabled: boolean
  /** Labels that mark a card as AI-generated, e.g. "self-driving" on PRs opened by the PostHog bot. */
  aiLabels: string[]
  aiMode: Mode
  unassignedMode: Mode
  /** Logins of the people on your team. */
  teamMembers: string[]
  /** Labels that mark a card as belonging to your team, e.g. "team/feature-flags". */
  teamLabels: string[]
  /** What to do with cards that have no team member assigned and no team label. */
  otherTeamsMode: Mode
  /** Regexes; cards whose title matches are hidden. */
  titlePatterns: string[]
  /** Column names to fold into a thin strip (e.g. "Done"). */
  collapsedColumns: string[]
  /** Column names removed from view entirely; managed from the toolbar's Columns menu. */
  hiddenColumns: string[]
  compact: boolean
  /** Sort every column by assignee (GitHub's own sort, via the URL) and label the first card of each run. */
  groupByAssignee: boolean
  /** Hide everything on the page that is not the board; moving the mouse to the top edge reveals it. */
  focus: boolean
  /** Lay `splitColumns` out as two stacks, issues left and PRs right, newest first (GitHub's sort by Created). */
  split: boolean
  splitColumns: string[]
  /** Fetch every page of each column as soon as the board opens, instead of on scroll. */
  preloadColumns: boolean
  /** Your GitHub login: cards assigned to you get highlighted and are never hidden. */
  me: string
}

export interface Decision {
  mode: Mode
  highlight: boolean
  /** Human-readable reasons, shown on the card. */
  reasons: string[]
}

export const MODE_RANK: Record<Mode, number> = { show: 0, dim: 1, hide: 2 }
