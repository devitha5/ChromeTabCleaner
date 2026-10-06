import { ago, hostOf } from "./lib/format.js";

const $ = (id) => document.getElementById(id);
const send = (msg) => chrome.runtime.sendMessage(msg);

export function item(row, now) {
  const li = document.createElement("li");
  if (row.candidate) li.className = "candidate";
  const host = hostOf(row.url);

  // Favicon, falling back to the site's first letter.
  const icon = document.createElement("span");
  icon.className = "icon";
  const letter = () => (icon.textContent = (host || row.title || "?")[0].toUpperCase());
  if (row.favIconUrl) {
    const img = document.createElement("img");
    img.src = row.favIconUrl;
    img.alt = "";
    img.onerror = () => { img.remove(); letter(); };
    icon.append(img);
  } else letter();

  const text = document.createElement("span");
  text.className = "text";
  text.title = row.url;
  const title = document.createElement("div");
  title.className = "title";
  title.textContent = row.title || row.url;
  const sub = document.createElement("div");
  sub.className = "host";
  sub.textContent = host || row.url;
  text.append(title, sub);

  const age = document.createElement("span");
  age.className = row.protectedReason ? "age protected" : "age";
  age.textContent = row.protectedReason || ago(now - row.lastActive);
  li.append(icon, text, age);
  return li;
}

export function fill(list, rows, now, emptyText) {
  list.replaceChildren(...rows.map((r) => item(r, now)));
  if (!rows.length) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = emptyText;
    list.append(li);
  }
}

export async function render() {
  const { settings, rows, now } = await send({ type: "getReport" });
  $("autoCleanup").checked = settings.autoCleanup;
  $("protectPinned").checked = settings.protectPinned;
  $("thresholdDays").value = settings.thresholdDays;

  // Sub-day limits are useful for testing but risky with auto-close on.
  const warn = $("thresholdWarning");
  warn.hidden = settings.thresholdDays >= 1;
  warn.textContent = settings.autoCleanup
    ? `Under 1 day: the hourly cleanup will close almost every tab you're not using. Use this only for testing.`
    : `Under 1 day: most tabs will show as ready to close. Use this only for testing.`;

  const candidates = rows.filter((r) => r.candidate).sort((a, b) => a.lastActive - b.lastActive);
  const windows = new Set(rows.map((r) => r.windowId)).size;
  $("summary").textContent = settings.autoCleanup
    ? `Auto-close is on · after ${settings.thresholdDays} days`
    : "Auto-close is off";
  $("statTabs").textContent = rows.length;
  $("statWindows").textContent = windows;
  $("statReady").textContent = candidates.length;
  $("statReady").parentElement.classList.toggle("active", candidates.length > 0);

  $("cleanNow").disabled = !candidates.length;
  $("cleanNow").textContent = `Close ${candidates.length} tab${candidates.length === 1 ? "" : "s"}`;
  fill($("candidates"), candidates, now, `Nothing unused for more than ${settings.thresholdDays} days.`);
  fill($("all"), [...rows].sort((a, b) => a.lastActive - b.lastActive), now, "No tabs open.");
}

async function save() {
  const days = parseFloat($("thresholdDays").value);
  if (!(days > 0)) return render(); // invalid input: restore the saved value
  await send({ type: "saveSettings", settings: {
    autoCleanup: $("autoCleanup").checked,
    protectPinned: $("protectPinned").checked,
    thresholdDays: days,
  }});
  render();
}

["autoCleanup", "protectPinned", "thresholdDays"].forEach((id) => $(id).addEventListener("change", save));
$("cleanNow").addEventListener("click", async () => {
  await send({ type: "cleanNow" });
  render();
});

render();
