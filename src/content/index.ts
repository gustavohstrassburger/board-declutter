import { evaluate } from '../core/rules'
import { cardFromSnapshot, columnField, projectFromPath } from '../core/snapshot'
import { stageTag } from '../core/stage'
import { loadSettings, onSettingsChange, saveSettings } from '../core/settings'
import type { Settings } from '../core/types'
import {
  applyCollapsedColumns,
  applyColumnStats,
  applyDecision,
  applyStageTag,
  chooseColumnStats,
  clearAll,
  clearAssigneeGroups,
  clearDecision,
  collectColumnStats,
  githubColumnCount,
  type ColumnStats,
  markAssigneeGroups,
  releasePlaceholders,
  resetStaleDecisions,
} from './apply'
import { cardKey, isRendered, parseBoard, SELECTORS } from './dom'
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

  const columns = [...board.querySelectorAll(SELECTORS.column)]
  const columnNames = columns.map((c) => c.getAttribute('data-board-column') ?? '')
  const field = items ? columnField(items, columnNames) : undefined
  const now = new Date()

  for (const { el, card } of entries) {
    const key = cardKey(card)
    const item = key ? snapshot.item(key) : undefined
    if (item) {
      // The DOM only shows fields the view displays; the API knows them all. The DOM wins when it has a value,
      // since it is fresher than a snapshot up to five minutes old.
      if (card.assignees.length === 0) card.assignees = item.assignees
      if (card.labels.length === 0) card.labels = item.labels
    }
    if (key) card.enrichment = item?.enrichment ?? enrichment.get(key)
    applyDecision(el, evaluate(card, settings), version, key)
    applyStageTag(
      el,
      stageTag(card, field ? item?.fieldUpdatedAt[field] : undefined, settings, now),
    )
  }

  // A hidden card is never rendered again, so a wrong "hide" would stick. With the snapshot we can re-judge
  // hidden placeholders from data alone and release the ones that should be visible.
  if (field) {
    for (const el of board.querySelectorAll('[data-bd-mode="hide"][data-bd-key]')) {
      if (isRendered(el)) continue
      const item = snapshot.item(el.getAttribute('data-bd-key') ?? '')
      if (item && evaluate(cardFromSnapshot(item, field), settings).mode !== 'hide')
        clearDecision(el)
    }
  }

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
