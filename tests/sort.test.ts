import { describe, expect, it } from 'vitest'
import { ASSIGNEE_SORT, NEWEST_SORT, withSort } from '../src/content/sort'

const board = 'https://github.com/orgs/PostHog/projects/112/views/2'

describe('withSort', () => {
  it('adds the sort to a project view URL and keeps other params', () => {
    expect(withSort(`${board}?filterQuery=-is%3Adraft`, ASSIGNEE_SORT)).toBe(
      `${board}?filterQuery=-is%3Adraft&sortedBy%5Bdirection%5D=asc&sortedBy%5BcolumnId%5D=Assignees`,
    )
  })

  it('is a no-op when the wanted sort is already there', () => {
    expect(
      withSort(`${board}?sortedBy%5Bdirection%5D=desc&sortedBy%5BcolumnId%5D=Created`, NEWEST_SORT),
    ).toBeUndefined()
  })

  it('replaces one of its own sorts but never the user’s', () => {
    expect(
      withSort(
        `${board}?sortedBy%5Bdirection%5D=asc&sortedBy%5BcolumnId%5D=Assignees`,
        NEWEST_SORT,
      ),
    ).toContain('sortedBy%5BcolumnId%5D=Created')
    expect(withSort(`${board}?sortedBy%5BcolumnId%5D=Title`, NEWEST_SORT)).toBeUndefined()
  })

  it('ignores pages that are not project views', () => {
    expect(withSort('https://github.com/PostHog/posthog/pulls', ASSIGNEE_SORT)).toBeUndefined()
  })
})
