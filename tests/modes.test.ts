import { describe, expect, it } from 'vitest'
import { applyChange, switchMode } from '../src/core/modes'
import { settings } from './fixtures'

describe('switchMode', () => {
  it('sets the planning defaults and keeps what they replaced', () => {
    const s = settings({
      compact: true,
      focus: false,
      nonAiMode: 'hide',
      hiddenColumns: ['no status', 'Backlog'],
      collapsedColumns: ['No Status', 'In Review'],
    })
    const planning = switchMode(s, 'planning')
    expect(planning).toMatchObject({
      mode: 'planning',
      otherTeamsMode: 'hide',
      aiMode: 'hide',
      nonAiMode: 'show',
      unassignedMode: 'highlight',
      highlightMine: false,
      focus: true,
      split: true,
      compact: true,
      hiddenColumns: ['Backlog', 'Done'],
      collapsedColumns: ['In Review'],
    })
    expect(planning.modeSnapshot).toMatchObject({
      focus: false,
      hiddenColumns: ['no status', 'Backlog'],
    })
    expect(planning.modeSnapshot).not.toHaveProperty('compact')
  })

  it('puts back the replaced values on leaving, dropping changes made to them meanwhile', () => {
    const s = settings({ focus: false, aiMode: 'dim' })
    const tweaked = { ...switchMode(s, 'planning'), focus: false, compact: true }
    expect(switchMode(tweaked, 'normal')).toMatchObject({
      mode: 'normal',
      modeSnapshot: {},
      focus: false,
      aiMode: 'dim',
      hiddenColumns: [],
      compact: true,
    })
  })

  it('goes straight from one mode to another without stacking them', () => {
    const s = settings({ aiMode: 'dim', highlightMine: true })
    const bot = switchMode(switchMode(s, 'planning'), 'botTriage')
    expect(bot).toMatchObject({ mode: 'botTriage', highlightMine: true, aiMode: 'show' })
    expect(switchMode(bot, 'normal')).toMatchObject({ highlightMine: true, aiMode: 'dim' })
  })

  it('leaves only my cards in My cards, whatever the other rules were', () => {
    const s = settings({ aiMode: 'hide', otherTeamsMode: 'hide', split: true, highlightMine: true })
    expect(switchMode(s, 'myCards')).toMatchObject({
      notMineMode: 'hide',
      aiMode: 'show',
      otherTeamsMode: 'show',
      highlightMine: false,
      split: false,
      hiddenColumns: ['Done'],
    })
  })

  it('lists Done once when it is already hidden', () => {
    expect(switchMode(settings({ hiddenColumns: ['done'] }), 'planning').hiddenColumns).toEqual([
      'Done',
    ])
  })
})

describe('applyChange', () => {
  const planning = switchMode(settings({ focus: false, compact: false }), 'planning')

  it('leaves the mode for Normal on a board setting change, keeping what is on the board', () => {
    expect(applyChange(planning, { compact: true })).toMatchObject({
      mode: 'normal',
      modeSnapshot: {},
      compact: true,
      focus: true,
      aiMode: 'hide',
    })
  })

  it('stays in the mode for profile settings, On/Off and unchanged values', () => {
    expect(applyChange(planning, { teamMembers: ['ann'] }).mode).toBe('planning')
    expect(applyChange(planning, { enabled: false }).mode).toBe('planning')
    expect(applyChange(planning, { focus: true, hiddenColumns: ['Done'] }).mode).toBe('planning')
  })

  it('lets a mode switch through', () => {
    expect(applyChange(planning, switchMode(planning, 'botTriage')).mode).toBe('botTriage')
  })
})
