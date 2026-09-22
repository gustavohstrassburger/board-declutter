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
