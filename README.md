# Board Declutter

Chrome extension that declutters GitHub Projects boards using only what the board shows: no token, nothing leaves the browser.

## Install

### From a release

1. Download the zip from the [latest release](https://github.com/gustavohstrassburger/board-declutter/releases/latest).
2. Unzip it into a folder you will keep (e.g. `~/board-declutter`).
3. Open `chrome://extensions`, turn on **Developer mode** (top right), click **Load unpacked** and pick that folder.
4. Open the board. By default the extension only runs on the PostHog Feature Flags view (`/orgs/PostHog/projects/112/views/6`); change that under **Run only on these views** in the options page.

To update, unzip the new release over the same folder and click the reload icon on the extension's card in `chrome://extensions`, then reload the board tab.

### From source

```sh
pnpm install
bin/build
```

Then **Load unpacked** the `dist/` folder as above. After pulling changes, run `bin/build` again and reload the extension.

## Setup

Open the options page (extension icon, or **⚙ → Options page** on the board) and fill in your GitHub login, team members and team labels. The AI rules read card labels, so the view must show the Labels field (View → Fields → Labels).

## Features

- **Modes**: Normal, Planning (your team's human work), Bot triage (AI cards only) and My cards (only cards assigned to you). Changing a setting by hand switches back to Normal.
- **Rules**: AI, not AI, unassigned, other teams' and not-yours cards can each be shown, dimmed or hidden; unassigned cards can also be highlighted. The strongest rule wins.
- **Layout**: compact cards, full-screen board, issues and PRs split side by side, a marker on your cards, cards preloaded instead of lazy-loaded (except long columns you list, Done by default), and grouping by assignee with collapsible groups.
- **Columns**: hide or collapse any column.
- **AI chip** next to the number of AI-generated cards.

Everything is on the floating toolbar (**Mode** and **⚙**) at the bottom right of the board.

## Development

```sh
pnpm run watch   # rebuild dist/ on change
bin/test
bin/lint
bin/fmt
```

Rules and settings live in `src/core/`, the content script and toolbar in `src/content/`, and the options page in `src/options/`. Board markup is read only in `src/content/dom.ts`. Every merge to `main` publishes a release with the built extension.
