import { MODE_RANK, type Card, type Decision, type Mode, type Settings } from './types'

const DAY_MS = 24 * 60 * 60 * 1000

function normalizeLogin(login: string): string {
  return login
    .replace(/^app\//, '')
    .replace(/\[bot\]$/, '')
    .toLowerCase()
}

export function isBotAuthor(card: Card, settings: Settings): boolean {
  const e = card.enrichment
  if (!e) return false
  if (e.authorIsBot) return true
  const bots = new Set(settings.botAuthors.map(normalizeLogin))
  return bots.has(normalizeLogin(e.author))
}

export function isStale(card: Card, settings: Settings, now: Date): boolean {
  const e = card.enrichment
  if (!e || settings.staleDays <= 0) return false
  const age = now.getTime() - new Date(e.updatedAt).getTime()
  return age > settings.staleDays * DAY_MS
}

/** A card belongs to the team when a team member touches it or it carries a team label. */
export function belongsToTeam(card: Card, settings: Settings): boolean {
  const members = new Set(settings.teamMembers.map(normalizeLogin))
  const labels = new Set(settings.teamLabels.map((l) => l.toLowerCase()))
  if (card.labels.some((l) => labels.has(l.toLowerCase()))) return true
  if (card.assignees.some((a) => members.has(normalizeLogin(a)))) return true
  const e = card.enrichment
  if (!e) return false
  if (members.has(normalizeLogin(e.author))) return true
  return e.reviewers.some((r) => members.has(normalizeLogin(r)))
}

export function isMine(card: Card, settings: Settings): boolean {
  if (!settings.me) return false
  const me = normalizeLogin(settings.me)
  if (card.assignees.some((a) => normalizeLogin(a) === me)) return true
  const e = card.enrichment
  if (!e) return false
  return normalizeLogin(e.author) === me || e.reviewers.some((r) => normalizeLogin(r) === me)
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
export function evaluate(card: Card, settings: Settings, now: Date = new Date()): Decision {
  const triggered: { mode: Mode; reason: string }[] = []

  if (isBotAuthor(card, settings)) {
    triggered.push({ mode: settings.botMode, reason: `bot author (${card.enrichment?.author})` })
  }
  if (card.enrichment?.isDraft) {
    triggered.push({ mode: settings.draftMode, reason: 'draft PR' })
  }
  if (card.assignees.length === 0 && card.type !== 'draft') {
    triggered.push({ mode: settings.unassignedMode, reason: 'no assignee' })
  }
  const teamConfigured = settings.teamMembers.length > 0 || settings.teamLabels.length > 0
  if (teamConfigured && !belongsToTeam(card, settings)) {
    triggered.push({ mode: settings.otherTeamsMode, reason: 'not your team' })
  }
  if (isStale(card, settings, now)) {
    triggered.push({ mode: settings.staleMode, reason: `no update in ${settings.staleDays}+ days` })
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
