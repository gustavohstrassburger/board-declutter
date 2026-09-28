import type { Card, Settings } from './types'

const DAY_MS = 24 * 60 * 60 * 1000

export interface StageTag {
  days: number
  level: 'ok' | 'warn' | 'stale'
  text: string
  title: string
}

/** How long a card has been in its column, for the columns the user watches. `enteredAt` is when the
 *  column field was last set, so a bulk re-save of the same value does reset it. */
export function stageTag(
  card: Card,
  enteredAt: string | undefined,
  settings: Settings,
  now: Date = new Date(),
): StageTag | undefined {
  if (!enteredAt) return undefined
  const watched = settings.stageColumns.some((c) => c.toLowerCase() === card.column.toLowerCase())
  if (!watched) return undefined
  const entered = new Date(enteredAt)
  if (Number.isNaN(entered.getTime())) return undefined

  const days = Math.max(0, Math.floor((now.getTime() - entered.getTime()) / DAY_MS))
  const level =
    days >= settings.stageStaleDays ? 'stale' : days >= settings.stageWarnDays ? 'warn' : 'ok'
  const text = days === 0 ? 'today' : `${days}d`
  const since = entered.toISOString().slice(0, 10)
  return {
    days,
    level,
    text,
    title: `${days} day${days === 1 ? '' : 's'} in ${card.column} (since ${since})`,
  }
}
