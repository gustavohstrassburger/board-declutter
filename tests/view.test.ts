import { describe, expect, it } from 'vitest'
import { viewShowsLabels } from '../src/content/view'

function page(visibleFields: number[], withToken = false): Document {
  document.body.innerHTML = `
    <script id="memex-columns-data" type="application/json">[{"databaseId":1,"dataType":"title"},{"databaseId":4,"dataType":"labels"}]</script>
    <script id="memex-views" type="application/json">[{"number":1,"visibleFields":[1]},{"number":2,"visibleFields":[${visibleFields}]}]</script>
    ${withToken ? '<button aria-label="Label: x"></button>' : ''}`
  return document
}

describe('viewShowsLabels', () => {
  it('reads the Labels field from the saved view matching the URL', () => {
    expect(viewShowsLabels(page([1, 4]), '/orgs/o/projects/1/views/2')).toBe(true)
    expect(viewShowsLabels(page([1]), '/orgs/o/projects/1/views/2')).toBe(false)
    expect(viewShowsLabels(page([1, 4]), '/orgs/o/projects/1/views/1')).toBe(false)
  })

  it('trusts a rendered label token over the saved view', () => {
    expect(viewShowsLabels(page([1], true), '/orgs/o/projects/1/views/2')).toBe(true)
  })

  it('is false when the embedded data is missing or broken', () => {
    document.body.innerHTML = '<script id="memex-views" type="application/json">nope</script>'
    expect(viewShowsLabels(document, '/orgs/o/projects/1/views/2')).toBe(false)
  })
})
