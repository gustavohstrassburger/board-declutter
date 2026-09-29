/** Whether the board can show labels at all: either a rendered card has label tokens, or the saved view lists
 *  the Labels field among its visible fields (read from the JSON GitHub embeds in the page). */
export function viewShowsLabels(doc: Document, pathname: string): boolean {
  if (doc.querySelector('button[aria-label^="Label: "]')) return true
  try {
    const columns = JSON.parse(doc.querySelector('#memex-columns-data')?.textContent ?? '[]') as {
      databaseId?: number
      dataType?: string
    }[]
    const views = JSON.parse(doc.querySelector('#memex-views')?.textContent ?? '[]') as {
      number?: number
      visibleFields?: number[]
    }[]
    const labelsId = columns.find((c) => c.dataType === 'labels')?.databaseId
    const viewNumber = Number(pathname.match(/\/views\/(\d+)/)?.[1])
    const view = views.find((v) => v.number === viewNumber) ?? views[0]
    return labelsId !== undefined && (view?.visibleFields ?? []).includes(labelsId)
  } catch {
    return false
  }
}
