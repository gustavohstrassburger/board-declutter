import { describe, expect, it } from 'vitest'
import { belongsToTeam, evaluate, isBotAuthor } from '../src/core/rules'
import { card, enrichment, settings } from './fixtures'

describe('isBotAuthor', () => {
  it('uses the GitHub account type', () => {
    const c = card({ enrichment: enrichment({ author: 'anything', authorIsBot: true }) })
    expect(isBotAuthor(c, settings({ botAuthors: [] }))).toBe(true)
  })

  it('matches configured logins ignoring the app/ prefix and [bot] suffix', () => {
    const c = card({ enrichment: enrichment({ author: 'app/posthog[bot]' }) })
    expect(isBotAuthor(c, settings({ botAuthors: ['posthog'] }))).toBe(true)
  })

  it('is false without enrichment', () => {
    expect(isBotAuthor(card(), settings())).toBe(false)
  })
})

describe('belongsToTeam', () => {
  const team = settings({ teamMembers: ['haacked'], teamLabels: ['team/feature-flags'] })

  it('matches by label without enrichment', () => {
    expect(belongsToTeam(card({ labels: ['Team/Feature-Flags'] }), team)).toBe(true)
  })

  it('matches by assignee, author or requested reviewer', () => {
    expect(belongsToTeam(card({ assignees: ['haacked'] }), team)).toBe(true)
    expect(belongsToTeam(card({ enrichment: enrichment({ author: 'haacked' }) }), team)).toBe(true)
    expect(belongsToTeam(card({ enrichment: enrichment({ reviewers: ['haacked'] }) }), team)).toBe(
      true,
    )
  })

  it('is false for an unrelated card', () => {
    expect(belongsToTeam(card({ enrichment: enrichment({ author: 'stranger' }) }), team)).toBe(
      false,
    )
  })
})

describe('evaluate', () => {
  it('shows a plain card by default', () => {
    expect(evaluate(card({ assignees: ['x'] }), settings())).toEqual({
      mode: 'show',
      highlight: false,
      reasons: [],
    })
  })

  it('dims bot PRs with the default settings', () => {
    const c = card({ assignees: ['x'], enrichment: enrichment({ author: 'posthog' }) })
    expect(evaluate(c, settings())).toMatchObject({
      mode: 'dim',
      reasons: ['bot author (posthog)'],
    })
  })

  it('lets the strongest mode win and reports every triggered rule', () => {
    const c = card({ enrichment: enrichment({ author: 'posthog', isDraft: true }) })
    const s = settings({ botMode: 'dim', draftMode: 'hide', unassignedMode: 'dim' })
    const d = evaluate(c, s)
    expect(d.mode).toBe('hide')
    expect(d.reasons).toEqual(['bot author (posthog)', 'draft PR', 'no assignee'])
  })

  it('does not treat draft items as unassigned', () => {
    expect(evaluate(card({ type: 'draft' }), settings({ unassignedMode: 'hide' })).mode).toBe(
      'show',
    )
  })

  it('applies the other-teams mode only when a team is configured', () => {
    const c = card({ assignees: ['x'] })
    expect(evaluate(c, settings({ otherTeamsMode: 'hide' })).mode).toBe('show')
    expect(evaluate(c, settings({ otherTeamsMode: 'hide', teamLabels: ['team/x'] })).mode).toBe(
      'hide',
    )
  })

  it('flags stale cards relative to `now`', () => {
    const c = card({
      assignees: ['x'],
      enrichment: enrichment({ updatedAt: '2026-01-01T00:00:00Z' }),
    })
    const s = settings({ staleDays: 30, staleMode: 'hide' })
    expect(evaluate(c, s, new Date('2026-03-01')).mode).toBe('hide')
    expect(evaluate(c, s, new Date('2026-01-10')).mode).toBe('show')
  })

  it('hides titles matching a pattern and ignores invalid regexes', () => {
    const c = card({ assignees: ['x'], title: 'trunk-merge/pr-1' })
    expect(evaluate(c, settings({ titlePatterns: ['[', '^trunk-merge/'] })).mode).toBe('hide')
  })

  it('never hides my own cards, only dims them', () => {
    const c = card({ assignees: ['me'], enrichment: enrichment({ author: 'posthog' }) })
    const d = evaluate(c, settings({ me: 'me', botMode: 'hide' }))
    expect(d).toMatchObject({ mode: 'dim', highlight: true })
  })
})
