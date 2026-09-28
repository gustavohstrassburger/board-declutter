import { describe, expect, it, vi } from 'vitest'
import { parseSnapshotNode } from '../src/core/github'
import {
  cardFromSnapshot,
  columnField,
  columnOf,
  projectFromPath,
  type SnapshotItem,
} from '../src/core/snapshot'
import { chooseColumnStats } from '../src/content/apply'
import { SnapshotStore, SNAPSHOT_RETRY_MS, SNAPSHOT_TTL_MS } from '../src/content/snapshot-store'

function item(fields: Record<string, string>, patch: Partial<SnapshotItem> = {}): SnapshotItem {
  return { type: 'issue', title: 't', assignees: [], labels: [], fields, ...patch }
}

describe('projectFromPath', () => {
  it('reads org and user projects', () => {
    expect(projectFromPath('/orgs/PostHog/projects/112/views/2')).toEqual({
      kind: 'orgs',
      owner: 'PostHog',
      number: 112,
    })
    expect(projectFromPath('/users/octocat/projects/3')).toEqual({
      kind: 'users',
      owner: 'octocat',
      number: 3,
    })
    expect(projectFromPath('/PostHog/posthog/pulls')).toBeUndefined()
  })
})

describe('columnField / columnOf', () => {
  it('picks the single-select field whose values match the board columns', () => {
    const items = [
      item({ Status: 'Todo', Priority: 'High' }),
      item({ Status: 'Done' }),
      item({ Priority: 'Todo' }),
    ]
    expect(columnField(items, ['No Status', 'Todo', 'Done'])).toBe('Status')
    expect(columnOf(items[2]!, 'Status')).toBe('No Status')
  })

  it('is undefined when nothing matches', () => {
    expect(columnField([item({ Status: 'X' })], ['Todo'])).toBeUndefined()
  })
})

describe('parseSnapshotNode / cardFromSnapshot', () => {
  it('maps a PR node into a snapshot item with enrichment, then into a card', () => {
    const parsed = parseSnapshotNode({
      fieldValues: { nodes: [{ name: 'In Review', field: { name: 'Status' } }, null, {}] },
      content: {
        __typename: 'PullRequest',
        number: 7,
        title: 'fix',
        repository: { nameWithOwner: 'o/r' },
        assignees: { nodes: [{ login: 'ann' }] },
        labels: { nodes: [{ name: 'team/x' }] },
        author: { login: 'posthog', __typename: 'Bot' },
        updatedAt: '2026-09-01T00:00:00Z',
        isDraft: true,
        reviewDecision: null,
        reviewRequests: { nodes: [{ requestedReviewer: { slug: 'team-x' } }] },
      },
    })!
    expect(parsed).toMatchObject({
      key: 'o/r#7',
      type: 'pull_request',
      fields: { Status: 'In Review' },
    })
    expect(parsed.enrichment).toMatchObject({
      authorIsBot: true,
      isDraft: true,
      reviewers: ['team-x'],
    })
    expect(cardFromSnapshot(parsed, 'Status')).toMatchObject({
      column: 'In Review',
      assignees: ['ann'],
      labels: ['team/x'],
    })
  })

  it('keeps draft items and drops items without content', () => {
    const draft = parseSnapshotNode({
      fieldValues: { nodes: [] },
      content: { __typename: 'DraftIssue', title: 'idea', assignees: { nodes: [] } },
    })
    expect(draft).toMatchObject({ type: 'draft' })
    expect(draft?.key).toBeUndefined()
    expect(parseSnapshotNode({ fieldValues: { nodes: [] }, content: null })).toBeUndefined()
  })
})

describe('chooseColumnStats', () => {
  const dom = { name: 'C', total: 25, hidden: 3, dimmed: 0 }
  const snap = { name: 'C', total: 82, hidden: 40, dimmed: 1 }

  it('prefers the snapshot when it agrees with GitHub’s counter', () => {
    expect(chooseColumnStats(dom, 82, snap)).toBe(snap)
  })

  it('falls back to the DOM only once every shell is loaded', () => {
    expect(chooseColumnStats(dom, 82, undefined)).toBeUndefined()
    expect(chooseColumnStats({ ...dom, total: 82 }, 82, undefined)).toMatchObject({ total: 82 })
  })

  it('distrusts a snapshot that disagrees with the counter (view filter) and needs a counter at all', () => {
    expect(chooseColumnStats(dom, 60, snap)).toBeUndefined()
    expect(chooseColumnStats(dom, undefined, snap)).toBeUndefined()
  })
})

describe('SnapshotStore', () => {
  const project = { kind: 'orgs' as const, owner: 'o', number: 1 }

  function setup(now: () => number) {
    const sendMessage = vi.fn()
    vi.stubGlobal('chrome', { runtime: { sendMessage, lastError: undefined } })
    const store = new SnapshotStore(() => {}, now)
    return { sendMessage, store, respond: (r: unknown) => sendMessage.mock.calls.at(-1)![1](r) }
  }

  it('fetches once, serves the cache until the TTL passes, and indexes items by key', () => {
    let now = 1_000_000
    const { sendMessage, store, respond } = setup(() => now)
    expect(store.get(project)).toBeUndefined()
    store.get(project)
    expect(sendMessage).toHaveBeenCalledTimes(1)
    respond({ items: [item({}, { key: 'o/r#1' })] })
    expect(store.get(project)).toHaveLength(1)
    expect(store.item('o/r#1')).toBeDefined()
    expect(sendMessage).toHaveBeenCalledTimes(1)
    now += SNAPSHOT_TTL_MS + 1
    store.get(project)
    expect(sendMessage).toHaveBeenCalledTimes(2)
  })

  it('backs off after an error and resets when the project changes', () => {
    let now = 1_000_000
    const { sendMessage, store, respond } = setup(() => now)
    store.get(project)
    respond({ error: 'no-token' })
    expect(store.status).toBe('no-token')
    store.get(project)
    expect(sendMessage).toHaveBeenCalledTimes(1)
    now += SNAPSHOT_RETRY_MS
    store.get(project)
    expect(sendMessage).toHaveBeenCalledTimes(2)
    respond({ items: [] })
    expect(store.get({ ...project, number: 2 })).toBeUndefined()
    expect(sendMessage).toHaveBeenCalledTimes(3)
  })
})
