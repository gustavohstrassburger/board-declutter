import { describe, expect, it } from 'vitest'
import { mergeSettings, parseList } from '../src/core/settings'

describe('mergeSettings', () => {
  it('fills defaults and upgrades the old group-by-assignee flag', () => {
    expect(mergeSettings(undefined).groupBy).toBe('none')
    expect(mergeSettings({ groupByAssignee: true } as never).groupBy).toBe('assignee')
    expect(mergeSettings({ groupByAssignee: true, groupBy: 'parent' } as never).groupBy).toBe(
      'parent',
    )
  })
})

describe('parseList', () => {
  it('splits on newlines and commas and drops blanks', () => {
    expect(parseList(' a\nb, c\n\n')).toEqual(['a', 'b', 'c'])
  })
})
