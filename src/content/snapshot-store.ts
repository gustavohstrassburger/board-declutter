import type { SnapshotRequest, SnapshotResponse } from '../background/protocol'
import { snapshotCacheKey, type ProjectRef, type SnapshotItem } from '../core/snapshot'

export const SNAPSHOT_TTL_MS = 5 * 60 * 1000
export const SNAPSHOT_RETRY_MS = 60 * 1000

/** The current project's items from the API, refreshed every few minutes; one request in flight at a time. */
export class SnapshotStore {
  private key: string | undefined
  private items: SnapshotItem[] | undefined
  private byKey = new Map<string, SnapshotItem>()
  private fetchedAt = 0
  private nextRequestAt = 0
  private inFlight = false
  status: 'ok' | 'no-token' | 'error' | 'pending' = 'pending'

  constructor(
    private onUpdate: () => void,
    private now: () => number = Date.now,
  ) {}

  /** Items for `project`, or undefined while unknown. Also triggers a (re)fetch when due. */
  get(project: ProjectRef): SnapshotItem[] | undefined {
    const key = snapshotCacheKey(project)
    if (key !== this.key) {
      this.key = key
      this.items = undefined
      this.byKey.clear()
      this.fetchedAt = 0
      this.nextRequestAt = 0
    }
    const stale = this.now() - this.fetchedAt > SNAPSHOT_TTL_MS
    if (stale && !this.inFlight && this.now() >= this.nextRequestAt) this.request(project)
    return this.items
  }

  item(key: string): SnapshotItem | undefined {
    return this.byKey.get(key)
  }

  private request(project: ProjectRef): void {
    this.inFlight = true
    const message: SnapshotRequest = { type: 'snapshot', project }
    chrome.runtime.sendMessage(message, (response: SnapshotResponse | undefined) => {
      this.receive(chrome.runtime.lastError ? undefined : response)
    })
  }

  receive(response: SnapshotResponse | undefined): void {
    this.inFlight = false
    if (!response || response.error || !response.items) {
      this.status = response?.error === 'no-token' ? 'no-token' : 'error'
      this.nextRequestAt = this.now() + SNAPSHOT_RETRY_MS
    } else {
      this.status = 'ok'
      this.items = response.items
      this.byKey = new Map(response.items.filter((i) => i.key).map((i) => [i.key!, i]))
      this.fetchedAt = this.now()
    }
    this.onUpdate()
  }
}
