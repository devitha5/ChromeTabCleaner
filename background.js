// ChromeTabCleaner - service worker (MVP)
const DAY_MS = 24 * 60 * 60 * 1000;
const ALARM = "cleanup";
const DEFAULTS = { autoCleanup: true, thresholdDays: 20, protectPinned: true };

// ---- Storage helpers -------------------------------------------------------
// Writes go through one queue so overlapping tab events can't overwrite each other.
let queue = Promise.resolve();
function updateActivity(mutate) {
  queue = queue.then(async () => {
    const { lastActive = {} } = await chrome.storage.local.get("lastActive");
    mutate(lastActive);
    await chrome.storage.local.set({ lastActive });
  }).catch(console.error);
  return queue;
}

async function getSettings() {
  const { settings } = await chrome.storage.local.get("settings");
  return { ...DEFAULTS, ...settings };
}

const touch = (tabId) => updateActivity((m) => { m[tabId] = Date.now(); });

// ---- Seeding: every open tab gets a timestamp ------------------------------
// Tab IDs change after a browser restart, so we rebuild the map from open tabs.
// Unknown tabs use Chrome's own lastAccessed when available, otherwise "now"
// (the safe direction: a restart can only delay cleanup, never speed it up).
async function seed() {
  const tabs = await chrome.tabs.query({});
  await updateActivity((m) => {
    const open = new Set(tabs.map((t) => String(t.id)));
    for (const id of Object.keys(m)) if (!open.has(id)) delete m[id];
    for (const t of tabs) if (!m[t.id]) m[t.id] = t.lastAccessed || Date.now();
  });
}

async function ensureAlarm() {
  if (!(await chrome.alarms.get(ALARM))) {
    chrome.alarms.create(ALARM, { periodInMinutes: 60 });
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  const { settings } = await chrome.storage.local.get("settings");
  if (!settings) await chrome.storage.local.set({ settings: DEFAULTS });
  await seed();
  await ensureAlarm();
});
chrome.runtime.onStartup.addListener(async () => { await seed(); await ensureAlarm(); });

// ---- Activity tracking (all windows) ---------------------------------------
chrome.tabs.onActivated.addListener(({ tabId }) => touch(tabId));
chrome.tabs.onCreated.addListener((tab) => touch(tab.id));
chrome.tabs.onRemoved.addListener((tabId) => updateActivity((m) => { delete m[tabId]; }));
chrome.tabs.onReplaced.addListener((added, removed) =>
  updateActivity((m) => { m[added] = m[removed] || Date.now(); delete m[removed]; }));
chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) return;
  const [tab] = await chrome.tabs.query({ active: true, windowId });
  if (tab) touch(tab.id);
});

// ---- Cleanup rules ---------------------------------------------------------
// A tab is a candidate when it hasn't been *activated* for longer than the
// threshold. Active tabs and (by default) pinned tabs are never candidates.
async function getReport() {
  await queue;
  const [settings, tabs, { lastActive = {} }] = await Promise.all([
    getSettings(),
    chrome.tabs.query({}),
    chrome.storage.local.get("lastActive"),
  ]);
  const now = Date.now();
  const limit = settings.thresholdDays * DAY_MS;
  const rows = tabs.map((t) => {
    const last = lastActive[t.id] || now;
    const protectedReason = t.active ? "active" : (t.pinned && settings.protectPinned ? "pinned" : null);
    return {
      id: t.id, windowId: t.windowId, title: t.title, url: t.url,
      favIconUrl: t.favIconUrl, pinned: t.pinned, lastActive: last,
      protectedReason, candidate: !protectedReason && now - last > limit,
    };
  });
  return { settings, rows, now };
}

async function cleanNow() {
  const { rows } = await getReport();
  const ids = rows.filter((r) => r.candidate).map((r) => r.id);
  if (ids.length) await chrome.tabs.remove(ids);
  return ids.length;
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM) return;
  const { autoCleanup } = await getSettings();
  if (autoCleanup) {
    const closed = await cleanNow();
    if (closed) console.log(`ChromeTabCleaner: closed ${closed} inactive tab(s)`);
  }
});

// ---- Popup messages --------------------------------------------------------
chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  (async () => {
    switch (msg.type) {
      case "getReport": return reply(await getReport());
      case "cleanNow": return reply({ closed: await cleanNow() });
      case "saveSettings":
        await chrome.storage.local.set({ settings: { ...(await getSettings()), ...msg.settings } });
        return reply({ ok: true });
    }
  })();
  return true; // keep the channel open for the async reply
});
