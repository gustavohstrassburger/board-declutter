import { describe, expect, it } from 'vitest'
import { stageTag } from '../src/core/stage'
import { card, settings } from './fixtures'

const now = new Date('2026-09-28T12:00:00Z')

describe('stageTag', () => {
  it('reports days in a watched column with the level from the thresholds', () => {
    const s = settings({ stageWarnDays: 3, stageStaleDays: 7 })
    expect(stageTag(card({ column: 'In Review' }), '2026-09-27T00:00:00Z', s, now)).toMatchObject({
      days: 1,
      level: 'ok',
      text: '1d',
    })
    expect(stageTag(card({ column: 'approved' }), '2026-09-24T00:00:00Z', s, now)).toMatchObject({
      days: 4,
      level: 'warn',
    })
    expect(stageTag(card({ column: 'In Review' }), '2026-09-01T00:00:00Z', s, now)).toMatchObject({
      level: 'stale',
      text: '27d',
      title: '27 days in In Review (since 2026-09-01)',
    })
  })

  it('says today for less than a day', () => {
    expect(
      stageTag(card({ column: 'In Review' }), '2026-09-28T09:00:00Z', settings(), now)?.text,
    ).toBe('today')
  })

  it('is undefined outside watched columns or without a timestamp', () => {
    expect(
      stageTag(card({ column: 'Todo' }), '2026-09-01T00:00:00Z', settings(), now),
    ).toBeUndefined()
    expect(stageTag(card({ column: 'In Review' }), undefined, settings(), now)).toBeUndefined()
    expect(stageTag(card({ column: 'In Review' }), 'garbage', settings(), now)).toBeUndefined()
  })
})
