/** Data the extension knows about one board card. DOM-derived fields are always present;
 *  enrichment fields are only filled once the GitHub API has been queried. */
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
  enrichment?: Enrichment
}

export interface Enrichment {
  author: string
  authorIsBot: boolean
  isDraft: boolean
  reviewDecision: 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED' | null
  reviewers: string[]
  updatedAt: string
}

export type Mode = 'show' | 'dim' | 'hide'

export interface Settings {
  enabled: boolean
  /** Logins treated as bots on top of the GitHub `Bot` account type. */
  botAuthors: string[]
  botMode: Mode
  draftMode: Mode
  unassignedMode: Mode
  /** Logins of the people on your team. */
  teamMembers: string[]
  /** Labels that mark a card as belonging to your team, e.g. "team/feature-flags". */
  teamLabels: string[]
  /** What to do with cards that are neither authored, assigned, reviewed by the team nor labelled for it. */
  otherTeamsMode: Mode
  /** Cards not updated in this many days get `staleMode`; 0 disables. */
  staleDays: number
  staleMode: Mode
  /** Regexes; cards whose title matches are hidden. */
  titlePatterns: string[]
  /** Column names to collapse entirely (e.g. "Done"). */
  collapsedColumns: string[]
  compact: boolean
  /** Sort every column by assignee (GitHub's own sort, via the URL) and label the first card of each run. */
  groupByAssignee: boolean
  /** Columns where each card shows how long it has been sitting there. Needs a token. */
  stageColumns: string[]
  /** Days in the column after which the tag turns amber, then red. */
  stageWarnDays: number
  stageStaleDays: number
  /** Your GitHub login: cards you author, are assigned to or review get highlighted. */
  me: string
}

export interface Decision {
  mode: Mode
  highlight: boolean
  /** Human-readable reasons, shown on hover. */
  reasons: string[]
}

/** Fields that need the GitHub API can't be evaluated without enrichment; they are simply skipped. */
export const MODE_RANK: Record<Mode, number> = { show: 0, dim: 1, hide: 2 }
