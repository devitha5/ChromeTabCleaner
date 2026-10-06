# ChromeTabCleaner (MVP)

Chrome Manifest V3 extension that closes tabs you haven't *activated* for a set
number of days (default 20). Local only — no backend, no accounts.

## Install
1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and pick this folder.
3. Pin the extension and open the popup.

## Files
| File | Role |
| --- | --- |
| `manifest.json` | MV3 manifest — `tabs`, `storage`, `alarms` permissions |
| `background.js` | Service worker: tracks activation, stores timestamps, hourly cleanup |
| `popup.html/css/js` | Settings, "Ready to close" list, manual **Close N tabs** button |

## Rules
- Inactivity = time since the tab was last **activated** (clicked into, or its window focused), not since it was opened.
- The active tab in each window is never closed.
- Pinned tabs are protected by default (toggle in popup).
- Cleanup runs every 60 minutes via `chrome.alarms` when auto-close is on.

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
