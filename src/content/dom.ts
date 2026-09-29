import type { Card } from '../core/types'

/** Selectors verified against the GitHub Projects (memex) board DOM in September 2026.
 *  Everything else on the board uses hashed CSS module class names, so only data attributes and ids are relied on. */
export const SELECTORS = {
  board: '#project-items-region',
  column: '[data-board-column]',
  card: '[data-board-card-id]',
  cardTitle: 'h3[id^="board-card-title-"]',
  avatar: 'img[data-testid="github-avatar"]',
  /** One per label when the view shows the Labels field. */
  labelButton: 'button[aria-label^="Label: "]',
} as const

const ITEM_PATH = /^\/([^/]+)\/([^/]+)\/(issues|pull)\/(\d+)$/

export function cardKey(card: Pick<Card, 'repo' | 'number'>): string | undefined {
  return card.repo && card.number ? `${card.repo}#${card.number}` : undefined
}

/** Board cards are virtualised: off-screen ones are empty placeholders that only carry an aria-label, and while
 *  a page of items loads GitHub fills the shell with a skeleton (a div with a span, no title) for seconds.
 *  Only a card with its real title is safe to evaluate: judging the skeleton would hide it for good. */
export function isRendered(el: Element): boolean {
  return el.querySelector(SELECTORS.cardTitle) !== null
}

interface Field {
  figure: Element
  values: string[]
  /** login → avatar URL, for fields rendered as avatar stacks */
  avatars: Record<string, string>
}

function figureFields(el: Element): Map<string, Field> {
  const fields = new Map<string, Field>()
  for (const figure of el.querySelectorAll('figure')) {
    const caption = figure.querySelector('figcaption')?.textContent ?? ''
    const colon = caption.indexOf(':')
    if (colon === -1) continue
    const name = caption.slice(0, colon).trim().toLowerCase()
    const avatars: Record<string, string> = {}
    for (const img of figure.querySelectorAll<HTMLImageElement>(SELECTORS.avatar))
      avatars[img.alt] = img.src
    const logins = Object.keys(avatars)
    const values = logins.length
      ? logins
      : caption
          .slice(colon + 1)
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
    fields.set(name, { figure, values, avatars })
    figure.setAttribute('data-bd-field', name)
  }
  return fields
}

/** The issue/PR the card points at. Only github.com item paths count, and the title anchor is preferred. */
function itemLink(el: Element): RegExpMatchArray | undefined {
  const anchors = [
    ...el.querySelectorAll<HTMLAnchorElement>(
      `${SELECTORS.cardTitle} a, a:has(${SELECTORS.cardTitle})`,
    ),
    ...el.querySelectorAll<HTMLAnchorElement>('a[href]'),
  ]
  for (const a of anchors) {
    let url: URL
    try {
      url = new URL(a.href, location.href)
    } catch {
      continue
    }
    if (url.hostname !== 'github.com') continue
    const m = url.pathname.match(ITEM_PATH)
    if (m) return m
  }
  return undefined
}

/** Labels render as a list of tokens (`button[aria-label="Label: x"]`); the figure form is kept as a fallback. */
function cardLabels(el: Element, fields: Map<string, Field>): string[] {
  const buttons = [...el.querySelectorAll(SELECTORS.labelButton)]
  if (buttons.length === 0) return fields.get('labels')?.values ?? []
  for (const button of buttons) button.closest('li')?.setAttribute('data-bd-field', 'label')
  return buttons
    .map((b) => (b.getAttribute('aria-label') ?? '').slice('Label: '.length).trim())
    .filter(Boolean)
}

export function parseCard(el: Element): Card | null {
  const id = el.getAttribute('data-board-card-id')
  if (!id || !isRendered(el)) return null

  const column = el.closest(SELECTORS.column)?.getAttribute('data-board-column') ?? ''
  const title =
    el.querySelector(SELECTORS.cardTitle)?.textContent?.trim() ||
    el.getAttribute('aria-label') ||
    ''

  const link = itemLink(el)

  const subject = el.getAttribute('data-hovercard-subject-tag') ?? ''
  let type: Card['type'] = 'draft'
  if (subject.startsWith('pull_request:') || link?.[3] === 'pull') type = 'pull_request'
  else if (subject.startsWith('issue:') || link?.[3] === 'issues') type = 'issue'

  const fields = figureFields(el)

  return {
    id,
    column,
    title,
    repo: link ? `${link[1]}/${link[2]}` : undefined,
    number: link ? Number(link[4]) : undefined,
    type,
    assignees: fields.get('assignees')?.values ?? [],
    avatars: fields.get('assignees')?.avatars,
    labels: cardLabels(el, fields),
  }
}

export function parseBoard(root: ParentNode): { el: Element; card: Card }[] {
  const out: { el: Element; card: Card }[] = []
  for (const el of root.querySelectorAll(SELECTORS.card)) {
    const card = parseCard(el)
    if (card) out.push({ el, card })
  }
  return out
}
