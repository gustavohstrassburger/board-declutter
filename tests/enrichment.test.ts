import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EnrichmentStore, ENRICHMENT_TTL_MS, RETRY_AFTER_MS } from '../src/content/enrichment'
import type { EnrichResponse } from '../src/background/protocol'
import { enrichment } from './fixtures'

type Callback = (response: EnrichResponse | undefined) => void
const sendMessage = vi.fn<(message: unknown, cb: Callback) => void>()

beforeEach(() => {
  sendMessage.mockReset()
  vi.stubGlobal('chrome', { runtime: { sendMessage, lastError: undefined } })
})

function pendingCallback(): Callback {
  return sendMessage.mock.calls.at(-1)![1]
}

describe('EnrichmentStore', () => {
  it('requests unknown keys once and serves them from the cache afterwards', () => {
    const onUpdate = vi.fn()
    const store = new EnrichmentStore(onUpdate)
    store.request(['a#1', 'a#1', 'a#2'])
    expect(sendMessage).toHaveBeenCalledTimes(1)
    expect(sendMessage.mock.calls[0]![0]).toEqual({ type: 'enrich', keys: ['a#1', 'a#2'] })

    store.request(['a#1']) // in flight: not asked again
    expect(sendMessage).toHaveBeenCalledTimes(1)

    const value = enrichment({ author: 'x' })
    pendingCallback()({ items: { 'a#1': value, 'a#2': value } })
    expect(store.get('a#1')).toEqual(value)
    expect(store.status).toBe('ok')
    expect(onUpdate).toHaveBeenCalledWith(new Set(['a#1', 'a#2']))

    store.request(['a#1', 'a#2'])
    expect(sendMessage).toHaveBeenCalledTimes(1)
  })

  it('does not re-request keys missing from the response until the retry delay passes', () => {
    let now = 1_000_000
    const store = new EnrichmentStore(
      () => {},
      () => now,
    )
    store.request(['a#1'])
    pendingCallback()({ items: {}, error: 'api' })
    expect(store.status).toBe('error')

    store.request(['a#1'])
    expect(sendMessage).toHaveBeenCalledTimes(1)

    now += RETRY_AFTER_MS
    store.request(['a#1'])
    expect(sendMessage).toHaveBeenCalledTimes(2)
  })

  it('keeps partial results that arrive with an error', () => {
    const store = new EnrichmentStore(() => {})
    store.request(['a#1', 'a#2'])
    pendingCallback()({ items: { 'a#1': enrichment() }, error: 'api' })
    expect(store.get('a#1')).toBeDefined()
    expect(store.get('a#2')).toBeUndefined()
  })

  it('reports no-token and treats a missing response as an error', () => {
    const store = new EnrichmentStore(() => {})
    store.request(['a#1'])
    pendingCallback()({ items: {}, error: 'no-token' })
    expect(store.status).toBe('no-token')

    store.receive(['a#2'], undefined)
    expect(store.status).toBe('error')
  })

  it('expires entries after the TTL', () => {
    let now = 1_000_000
    const store = new EnrichmentStore(
      () => {},
      () => now,
    )
    store.request(['a#1'])
    pendingCallback()({ items: { 'a#1': enrichment() } })
    expect(store.get('a#1')).toBeDefined()
    now += ENRICHMENT_TTL_MS + 1
    expect(store.get('a#1')).toBeUndefined()
    store.request(['a#1'])
    expect(sendMessage).toHaveBeenCalledTimes(2)
  })
})
