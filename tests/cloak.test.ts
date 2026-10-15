import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Cloak, MAX_CLOAK_MS, QUIET_MS, settled } from '../src/content/cloak'

describe('settled', () => {
  const ready = { loading: false, hasColumns: true, quietFor: QUIET_MS }

  it('is true once the board has columns, nothing loading and no recent change', () => {
    expect(settled(ready)).toBe(true)
  })

  it('waits for columns, the preloader and a quiet spell', () => {
    expect(settled({ ...ready, hasColumns: false })).toBe(false)
    expect(settled({ ...ready, loading: true })).toBe(false)
    expect(settled({ ...ready, quietFor: QUIET_MS - 1 })).toBe(false)
  })
})

describe('Cloak', () => {
  const root = document.documentElement
  const cloaked = (): boolean => root.hasAttribute('data-bd-cloak')
  const busy = { loading: true, hasColumns: true, quietFor: 0 }

  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('shows the board once it has settled', () => {
    const cloak = new Cloak(root, () => {})
    cloak.hide(0)
    cloak.update(busy, 100)
    expect(cloaked()).toBe(true)
    cloak.update({ loading: false, hasColumns: true, quietFor: QUIET_MS }, 200)
    expect(cloaked()).toBe(false)
  })

  it('shows the board after the time limit even while it is still changing', () => {
    const cloak = new Cloak(root, () => {})
    cloak.hide(0)
    cloak.update(busy, MAX_CLOAK_MS)
    expect(cloaked()).toBe(false)
  })

  it('asks for another check after a quiet spell, since a settled board changes nothing', () => {
    const recheck = vi.fn()
    const cloak = new Cloak(root, recheck)
    cloak.hide(0)
    cloak.update(busy, 0)
    vi.advanceTimersByTime(QUIET_MS)
    expect(recheck).toHaveBeenCalledTimes(1)
    cloak.show()
  })

  it('keeps the original deadline when hidden again while cloaked', () => {
    const cloak = new Cloak(root, () => {})
    cloak.hide(0)
    cloak.hide(1000)
    cloak.update(busy, MAX_CLOAK_MS)
    expect(cloaked()).toBe(false)
  })
})
