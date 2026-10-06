// In-memory stand-in for the parts of the chrome.* API the extension uses.
import { vi } from "vitest";

function event() {
  const listeners = [];
  return {
    addListener: (fn) => listeners.push(fn),
    // Calls every listener and waits for any promises they return.
    fire: (...args) => Promise.all(listeners.map((fn) => fn(...args))),
    listeners,
  };
}

export function createChrome({ tabs = [], storage = {}, alarms = {} } = {}) {
  const store = structuredClone(storage);
  const chrome = {
    _store: store,
    _tabs: tabs,
    storage: {
      local: {
        get: vi.fn(async (key) => (key in store ? { [key]: structuredClone(store[key]) } : {})),
        set: vi.fn(async (obj) => { Object.assign(store, structuredClone(obj)); }),
      },
    },
    tabs: {
      query: vi.fn(async (q = {}) => chrome._tabs.filter((t) =>
        Object.entries(q).every(([k, v]) => t[k] === v))),
      remove: vi.fn(async (ids) => {
        chrome._tabs = chrome._tabs.filter((t) => !ids.includes(t.id));
      }),
      onActivated: event(), onCreated: event(), onRemoved: event(), onReplaced: event(),
    },
    windows: { WINDOW_ID_NONE: -1, onFocusChanged: event() },
    alarms: {
      get: vi.fn(async (name) => alarms[name]),
      create: vi.fn((name, info) => { alarms[name] = { name, ...info }; }),
      onAlarm: event(),
    },
    runtime: {
      onInstalled: event(), onStartup: event(), onMessage: event(),
      sendMessage: vi.fn(),
    },
  };
  return chrome;
}

// Sends a message to the service worker's onMessage handler and resolves with its reply.
export function sendMessage(chrome, msg) {
  return new Promise((resolve) => {
    for (const fn of chrome.runtime.onMessage.listeners) fn(msg, {}, resolve);
  });
}
