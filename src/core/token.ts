/** The GitHub token lives in chrome.storage.local under its own key, restricted to trusted contexts
 *  (see background), so it never syncs across profiles and the github.com content script can't read it. */
const TOKEN_KEY = 'githubToken'

export async function loadToken(): Promise<string> {
  const result = await chrome.storage.local.get(TOKEN_KEY)
  return typeof result[TOKEN_KEY] === 'string' ? (result[TOKEN_KEY] as string) : ''
}

export async function saveToken(token: string): Promise<void> {
  if (token) await chrome.storage.local.set({ [TOKEN_KEY]: token })
  else await chrome.storage.local.remove(TOKEN_KEY)
}

export function onTokenChange(listener: () => void): void {
  chrome.storage.local.onChanged.addListener((changes) => {
    if (TOKEN_KEY in changes) listener()
  })
}

/** Builds before 0.1.0 kept the token inside the synced settings object. Move it to local storage once and
 *  scrub it from sync, so users who set it up early keep working and the token stops syncing. */
export async function migrateLegacyToken(): Promise<boolean> {
  const stored = await chrome.storage.sync.get('settings')
  const settings = stored.settings as
    (Record<string, unknown> & { githubToken?: unknown }) | undefined
  if (!settings || typeof settings.githubToken !== 'string') return false
  const { githubToken, ...rest } = settings
  if (githubToken && !(await loadToken())) await saveToken(githubToken)
  await chrome.storage.sync.set({ settings: rest })
  return Boolean(githubToken)
}
