import { beforeEach, describe, expect, it } from 'vitest'
import {
  applyCollapsedColumns,
  applyColumnStats,
  applyDecision,
  applyStageTag,
  clearAll,
  clearAssigneeGroups,
  collectColumnStats,
  markAssigneeGroups,
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
      avatars: { neilkakkar: 'https://avatars.githubusercontent.com/u/1' },
      labels: ['feature/cohorts', 'team/feature-flags'],
    })
  })

  it('skips virtualised placeholder cards', () => {
    expect(parseCard(document.querySelector('[data-board-card-id="248684323"]')!)).toBeNull()
  })

  it('skips the loading skeleton GitHub puts in a card while a page of items loads', () => {
    document.body.innerHTML =
      '<div data-board-column="C"><div><div data-board-card-id="1" aria-label="fix(flags): x"><div><span></span></div></div></div></div>'
    const el = document.querySelector('[data-board-card-id="1"]')!
    expect(parseCard(el)).toBeNull()
    expect(parseBoard(document)).toEqual([])
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

  it('shows the visible count only while something is hidden, and removes it after', () => {
    const column = document.querySelector('[data-board-column="Todo"]')!
    applyColumnStats(column, { name: 'Todo', total: 3, hidden: 2, dimmed: 1 })
    const badge = column.querySelector<HTMLElement>('.bd-col-count')!
    expect(badge.textContent).toBe('1 shown')
    expect(badge.title).toBe('2 hidden, 1 dimmed')

    applyColumnStats(column, { name: 'Todo', total: 3, hidden: 0, dimmed: 1 })
    expect(column.querySelector('.bd-col-count')).toBeNull()
  })

  it("sits right after GitHub's counter", () => {
    const column = document.querySelector('[data-board-column="Todo"]')!
    column.firstElementChild!.innerHTML =
      '<h2>Todo</h2><span data-component="CounterLabel">82</span><span>(82)</span>'
    applyColumnStats(column, { name: 'Todo', total: 82, hidden: 40, dimmed: 0 })
    const badge = column.querySelector('.bd-col-count')!
    expect(badge.textContent).toBe('42 shown')
    expect(badge.previousElementSibling?.getAttribute('data-component')).toBe('CounterLabel')
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

describe('markAssigneeGroups', () => {
  function board(assignees: (string[] | null)[]): void {
    document.body.innerHTML = `<div id="project-items-region"><div data-board-column="C"><div>C</div><div>${assignees
      .map((a, i) =>
        a === null
          ? `<div data-board-card-id="${i}"></div>`
          : `<div data-board-card-id="${i}"><div><a href="https://github.com/o/r/issues/${i}"><h3 id="board-card-title-${i}">t${i}</h3></a>${
              a.length
                ? `<figure><figcaption>Assignees: ${a.join(', ')}</figcaption>${a
                    .map(
                      (x) =>
                        `<img data-testid="github-avatar" alt="${x}" src="https://avatars.example/${x}.png">`,
                    )
                    .join('')}</figure>`
                : ''
            }</div></div>`,
      )
      .join('')}</div></div></div>`
  }
  const groups = () =>
    [...document.querySelectorAll('[data-board-card-id]')].map((el) =>
      el.getAttribute('data-bd-group'),
    )
  const headers = () =>
    [...document.querySelectorAll('[data-board-card-id]')].map((el) => {
      const h = el.querySelector(':scope > .bd-group-header')
      return h
        ? `${h.querySelectorAll('img').length}:${h.querySelector('span')?.textContent}`
        : null
    })

  it('labels the first card of each run, skipping placeholders and hidden cards', () => {
    board([['ann'], ['ann'], null, ['bob'], [], [], ['ann']])
    const entries = parseBoard(document)
    const hidden = document.querySelector('[data-board-card-id="3"]')!
    applyDecision(hidden, { mode: 'hide', highlight: false, reasons: [] }, 1)
    markAssigneeGroups(document, entries)
    expect(groups()).toEqual(['ann', null, null, null, 'Unassigned', null, 'ann'])
    expect(headers()).toEqual(['1:ann', null, null, null, '0:Unassigned', null, '1:ann'])
  })

  it('puts the header with every avatar in front of the card box, and clears everything on demand', () => {
    board([
      ['ann', 'bob'],
      ['ann', 'bob'],
    ])
    markAssigneeGroups(document, parseBoard(document))
    expect(headers()).toEqual(['2:ann, bob', null])
    const card = document.querySelector('[data-board-card-id="0"]')!
    expect(card.firstElementChild?.className).toBe('bd-group-header')
    expect(card.querySelector('.bd-group-header img')?.getAttribute('src')).toBe(
      'https://avatars.example/ann.png',
    )
    clearAssigneeGroups(document)
    expect(groups()).toEqual([null, null])
    expect(document.querySelector('.bd-group-header')).toBeNull()
  })

  it('removes the header from a card that turned into a placeholder', () => {
    board([['ann']])
    markAssigneeGroups(document, parseBoard(document))
    const card = document.querySelector('[data-board-card-id="0"]')!
    card.lastElementChild!.remove() // GitHub un-rendered it; only our header is left
    markAssigneeGroups(document, [])
    expect(card.children).toHaveLength(0)
  })
})

describe('applyStageTag', () => {
  it('appends the chip to the card box, updates it in place and removes it', () => {
    const el = document.querySelector('[data-board-card-id="231274630"]')!
    applyStageTag(el, {
      days: 4,
      level: 'warn',
      text: '4d',
      title: '4 days in In Review (since 2026-09-24)',
    })
    const chip = el.querySelector<HTMLElement>('.bd-stage')!
    expect(chip.parentElement).toBe(el.firstElementChild)
    expect(chip.textContent).toBe('4d')
    expect(chip.dataset.level).toBe('warn')
    expect(el.getAttribute('data-bd-stage')).toBe('4d')

    applyStageTag(el, { days: 9, level: 'stale', text: '9d', title: '9 days' })
    expect(el.querySelectorAll('.bd-stage')).toHaveLength(1)
    expect(chip.dataset.level).toBe('stale')

    applyStageTag(el, undefined)
    expect(el.querySelector('.bd-stage')).toBeNull()
    expect(el.hasAttribute('data-bd-stage')).toBe(false)
  })

  it('skips the group header and does nothing on an empty placeholder', () => {
    const el = document.querySelector('[data-board-card-id="231274630"]')!
    const header = document.createElement('div')
    header.className = 'bd-group-header'
    el.prepend(header)
    applyStageTag(el, { days: 1, level: 'ok', text: '1d', title: '' })
    expect(el.querySelector('.bd-stage')?.parentElement).toBe(el.children[1])

    const placeholder = document.querySelector('[data-board-card-id="248684323"]')!
    applyStageTag(placeholder, { days: 1, level: 'ok', text: '1d', title: '' })
    expect(placeholder.querySelector('.bd-stage')).toBeNull()
  })
})
