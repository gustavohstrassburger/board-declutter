import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Settings } from '../src/core/types'
import { Toolbar } from '../src/content/toolbar'
import { settings } from './fixtures'

function control(key: string): HTMLElement {
  return document.querySelector<HTMLElement>(`.bd-toolbar [data-key="${key}"]`)!
}

function segment(key: string, value: string): HTMLButtonElement {
  return control(key).querySelector<HTMLButtonElement>(`[data-value="${value}"]`)!
}

function setup(stored: Settings): { onChange: ReturnType<typeof vi.fn> } {
  const onChange = vi.fn(async () => {})
  const toolbar = new Toolbar(stored, onChange)
  toolbar.update({
    columns: ['No Status', 'Backlog', 'Done'],
    labelsVisible: true,
  })
  return { onChange }
}

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('Toolbar', () => {
  it('keeps the bar to the mode switch, the settings and minimize', () => {
    setup(settings())
    const bar = [...document.querySelector('.bd-toolbar')!.children].filter(
      (el) => !el.classList.contains('bd-toolbar__expand') && !(el as HTMLElement).hidden,
    )
    expect(bar).toHaveLength(3)
    expect(bar[0]!.contains(control('mode'))).toBe(true)
    expect(bar[1]!.contains(control('settings'))).toBe(true)
  })

  it('shows a status only when off or when the view hides labels the rules need', () => {
    setup(settings({ enabled: false }))
    expect(document.querySelector<HTMLElement>('.bd-toolbar__status')!.textContent).toBe('Off')
    document.body.innerHTML = ''
    const toolbar = new Toolbar(settings({ aiMode: 'dim' }), async () => {})
    toolbar.update({ columns: [], labelsVisible: false })
    expect(document.querySelector('.bd-toolbar__status')!.textContent).toBe('⚠ labels hidden')
  })

  it('picks a mode from its menu', () => {
    const { onChange } = setup(settings())
    const menu = document.querySelector<HTMLElement>('.bd-toolbar__mode [role="menu"]')!
    expect(menu.hidden).toBe(true)
    control('mode').click()
    expect(menu.hidden).toBe(false)

    const items = [...menu.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')]
    expect(items.map((i) => i.querySelector('span')!.textContent)).toEqual([
      'Normal',
      'Planning',
      'Bot triage',
    ])
    expect(items[0]!.getAttribute('aria-checked')).toBe('true')
    items[2]!.click()
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ mode: 'botTriage' }))
    expect(menu.hidden).toBe(true)
  })

  it('shows every value of a rule and patches the one picked', () => {
    const { onChange } = setup(settings({ aiMode: 'dim' }))
    expect(segment('aiMode', 'dim').getAttribute('aria-pressed')).toBe('true')
    expect(segment('aiMode', 'show').getAttribute('aria-pressed')).toBe('false')
    segment('aiMode', 'hide').click()
    expect(onChange).toHaveBeenCalledWith({ aiMode: 'hide' })
  })

  it('flips switches', () => {
    const { onChange } = setup(settings({ preloadColumns: true }))
    expect(control('preloadColumns').getAttribute('aria-checked')).toBe('true')
    control('preloadColumns').click()
    expect(onChange).toHaveBeenCalledWith({ preloadColumns: false })
  })

  it('switches modes with their defaults and leaves every control editable', () => {
    const { onChange } = setup(settings({ focus: false }))
    control('mode').click()
    document.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')[1]!.click()
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'planning', focus: true, modeSnapshot: expect.anything() }),
    )
    expect(document.querySelectorAll('.bd-toolbar button:disabled')).toHaveLength(0)
  })

  it('writes column changes', () => {
    const { onChange } = setup(settings({ hiddenColumns: ['No Status'] }))
    const backlog = [...document.querySelectorAll('.bd-toolbar__column')]
      .find((label) => label.textContent!.trim() === 'Backlog')!
      .querySelector('input')!
    backlog.checked = false
    backlog.dispatchEvent(new Event('change'))
    expect(onChange).toHaveBeenCalledWith({ hiddenColumns: ['No Status', 'Backlog'] })
  })
})
