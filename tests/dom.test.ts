import { beforeEach, describe, expect, it } from 'vitest'
import {
  applyCollapsedColumns,
  applyColumnStats,
  applyDecision,
  clearAll,
  collectColumnStats,
  releasePlaceholders,
  resetStaleDecisions,
  setText,
} from '../src/content/apply'
import { cardKey, parseBoard, parseCard } from '../src/content/dom'
import { CARD_HTML } from './fixtures'

beforeEach(() => {
  document.body.innerHTML = `<div id="project-items-region">${CARD_HTML}</div>`
})

describe('parseCard', () => {
  it('reads everything visible on a rendered issue card', () => {
    const el = document.querySelector('[data-board-card-id="231274630"]')!
    expect(parseCard(el)).toEqual({
      id: '231274630',
      column: 'Todo',
      title: 'Cohort Clickhouse Table revamp',
      repo: 'PostHog/posthog',
      number: 13147,
      type: 'issue',
      assignees: ['neilkakkar'],
      labels: ['feature/cohorts', 'team/feature-flags'],
    })
  })

  it('skips virtualised placeholder cards', () => {
    expect(parseCard(document.querySelector('[data-board-card-id="248684323"]')!)).toBeNull()
  })

  it('treats items without a link as draft items', () => {
    expect(parseCard(document.querySelector('[data-board-card-id="99"]')!)).toMatchObject({
      type: 'draft',
      repo: undefined,
      assignees: [],
    })
  })

  it('infers the type from the link when the hovercard tag is missing', () => {
    expect(parseCard(document.querySelector('[data-board-card-id="500"]')!)).toMatchObject({
      type: 'pull_request',
      number: 101876,
      column: 'Done',
    })
  })

  it('tags field figures so CSS can target them', () => {
    parseCard(document.querySelector('[data-board-card-id="231274630"]')!)
    expect(document.querySelectorAll('figure[data-bd-field="labels"]')).toHaveLength(1)
  })
})

describe('parseBoard', () => {
  it('returns only rendered cards', () => {
    expect(parseBoard(document).map(({ card }) => card.id)).toEqual(['231274630', '99', '500'])
  })
})

describe('cardKey', () => {
  it('builds owner/repo#number and is undefined for drafts', () => {
    expect(cardKey({ repo: 'PostHog/posthog', number: 1 })).toBe('PostHog/posthog#1')
    expect(cardKey({})).toBeUndefined()
  })
})

describe('apply', () => {
  it('sets and clears card attributes', () => {
    const el = document.querySelector('[data-board-card-id="500"]')!
    applyDecision(el, { mode: 'hide', highlight: true, reasons: ['bot author', 'draft PR'] }, 3)
    expect(el.getAttribute('data-bd-mode')).toBe('hide')
    expect(el.hasAttribute('data-bd-highlight')).toBe(true)
    expect(el.getAttribute('data-bd-reasons')).toBe('bot author · draft PR')
    expect(el.getAttribute('data-bd-v')).toBe('3')

    applyDecision(el, { mode: 'show', highlight: false, reasons: [] }, 4)
    expect(el.hasAttribute('data-bd-mode')).toBe(false)
    expect(el.hasAttribute('data-bd-reasons')).toBe(false)
  })

  it('adds a column badge only when something is hidden or dimmed, and removes it after', () => {
    const column = document.querySelector('[data-board-column="Todo"]')!
    applyColumnStats(column, { name: 'Todo', total: 3, hidden: 2, dimmed: 1 })
    expect(column.querySelector('.bd-col-count')?.textContent).toBe('2 hidden, 1 dimmed')
    applyColumnStats(column, { name: 'Todo', total: 3, hidden: 0, dimmed: 0 })
    expect(column.querySelector('.bd-col-count')).toBeNull()
  })

  it('collapses columns case-insensitively and clearAll resets the board', () => {
    applyCollapsedColumns(document, ['done'])
    expect(
      document.querySelector('[data-board-column="Done"]')?.hasAttribute('data-bd-collapsed'),
    ).toBe(true)
    expect(
      document.querySelector('[data-board-column="Todo"]')?.hasAttribute('data-bd-collapsed'),
    ).toBe(false)
    applyColumnStats(document.querySelector('[data-board-column="Todo"]')!, {
      name: 'Todo',
      total: 3,
      hidden: 1,
      dimmed: 0,
    })

    clearAll(document)
    expect(document.querySelector('[data-bd-collapsed]')).toBeNull()
    expect(document.querySelector('.bd-col-count')).toBeNull()
  })
})

describe('virtualised cards', () => {
  const hide = { mode: 'hide' as const, highlight: false, reasons: ['no assignee'] }

  it('counts placeholders from their attributes so hidden cards stay in the stats', () => {
    const column = document.querySelector('[data-board-column="Todo"]')!
    const placeholder = document.querySelector('[data-board-card-id="248684323"]')!
    applyDecision(placeholder, hide, 1)
    applyDecision(document.querySelector('[data-board-card-id="99"]')!, { ...hide, mode: 'dim' }, 1)
    expect(collectColumnStats(column)).toEqual({ name: 'Todo', total: 3, hidden: 1, dimmed: 1 })
  })

  it('releases placeholders decided under an older settings version, but not rendered cards', () => {
    const placeholder = document.querySelector('[data-board-card-id="248684323"]')!
    const rendered = document.querySelector('[data-board-card-id="500"]')!
    applyDecision(placeholder, hide, 1)
    applyDecision(rendered, hide, 1)

    resetStaleDecisions(document, 1)
    expect(placeholder.getAttribute('data-bd-mode')).toBe('hide')

    resetStaleDecisions(document, 2)
    expect(placeholder.hasAttribute('data-bd-mode')).toBe(false)
    expect(rendered.getAttribute('data-bd-mode')).toBe('hide')
  })
})

describe('own DOM writes', () => {
  it('does not touch the DOM when the column badge text is unchanged', async () => {
    const column = document.querySelector('[data-board-column="Todo"]')!
    applyColumnStats(column, { name: 'Todo', total: 3, hidden: 2, dimmed: 0 })
    const observer = new MutationObserver(() => {})
    observer.observe(document.body, { childList: true, subtree: true, characterData: true })
    applyColumnStats(column, { name: 'Todo', total: 3, hidden: 2, dimmed: 0 })
    await Promise.resolve()
    expect(observer.takeRecords()).toHaveLength(0)
    observer.disconnect()
  })

  it('setText writes only on change', () => {
    const el = document.createElement('span')
    setText(el, 'a')
    const node = el.firstChild
    setText(el, 'a')
    expect(el.firstChild).toBe(node)
    setText(el, 'b')
    expect(el.textContent).toBe('b')
  })
})

describe('releasePlaceholders', () => {
  it('releases only hidden placeholders whose enrichment arrived', () => {
    const hide = { mode: 'hide' as const, highlight: false, reasons: ['x'] }
    const placeholder = document.querySelector('[data-board-card-id="248684323"]')!
    const rendered = document.querySelector('[data-board-card-id="500"]')!
    applyDecision(placeholder, hide, 1, 'PostHog/posthog#1')
    applyDecision(rendered, hide, 1, 'PostHog/posthog#2')
    releasePlaceholders(document, new Set(['PostHog/posthog#3']))
    expect(placeholder.getAttribute('data-bd-mode')).toBe('hide')
    releasePlaceholders(document, new Set(['PostHog/posthog#1', 'PostHog/posthog#2']))
    expect(placeholder.hasAttribute('data-bd-mode')).toBe(false)
    expect(rendered.getAttribute('data-bd-mode')).toBe('hide')
  })
})

describe('parseCard link safety', () => {
  it('ignores links to other hosts that merely mention github.com', () => {
    document.body.innerHTML = `<div data-board-column="X"><div><div data-board-card-id="7">
      <a href="https://evil.example/?u=github.com/a/b/issues/1"><h3 id="board-card-title-7">t</h3></a>
    </div></div></div>`
    expect(parseCard(document.querySelector('[data-board-card-id="7"]')!)).toMatchObject({
      type: 'draft',
      repo: undefined,
    })
  })
})
