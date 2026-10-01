import { describe, expect, it } from 'vitest'
import { loadMoreSentinels } from '../src/content/dom'
import { needsPreload, nextAttemptCount } from '../src/content/preload'

describe('needsPreload', () => {
  const now = 1_000_000

  it('is true only while the column holds fewer shells than GitHub counts', () => {
    expect(needsPreload(25, 94, undefined, now)).toBe(true)
    expect(needsPreload(94, 94, undefined, now)).toBe(false)
    expect(needsPreload(25, undefined, undefined, now)).toBe(false)
  })

  it('gives up after a few fruitless attempts and tries again later', () => {
    expect(needsPreload(25, 94, { count: 4, at: now - 1000, shells: 25 }, now)).toBe(false)
    expect(needsPreload(25, 94, { count: 3, at: now - 1000, shells: 25 }, now)).toBe(true)
    expect(needsPreload(25, 94, { count: 4, at: now - 61_000, shells: 25 }, now)).toBe(true)
  })

  it('keeps going while attempts bring cards', () => {
    expect(needsPreload(50, 94, { count: 4, at: now - 1000, shells: 25 }, now)).toBe(true)
  })
})

describe('nextAttemptCount', () => {
  const now = 1_000_000

  it('counts fruitless attempts in a row and resets on progress or after a quiet minute', () => {
    expect(nextAttemptCount(undefined, 25, now)).toBe(1)
    expect(nextAttemptCount({ count: 2, at: now - 1000, shells: 25 }, 25, now)).toBe(3)
    expect(nextAttemptCount({ count: 2, at: now - 1000, shells: 25 }, 50, now)).toBe(1)
    expect(nextAttemptCount({ count: 4, at: now - 61_000, shells: 25 }, 25, now)).toBe(1)
  })
})

describe('loadMoreSentinels', () => {
  it('picks what GitHub puts after the cards that is not a control nor ours', () => {
    document.body.innerHTML = `<div id="zone">
      <div data-board-card-id="1"><button>card</button></div>
      <div id="footer"><button>Add item</button></div>
      <div id="sentinel"></div>
      <div class="bd-stack-loader"></div>
    </div>`
    expect(loadMoreSentinels(document.querySelector('#zone')!).map((el) => el.id)).toEqual([
      'sentinel',
    ])
  })
})
