import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadToken, migrateLegacyToken, saveToken } from '../src/core/token'

function fakeStorage(initial: Record<string, unknown>) {
  const data = { ...initial }
  return {
    data,
    get: vi.fn(async (key: string) => (key in data ? { [key]: data[key] } : {})),
    set: vi.fn(async (items: Record<string, unknown>) => Object.assign(data, items)),
    remove: vi.fn(async (key: string) => {
      delete data[key]
    }),
  }
}

let sync: ReturnType<typeof fakeStorage>
let local: ReturnType<typeof fakeStorage>

beforeEach(() => {
  sync = fakeStorage({})
  local = fakeStorage({})
  vi.stubGlobal('chrome', { storage: { sync, local } })
})

describe('token storage', () => {
  it('round-trips and removes an empty token', async () => {
    await saveToken('abc')
    expect(await loadToken()).toBe('abc')
    await saveToken('')
    expect(await loadToken()).toBe('')
    expect('githubToken' in local.data).toBe(false)
  })
})

describe('migrateLegacyToken', () => {
  it('moves a token kept in the synced settings to local storage and scrubs it from sync', async () => {
    sync.data.settings = { enabled: true, githubToken: 'legacy' }
    expect(await migrateLegacyToken()).toBe(true)
    expect(await loadToken()).toBe('legacy')
    expect(sync.data.settings).toEqual({ enabled: true })
  })

  it('never overwrites a token already in local storage, but still scrubs sync', async () => {
    local.data.githubToken = 'current'
    sync.data.settings = { githubToken: 'legacy' }
    await migrateLegacyToken()
    expect(await loadToken()).toBe('current')
    expect(sync.data.settings).toEqual({})
  })

  it('is a no-op without the legacy field', async () => {
    sync.data.settings = { enabled: false }
    expect(await migrateLegacyToken()).toBe(false)
    expect(sync.set).not.toHaveBeenCalled()
  })
})
