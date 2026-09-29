import { describe, expect, it } from 'vitest'
import { aiLabel, belongsToTeam, evaluate } from '../src/core/rules'
import { card, settings } from './fixtures'

describe('belongsToTeam', () => {
  const team = settings({ teamMembers: ['haacked'], teamLabels: ['team/feature-flags'] })

  it('matches by label, case-insensitively', () => {
    expect(belongsToTeam(card({ labels: ['Team/Feature-Flags'] }), team)).toBe(true)
  })

  it('matches by assignee, ignoring the app/ prefix and [bot] suffix', () => {
    expect(belongsToTeam(card({ assignees: ['app/haacked[bot]'] }), team)).toBe(true)
  })

  it('is false for an unrelated card', () => {
    expect(belongsToTeam(card({ assignees: ['stranger'], labels: ['bug'] }), team)).toBe(false)
  })
})

describe('aiLabel', () => {
  it('matches configured labels case-insensitively', () => {
    expect(aiLabel(card({ labels: ['bug', 'Self-Driving'] }), settings())).toBe('Self-Driving')
    expect(aiLabel(card({ labels: ['bug'] }), settings())).toBeUndefined()
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

  it('lets the strongest mode win and reports every triggered rule', () => {
    const s = settings({ unassignedMode: 'dim', otherTeamsMode: 'hide', teamLabels: ['team/x'] })
    const d = evaluate(card(), s)
    expect(d.mode).toBe('hide')
    expect(d.reasons).toEqual(['no assignee', 'not your team'])
  })

  it('dims AI-generated cards by default and reports the label', () => {
    const d = evaluate(card({ assignees: ['x'], labels: ['self-driving'] }), settings())
    expect(d).toMatchObject({ mode: 'dim', reasons: ['AI-generated (self-driving)'] })
    expect(
      evaluate(card({ assignees: ['x'], labels: ['self-driving'] }), settings({ aiMode: 'hide' }))
        .mode,
    ).toBe('hide')
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

  it('hides titles matching a pattern and ignores invalid regexes', () => {
    const c = card({ assignees: ['x'], title: 'trunk-merge/pr-1' })
    expect(evaluate(c, settings({ titlePatterns: ['[', '^trunk-merge/'] })).mode).toBe('hide')
  })

  it('never hides my own cards, only dims them', () => {
    const c = card({ assignees: ['me'], title: 'trunk-merge/pr-1' })
    const d = evaluate(c, settings({ me: 'me', titlePatterns: ['^trunk-merge/'] }))
    expect(d).toMatchObject({ mode: 'dim', highlight: true })
  })
})
