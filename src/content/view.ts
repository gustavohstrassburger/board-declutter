/** Whether the board can show a field at all: either a rendered card has the field's token, or the saved view
 *  lists the field among its visible fields (read from the JSON GitHub embeds in the page). */
export function viewShowsField(
  doc: Document,
  pathname: string,
  dataType: string,
  tokenSelector: string,
): boolean {
  if (doc.querySelector(tokenSelector)) return true
  try {
    const columns = JSON.parse(doc.querySelector('#memex-columns-data')?.textContent ?? '[]') as {
      databaseId?: number
      dataType?: string
    }[]
    const views = JSON.parse(doc.querySelector('#memex-views')?.textContent ?? '[]') as {
      number?: number
      visibleFields?: number[]
    }[]
    const fieldId = columns.find((c) => c.dataType === dataType)?.databaseId
    const viewNumber = Number(pathname.match(/\/views\/(\d+)/)?.[1])
    const view = views.find((v) => v.number === viewNumber) ?? views[0]
    return fieldId !== undefined && (view?.visibleFields ?? []).includes(fieldId)
  } catch {
    return false
  }
}

export function viewShowsLabels(doc: Document, pathname: string): boolean {
  return viewShowsField(doc, pathname, 'labels', 'button[aria-label^="Label: "]')
}

export function viewShowsParent(doc: Document, pathname: string): boolean {
  return viewShowsField(doc, pathname, 'parentIssue', 'button[aria-label^="Parent issue: "]')
}
