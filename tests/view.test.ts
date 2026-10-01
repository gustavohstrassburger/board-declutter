import { describe, expect, it } from 'vitest'
import { isAllowedView, viewShowsLabels } from '../src/content/view'

function page(visibleFields: number[], withToken = false): Document {
  document.body.innerHTML = `
    <script id="memex-columns-data" type="application/json">[{"databaseId":1,"dataType":"title"},{"databaseId":4,"dataType":"labels"},{"databaseId":9,"dataType":"parentIssue"}]</script>
    <script id="memex-views" type="application/json">[{"number":1,"visibleFields":[1]},{"number":2,"visibleFields":[${visibleFields}]}]</script>
    ${withToken ? '<button aria-label="Label: x"></button>' : ''}`
  return document
}

describe('isAllowedView', () => {
  const views = ['https://github.com/orgs/PostHog/projects/112/views/6?sortedBy=x']

  it('matches the view path and ignores the query string and a trailing slash', () => {
    expect(isAllowedView('/orgs/PostHog/projects/112/views/6', views)).toBe(true)
    expect(isAllowedView('/orgs/PostHog/projects/112/views/6/', views)).toBe(true)
    expect(isAllowedView('/orgs/posthog/projects/112/views/6', views)).toBe(true)
    expect(isAllowedView('/orgs/PostHog/projects/112/views/1', views)).toBe(false)
  })

  it('accepts bare paths and runs everywhere when no view is listed', () => {
    expect(isAllowedView('/orgs/o/projects/1/views/2', ['/orgs/o/projects/1/views/2'])).toBe(true)
    expect(isAllowedView('/orgs/o/projects/1/views/2', [])).toBe(true)
  })
})

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
