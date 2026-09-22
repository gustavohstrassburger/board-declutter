import type { Enrichment } from './types'

const KEY = /^([^/]+)\/([^#]+)#(\d+)$/

export interface ItemRef {
  key: string
  owner: string
  repo: string
  number: number
}

export function parseKey(key: string): ItemRef | undefined {
  const m = key.match(KEY)
  if (!m) return undefined
  const number = Number(m[3])
  // GraphQL `Int` is 32-bit; one out-of-range number would fail validation for the whole document.
  if (number > 2_147_483_647) return undefined
  return { key, owner: m[1]!, repo: m[2]!, number }
}

/** One GraphQL document fetching every item, aliased so a single request covers many repos. */
export function buildQuery(items: ItemRef[]): string {
  const byRepo = new Map<string, ItemRef[]>()
  for (const item of items) {
    const k = `${item.owner}/${item.repo}`
    byRepo.set(k, [...(byRepo.get(k) ?? []), item])
  }
  const repos = [...byRepo.entries()].map(([, refs], ri) => {
    const first = refs[0]!
    const fields = refs
      .map(
        (r, ii) =>
          `i${ii}: issueOrPullRequest(number: ${r.number}) { __typename ...IssueFields ...PullRequestFields }`,
      )
      .join('\n')
    return `r${ri}: repository(owner: ${JSON.stringify(first.owner)}, name: ${JSON.stringify(first.repo)}) {\n${fields}\n}`
  })
  return `
fragment Author on Actor { login __typename }
fragment IssueFields on Issue { author { ...Author } updatedAt }
fragment PullRequestFields on PullRequest {
  author { ...Author }
  updatedAt
  isDraft
  reviewDecision
  reviewRequests(first: 10) {
    nodes { requestedReviewer { ... on User { login } ... on Team { slug } } }
  }
}
query {
${repos.join('\n')}
}`
}

interface GraphQLItem {
  __typename: 'Issue' | 'PullRequest'
  author: { login: string; __typename: string } | null
  updatedAt: string
  isDraft?: boolean
  reviewDecision?: Enrichment['reviewDecision']
  reviewRequests?: { nodes: { requestedReviewer: { login?: string; slug?: string } | null }[] }
}

/** Map the aliased response back onto the keys, in the same order `buildQuery` grouped them. */
export function parseResponse(
  items: ItemRef[],
  data: Record<string, Record<string, GraphQLItem | null>>,
): Record<string, Enrichment> {
  const byRepo = new Map<string, ItemRef[]>()
  for (const item of items) {
    const k = `${item.owner}/${item.repo}`
    byRepo.set(k, [...(byRepo.get(k) ?? []), item])
  }
  const out: Record<string, Enrichment> = {}
  ;[...byRepo.values()].forEach((refs, ri) => {
    const repo = data[`r${ri}`]
    if (!repo) return
    refs.forEach((ref, ii) => {
      const node = repo[`i${ii}`]
      if (!node) return
      out[ref.key] = {
        author: node.author?.login ?? 'ghost',
        authorIsBot: node.author?.__typename === 'Bot',
        isDraft: node.isDraft ?? false,
        reviewDecision: node.reviewDecision ?? null,
        reviewers: (node.reviewRequests?.nodes ?? [])
          .map((n) => n.requestedReviewer?.login ?? n.requestedReviewer?.slug)
          .filter((r): r is string => Boolean(r)),
        updatedAt: node.updatedAt,
      }
    })
  })
  return out
}

export async function fetchEnrichment(
  token: string,
  items: ItemRef[],
): Promise<Record<string, Enrichment>> {
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: buildQuery(items) }),
  })
  if (!res.ok) throw new Error(`GitHub API ${res.status}`)
  const body = (await res.json()) as {
    data?: Record<string, Record<string, GraphQLItem | null>>
    errors?: unknown[]
  }
  // Partial errors (e.g. one repo the token can't read) still come with data for the rest.
  if (!body.data)
    throw new Error(`GitHub API returned no data: ${JSON.stringify(body.errors ?? body)}`)
  return parseResponse(items, body.data)
}
