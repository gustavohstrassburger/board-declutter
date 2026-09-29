import { describe, expect, it } from 'vitest'
import { shouldPeek } from '../src/content/focus'

describe('shouldPeek', () => {
  it('starts peeking only at the very top edge', () => {
    expect(shouldPeek(0, false, 300)).toBe(true)
    expect(shouldPeek(3, false, 300)).toBe(true)
    expect(shouldPeek(4, false, 300)).toBe(false)
  })

  it('keeps peeking while the mouse stays above the board and stops once it is over it', () => {
    expect(shouldPeek(150, true, 300)).toBe(true)
    expect(shouldPeek(299, true, 300)).toBe(true)
    expect(shouldPeek(300, true, 300)).toBe(false)
  })

  it('never stops peeking when the board position is unknown', () => {
    expect(shouldPeek(5000, true, Infinity)).toBe(true)
  })
})
