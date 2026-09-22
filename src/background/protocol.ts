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

export interface OpenOptionsRequest {
  type: 'open-options'
}

export type Request = EnrichRequest | OpenOptionsRequest
