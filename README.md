# Board Declutter

Chrome extension that makes GitHub Projects boards readable again when most of the cards are noise.

It was built for the PostHog Feature Flags board, where roughly a third of the open cards are PRs opened by the PostHog AI bot, half of the "No Status" column is community issues nobody owns, and the "Done" column holds a couple hundred cards that never get archived. GitHub's own board filter can't help with the biggest problem: it has no `author:` qualifier, so there is no native way to separate bot PRs from human ones.

## What it does

Every card on a board gets evaluated against a small set of rules. Each rule can **show**, **dim** or **hide** the card, and the strongest outcome wins. Cards that are yours (author, assignee or requested reviewer) get a blue marker and are never hidden.

| Rule                                                                                       | Needs token | Default |
| ------------------------------------------------------------------------------------------ | ----------- | ------- |
| Bot-authored PRs (GitHub `Bot` accounts plus a configurable login list)                    | yes         | dim     |
| Draft PRs                                                                                  | yes         | show    |
| Cards with no assignee                                                                     | no          | show    |
| Cards from other teams (no team member as author, assignee or reviewer, and no team label) | partly      | show    |
| Stale cards (no update in N days)                                                          | yes         | off     |
| Titles matching a regex                                                                    | no          | hide    |

On top of that:

- **Column counts**: next to GitHub's own count, each column shows how many cards are actually visible once the rules ran, with the hidden and dimmed breakdown on hover.
- **Collapsed columns**: fold columns like "Done" into a thin strip.
- **Compact mode**: single-line titles, no label chips.
- **Group by assignee**: every column ordered by assignee with a header on the first card of each group. GitHub does the ordering: the extension applies the board's own "sort by Assignees" through the URL, so it covers the whole column and not just the cards currently rendered. Turn it off to sort the view another way.
- **Floating toolbar**: quick toggles for the most used rules without opening the options page.
- **Reason badge**: dimmed cards show why ("bot author · draft PR") in the bottom-right corner.

Author, draft, reviewer and last-update data is not on the card, so those rules need a GitHub token. The extension batches items into one GraphQL request per 50 cards, caches results for 10 minutes in session storage and only ever talks to `api.github.com`. The token is kept in this browser profile's local extension storage, never synced, and never handed to the content script running on github.com. Without a token, the DOM-only rules still work and the toolbar says which rules are off.

## Install

```sh
pnpm install
bin/build
```

Then open `chrome://extensions`, enable **Developer mode**, click **Load unpacked** and pick the `dist/` folder. Click the extension icon to open the settings page.

Recommended first setup for a team board:

1. Put your GitHub login in **Your GitHub login**.
2. List your team members and team labels (e.g. `team/feature-flags`).
3. Add a token with read access to the repositories on the board (classic `repo` scope, or a fine-grained token with Issues and Pull requests read).
4. Set **Bot-authored PRs** and **Cards from other teams** to `dim` or `hide`, and collapse `Done`.

`bin/build --zip` produces a zip for sharing or uploading to the Chrome Web Store.

## Development

```sh
pnpm run watch   # rebuild dist/ on change; reload the extension in chrome://extensions
bin/test         # vitest
bin/lint         # eslint, prettier --check, tsc
bin/fmt          # prettier + eslint --fix
```

Layout:

- `src/core/` – pure logic: settings, rule engine, GitHub GraphQL client. Fully unit tested.
- `src/content/` – content script: reads cards from the board DOM, applies decisions as `data-bd-*` attributes, injects the floating toolbar. Styling lives in `content.css`.
- `src/background/` – service worker: fetches enrichment with the stored token and caches it.
- `src/options/` – settings page.
- `scripts/` – esbuild bundling and the dependency-free icon generator.

### How the board is read

GitHub Projects renders the board with hashed CSS class names, so the extension relies only on stable data attributes: columns are `[data-board-column]`, cards are `[data-board-card-id]`, the title is `h3[id^=board-card-title-]`, fields like assignees and labels are `<figure>` elements whose `<figcaption>` starts with the field name, and the item link is the card's `<a href>`. Cards are virtualised while scrolling, so a `MutationObserver` re-applies the rules on every DOM change; applying is idempotent and cheap. The toolbar and the per-column badge are the only nodes the extension adds to the page.

If GitHub changes the board markup, `src/content/dom.ts` is the only file that should need updating, and `tests/dom.test.ts` holds a captured copy of the real markup to test against.

## Ideas not built yet

- Group bot PRs into one collapsible stack per column instead of dimming them one by one.
- Show CI status and review decision as a small strip on the card.
- Read the author from GitHub's hovercard endpoint so no token is needed.
- Sort cards inside a column by last update.
