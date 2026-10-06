// Pure cleanup rules, shared by the service worker and the unit tests.
export const DAY_MS = 24 * 60 * 60 * 1000;
export const DEFAULTS = { autoCleanup: true, thresholdDays: 20, protectPinned: true };

export const isValidThreshold = (days) => typeof days === "number" && days > 0;

// A tab is a candidate when it hasn't been *activated* for longer than the
// threshold. Active tabs and (by default) pinned tabs are never candidates.
// Tabs with no recorded time count as used "now" (never closed by mistake).
export function buildRows(tabs, lastActive, settings, now) {
  const limit = settings.thresholdDays * DAY_MS;
  return tabs.map((t) => {
    const last = lastActive[t.id] || now;
    const protectedReason = t.active ? "active" : (t.pinned && settings.protectPinned ? "pinned" : null);
    return {
      id: t.id, windowId: t.windowId, title: t.title, url: t.url,
      favIconUrl: t.favIconUrl, pinned: t.pinned, lastActive: last,
      protectedReason, candidate: !protectedReason && now - last > limit,
    };
  });
}

// Tab IDs are reassigned after a browser restart and old numbers get reused, so
// on startup (reset) we drop every stored timestamp; otherwise a restored tab
// could inherit a different tab's old time and be closed too early.
// Tabs without a timestamp use Chrome's own lastAccessed when available,
// otherwise "now" (the safe direction: this can only delay cleanup).
export function seedActivity(map, tabs, { reset = false, now = Date.now() } = {}) {
  const open = new Set(tabs.map((t) => String(t.id)));
  for (const id of Object.keys(map)) if (reset || !open.has(id)) delete map[id];
  for (const t of tabs) if (!map[t.id]) map[t.id] = t.lastAccessed || now;
  return map;
}
