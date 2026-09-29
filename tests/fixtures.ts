import type { Card, Settings } from '../src/core/types'
import { DEFAULT_SETTINGS } from '../src/core/settings'

export function settings(patch: Partial<Settings> = {}): Settings {
  return { ...DEFAULT_SETTINGS, ...patch }
}

export function card(patch: Partial<Card> = {}): Card {
  return {
    id: '1',
    column: 'In Review',
    title: 'fix(flags): something',
    repo: 'PostHog/posthog',
    number: 100,
    type: 'pull_request',
    assignees: [],
    labels: [],
    ...patch,
  }
}

/** Real card markup captured from github.com/orgs/PostHog/projects/112 (class names stripped). */
export const CARD_HTML = `
<div data-board-column="Todo">
  <div><h3>Todo</h3><span>6</span></div>
  <div data-dnd-drop-type="card">
    <div data-board-card-id="231274630" data-hovercard-subject-tag="issue:1477356907" role="button" aria-labelledby="board-card-title-231274630">
      <div><div><div><div>
        <div><div id="board-card-header-icon-231274630"><span></span></div><div id="board-card-header-title-231274630"><span>posthog #13147</span></div></div>
        <div>
          <figure><figcaption>Assignees: neilkakkar</figcaption><span data-component="AvatarStack"><div><span><img data-testid="github-avatar" alt="neilkakkar" src="https://avatars.githubusercontent.com/u/1"></span></div></span></figure>
          <figure><figcaption>Labels: feature/cohorts, team/feature-flags</figcaption><span>feature/cohorts</span><span>team/feature-flags</span></figure>
        </div>
      </div></div></div>
      <a data-component="Link" role="button" href="https://github.com/PostHog/posthog/issues/13147" target="_blank"><h3 id="board-card-title-231274630"><span>Cohort Clickhouse Table revamp</span></h3></a>
      </div>
    </div>
    <div data-board-card-id="248684323" data-hovercard-subject-tag="pull_request:4551206399" role="button" aria-label="fix(flags): keep replica schema lag" style="height: 125px;"></div>
    <div data-board-card-id="99" role="button">
      <div><div><div id="board-card-header-title-99"><span>Draft</span></div></div></div>
      <a href="#"><h3 id="board-card-title-99"><span>Just a draft item</span></h3></a>
    </div>
  </div>
</div>
<div data-board-column="Done">
  <div><h3>Done</h3><span>1</span></div>
  <div data-dnd-drop-type="card">
    <div data-board-card-id="500">
      <div><div id="board-card-header-title-500"><span>posthog #101876</span></div></div>
      <a href="https://github.com/PostHog/posthog/pull/101876"><h3 id="board-card-title-500"><span>fix(flags): keep replica schema lag from skipping flag definitions writes</span></h3></a>
    </div>
  </div>
</div>`
