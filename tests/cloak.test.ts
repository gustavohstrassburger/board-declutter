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
  let cloak: Cloak
  const recheck = vi.fn()

  beforeEach(() => {
    vi.useFakeTimers()
    recheck.mockClear()
    cloak = new Cloak(root, recheck)
  })

  afterEach(() => {
    cloak.show()
    vi.useRealTimers()
  })

  it('shows the board once it has settled', () => {
    cloak.hide()
    cloak.update(busy)
    expect(cloaked()).toBe(true)
    cloak.update({ loading: false, hasColumns: true, quietFor: QUIET_MS })
    expect(cloaked()).toBe(false)
  })

  it('shows the board after the time limit even if no pass ever reports it settled', () => {
    cloak.hide()
    vi.advanceTimersByTime(MAX_CLOAK_MS - 1)
    expect(cloaked()).toBe(true)
    vi.advanceTimersByTime(1)
    expect(cloaked()).toBe(false)
  })

  it('keeps the time limit while passes report the board still changing', () => {
    cloak.hide()
    for (let t = 0; t < MAX_CLOAK_MS; t += QUIET_MS) {
      cloak.update(busy)
      vi.advanceTimersByTime(QUIET_MS)
    }
    expect(cloaked()).toBe(false)
  })

  it('asks for another check after a quiet spell, since a settled board changes nothing', () => {
    cloak.hide()
    cloak.update(busy)
    vi.advanceTimersByTime(QUIET_MS)
    expect(recheck).toHaveBeenCalledTimes(1)
  })

  it('keeps the original deadline when hidden again while cloaked', () => {
    cloak.hide()
    vi.advanceTimersByTime(MAX_CLOAK_MS - 1000)
    cloak.hide()
    vi.advanceTimersByTime(1000)
    expect(cloaked()).toBe(false)
  })
})
