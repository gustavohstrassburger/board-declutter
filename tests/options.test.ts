import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '../src/core/settings'

/** The options script reads a form field for every setting except the toolbar-only ones.
 *  A missing field throws while filling the form and while saving it, so the HTML must stay in sync. */
const TOOLBAR_ONLY = new Set(['enabled', 'hiddenColumns'])

describe('options.html', () => {
  it('has a form field for every setting', () => {
    const html = readFileSync(resolve(process.cwd(), 'src/options/options.html'), 'utf8')
    const missing = Object.keys(DEFAULT_SETTINGS)
      .filter((key) => !TOOLBAR_ONLY.has(key))
      .filter((key) => !html.includes(`name="${key}"`))
    expect(missing).toEqual([])
  })
})
