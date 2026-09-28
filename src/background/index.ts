import { fetchEnrichment, fetchProjectSnapshot, parseKey, type ItemRef } from '../core/github'
import { snapshotCacheKey, type ProjectRef, type SnapshotItem } from '../core/snapshot'
import { loadToken, onTokenChange } from '../core/token'
import type { Enrichment } from '../core/types'
import type { EnrichResponse, Request, SnapshotResponse } from './protocol'

const CACHE_TTL_MS = 10 * 60 * 1000
const SNAPSHOT_TTL_MS = 5 * 60 * 1000
const ERROR_BACKOFF_MS = 60 * 1000
const BATCH_SIZE = 50
const MAX_KEYS_PER_REQUEST = 500

interface CacheEntry {
  /** null records an item the API did not return (deleted, or a repo the token can't read). */
  value: Enrichment | null
  fetchedAt: number
}

/** Session storage is cleared with the browser and only trusted contexts can read it: the right home for a 10-minute cache. */
const cache = chrome.storage.session

let lastErrorAt = 0

async function readCache(keys: string[]): Promise<Map<string, Enrichment | null>> {
  const stored = await cache.get(keys.map((k) => `enrich:${k}`))
  const out = new Map<string, Enrichment | null>()
  const now = Date.now()
  for (const key of keys) {
    const entry = stored[`enrich:${key}`] as CacheEntry | undefined
    if (entry && now - entry.fetchedAt < CACHE_TTL_MS) out.set(key, entry.value)
  }
  return out
}

async function writeCache(entries: Map<string, Enrichment | null>): Promise<void> {
  const now = Date.now()
  const payload: Record<string, CacheEntry> = {}
  for (const [key, value] of entries) payload[`enrich:${key}`] = { value, fetchedAt: now }
  await cache.set(payload)
}

async function enrich(keys: string[]): Promise<EnrichResponse> {
  const token = await loadToken()
  if (!token) return { items: {}, error: 'no-token' }

  const known = await readCache(keys)
  const items: Record<string, Enrichment> = {}
  for (const [key, value] of known) if (value) items[key] = value

  const missing = keys
    .filter((k) => !known.has(k))
    .map(parseKey)
    .filter((r): r is ItemRef => r !== undefined)
  if (missing.length === 0) return { items }
  if (Date.now() - lastErrorAt < ERROR_BACKOFF_MS) return { items, error: 'api' }

  try {
    for (let i = 0; i < missing.length; i += BATCH_SIZE) {
      const batch = missing.slice(i, i + BATCH_SIZE)
      const fetched = await fetchEnrichment(token, batch)
      const entries = new Map<string, Enrichment | null>()
      for (const ref of batch) entries.set(ref.key, fetched[ref.key] ?? null)
      await writeCache(entries)
      Object.assign(items, fetched)
    }
  } catch (err) {
    lastErrorAt = Date.now()
    console.error('[board-declutter] enrichment failed', err)
    return { items, error: 'api' }
  }
  return { items }
}

interface SnapshotCacheEntry {
  items: SnapshotItem[]
  fetchedAt: number
}

/** Every item on the project, so counts and rules can cover cards the board has not rendered. */
async function snapshot(project: ProjectRef): Promise<SnapshotResponse> {
  const token = await loadToken()
  if (!token) return { error: 'no-token' }

  const cacheKey = `snapshot:${snapshotCacheKey(project)}`
  const stored = (await cache.get(cacheKey))[cacheKey] as SnapshotCacheEntry | undefined
  if (stored && Date.now() - stored.fetchedAt < SNAPSHOT_TTL_MS) return { items: stored.items }
  if (Date.now() - lastErrorAt < ERROR_BACKOFF_MS) return { error: 'api' }

  try {
    const items = await fetchProjectSnapshot(token, project)
    await cache.set({ [cacheKey]: { items, fetchedAt: Date.now() } satisfies SnapshotCacheEntry })
    return { items }
  } catch (err) {
    lastErrorAt = Date.now()
    console.error('[board-declutter] project snapshot failed', err)
    return { error: 'api' }
  }
}

function isSnapshotRequest(message: unknown): message is { type: 'snapshot'; project: ProjectRef } {
  if (typeof message !== 'object' || message === null) return false
  const m = message as { type?: unknown; project?: Partial<ProjectRef> }
  return (
    m.type === 'snapshot' &&
    typeof m.project === 'object' &&
    m.project !== null &&
    (m.project.kind === 'orgs' || m.project.kind === 'users') &&
    typeof m.project.owner === 'string' &&
    Number.isInteger(m.project.number)
  )
}

function isEnrichRequest(message: unknown): message is { type: 'enrich'; keys: string[] } {
  if (typeof message !== 'object' || message === null) return false
  const m = message as Record<string, unknown>
  return m.type === 'enrich' && Array.isArray(m.keys) && m.keys.every((k) => typeof k === 'string')
}

chrome.runtime.onMessage.addListener((message: Request, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return false

  if (isEnrichRequest(message)) {
    enrich(message.keys.slice(0, MAX_KEYS_PER_REQUEST)).then(sendResponse, (err: unknown) => {
      console.error('[board-declutter] enrichment failed', err)
      sendResponse({ items: {}, error: 'api' } satisfies EnrichResponse)
    })
    return true // keep the channel open for the async response
  }
  if (isSnapshotRequest(message)) {
    snapshot(message.project).then(sendResponse, (err: unknown) => {
      console.error('[board-declutter] project snapshot failed', err)
      sendResponse({ error: 'api' } satisfies SnapshotResponse)
    })
    return true
  }
  if (message.type === 'open-options') {
    void chrome.runtime.openOptionsPage()
  }
  return false
})

chrome.action.onClicked.addListener(() => {
  void chrome.runtime.openOptionsPage()
})

// The content script must never see the token or the cached API data. Session storage is trusted-only by
// default; `setAccessLevel` on local storage only exists in newer Chrome versions, and our content script
// never reads local storage anyway, so a missing API is not fatal.
for (const area of [chrome.storage.local, chrome.storage.session]) {
  if (typeof area.setAccessLevel === 'function') {
    void area.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' })
  }
}

onTokenChange(() => {
  lastErrorAt = 0
  void cache.clear()
})
