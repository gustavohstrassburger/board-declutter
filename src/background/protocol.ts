import type { ProjectRef, SnapshotItem } from '../core/snapshot'
import type { Enrichment } from '../core/types'

export interface EnrichRequest {
  type: 'enrich'
  /** "owner/repo#number" */
  keys: string[]
}

export interface EnrichResponse {
  items: Record<string, Enrichment>
  error?: 'no-token' | 'api'
}

export interface SnapshotRequest {
  type: 'snapshot'
  project: ProjectRef
}

export interface SnapshotResponse {
  items?: SnapshotItem[]
  error?: 'no-token' | 'api'
}

export interface OpenOptionsRequest {
  type: 'open-options'
}

export type Request = EnrichRequest | SnapshotRequest | OpenOptionsRequest
