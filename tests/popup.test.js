// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DAY_MS, DEFAULTS } from "../lib/rules.js";

const NOW = 1_700_000_000_000;
const html = readFileSync(fileURLToPath(import.meta.url).replace(/tests\/popup\.test\.js$/, "popup.html"), "utf8");
const $ = (id) => document.getElementById(id);
const flush = () => new Promise((r) => setTimeout(r, 0));

const row = (id, extra = {}) => ({
  id, windowId: 1, title: `Tab ${id}`, url: `https://www.site${id}.com/page`,
  lastActive: NOW - DAY_MS, protectedReason: null, candidate: false, ...extra,
});

let report, popup;

// Mounts popup.html, wires a fake service worker, and loads popup.js (which renders on load).
async function mount(r) {
  report = r;
  document.body.innerHTML = new DOMParser().parseFromString(html, "text/html").body.innerHTML;
  globalThis.chrome = {
    runtime: {
      sendMessage: vi.fn(async (msg) => {
        if (msg.type === "getReport") return structuredClone(report);
        if (msg.type === "saveSettings") { report.settings = { ...report.settings, ...msg.settings }; return { ok: true }; }
        if (msg.type === "cleanNow") {
          const closed = report.rows.filter((x) => x.candidate).length;
          report.rows = report.rows.filter((x) => !x.candidate);
          return { closed };
        }
      }),
    },
  };
  vi.resetModules();
  popup = await import("../popup.js");
  await flush();
}

const send = () => chrome.runtime.sendMessage;
const change = async (el) => { el.dispatchEvent(new Event("change")); await flush(); };

afterEach(() => { delete globalThis.chrome; });

describe("item", () => {
  beforeEach(() => mount({ settings: DEFAULTS, rows: [], now: NOW }));

  it("shows title, host without www, and age", () => {
    const li = popup.item(row(1), NOW);
    expect(li.querySelector(".title").textContent).toBe("Tab 1");
    expect(li.querySelector(".host").textContent).toBe("site1.com");
    expect(li.querySelector(".age").textContent).toBe("1d ago");
    expect(li.querySelector(".text").title).toBe("https://www.site1.com/page");
  });

  it("styles candidates", () => {
    expect(popup.item(row(1, { candidate: true }), NOW).className).toBe("candidate");
    expect(popup.item(row(1), NOW).className).toBe("");
  });

  it("shows the protected reason instead of the age", () => {
    const age = popup.item(row(1, { protectedReason: "pinned" }), NOW).querySelector(".age");
    expect(age.textContent).toBe("pinned");
    expect(age.className).toBe("age protected");
  });

  it("falls back to the URL when there is no title", () => {
    const li = popup.item(row(1, { title: "" }), NOW);
    expect(li.querySelector(".title").textContent).toBe("https://www.site1.com/page");
  });

  it("uses the URL as subtitle when it has no host", () => {
    const li = popup.item(row(1, { url: "about:blank" }), NOW);
    expect(li.querySelector(".host").textContent).toBe("about:blank");
  });

  it("shows the favicon when there is one", () => {
    const img = popup.item(row(1, { favIconUrl: "https://site1.com/f.ico" }), NOW).querySelector(".icon img");
    expect(img.src).toBe("https://site1.com/f.ico");
    expect(img.alt).toBe("");
  });

  it("shows the host's first letter when there is no favicon", () => {
    expect(popup.item(row(1), NOW).querySelector(".icon").textContent).toBe("S");
  });

  it("swaps a broken favicon for the letter", () => {
    const icon = popup.item(row(1, { favIconUrl: "https://broken/f.ico" }), NOW).querySelector(".icon");
    icon.querySelector("img").dispatchEvent(new Event("error"));
    expect(icon.querySelector("img")).toBeNull();
    expect(icon.textContent).toBe("S");
  });

  it("uses the title's letter, then '?', when there is no host", () => {
    expect(popup.item(row(1, { url: "x", title: "jira" }), NOW).querySelector(".icon").textContent).toBe("J");
    expect(popup.item(row(1, { url: "", title: "" }), NOW).querySelector(".icon").textContent).toBe("?");
  });
});

describe("fill", () => {
  beforeEach(() => mount({ settings: DEFAULTS, rows: [], now: NOW }));

  it("renders one item per row", () => {
    const ul = document.createElement("ul");
    popup.fill(ul, [row(1), row(2)], NOW, "empty");
    expect(ul.querySelectorAll("li")).toHaveLength(2);
  });

  it("shows the empty text when there are no rows", () => {
    const ul = document.createElement("ul");
    popup.fill(ul, [], NOW, "Nothing here.");
    expect(ul.querySelector("li.empty").textContent).toBe("Nothing here.");
  });

  it("replaces previous contents", () => {
    const ul = document.createElement("ul");
    popup.fill(ul, [row(1), row(2)], NOW, "");
    popup.fill(ul, [row(3)], NOW, "");
    expect(ul.querySelectorAll("li")).toHaveLength(1);
  });
});

describe("render", () => {
  const rows = [
    row(1, { candidate: true, lastActive: NOW - 30 * DAY_MS }),
    row(2, { candidate: true, lastActive: NOW - 40 * DAY_MS, windowId: 2 }),
    row(3, { protectedReason: "active", lastActive: NOW }),
  ];

  it("asks the service worker for a report on open", async () => {
    await mount({ settings: DEFAULTS, rows, now: NOW });
    expect(send()).toHaveBeenCalledWith({ type: "getReport" });
  });

  it("fills settings from the report", async () => {
    await mount({ settings: { autoCleanup: false, protectPinned: true, thresholdDays: 7 }, rows, now: NOW });
    expect($("autoCleanup").checked).toBe(false);
    expect($("protectPinned").checked).toBe(true);
    expect($("thresholdDays").value).toBe("7");
  });

  it("shows stats and summary", async () => {
    await mount({ settings: DEFAULTS, rows, now: NOW });
    expect($("statTabs").textContent).toBe("3");
    expect($("statWindows").textContent).toBe("2");
    expect($("statReady").textContent).toBe("2");
    expect($("statReady").parentElement.classList.contains("active")).toBe(true);
    expect($("summary").textContent).toBe("Auto-close is on · after 20 days");
  });

  it("says when auto-close is off", async () => {
    await mount({ settings: { ...DEFAULTS, autoCleanup: false }, rows, now: NOW });
    expect($("summary").textContent).toBe("Auto-close is off");
  });

  it("lists candidates oldest first and enables the button", async () => {
    await mount({ settings: DEFAULTS, rows, now: NOW });
    const titles = [...$("candidates").querySelectorAll(".title")].map((e) => e.textContent);
    expect(titles).toEqual(["Tab 2", "Tab 1"]);
    expect($("cleanNow").disabled).toBe(false);
    expect($("cleanNow").textContent).toBe("Close 2 tabs");
    expect($("all").querySelectorAll("li")).toHaveLength(3);
  });

  it("uses singular wording for one tab", async () => {
    await mount({ settings: DEFAULTS, rows: [rows[0]], now: NOW });
    expect($("cleanNow").textContent).toBe("Close 1 tab");
  });

  it("disables the button and shows empty text when nothing is stale", async () => {
    await mount({ settings: DEFAULTS, rows: [rows[2]], now: NOW });
    expect($("cleanNow").disabled).toBe(true);
    expect($("cleanNow").textContent).toBe("Close 0 tabs");
    expect($("statReady").parentElement.classList.contains("active")).toBe(false);
    expect($("candidates").textContent).toBe("Nothing unused for more than 20 days.");
  });

  it("shows 'No tabs open.' when there are no tabs", async () => {
    await mount({ settings: DEFAULTS, rows: [], now: NOW });
    expect($("all").textContent).toBe("No tabs open.");
  });

  it("hides the low-threshold warning at 1 day or more", async () => {
    await mount({ settings: { ...DEFAULTS, thresholdDays: 1 }, rows, now: NOW });
    expect($("thresholdWarning").hidden).toBe(true);
  });

  it("warns about the hourly cleanup under 1 day with auto-close on", async () => {
    await mount({ settings: { ...DEFAULTS, thresholdDays: 0.001 }, rows, now: NOW });
    expect($("thresholdWarning").hidden).toBe(false);
    expect($("thresholdWarning").textContent).toContain("hourly cleanup will close");
  });

  it("uses a softer warning under 1 day with auto-close off", async () => {
    await mount({ settings: { ...DEFAULTS, autoCleanup: false, thresholdDays: 0.5 }, rows, now: NOW });
    expect($("thresholdWarning").textContent).toContain("will show as ready to close");
  });
});

describe("user actions", () => {
  beforeEach(() => mount({
    settings: DEFAULTS,
    rows: [row(1, { candidate: true, lastActive: NOW - 30 * DAY_MS }), row(2)],
    now: NOW,
  }));

  it("saves all settings when a toggle changes", async () => {
    $("autoCleanup").checked = false;
    await change($("autoCleanup"));
    expect(send()).toHaveBeenCalledWith({ type: "saveSettings",
      settings: { autoCleanup: false, protectPinned: true, thresholdDays: 20 } });
    expect($("summary").textContent).toBe("Auto-close is off");
  });

  it("saves a new threshold", async () => {
    $("thresholdDays").value = "3.5";
    await change($("thresholdDays"));
    expect(report.settings.thresholdDays).toBe(3.5);
  });

  it.each(["0", "-2", "", "abc"])("does not save threshold %j and restores the saved value", async (value) => {
    $("thresholdDays").value = value;
    await change($("thresholdDays"));
    expect(send()).not.toHaveBeenCalledWith(expect.objectContaining({ type: "saveSettings" }));
    expect($("thresholdDays").value).toBe("20");
  });

  it("closes tabs and re-renders when Close is clicked", async () => {
    $("cleanNow").click();
    await flush();
    expect(send()).toHaveBeenCalledWith({ type: "cleanNow" });
    expect($("statTabs").textContent).toBe("1");
    expect($("cleanNow").disabled).toBe(true);
  });
});
