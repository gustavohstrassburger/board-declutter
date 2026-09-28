import { evaluate } from '../core/rules'
import { cardFromSnapshot, columnField, projectFromPath } from '../core/snapshot'
import { loadSettings, onSettingsChange, saveSettings } from '../core/settings'
import type { Settings } from '../core/types'
import {
  applyCollapsedColumns,
  applyColumnStats,
  applyDecision,
  chooseColumnStats,
  clearAll,
  clearAssigneeGroups,
  collectColumnStats,
  githubColumnCount,
  type ColumnStats,
  markAssigneeGroups,
  releasePlaceholders,
  resetStaleDecisions,
} from './apply'
import { cardKey, parseBoard, SELECTORS } from './dom'
import { EnrichmentStore } from './enrichment'
import { SnapshotStore } from './snapshot-store'
import { ensureAssigneeSort } from './sort'
import { Toolbar } from './toolbar'

let settings: Settings
/** Bumped whenever settings change; see `applyDecision` for why decisions are stamped with it. */
let version = 0
let toolbar: Toolbar | undefined
let scheduled = false

const snapshot = new SnapshotStore(() => schedule())

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
  if (settings.groupByAssignee && ensureAssigneeSort(board)) return

  const entries = parseBoard(board)
  const project = projectFromPath(location.pathname)
  const items = project ? snapshot.get(project) : undefined

  // The snapshot already carries author/draft/reviewer data; only ask per item for what it lacks.
  enrichment.request(
    entries
      .map(({ card }) => cardKey(card))
      .filter((k): k is string => k !== undefined && snapshot.item(k) === undefined),
  )

  for (const { el, card } of entries) {
    const key = cardKey(card)
    if (key) card.enrichment = snapshot.item(key)?.enrichment ?? enrichment.get(key)
    applyDecision(el, evaluate(card, settings), version, key)
  }

  const columns = [...board.querySelectorAll(SELECTORS.column)]
  const columnNames = columns.map((c) => c.getAttribute('data-board-column') ?? '')
  const field = items ? columnField(items, columnNames) : undefined
  const fromSnapshot = new Map<string, ColumnStats>()
  if (items && field) {
    for (const item of items) {
      const card = cardFromSnapshot(item, field)
      const stats = fromSnapshot.get(card.column) ?? {
        name: card.column,
        total: 0,
        hidden: 0,
        dimmed: 0,
      }
      const mode = evaluate(card, settings).mode
      stats.total++
      if (mode === 'hide') stats.hidden++
      else if (mode === 'dim') stats.dimmed++
      fromSnapshot.set(card.column, stats)
    }
  }

  let total = 0
  let hidden = 0
  let dimmed = 0
  for (const column of columns) {
    const dom = collectColumnStats(column)
    const stats =
      chooseColumnStats(dom, githubColumnCount(column), fromSnapshot.get(dom.name)) ?? dom
    applyColumnStats(
      column,
      stats === dom && dom.total !== githubColumnCount(column) ? undefined : stats,
    )
    total += stats.total
    hidden += stats.hidden
    dimmed += stats.dimmed
  }
  applyCollapsedColumns(board, settings.collapsedColumns)
  if (settings.groupByAssignee) markAssigneeGroups(board, entries)
  else clearAssigneeGroups(board)
  document.documentElement.toggleAttribute('data-bd-compact', settings.compact)

  toolbar?.update({ total, hidden, dimmed, enrichment: enrichmentStatus() })
}

/** The snapshot is the primary source; per-item enrichment only matters when the snapshot is unavailable. */
function enrichmentStatus(): EnrichmentStore['status'] {
  return snapshot.status === 'ok'
    ? 'ok'
    : enrichment.status === 'ok'
      ? snapshot.status
      : enrichment.status
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
