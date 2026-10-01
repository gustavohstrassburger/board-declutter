# Board Declutter

Chrome extension that makes GitHub Projects boards readable again when most of the cards are noise.

It was built for the PostHog Feature Flags board, where half of the "No Status" column is community issues nobody owns and the "Done" column holds a couple hundred cards that never get archived. It works only with what the board already shows on each card: nothing leaves the browser, no token, no API calls.

## What it does

Every card on a board gets evaluated against a small set of rules. The AI rule needs the view to show the Labels field (View → Fields → Labels); on the PostHog board the AI bot labels its PRs `self-driving`, which no human PR carries. Each rule can **show**, **dim** or **hide** the card, and the strongest outcome wins. The no-assignee rule can also **highlight** the card: it stays visible with an amber marker, so work nobody owns stands out. Cards assigned to you get a blue marker (unless **Highlight cards assigned to you** is off); the rules treat them like any other card.

| Rule                                                                                    | Default |
| --------------------------------------------------------------------------------------- | ------- |
| AI-generated cards, recognised by label (`self-driving` by default)                     | dim     |
| Cards not marked as AI-generated                                                        | show    |
| Cards with no assignee                                                                  | show    |
| Cards from other teams (assigned to no team member, or unassigned without a team label) | show    |
| Titles matching a regex                                                                 | hide    |

On top of that:

- **Modes**: a set of defaults applied when the mode is picked, from the first button of the toolbar (a menu that describes each mode) or the top of the options page. Picking Normal puts back the values the mode replaced; changing a board setting by hand while a mode is on also switches to Normal, but keeps what is on the board, the change included. **Planning** hides other teams' cards and AI cards, highlights cards with no assignee (and drops the marker on yours), turns on the full-screen board and the issue/PR split, hides the Done column and keeps No Status visible. **Bot triage** leaves only AI cards, from every team, highlights the unassigned ones, turns on the full-screen board and the issue/PR split, hides Done and keeps No Status visible.
- **Column counts**: next to GitHub's own count, each column shows how many cards are actually visible, with the hidden and dimmed breakdown on hover. Columns lazy-load, so the number only appears once the column is fully loaded. **Preload cards** (on by default) disables that lazy-loading by fetching every card of each column when the board opens, without scrolling: GitHub loads the next page when a sentinel at the end of the list comes into view, so the extension takes it out of the layout for a moment and puts it back. That also keeps loading going when rules hide so many cards that the column is too short to scroll.
- **Hidden and collapsed columns**: the Columns section of the toolbar's settings panel lists the board's columns with a checkbox each, so "Done" or "No Status" can be removed in one click; the options page can also fold columns into a thin strip.
- **Compact mode**: single-line titles, no field chips under them (labels, parent, dates).
- **Split issues and PRs**: a column such as "No Status" becomes two stacks side by side, issues on the left and pull requests on the right, newest first. GitHub does the ordering (sort by Created) and a CSS grid does the split, so the virtualised list is never reordered. Each stack scrolls on its own: the wheel moves whichever stack the pointer is over.
- **Group by assignee**: every column ordered by assignee, with avatars and name as a header on the first card of each group. GitHub does the ordering: the extension applies the board's own sort through the URL, so it covers the whole column and not just the cards currently rendered. Click a group's header (it shows the card count) to fold its cards away and again to bring them back; folded groups are remembered per browser.
- **Full-screen board** (focus mode): hides GitHub's header, the project title bar and the view tabs so the board gets the whole window; the filter bar stays. Push the mouse against the top edge to bring them back.
- **Floating toolbar**: a small bar with the mode switch and **⚙**, which opens a panel with every setting the board uses at once: each rule's show/dim/hide choices, the layout switches, grouping and the columns. It shows a status only when there is something to say ("Off", or "⚠ labels hidden" when the view keeps the AI rules blind). It can be minimized to the mode switch and a small expand pill. The options page sections fold the same way, below the mode.
- **AI chip**: cards carrying one of the AI labels show a small purple "AI" chip next to their number, in every mode, so bot work is recognisable even when it is not dimmed.
- **Reason badge**: dimmed cards show why ("no assignee · not your team") in the bottom-right corner.

## Install

```sh
pnpm install
bin/build
```

Then open `chrome://extensions`, enable **Developer mode**, click **Load unpacked** and pick the `dist/` folder. Click the extension icon to open the settings page.

Recommended first setup for a team board:

1. List the project views to run on in **Run only on these views** (by default the PostHog Feature Flags view, `projects/112/views/6`); anywhere else the extension does nothing. Leave it empty to run on every board. Pick views that show the Labels field, which the AI rules and modes rely on.
1. Put your GitHub login in **Your GitHub login**.
1. List your team members and team labels (e.g. `team/feature-flags`).
1. Set **Cards from other teams** and **Cards with no assignee** to `dim` or `hide`, and collapse `Done`.

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
