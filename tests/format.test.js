import { describe, it, expect } from "vitest";
import { ago, hostOf } from "../lib/format.js";

const MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR;

describe("ago", () => {
  it.each([
    [0, "just now"],
    [59_999, "just now"],
    [MIN, "1m ago"],
    [59 * MIN, "59m ago"],
    [HOUR, "1h ago"],
    [23 * HOUR + 59 * MIN, "23h ago"],
    [DAY, "1d ago"],
    [34 * DAY + 5 * HOUR, "34d ago"],
  ])("%i ms → %s", (ms, text) => expect(ago(ms)).toBe(text));
});

describe("hostOf", () => {
  it.each([
    ["https://www.github.com/devitha5", "github.com"],
    ["https://acme.atlassian.net/browse/PROJ-1", "acme.atlassian.net"],
    ["http://localhost:3000/", "localhost"],
    ["chrome://extensions", "extensions"],
    ["not a url", ""],
    [undefined, ""],
  ])("%s → %s", (url, host) => expect(hostOf(url)).toBe(host));
});
