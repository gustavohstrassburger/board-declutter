# Board Declutter

Chrome extension that makes GitHub Projects boards readable again when most of the cards are noise.

It was built for the PostHog Feature Flags board, where half of the "No Status" column is community issues nobody owns and the "Done" column holds a couple hundred cards that never get archived. It works only with what the board already shows on each card: nothing leaves the browser, no token, no API calls.

## What it does

Every card on a board gets evaluated against a small set of rules. The AI rule needs the view to show the Labels field (View → Fields → Labels); on the PostHog board the AI bot labels its PRs `self-driving`, which no human PR carries. Each rule can **show**, **dim** or **hide** the card, and the strongest outcome wins. Cards assigned to you get a blue marker and are never hidden.

| Rule                                                                | Default |
| ------------------------------------------------------------------- | ------- |
| AI-generated cards, recognised by label (`self-driving` by default) | dim     |
| Cards with no assignee                                              | show    |
| Cards from other teams (no team member assigned and no team label)  | show    |
| Titles matching a regex                                             | hide    |

On top of that:

- **Column counts**: next to GitHub's own count, each column shows how many cards are actually visible, with the hidden and dimmed breakdown on hover. Columns lazy-load, so the number only appears once the column is fully loaded.
- **Hidden and collapsed columns**: the toolbar's **Columns** button lists the board's columns with a checkbox each, so "Done" or "No Status" can be removed in one click; the options page can also fold columns into a thin strip.
- **Compact mode**: single-line titles, no label chips.
- **Group by assignee**: every column ordered by assignee, with the assignees' avatars and name as a header on the first card of each group. GitHub does the ordering: the extension applies the board's own "sort by Assignees" through the URL, so it covers the whole column and not just the cards currently rendered. Turn it off to sort the view another way.
- **Focus mode**: hides GitHub's header, the project title bar, the view tabs and the filter bar so the board gets the whole window. Push the mouse against the top edge to bring them back.
- **Floating toolbar**: quick toggles for the rules without opening the options page. It can be minimized to a small pill that keeps the hidden count.
- **Reason badge**: dimmed cards show why ("no assignee · not your team") in the bottom-right corner.

## Install

```sh
pnpm install
bin/build
```

Then open `chrome://extensions`, enable **Developer mode**, click **Load unpacked** and pick the `dist/` folder. Click the extension icon to open the settings page.

Recommended first setup for a team board:

1. Put your GitHub login in **Your GitHub login**.
2. List your team members and team labels (e.g. `team/feature-flags`).
3. Set **Cards from other teams** and **Cards with no assignee** to `dim` or `hide`, and collapse `Done`.

`bin/build --zip` produces a zip for sharing or uploading to the Chrome Web Store.

## Development

```sh
pnpm run watch   # rebuild dist/ on change; reload the extension in chrome://extensions
bin/test         # vitest
bin/lint         # eslint, prettier --check, tsc
bin/fmt          # prettier + eslint --fix
```

Layout:

- `src/core/` – pure logic: settings and the rule engine. Fully unit tested.
- `src/content/` – content script: reads cards from the board DOM, applies decisions as `data-bd-*` attributes, injects the floating toolbar and the group headers. Styling lives in `content.css`.
- `src/background/` – tiny service worker: opens the options page.
- `src/options/` – settings page.
- `scripts/` – esbuild bundling and the dependency-free icon generator.

### How the board is read

GitHub Projects renders the board with hashed CSS class names, so the extension relies only on stable data attributes: columns are `[data-board-column]`, cards are `[data-board-card-id]`, the title is `h3[id^=board-card-title-]`, fields like assignees and labels are `<figure>` elements whose `<figcaption>` starts with the field name, and the item link is the card's `<a href>`. Cards are virtualised while scrolling, and while a page of items loads GitHub fills the shells with a skeleton, so a card is only evaluated once its real title is in the DOM. A `MutationObserver` re-applies the rules on every DOM change; applying is idempotent and cheap.

If GitHub changes the board markup, `src/content/dom.ts` is the only file that should need updating, and `tests/dom.test.ts` holds a captured copy of the real markup to test against.

## Ideas not built yet

These need data the card does not show, so they would need the GitHub API (a token) or GitHub's hovercard endpoint:

- Recognise bot PRs by author rather than by label, for bots that do not label their PRs. GitHub's board filter has no `author:` qualifier.
- Show how long a card has been in its column, to spot stale reviews.
- Dim draft PRs and cards not updated for a while.
- Group bot PRs into one collapsible stack per column.
