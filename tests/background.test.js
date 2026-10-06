import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createChrome, sendMessage } from "./chromeMock.js";
import { DAY_MS, DEFAULTS } from "../lib/rules.js";

const NOW = 1_700_000_000_000;
const tab = (id, extra = {}) => ({ id, windowId: 1, title: `Tab ${id}`, url: `https://example.com/${id}`, ...extra });

let chrome;

// Loads a fresh copy of the service worker against a fresh mock.
async function load(opts) {
  chrome = createChrome(opts);
  globalThis.chrome = chrome;
  vi.resetModules();
  await import("../background.js");
  return chrome;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
  delete globalThis.chrome;
});

describe("install and startup", () => {
  it("writes default settings on first install", async () => {
    await load({ tabs: [tab(1)] });
    await chrome.runtime.onInstalled.fire({ reason: "install" });
    expect(chrome._store.settings).toEqual(DEFAULTS);
  });

  it("keeps existing settings on update", async () => {
    const settings = { ...DEFAULTS, thresholdDays: 5 };
    await load({ storage: { settings } });
    await chrome.runtime.onInstalled.fire({ reason: "update" });
    expect(chrome._store.settings).toEqual(settings);
  });

  it("seeds a timestamp for every open tab on install", async () => {
    await load({ tabs: [tab(1, { lastAccessed: NOW - 1000 }), tab(2)] });
    await chrome.runtime.onInstalled.fire({});
    expect(chrome._store.lastActive).toEqual({ 1: NOW - 1000, 2: NOW });
  });

  it("keeps saved times on install/reload (tab IDs are unchanged)", async () => {
    await load({ tabs: [tab(1, { lastAccessed: NOW })], storage: { lastActive: { 1: NOW - 10 * DAY_MS } } });
    await chrome.runtime.onInstalled.fire({});
    expect(chrome._store.lastActive).toEqual({ 1: NOW - 10 * DAY_MS });
  });

  it("drops saved times on browser startup so reused tab IDs start fresh", async () => {
    await load({
      tabs: [tab(5, { lastAccessed: NOW - 60_000 })],
      storage: { lastActive: { 5: NOW - 40 * DAY_MS, 9: NOW - 40 * DAY_MS } },
    });
    await chrome.runtime.onStartup.fire();
    expect(chrome._store.lastActive).toEqual({ 5: NOW - 60_000 });
  });

  it("creates the hourly alarm once", async () => {
    await load();
    await chrome.runtime.onInstalled.fire({});
    await chrome.runtime.onStartup.fire();
    expect(chrome.alarms.create).toHaveBeenCalledTimes(1);
    expect(chrome.alarms.create).toHaveBeenCalledWith("cleanup", { periodInMinutes: 60 });
  });

  it("does not recreate an existing alarm", async () => {
    await load({ alarms: { cleanup: { name: "cleanup" } } });
    await chrome.runtime.onStartup.fire();
    expect(chrome.alarms.create).not.toHaveBeenCalled();
  });
});

describe("activity tracking", () => {
  it("records the time when a tab is activated", async () => {
    await load();
    await chrome.tabs.onActivated.fire({ tabId: 3, windowId: 1 });
    expect(chrome._store.lastActive).toEqual({ 3: NOW });
  });

  it("records the time when a tab is created", async () => {
    await load();
    await chrome.tabs.onCreated.fire(tab(4));
    expect(chrome._store.lastActive).toEqual({ 4: NOW });
  });

  it("forgets a tab when it is closed", async () => {
    await load({ storage: { lastActive: { 1: NOW, 2: NOW } } });
    await chrome.tabs.onRemoved.fire(1, {});
    expect(chrome._store.lastActive).toEqual({ 2: NOW });
  });

  it("moves the time to the new ID when a tab is replaced", async () => {
    await load({ storage: { lastActive: { 1: NOW - DAY_MS } } });
    await chrome.tabs.onReplaced.fire(2, 1);
    expect(chrome._store.lastActive).toEqual({ 2: NOW - DAY_MS });
  });

  it("uses now when a replaced tab had no time", async () => {
    await load();
    await chrome.tabs.onReplaced.fire(2, 1);
    expect(chrome._store.lastActive).toEqual({ 2: NOW });
  });

  it("touches the active tab of a newly focused window", async () => {
    await load({ tabs: [tab(1, { windowId: 2, active: true }), tab(2, { windowId: 2 })] });
    await chrome.windows.onFocusChanged.fire(2);
    expect(chrome._store.lastActive).toEqual({ 1: NOW });
  });

  it("ignores focus leaving Chrome", async () => {
    await load({ tabs: [tab(1, { active: true })] });
    await chrome.windows.onFocusChanged.fire(chrome.windows.WINDOW_ID_NONE);
    expect(chrome.tabs.query).not.toHaveBeenCalled();
    expect(chrome._store.lastActive).toBeUndefined();
  });

  it("does nothing when a focused window has no active tab", async () => {
    await load({ tabs: [] });
    await chrome.windows.onFocusChanged.fire(7);
    expect(chrome._store.lastActive).toBeUndefined();
  });

  it("does not lose updates when events overlap", async () => {
    await load();
    await Promise.all([1, 2, 3, 4, 5].map((tabId) => chrome.tabs.onActivated.fire({ tabId })));
    expect(Object.keys(chrome._store.lastActive)).toEqual(["1", "2", "3", "4", "5"]);
  });

  it("keeps working after a storage write fails", async () => {
    await load();
    vi.spyOn(console, "error").mockImplementation(() => {});
    chrome.storage.local.set.mockRejectedValueOnce(new Error("quota"));
    await chrome.tabs.onActivated.fire({ tabId: 1 });
    await chrome.tabs.onActivated.fire({ tabId: 2 });
    expect(console.error).toHaveBeenCalled();
    expect(chrome._store.lastActive).toEqual({ 2: NOW });
  });
});

describe("popup messages", () => {
  const stale = NOW - 30 * DAY_MS;

  it("getReport returns settings, rows and the current time", async () => {
    await load({
      tabs: [tab(1), tab(2, { active: true })],
      storage: { settings: DEFAULTS, lastActive: { 1: stale, 2: stale } },
    });
    const report = await sendMessage(chrome, { type: "getReport" });
    expect(report.now).toBe(NOW);
    expect(report.settings).toEqual(DEFAULTS);
    expect(report.rows.map((r) => [r.id, r.candidate])).toEqual([[1, true], [2, false]]);
  });

  it("getReport fills in defaults when settings were never saved", async () => {
    await load();
    const { settings } = await sendMessage(chrome, { type: "getReport" });
    expect(settings).toEqual(DEFAULTS);
  });

  it("cleanNow closes only candidate tabs and reports the count", async () => {
    await load({
      tabs: [tab(1), tab(2, { pinned: true }), tab(3, { active: true }), tab(4)],
      storage: { lastActive: { 1: stale, 2: stale, 3: stale, 4: NOW } },
    });
    const reply = await sendMessage(chrome, { type: "cleanNow" });
    expect(reply).toEqual({ closed: 1 });
    expect(chrome.tabs.remove).toHaveBeenCalledWith([1]);
  });

  it("cleanNow does not call tabs.remove when nothing is stale", async () => {
    await load({ tabs: [tab(1)], storage: { lastActive: { 1: NOW } } });
    expect(await sendMessage(chrome, { type: "cleanNow" })).toEqual({ closed: 0 });
    expect(chrome.tabs.remove).not.toHaveBeenCalled();
  });

  it("saveSettings merges into the stored settings", async () => {
    await load({ storage: { settings: DEFAULTS } });
    const reply = await sendMessage(chrome, { type: "saveSettings", settings: { thresholdDays: 7 } });
    expect(reply).toEqual({ ok: true });
    expect(chrome._store.settings).toEqual({ ...DEFAULTS, thresholdDays: 7 });
  });

  it("saveSettings accepts changes that don't touch the threshold", async () => {
    await load({ storage: { settings: DEFAULTS } });
    await sendMessage(chrome, { type: "saveSettings", settings: { autoCleanup: false } });
    expect(chrome._store.settings).toEqual({ ...DEFAULTS, autoCleanup: false });
  });

  it.each([0, -5, NaN, "20"])("saveSettings rejects threshold %s", async (thresholdDays) => {
    await load({ storage: { settings: DEFAULTS } });
    const reply = await sendMessage(chrome, { type: "saveSettings", settings: { thresholdDays } });
    expect(reply).toEqual({ ok: false });
    expect(chrome._store.settings).toEqual(DEFAULTS);
  });

  it("keeps the message channel open for async replies", async () => {
    await load();
    const [listener] = chrome.runtime.onMessage.listeners;
    expect(listener({ type: "unknown" }, {}, () => {})).toBe(true);
  });
});

describe("hourly alarm", () => {
  const stale = NOW - 30 * DAY_MS;

  it("closes stale tabs when auto-close is on", async () => {
    await load({ tabs: [tab(1), tab(2)], storage: { settings: DEFAULTS, lastActive: { 1: stale, 2: NOW } } });
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await chrome.alarms.onAlarm.fire({ name: "cleanup" });
    expect(chrome.tabs.remove).toHaveBeenCalledWith([1]);
    expect(log).toHaveBeenCalledWith("ChromeTabCleaner: closed 1 inactive tab(s)");
  });

  it("does nothing when auto-close is off", async () => {
    await load({ tabs: [tab(1)], storage: { settings: { ...DEFAULTS, autoCleanup: false }, lastActive: { 1: stale } } });
    await chrome.alarms.onAlarm.fire({ name: "cleanup" });
    expect(chrome.tabs.remove).not.toHaveBeenCalled();
  });

  it("does not log when nothing was closed", async () => {
    await load({ tabs: [tab(1)], storage: { lastActive: { 1: NOW } } });
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await chrome.alarms.onAlarm.fire({ name: "cleanup" });
    expect(log).not.toHaveBeenCalled();
  });

  it("ignores other alarms", async () => {
    await load({ tabs: [tab(1)], storage: { lastActive: { 1: stale } } });
    await chrome.alarms.onAlarm.fire({ name: "something-else" });
    expect(chrome.tabs.remove).not.toHaveBeenCalled();
  });
});
