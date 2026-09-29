import { evaluate } from '../core/rules'
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
  markAssigneeGroups,
  resetStaleDecisions,
} from './apply'
import { parseBoard, SELECTORS } from './dom'
import { installPeek } from './focus'
import { ensureAssigneeSort } from './sort'
import { Toolbar } from './toolbar'

let settings: Settings
/** Bumped whenever settings change; see `applyDecision` for why decisions are stamped with it. */
let version = 0
let toolbar: Toolbar | undefined
let scheduled = false

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
    toolbar?.update({ total: 0, hidden: 0, dimmed: 0 })
    return
  }

  resetStaleDecisions(board, version)
  if (settings.groupByAssignee && ensureAssigneeSort(board)) return

  const entries = parseBoard(board)
  for (const { el, card } of entries) {
    applyDecision(el, evaluate(card, settings), version)
  }

  let total = 0
  let hidden = 0
  let dimmed = 0
  for (const column of board.querySelectorAll(SELECTORS.column)) {
    const dom = collectColumnStats(column)
    applyColumnStats(column, chooseColumnStats(dom, githubColumnCount(column)))
    total += dom.total
    hidden += dom.hidden
    dimmed += dom.dimmed
  }
  applyCollapsedColumns(board, settings.collapsedColumns)
  if (settings.groupByAssignee) markAssigneeGroups(board, entries)
  else clearAssigneeGroups(board)
  document.documentElement.toggleAttribute('data-bd-compact', settings.compact)
  document.documentElement.toggleAttribute('data-bd-focus', settings.focus)

  toolbar?.update({ total, hidden, dimmed })
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
  installPeek(
    document.documentElement,
    () => document.querySelector(SELECTORS.board)?.getBoundingClientRect().top,
  )

  // GitHub navigates between views without a full reload and virtualises cards while scrolling,
  // so re-apply on every subtree change. `apply` is idempotent and cheap.
  new MutationObserver((records) => {
    if (records.some((r) => !isOwnMutation(r))) schedule()
  }).observe(document.body, { childList: true, subtree: true })
  schedule()
}

void main()
