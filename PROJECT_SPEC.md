# ChromeTabCleaner

ChromeTabCleaner is a Chrome Manifest V3 extension that automatically tracks tab activity and closes tabs that have been inactive beyond a configurable threshold.

**Default inactivity threshold:** 20 days

## Problem Statement

QA and development workflows often create many open Chrome tabs across multiple windows, including Jira, GitHub, Figma, test environments, documentation, and debugging pages. Over time, this makes tabs harder to find, increases clutter, and can waste system resources.

## Proposed Solution

The extension will track the last time each tab was actively used, store that timestamp locally, and periodically clean up tabs that exceed the inactivity threshold.

- Track tab activation across all Chrome windows.
- Store last active timestamps using Chrome Storage.
- Run scheduled cleanup using Chrome Alarms.
- Close eligible inactive tabs automatically or after review.
- Protect important tabs, starting with pinned tabs.

## Inactive Tab Rule

A tab is considered inactive based on its **last activated time**, not when it was opened. For example, a tab opened 30 days ago but used yesterday should remain open.

If a tab has not been actively used for 20 days, it becomes eligible for cleanup.

## Goals

- Reduce browser tab clutter.
- Make important tabs easier to find.
- Support multiple Chrome windows.
- Allow users to configure the inactivity threshold.
- Provide safeguards so important tabs are not closed accidentally.

## Out of Scope for MVP

- User accounts or authentication.
- Cloud database or external backend.
- Cross-device synchronization.
- Payments or subscriptions.
- Advanced analytics.

## High-Level Architecture

| Component | Responsibility |
| --- | --- |
| Popup UI | Shows tracked tabs, cleanup candidates, settings, and manual cleanup actions. |
| Service Worker | Tracks activity, applies cleanup rules, and closes eligible tabs. |
| Chrome Tabs API | Reads tab state and closes inactive tabs. |
| Chrome Storage API | Stores activity timestamps and user settings locally. |
| Chrome Alarms API | Runs cleanup on a schedule. |

## Default Configuration

| Setting | Default |
| --- | --- |
| Automatic cleanup | Enabled |
| Inactivity threshold | 20 days |
| Cleanup frequency | Every hour |
| Pinned tabs | Protected |
| Multiple windows | Supported |
| Manual cleanup | Supported |

## Safety Features

- Protect pinned tabs by default.
- Allow users to review cleanup candidates before closing.
- Allow users to enable or disable automatic cleanup.
- Support configurable inactivity periods.
- Support domain exclusions and snoozing in later phases.

## Implementation Roadmap

### Phase 1 — MVP

- Create Manifest V3 extension.
- Track tab activation and store last active timestamps.
- Detect inactive tabs across multiple windows.
- Implement automatic cleanup with pinned-tab protection.
- Add basic popup UI and settings.

### Phase 2 — Safety and Usability

- Add cleanup preview and manual "Clean Now".
- Add domain exclusions.
- Add snooze and restore options.
- Add recently closed tab history.

### Phase 3 — Testing and Distribution

- Add functional, boundary, and negative tests.
- Automate key flows using Playwright.
- Package and publish through the Chrome Web Store.

## MVP Success Criteria

- Detect tab activation.
- Store last active timestamps locally.
- Identify tabs inactive beyond the configured threshold.
- Protect pinned tabs.
- Close eligible inactive tabs.
- Allow users to configure cleanup settings.
- Run without an external backend.

## Summary

ChromeTabCleaner will provide a simple, local-first way to reduce Chrome tab clutter by identifying and cleaning up tabs that have not been used for a configurable period, starting with a safe 20-day default.
