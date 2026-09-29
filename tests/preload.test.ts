import { describe, expect, it } from 'vitest'
import { needsPreload } from '../src/content/preload'

describe('needsPreload', () => {
  const now = 1_000_000

  it('is true only while the column holds fewer shells than GitHub counts', () => {
    expect(needsPreload(25, 94, undefined, now)).toBe(true)
    expect(needsPreload(94, 94, undefined, now)).toBe(false)
    expect(needsPreload(25, undefined, undefined, now)).toBe(false)
  })

  it('gives up after a few recent attempts and tries again later', () => {
    expect(needsPreload(25, 94, { count: 4, at: now - 1000 }, now)).toBe(false)
    expect(needsPreload(25, 94, { count: 3, at: now - 1000 }, now)).toBe(true)
    expect(needsPreload(25, 94, { count: 4, at: now - 61_000 }, now)).toBe(true)
  })
})
