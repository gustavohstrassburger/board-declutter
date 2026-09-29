import type { ProjectRef, SnapshotItem } from './snapshot'
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
    nodes { requestedReviewer { ... on User { login } } }
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
  /** Only users: any Team field needs the read:org scope, and the rules only match logins anyway. */
  reviewRequests?: { nodes: { requestedReviewer: { login?: string } | null }[] }
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
          .map((n) => n.requestedReviewer?.login)
          .filter((r): r is string => Boolean(r)),
        updatedAt: node.updatedAt,
      }
    })
  })
  return out
}

/** Turns an HTTP failure into a message a person can act on. GitHub explains SSO and scope problems in headers. */
async function assertOk(res: Response): Promise<void> {
  if (res.ok) return
  const sso = res.headers.get('x-github-sso')
  if (res.status === 403 && sso?.startsWith('required')) {
    throw new Error(
      '403: the token is not authorized for this organization. Open github.com/settings/tokens, click "Configure SSO" next to it and authorize the org.',
    )
  }
  if (res.status === 401)
    throw new Error(
      '401: the token was rejected. Check it was pasted completely and has not expired.',
    )
  let detail = ''
  try {
    detail = ((await res.json()) as { message?: string }).message ?? ''
  } catch {
    // no body
  }
  throw new Error(`${res.status}${detail ? `: ${detail}` : ''}`)
}

/** GraphQL errors come as a list; the first message and type are enough to tell scopes from typos. */
export function describeErrors(errors: unknown): string {
  const list = Array.isArray(errors) ? (errors as { type?: string; message?: string }[]) : []
  const first = list[0]
  if (!first) return 'GitHub returned no data'
  if (first.type === 'INSUFFICIENT_SCOPES') {
    return `insufficient scopes: ${first.message ?? ''} A classic token needs "repo" and "read:project".`
  }
  if (first.type === 'NOT_FOUND')
    return `not found: ${first.message ?? ''} The token may lack access to the project or organization.`
  return `${first.type ?? 'error'}: ${first.message ?? ''}`
}

/** GitHub answers a token that lacks access with nulls, and only sometimes with an error entry. */
export function describeMissingProject(
  ref: ProjectRef,
  ownerMissing: boolean,
  errors: unknown,
): string {
  if (Array.isArray(errors) && errors.length) return describeErrors(errors)
  const owner = ref.kind === 'orgs' ? `organization "${ref.owner}"` : `user "${ref.owner}"`
  if (ownerMissing) {
    return `the ${owner} is not visible to this token. A fine-grained token must have "${ref.owner}" as its resource owner (and be approved by the organization if it requires that); a classic token must be authorized under "Configure SSO".`
  }
  return `project #${ref.number} of ${owner} is not visible to this token. A fine-grained token needs the organization permission "Projects: read"; a classic token needs the "read:project" scope.`
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
  await assertOk(res)
  const body = (await res.json()) as {
    data?: Record<string, Record<string, GraphQLItem | null>>
    errors?: unknown[]
  }
  // Partial errors (e.g. one repo the token can't read) still come with data for the rest.
  if (!body.data) throw new Error(describeErrors(body.errors))
  return parseResponse(items, body.data)
}

export const SNAPSHOT_QUERY = `
fragment Author on Actor { login __typename }
query($owner: String!, $number: Int!, $after: String) {
  OWNER(login: $owner) {
    projectV2(number: $number) {
      items(first: 100, after: $after) {
        pageInfo { hasNextPage endCursor }
        nodes {
          fieldValues(first: 30) {
            nodes {
              ... on ProjectV2ItemFieldSingleSelectValue { name updatedAt field { ... on ProjectV2FieldCommon { name } } }
            }
          }
          content {
            __typename
            ... on DraftIssue { title assignees(first: 10) { nodes { login } } }
            ... on Issue {
              number title updatedAt author { ...Author }
              repository { nameWithOwner }
              assignees(first: 10) { nodes { login } }
              labels(first: 20) { nodes { name } }
            }
            ... on PullRequest {
              number title updatedAt isDraft reviewDecision author { ...Author }
              repository { nameWithOwner }
              assignees(first: 10) { nodes { login } }
              labels(first: 20) { nodes { name } }
              reviewRequests(first: 10) { nodes { requestedReviewer { ... on User { login } } } }
            }
          }
        }
      }
    }
  }
}`

interface SnapshotNode {
  fieldValues: {
    nodes: ({ name?: string; updatedAt?: string; field?: { name?: string } } | null)[]
  }
  content:
    | null
    | { __typename: 'DraftIssue'; title: string; assignees: { nodes: { login: string }[] } }
    | ({
        __typename: 'Issue' | 'PullRequest'
        number: number
        title: string
        repository: { nameWithOwner: string }
        assignees: { nodes: { login: string }[] }
        labels: { nodes: { name: string }[] }
      } & GraphQLItem)
}

export function parseSnapshotNode(node: SnapshotNode): SnapshotItem | undefined {
  const fields: Record<string, string> = {}
  const fieldUpdatedAt: Record<string, string> = {}
  for (const v of node.fieldValues.nodes) {
    if (!v?.name || !v.field?.name) continue
    fields[v.field.name] = v.name
    if (v.updatedAt) fieldUpdatedAt[v.field.name] = v.updatedAt
  }
  const c = node.content
  if (!c) return undefined
  if (c.__typename === 'DraftIssue') {
    return {
      type: 'draft',
      title: c.title,
      assignees: c.assignees.nodes.map((a) => a.login),
      labels: [],
      fields,
      fieldUpdatedAt,
    }
  }
  const repo = c.repository.nameWithOwner
  return {
    key: `${repo}#${c.number}`,
    type: c.__typename === 'PullRequest' ? 'pull_request' : 'issue',
    title: c.title,
    repo,
    number: c.number,
    assignees: c.assignees.nodes.map((a) => a.login),
    labels: c.labels.nodes.map((l) => l.name),
    fields,
    fieldUpdatedAt,
    enrichment: {
      author: c.author?.login ?? 'ghost',
      authorIsBot: c.author?.__typename === 'Bot',
      isDraft: c.isDraft ?? false,
      reviewDecision: c.reviewDecision ?? null,
      reviewers: (c.reviewRequests?.nodes ?? [])
        .map((n) => n.requestedReviewer?.login)
        .filter((r): r is string => Boolean(r)),
      updatedAt: c.updatedAt,
    },
  }
}

/** Every item on the project, across all pages. Needs a token with project read access. */
export async function fetchProjectSnapshot(
  token: string,
  ref: ProjectRef,
): Promise<SnapshotItem[]> {
  const query = SNAPSHOT_QUERY.replace('OWNER', ref.kind === 'orgs' ? 'organization' : 'user')
  const items: SnapshotItem[] = []
  let after: string | null = null
  for (let page = 0; page < 50; page++) {
    const res = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables: { owner: ref.owner, number: ref.number, after } }),
    })
    await assertOk(res)
    const body = (await res.json()) as {
      data?: Record<
        string,
        {
          projectV2: {
            items: {
              pageInfo: { hasNextPage: boolean; endCursor: string | null }
              nodes: SnapshotNode[]
            }
          } | null
        } | null
      >
      errors?: unknown[]
    }
    const owner = Object.values(body.data ?? {})[0]
    const project = owner?.projectV2
    if (!project)
      throw new Error(
        describeMissingProject(ref, owner === null || owner === undefined, body.errors),
      )
    for (const node of project.items.nodes) {
      const item = parseSnapshotNode(node)
      if (item) items.push(item)
    }
    if (!project.items.pageInfo.hasNextPage) break
    after = project.items.pageInfo.endCursor
  }
  return items
}
