import {
  MODE_RANK,
  type Card,
  type Decision,
  type Mode,
  type Settings,
  type UnassignedMode,
} from './types'

function normalizeLogin(login: string): string {
  return login
    .replace(/^app\//, '')
    .replace(/\[bot\]$/, '')
    .toLowerCase()
}

/** Who is assigned says more than a label: a team-labelled card picked up by someone outside the team is
 *  theirs. So once team members are configured, an assigned card belongs to the team only when a member is
 *  among its assignees; unassigned cards (or any card, without members configured) go by team label. */
export function belongsToTeam(card: Card, settings: Settings): boolean {
  const members = new Set(settings.teamMembers.map(normalizeLogin))
  if (members.size > 0 && card.assignees.length > 0) {
    return card.assignees.some((a) => members.has(normalizeLogin(a)))
  }
  const labels = new Set(settings.teamLabels.map((l) => l.toLowerCase()))
  return card.labels.some((l) => labels.has(l.toLowerCase()))
}

/** The label that marks the card as AI-generated, if any. */
export function aiLabel(card: Card, settings: Settings): string | undefined {
  const wanted = new Set(settings.aiLabels.map((l) => l.trim().toLowerCase()))
  return card.labels.find((l) => wanted.has(l.trim().toLowerCase()))
}

export function isMine(card: Card, settings: Settings): boolean {
  if (!settings.me) return false
  const me = normalizeLogin(settings.me)
  return card.assignees.some((a) => normalizeLogin(a) === me)
}

const compiledPatterns = new WeakMap<string[], { source: string; regex: RegExp }[]>()

/** Compiled once per `titlePatterns` array; invalid regexes from the options page are dropped rather than breaking the board. */
function patternsFor(settings: Settings): { source: string; regex: RegExp }[] {
  let compiled = compiledPatterns.get(settings.titlePatterns)
  if (!compiled) {
    compiled = []
    for (const source of settings.titlePatterns) {
      try {
        compiled.push({ source, regex: new RegExp(source, 'i') })
      } catch {
        // ignore
      }
    }
    compiledPatterns.set(settings.titlePatterns, compiled)
  }
  return compiled
}

function matchesTitlePattern(card: Card, settings: Settings): string | undefined {
  return patternsFor(settings).find((p) => p.regex.test(card.title))?.source
}

/** Combine rule outcomes: the strongest mode wins, and every triggered rule is reported. */
export function evaluate(card: Card, settings: Settings): Decision {
  const triggered: { mode: UnassignedMode; reason: string }[] = []

  const ai = aiLabel(card, settings)
  if (ai !== undefined) {
    triggered.push({ mode: settings.aiMode, reason: `AI-generated (${ai})` })
  } else {
    triggered.push({ mode: settings.nonAiMode, reason: 'not AI-generated' })
  }
  if (card.assignees.length === 0 && card.type !== 'draft') {
    triggered.push({ mode: settings.unassignedMode, reason: 'no assignee' })
  }
  const teamConfigured = settings.teamMembers.length > 0 || settings.teamLabels.length > 0
  if (teamConfigured && !belongsToTeam(card, settings)) {
    triggered.push({ mode: settings.otherTeamsMode, reason: 'not your team' })
  }
  // Without a login every card would count as someone else's and the board would empty out.
  if (settings.me && !isMine(card, settings)) {
    triggered.push({ mode: settings.notMineMode, reason: 'not yours' })
  }
  const pattern = matchesTitlePattern(card, settings)
  if (pattern !== undefined) {
    triggered.push({ mode: 'hide', reason: `title matches /${pattern}/` })
  }

  // 'highlight' marks the card without changing whether it is shown, so it does not compete with dim/hide,
  // and the marker itself says why: it adds no reason badge.
  const active = triggered.filter(
    (t): t is { mode: Mode; reason: string } => t.mode !== 'show' && t.mode !== 'highlight',
  )
  const mode = active.reduce<Mode>(
    (acc, t) => (MODE_RANK[t.mode] > MODE_RANK[acc] ? t.mode : acc),
    'show',
  )
  return {
    mode,
    highlight: settings.highlightMine && isMine(card, settings),
    attention: triggered.some((t) => t.mode === 'highlight'),
    ai: ai !== undefined,
    reasons: active.map((t) => t.reason),
  }
}
