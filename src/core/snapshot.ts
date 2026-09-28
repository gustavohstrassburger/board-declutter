import type { Card, Enrichment } from './types'

/** One project item as returned by the GitHub GraphQL API, independent of what the board has rendered. */
export interface SnapshotItem {
  /** "owner/repo#number" for issues and PRs; undefined for draft items. */
  key?: string
  type: Card['type']
  title: string
  repo?: string
  number?: number
  assignees: string[]
  labels: string[]
  /** Single-select field values by field name, e.g. { Status: "In Review" }. */
  fields: Record<string, string>
  /** When each single-select value was last set, by field name: how long the card has been in its column. */
  fieldUpdatedAt: Record<string, string>
  enrichment?: Enrichment
}

export interface ProjectRef {
  kind: 'orgs' | 'users'
  owner: string
  number: number
}

const PROJECT_PATH = /^\/(orgs|users)\/([^/]+)\/projects\/(\d+)/

export function projectFromPath(pathname: string): ProjectRef | undefined {
  const m = pathname.match(PROJECT_PATH)
  if (!m) return undefined
  return { kind: m[1] as ProjectRef['kind'], owner: m[2]!, number: Number(m[3]) }
}

export function snapshotCacheKey(ref: ProjectRef): string {
  return `${ref.kind}/${ref.owner}/${ref.number}`
}

/** The board's "column by" field is whichever single-select field has the most values matching the column names. */
export function columnField(items: SnapshotItem[], columnNames: string[]): string | undefined {
  const names = new Set(columnNames)
  const score = new Map<string, number>()
  for (const item of items) {
    for (const [field, value] of Object.entries(item.fields)) {
      if (names.has(value)) score.set(field, (score.get(field) ?? 0) + 1)
    }
  }
  let best: string | undefined
  let bestScore = 0
  for (const [field, n] of score) {
    if (n > bestScore) {
      best = field
      bestScore = n
    }
  }
  return best
}

/** GitHub labels the column for items without a value "No <Field>", e.g. "No Status". */
export function columnOf(item: SnapshotItem, field: string): string {
  return item.fields[field] ?? `No ${field}`
}

export function cardFromSnapshot(item: SnapshotItem, field: string): Card {
  return {
    id: item.key ?? item.title,
    column: columnOf(item, field),
    title: item.title,
    repo: item.repo,
    number: item.number,
    type: item.type,
    assignees: item.assignees,
    labels: item.labels,
    enrichment: item.enrichment,
  }
}
