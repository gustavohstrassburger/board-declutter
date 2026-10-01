import { describe, expect, it } from 'vitest'
import { mergeSettings, parseList } from '../src/core/settings'

describe('mergeSettings', () => {
  it('fills defaults and upgrades old grouping values', () => {
    expect(mergeSettings(undefined).groupBy).toBe('none')
    expect(mergeSettings({ groupByAssignee: true } as never).groupBy).toBe('assignee')
    expect(mergeSettings({ groupBy: 'parent' } as never).groupBy).toBe('none')
  })

  it('leaves a stored mode that no longer exists, putting back what it replaced', () => {
    expect(
      mergeSettings({ mode: 'gone', focus: true, modeSnapshot: { focus: false } } as never),
    ).toMatchObject({ mode: 'normal', focus: false, modeSnapshot: {} })
    expect(mergeSettings({ mode: 'planning' }).mode).toBe('planning')
  })
})

describe('parseList', () => {
  it('splits on newlines and commas and drops blanks', () => {
    expect(parseList(' a\nb, c\n\n')).toEqual(['a', 'b', 'c'])
  })
})
