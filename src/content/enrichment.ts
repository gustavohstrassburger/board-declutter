import type { Enrichment } from '../core/types'
import type { EnrichRequest, EnrichResponse } from '../background/protocol'

export const ENRICHMENT_TTL_MS = 10 * 60 * 1000
export const RETRY_AFTER_MS = 60 * 1000

interface Entry {
  value: Enrichment
  fetchedAt: number
}

/** Per-page cache of API data, keyed by "owner/repo#number". The service worker keeps the durable one.
 *  Keys that fail or come back empty are not asked for again until `RETRY_AFTER_MS` has passed, so a bad
 *  token or an unreadable repo can't turn the observer loop into a stream of API calls. */
export class EnrichmentStore {
  private cache = new Map<string, Entry>()
  private inFlight = new Set<string>()
  private retryAt = new Map<string, number>()
  status: 'ok' | 'no-token' | 'error' | 'pending' = 'ok'
  errorMessage = ''

  constructor(
    private onUpdate: (keys: Set<string>) => void,
    private now: () => number = Date.now,
  ) {}

  get(key: string): Enrichment | undefined {
    const entry = this.cache.get(key)
    if (!entry) return undefined
    if (this.now() - entry.fetchedAt > ENRICHMENT_TTL_MS) {
      this.cache.delete(key)
      return undefined
    }
    return entry.value
  }

  private wanted(key: string): boolean {
    if (this.inFlight.has(key) || this.get(key) !== undefined) return false
    const retry = this.retryAt.get(key)
    return retry === undefined || retry <= this.now()
  }

  /** Ask the background worker for anything not yet known. Fire-and-forget; `onUpdate` runs when data lands. */
  request(keys: string[]): void {
    const missing = [...new Set(keys)].filter((k) => this.wanted(k))
    if (missing.length === 0) return
    for (const k of missing) this.inFlight.add(k)
    this.status = 'pending'

    const message: EnrichRequest = { type: 'enrich', keys: missing }
    chrome.runtime.sendMessage(message, (response: EnrichResponse | undefined) => {
      this.receive(missing, chrome.runtime.lastError ? undefined : response)
    })
  }

  receive(requested: string[], response: EnrichResponse | undefined): void {
    const fetchedAt = this.now()
    const landed = new Set<string>()
    for (const k of requested) this.inFlight.delete(k)

    if (!response) {
      this.status = 'error'
      this.errorMessage = 'no response from the extension worker'
    } else {
      this.status = response.error === 'no-token' ? 'no-token' : response.error ? 'error' : 'ok'
      this.errorMessage = response.error === 'api' ? (response.message ?? '') : ''
      for (const [k, value] of Object.entries(response.items)) {
        this.cache.set(k, { value, fetchedAt })
        landed.add(k)
      }
    }
    for (const k of requested) {
      if (!landed.has(k)) this.retryAt.set(k, fetchedAt + RETRY_AFTER_MS)
    }
    this.onUpdate(landed)
  }
}
