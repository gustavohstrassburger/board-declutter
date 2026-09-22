import { evaluate } from '../core/rules'
import { loadSettings, onSettingsChange, saveSettings } from '../core/settings'
import type { Settings } from '../core/types'
import {
  applyCollapsedColumns,
  applyColumnStats,
  applyDecision,
  clearAll,
  collectColumnStats,
  releasePlaceholders,
  resetStaleDecisions,
} from './apply'
import { cardKey, parseBoard, SELECTORS } from './dom'
import { EnrichmentStore } from './enrichment'
import { Toolbar } from './toolbar'

let settings: Settings
/** Bumped whenever settings change; see `applyDecision` for why decisions are stamped with it. */
let version = 0
let toolbar: Toolbar | undefined
let scheduled = false

const enrichment = new EnrichmentStore((landed) => {
  const board = document.querySelector(SELECTORS.board)
  if (board && landed.size) releasePlaceholders(board, landed)
  schedule()
})

function schedule(): void {
  if (scheduled) return
  scheduled = true
  requestAnimationFrame(() => {
    scheduled = false
    apply()
  })
}

function apply(): void {
  const board = document.querySelector(SELECTORS.board)
  if (!board) {
    toolbarVisible(false)
    return
  }
  toolbarVisible(true)

  if (!settings.enabled) {
    clearAll(board)
    toolbar?.update({ total: 0, hidden: 0, dimmed: 0, enrichment: enrichment.status })
    return
  }

  resetStaleDecisions(board, version)

  const entries = parseBoard(board)
  enrichment.request(
    entries.map(({ card }) => cardKey(card)).filter((k): k is string => k !== undefined),
  )

  for (const { el, card } of entries) {
    const key = cardKey(card)
    if (key) card.enrichment = enrichment.get(key)
    applyDecision(el, evaluate(card, settings), version, key)
  }

  let total = 0
  let hidden = 0
  let dimmed = 0
  for (const column of board.querySelectorAll(SELECTORS.column)) {
    const stats = collectColumnStats(column)
    applyColumnStats(column, stats)
    total += stats.total
    hidden += stats.hidden
    dimmed += stats.dimmed
  }
  applyCollapsedColumns(board, settings.collapsedColumns)
  document.documentElement.toggleAttribute('data-bd-compact', settings.compact)

  toolbar?.update({ total, hidden, dimmed, enrichment: enrichment.status })
}

function toolbarVisible(visible: boolean): void {
  document.querySelector('.bd-toolbar')?.toggleAttribute('hidden', !visible)
}

function updateSettings(next: Settings): void {
  settings = next
  version++
  toolbar?.setSettings(settings)
  schedule()
}

/** Mutations inside the nodes we add ourselves are ours; reacting to them would loop. */
function isOwnMutation(record: MutationRecord): boolean {
  const target = record.target instanceof Element ? record.target : record.target.parentElement
  return target?.closest('.bd-toolbar, .bd-col-count') !== null
}

async function main(): Promise<void> {
  settings = await loadSettings()
  // Toolbar clicks only persist; the storage change event then drives the update, so each change is applied once.
  toolbar = new Toolbar(settings, (patch) => saveSettings({ ...settings, ...patch }))
  onSettingsChange(updateSettings)

  // GitHub navigates between views without a full reload and virtualises cards while scrolling,
  // so re-apply on every subtree change. `apply` is idempotent and cheap.
  new MutationObserver((records) => {
    if (records.some((r) => !isOwnMutation(r))) schedule()
  }).observe(document.body, { childList: true, subtree: true })
  schedule()
}

void main()
