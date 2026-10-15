import { describe, expect, it, vi } from 'vitest'
import { loadMoreSentinels } from '../src/content/dom'
import {
  ColumnPreloader,
  needsPreload,
  nextAttemptCount,
  preloadable,
  waitForMore,
} from '../src/content/preload'

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

describe('preloadable', () => {
  it('skips hidden or folded columns and the ones listed, case-insensitively', () => {
    document.body.innerHTML = `
      <div data-board-column="Todo"></div>
      <div data-board-column="Done"></div>
      <div data-board-column="Backlog" data-bd-hidden-column></div>
      <div data-board-column="Archive" data-bd-collapsed></div>`
    const names = [...document.querySelectorAll('[data-board-column]')]
      .filter((c) => preloadable(c, ['done']))
      .map((c) => c.getAttribute('data-board-column'))
    expect(names).toEqual(['Todo'])
  })
})

describe('ColumnPreloader.run', () => {
  function column(name: string, shells: number, counter: number): string {
    return `
      <div data-board-column="${name}">
        <header><span data-component="CounterLabel">${counter}</span></header>
        <div data-dnd-drop-type="card">${'<div data-board-card-id="x"></div>'.repeat(shells)}<div class="sentinel"></div></div>
      </div>`
  }

  function board(shells: number, counter: number): Element {
    document.body.innerHTML = column('Todo', shells, counter)
    return document.body
  }

  it('loads every column that needs it at once', () => {
    document.body.innerHTML = column('Todo', 1, 3) + column('Doing', 1, 3)
    new ColumnPreloader(() => {}).run(document.body, [])
    const nudged = [...document.querySelectorAll<HTMLElement>('.sentinel')].map(
      (el) => el.style.display,
    )
    expect(nudged).toEqual(['none', 'none'])
  })

  it('reports loading while a column has cards left to fetch', () => {
    expect(new ColumnPreloader(() => {}).run(board(1, 3), [])).toBe(true)
  })

  it('reports done once every column holds all its cards', () => {
    expect(new ColumnPreloader(() => {}).run(board(3, 3), [])).toBe(false)
  })
})

describe('waitForMore', () => {
  function list(shells: number): Element {
    document.body.innerHTML = `<div>${'<div data-board-card-id="x"></div>'.repeat(shells)}</div>`
    return document.body.firstElementChild!
  }

  it('resolves as soon as a new card shell lands', async () => {
    const zone = list(1)
    const more = waitForMore(zone, 1)
    zone.insertAdjacentHTML('beforeend', '<div data-board-card-id="y"></div>')
    expect(await more).toBe(true)
  })

  it('gives up after the timeout when nothing lands', async () => {
    vi.useFakeTimers()
    const more = waitForMore(list(1), 1)
    vi.advanceTimersByTime(2000)
    expect(await more).toBe(false)
    vi.useRealTimers()
  })
})
