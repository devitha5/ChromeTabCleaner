import { describe, it, expect } from "vitest";
import { DAY_MS, DEFAULTS, buildRows, seedActivity, isValidThreshold } from "../lib/rules.js";

const NOW = 1_700_000_000_000;
const tab = (id, extra = {}) => ({ id, windowId: 1, title: `Tab ${id}`, url: `https://example.com/${id}`, ...extra });
const daysAgo = (d) => NOW - d * DAY_MS;

describe("DEFAULTS", () => {
  it("matches the spec: auto-close on, 20 days, pinned protected", () => {
    expect(DEFAULTS).toEqual({ autoCleanup: true, thresholdDays: 20, protectPinned: true });
  });
});

describe("isValidThreshold", () => {
  it.each([20, 1, 0.001])("accepts %s", (v) => expect(isValidThreshold(v)).toBe(true));
  it.each([0, -1, NaN, "20", null, undefined])("rejects %s", (v) => expect(isValidThreshold(v)).toBe(false));
});

describe("buildRows", () => {
  const settings = DEFAULTS;

  it("marks a tab unused for longer than the threshold as a candidate", () => {
    const [row] = buildRows([tab(1)], { 1: daysAgo(21) }, settings, NOW);
    expect(row.candidate).toBe(true);
    expect(row.protectedReason).toBeNull();
  });

  it("keeps a tab used within the threshold", () => {
    const [row] = buildRows([tab(1)], { 1: daysAgo(19) }, settings, NOW);
    expect(row.candidate).toBe(false);
  });

  it("does not close a tab at exactly the threshold (must be strictly older)", () => {
    const [row] = buildRows([tab(1)], { 1: daysAgo(20) }, settings, NOW);
    expect(row.candidate).toBe(false);
  });

  it("closes a tab 1 ms past the threshold", () => {
    const [row] = buildRows([tab(1)], { 1: daysAgo(20) - 1 }, settings, NOW);
    expect(row.candidate).toBe(true);
  });

  it("judges by last activation, not when the tab was opened", () => {
    // Opened long ago (lastAccessed is old) but activated yesterday.
    const [row] = buildRows([tab(1, { lastAccessed: daysAgo(30) })], { 1: daysAgo(1) }, settings, NOW);
    expect(row.candidate).toBe(false);
  });

  it("never closes the active tab", () => {
    const [row] = buildRows([tab(1, { active: true })], { 1: daysAgo(100) }, settings, NOW);
    expect(row).toMatchObject({ candidate: false, protectedReason: "active" });
  });

  it("protects pinned tabs when protectPinned is on", () => {
    const [row] = buildRows([tab(1, { pinned: true })], { 1: daysAgo(100) }, settings, NOW);
    expect(row).toMatchObject({ candidate: false, protectedReason: "pinned" });
  });

  it("closes stale pinned tabs when protectPinned is off", () => {
    const [row] = buildRows([tab(1, { pinned: true })], { 1: daysAgo(100) },
      { ...settings, protectPinned: false }, NOW);
    expect(row).toMatchObject({ candidate: true, protectedReason: null });
  });

  it("labels an active pinned tab as active", () => {
    const [row] = buildRows([tab(1, { active: true, pinned: true })], {}, settings, NOW);
    expect(row.protectedReason).toBe("active");
  });

  it("treats a tab with no recorded time as just used", () => {
    const [row] = buildRows([tab(1)], {}, settings, NOW);
    expect(row).toMatchObject({ lastActive: NOW, candidate: false });
  });

  it("uses the configured threshold", () => {
    const rows = buildRows([tab(1), tab(2)], { 1: daysAgo(3), 2: daysAgo(1) },
      { ...settings, thresholdDays: 2 }, NOW);
    expect(rows.map((r) => r.candidate)).toEqual([true, false]);
  });

  it("works across multiple windows", () => {
    const rows = buildRows([tab(1, { windowId: 1 }), tab(2, { windowId: 2 })],
      { 1: daysAgo(30), 2: daysAgo(30) }, settings, NOW);
    expect(rows.every((r) => r.candidate)).toBe(true);
  });

  it("copies the tab fields the popup needs", () => {
    const t = tab(7, { windowId: 3, favIconUrl: "https://example.com/f.ico", pinned: false });
    const [row] = buildRows([t], { 7: daysAgo(2) }, settings, NOW);
    expect(row).toEqual({
      id: 7, windowId: 3, title: "Tab 7", url: "https://example.com/7",
      favIconUrl: "https://example.com/f.ico", pinned: false, lastActive: daysAgo(2),
      protectedReason: null, candidate: false,
    });
  });

  it("returns an empty list when no tabs are open", () => {
    expect(buildRows([], {}, settings, NOW)).toEqual([]);
  });
});

describe("seedActivity", () => {
  it("adds missing tabs using Chrome's lastAccessed", () => {
    const map = seedActivity({}, [tab(1, { lastAccessed: daysAgo(5) })], { now: NOW });
    expect(map).toEqual({ 1: daysAgo(5) });
  });

  it("falls back to now when lastAccessed is missing", () => {
    expect(seedActivity({}, [tab(1)], { now: NOW })).toEqual({ 1: NOW });
  });

  it("keeps existing times and drops closed tabs without reset", () => {
    const map = seedActivity({ 1: daysAgo(10), 9: daysAgo(40) }, [tab(1, { lastAccessed: NOW })], { now: NOW });
    expect(map).toEqual({ 1: daysAgo(10) });
  });

  it("on reset, a reused tab ID does not inherit the old tab's time", () => {
    // Before the restart, tab 5 was idle for 40 days. After it, ID 5 is a fresh tab.
    const map = seedActivity({ 5: daysAgo(40), 9: daysAgo(40) },
      [tab(5, { lastAccessed: NOW - 60_000 })], { reset: true, now: NOW });
    expect(map).toEqual({ 5: NOW - 60_000 });
  });

  it("mutates and returns the same map", () => {
    const map = {};
    expect(seedActivity(map, [tab(1)], { now: NOW })).toBe(map);
  });
});
