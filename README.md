# ChromeTabCleaner (MVP)

Chrome Manifest V3 extension that closes tabs you haven't *activated* for a set
number of days (default 20). Local only — no backend, no accounts.

## Install
1. Download the latest `ChromeTabCleaner-v*.zip` from the
   [Releases page](https://github.com/devitha5/ChromeTabCleaner/releases) and unzip it.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and pick the unzipped folder.
4. Pin the extension and open the popup.

Developing locally? You can also load this repo folder directly.

## Build and release
```sh
npm run package   # runs tests, then builds dist/ChromeTabCleaner/ and dist/ChromeTabCleaner-v<version>.zip
```
The zip contains only the runtime files and is ready for the Chrome Web Store.

To publish a new version to GitHub Releases:
```sh
npm version patch          # or minor / major — bumps package.json and manifest.json, commits, tags
git push --follow-tags     # GitHub Actions tests, builds and attaches the zip to a release
```

## Files
| File | Role |
| --- | --- |
| `manifest.json` | MV3 manifest — `tabs`, `storage`, `alarms` permissions |
| `background.js` | Service worker: tracks activation, stores timestamps, hourly cleanup |
| `lib/rules.js`, `lib/format.js` | Cleanup rules and display helpers (shared, unit-tested) |
| `popup.html/css/js` | Settings, "Ready to close" list, manual **Close N tabs** button |
| `scripts/package.js` | Builds the clean extension folder and zip in `dist/` |

## Rules
- Inactivity = time since the tab was last **activated** (clicked into, or its window focused), not since it was opened.
- The active tab in each window is never closed.
- Pinned tabs are protected by default (toggle in popup).
- Cleanup runs every 60 minutes via `chrome.alarms` when auto-close is on.

## Unit tests
Requires Node 18+. Tests use Vitest with an in-memory `chrome` mock (`tests/chromeMock.js`),
and jsdom for the popup.

```sh
npm install
npm test          # run once
npm run coverage  # run with a coverage report (HTML in coverage/)
```

| Test file | Covers |
| --- | --- |
| `tests/rules.test.js` | Which tabs are stale (threshold edge, active, pinned), startup seeding |
| `tests/background.test.js` | Install/startup, tab events, write queue, popup messages, hourly alarm |
| `tests/popup.test.js` | Rendering, stats, warnings, settings saving, Close button |
| `tests/format.test.js` | "x ago" text and host names |

The pure cleanup rules live in `lib/rules.js` so they can be tested without Chrome.

## Quick QA check (no need to wait 20 days)
1. Set the threshold to `0.001` days (~1.5 min).
2. Open a few tabs, pin one, then stay on a different tab for 2 minutes.
3. Reopen the popup — unpinned idle tabs appear under **Ready to close**; the pinned and active tabs don't.
4. Click **Close N tabs** and confirm only those tabs closed.
5. To test the alarm path: on the extension's service-worker console run
   `chrome.alarms.create("cleanup", { delayInMinutes: 0.5 })`.

## Known MVP limits
- Tab IDs change after a browser restart, so timestamps are rebuilt on startup
  from Chrome's `tab.lastAccessed` (or "now"). A restart can delay cleanup, never speed it up.
- No domain exclusions, snooze, or restore history yet (Phase 2).
