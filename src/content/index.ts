import { applyChange } from '../core/modes'
import { evaluate } from '../core/rules'
import { loadSettings, onSettingsChange, saveSettings } from '../core/settings'
import type { Settings } from '../core/types'
import {
  applyCollapsedColumns,
  applyColumnStats,
  applyDecision,
  applyHiddenColumns,
  applySplitColumns,
  chooseColumnStats,
  clearAll,
  clearAssigneeGroups,
  collectColumnStats,
  githubColumnCount,
  markGroups,
  resetStaleDecisions,
} from './apply'
import { Cloak } from './cloak'
import { parseBoard, renderingOnScreen, SELECTORS } from './dom'
import { installPeek } from './focus'
import { ColumnPreloader } from './preload'
import { ASSIGNEE_SORT, ensureSort, NEWEST_SORT } from './sort'
import { Toolbar } from './toolbar'
import { isAllowedView, isProjectPath, viewShowsLabels } from './view'

let settings: Settings
/** Bumped whenever settings change; see `applyDecision` for why decisions are stamped with it. */
let version = 0
let toolbar: Toolbar | undefined
let scheduled = false
const preloader = new ColumnPreloader(() => schedule())
const cloak = new Cloak(document.documentElement, () => schedule())
/** When GitHub last changed the page, to tell when the board has settled (see `Cloak`). */
let lastChange = performance.now()
let lastPath: string | undefined

const COLLAPSED_GROUPS_KEY = 'bd-collapsed-groups'

/** Folded groups are a per-browser view convenience, like the toolbar's minimized state, so they live in
 *  localStorage, which may be unavailable (private mode). */
function loadCollapsedGroups(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(COLLAPSED_GROUPS_KEY) ?? '[]') as string[])
  } catch {
    return new Set()
  }
}

const collapsedGroups = loadCollapsedGroups()

function toggleGroup(key: string): void {
  if (!collapsedGroups.delete(key)) collapsedGroups.add(key)
  try {
    localStorage.setItem(COLLAPSED_GROUPS_KEY, JSON.stringify([...collapsedGroups]))
  } catch {
    // ignore
  }
  schedule()
}

function schedule(): void {
  if (scheduled) return
  scheduled = true
  requestAnimationFrame(() => {
    scheduled = false
    apply()
  })
}

function apply(): void {
  // GitHub switches views without a reload and keeps the board element, so each new view is cloaked again.
  if (location.pathname !== lastPath) {
    lastPath = location.pathname
    if (cloaks(location.pathname)) cloak.hide()
  }
  const board = document.querySelector(SELECTORS.board)
  if (!board) {
    toolbarVisible(false)
    // GitHub navigates without a reload: leaving a full-screen board must bring the page's header back.
    document.documentElement.removeAttribute('data-bd-focus')
    document.documentElement.removeAttribute('data-bd-compact')
    return
  }
  // GitHub switches views without a reload, so a board left for another view must be restored.
  if (!isAllowedView(location.pathname, settings.views)) {
    clearAll(board)
    toolbarVisible(false)
    cloak.show()
    return
  }
  toolbarVisible(true)

  if (!settings.enabled) {
    clearAll(board)
    cloak.show()
    toolbar?.update({
      columns: columnNames(board),
      labelsVisible: true,
    })
    return
  }

  resetStaleDecisions(board, version)
  // Both features lean on GitHub's own sort; grouping by assignee takes precedence when both are on.
  const sort =
    settings.groupBy === 'assignee' ? ASSIGNEE_SORT : settings.split ? NEWEST_SORT : undefined
  // GitHub re-renders the board with the sort, and that change drives the next pass.
  if (sort && ensureSort(board, sort)) return

  const entries = parseBoard(board)
  for (const { el, card } of entries) {
    applyDecision(el, evaluate(card, settings), version)
  }

  for (const column of board.querySelectorAll(SELECTORS.column)) {
    applyColumnStats(
      column,
      chooseColumnStats(collectColumnStats(column), githubColumnCount(column)),
    )
  }
  applyCollapsedColumns(board, settings.collapsedColumns)
  applyHiddenColumns(board, settings.hiddenColumns)
  applySplitColumns(board, settings.split ? settings.splitColumns : [], schedule)
  const loading = settings.preloadColumns && preloader.run(board, settings.noPreloadColumns)
  if (settings.groupBy !== 'none') {
    markGroups(board, entries, {
      collapsed: collapsedGroups,
      onToggle: toggleGroup,
    })
  } else clearAssigneeGroups(board)
  document.documentElement.toggleAttribute('data-bd-compact', settings.compact)
  document.documentElement.toggleAttribute('data-bd-focus', settings.focus)

  toolbar?.update({
    columns: columnNames(board),
    labelsVisible: entries.length === 0 || viewShowsLabels(document, location.pathname),
  })
  cloak.update({
    loading,
    hasColumns: board.querySelector(SELECTORS.column) !== null,
    rendering: renderingOnScreen(board, window.innerHeight),
    quietFor: performance.now() - lastChange,
  })
}

function cloaks(pathname: string): boolean {
  return settings.enabled && isProjectPath(pathname) && isAllowedView(pathname, settings.views)
}

function columnNames(board: Element): string[] {
  return [...board.querySelectorAll(SELECTORS.column)].map(
    (c) => c.getAttribute('data-board-column') ?? '',
  )
}

function toolbarVisible(visible: boolean): void {
  document.querySelector('.bd-toolbar')?.toggleAttribute('hidden', !visible)
}

function updateSettings(next: Settings): void {
  // A card's group key includes its stack, which splitting changes; folded placeholders keep the old key and
  // no header would carry it any more, so drop the grouping marks and let the next pass redo them.
  if (
    next.split !== settings.split ||
    next.splitColumns.join('\n') !== settings.splitColumns.join('\n')
  ) {
    const board = document.querySelector(SELECTORS.board)
    if (board) clearAssigneeGroups(board)
  }
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

function domReady(): Promise<void> {
  if (document.readyState !== 'loading') return Promise.resolve()
  return new Promise((resolve) =>
    document.addEventListener('DOMContentLoaded', () => resolve(), { once: true }),
  )
}

async function main(): Promise<void> {
  // The script runs before the page is parsed (document_start) so the board is cloaked from its first paint,
  // even before the settings say whether this view is one to declutter.
  if (isProjectPath(location.pathname)) cloak.hide()
  settings = await loadSettings()
  if (!cloaks(location.pathname)) cloak.show()
  await domReady()
  // Toolbar clicks only persist; the storage change event then drives the update, so each change is applied once.
  toolbar = new Toolbar(settings, (patch) =>
    saveSettings(applyChange(settings, patch)).catch((err: unknown) =>
      console.error('Board Declutter: could not save settings', err),
    ),
  )
  onSettingsChange(updateSettings)
  installPeek(
    document.documentElement,
    () => document.querySelector(SELECTORS.board)?.getBoundingClientRect().top,
  )

  // GitHub navigates between views without a full reload and virtualises cards while scrolling,
  // so re-apply on every subtree change. `apply` is idempotent and cheap.
  new MutationObserver((records) => {
    if (records.some((r) => !isOwnMutation(r))) {
      lastChange = performance.now()
      schedule()
    }
  }).observe(document.body, { childList: true, subtree: true })
  schedule()
}

void main()
