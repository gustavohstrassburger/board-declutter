/** Focus mode hides GitHub's chrome around the board (see content.css). Pushing the mouse against the top
 *  edge reveals it, and moving back down over the board hides it again. */
const PEEK_EDGE_PX = 3

export function shouldPeek(clientY: number, peeking: boolean, boardTop: number): boolean {
  if (!peeking) return clientY <= PEEK_EDGE_PX
  return clientY < boardTop
}

export function installPeek(root: HTMLElement, boardTop: () => number | undefined): void {
  document.addEventListener('mousemove', (event) => {
    if (!root.hasAttribute('data-bd-focus')) {
      root.removeAttribute('data-bd-peek')
      return
    }
    const top = boardTop()
    const peeking = root.hasAttribute('data-bd-peek')
    const next = shouldPeek(event.clientY, peeking, top ?? Infinity)
    if (next !== peeking) root.toggleAttribute('data-bd-peek', next)
  })
}
