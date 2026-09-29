import type { Request } from './protocol'

chrome.runtime.onMessage.addListener((message: Request, sender) => {
  if (sender.id !== chrome.runtime.id) return false
  if (message.type === 'open-options') void chrome.runtime.openOptionsPage()
  return false
})

chrome.action.onClicked.addListener(() => {
  void chrome.runtime.openOptionsPage()
})

// Earlier builds kept a GitHub token and API caches; the extension no longer talks to the API, so drop them.
chrome.runtime.onInstalled.addListener(() => {
  void chrome.storage.local.remove('githubToken')
  void chrome.storage.session.clear()
})
