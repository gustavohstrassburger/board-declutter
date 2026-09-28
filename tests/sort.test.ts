import { describe, expect, it } from 'vitest'
import { withAssigneeSort } from '../src/content/sort'

describe('withAssigneeSort', () => {
  it('adds the assignee sort to a project view URL and keeps other params', () => {
    const out = withAssigneeSort(
      'https://github.com/orgs/PostHog/projects/112/views/2?filterQuery=-is%3Adraft',
    )
    expect(out).toBe(
      'https://github.com/orgs/PostHog/projects/112/views/2?filterQuery=-is%3Adraft&sortedBy%5Bdirection%5D=asc&sortedBy%5BcolumnId%5D=Assignees',
    )
  })

  it('leaves a URL alone when it already has a sort, ours or the user’s', () => {
    expect(
      withAssigneeSort(
        'https://github.com/orgs/PostHog/projects/112?sortedBy%5BcolumnId%5D=Assignees',
      ),
    ).toBeUndefined()
    expect(
      withAssigneeSort('https://github.com/orgs/PostHog/projects/112?sortedBy%5BcolumnId%5D=Title'),
    ).toBeUndefined()
  })

  it('ignores pages that are not project views', () => {
    expect(withAssigneeSort('https://github.com/PostHog/posthog/pulls')).toBeUndefined()
  })
})
