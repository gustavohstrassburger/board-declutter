import { MODE_RANK, type Card, type Decision, type Mode, type Settings } from './types'

function normalizeLogin(login: string): string {
  return login
    .replace(/^app\//, '')
    .replace(/\[bot\]$/, '')
    .toLowerCase()
}

/** A card belongs to the team when a team member is assigned to it or it carries a team label. */
export function belongsToTeam(card: Card, settings: Settings): boolean {
  const members = new Set(settings.teamMembers.map(normalizeLogin))
  const labels = new Set(settings.teamLabels.map((l) => l.toLowerCase()))
  if (card.labels.some((l) => labels.has(l.toLowerCase()))) return true
  return card.assignees.some((a) => members.has(normalizeLogin(a)))
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
  const triggered: { mode: Mode; reason: string }[] = []

  const ai = aiLabel(card, settings)
  if (ai !== undefined) {
    triggered.push({ mode: settings.aiMode, reason: `AI-generated (${ai})` })
  }
  if (card.assignees.length === 0 && card.type !== 'draft') {
    triggered.push({ mode: settings.unassignedMode, reason: 'no assignee' })
  }
  const teamConfigured = settings.teamMembers.length > 0 || settings.teamLabels.length > 0
  if (teamConfigured && !belongsToTeam(card, settings)) {
    triggered.push({ mode: settings.otherTeamsMode, reason: 'not your team' })
  }
  const pattern = matchesTitlePattern(card, settings)
  if (pattern !== undefined) {
    triggered.push({ mode: 'hide', reason: `title matches /${pattern}/` })
  }

  const active = triggered.filter((t) => t.mode !== 'show')
  const mode = active.reduce<Mode>(
    (acc, t) => (MODE_RANK[t.mode] > MODE_RANK[acc] ? t.mode : acc),
    'show',
  )
  const highlight = isMine(card, settings)

  // Cards that are mine are never hidden: the whole point is to find my work fast.
  return {
    mode: highlight && mode === 'hide' ? 'dim' : mode,
    highlight,
    reasons: active.map((t) => t.reason),
  }
}
