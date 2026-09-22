import { describe, expect, it } from 'vitest'
import { buildQuery, parseKey, parseResponse } from '../src/core/github'

const refs = [
  parseKey('PostHog/posthog#1')!,
  parseKey('PostHog/posthog#2')!,
  parseKey('PostHog/charts#7')!,
]

describe('parseKey', () => {
  it('splits owner, repo and number', () => {
    expect(parseKey('PostHog/posthog#42')).toEqual({
      key: 'PostHog/posthog#42',
      owner: 'PostHog',
      repo: 'posthog',
      number: 42,
    })
    expect(parseKey('nope')).toBeUndefined()
    expect(parseKey('a/b#2147483648')).toBeUndefined()
  })
})

describe('buildQuery', () => {
  it('groups items per repository with stable aliases', () => {
    const q = buildQuery(refs)
    expect(q).toContain('r0: repository(owner: "PostHog", name: "posthog")')
    expect(q).toContain('i1: issueOrPullRequest(number: 2)')
    expect(q).toContain('r1: repository(owner: "PostHog", name: "charts")')
    expect(q).toContain('i0: issueOrPullRequest(number: 7)')
  })
})

describe('parseResponse', () => {
  it('maps aliases back to keys and normalises PR and issue shapes', () => {
    const out = parseResponse(refs, {
      r0: {
        i0: {
          __typename: 'PullRequest',
          author: { login: 'posthog', __typename: 'Bot' },
          updatedAt: '2026-09-01T00:00:00Z',
          isDraft: true,
          reviewDecision: 'APPROVED',
          reviewRequests: {
            nodes: [
              { requestedReviewer: { slug: 'team-feature-flags' } },
              { requestedReviewer: null },
            ],
          },
        },
        i1: { __typename: 'Issue', author: null, updatedAt: '2026-08-01T00:00:00Z' },
      },
      r1: { i0: null },
    })
    expect(out).toEqual({
      'PostHog/posthog#1': {
        author: 'posthog',
        authorIsBot: true,
        isDraft: true,
        reviewDecision: 'APPROVED',
        reviewers: ['team-feature-flags'],
        updatedAt: '2026-09-01T00:00:00Z',
      },
      'PostHog/posthog#2': {
        author: 'ghost',
        authorIsBot: false,
        isDraft: false,
        reviewDecision: null,
        reviewers: [],
        updatedAt: '2026-08-01T00:00:00Z',
      },
    })
  })
})
