const $ = (id) => document.getElementById(id);
const send = (msg) => chrome.runtime.sendMessage(msg);

function ago(ms) {
  const m = Math.floor(ms / 60000), h = Math.floor(m / 60), d = Math.floor(h / 24);
  return d ? `${d}d ago` : h ? `${h}h ago` : m ? `${m}m ago` : "just now";
}

function item(row, now) {
  const li = document.createElement("li");
  if (row.candidate) li.className = "candidate";
  const icon = document.createElement("img");
  icon.src = row.favIconUrl || "";
  icon.alt = "";
  icon.onerror = () => (icon.style.visibility = "hidden");
  const title = document.createElement("span");
  title.className = "title";
  title.textContent = row.title || row.url;
  title.title = row.url;
  const age = document.createElement("span");
  age.className = "age";
  age.textContent = row.protectedReason || ago(now - row.lastActive);
  li.append(icon, title, age);
  return li;
}

function fill(list, rows, now, emptyText) {
  list.replaceChildren(...rows.map((r) => item(r, now)));
  if (!rows.length) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = emptyText;
    list.append(li);
  }
}

async function render() {
  const { settings, rows, now } = await send({ type: "getReport" });
  $("autoCleanup").checked = settings.autoCleanup;
  $("protectPinned").checked = settings.protectPinned;
  $("thresholdDays").value = settings.thresholdDays;

  const candidates = rows.filter((r) => r.candidate).sort((a, b) => a.lastActive - b.lastActive);
  const windows = new Set(rows.map((r) => r.windowId)).size;
  $("summary").textContent =
    `${rows.length} tabs across ${windows} window${windows === 1 ? "" : "s"}. ` +
    (settings.autoCleanup ? "Auto-close is on, checked hourly." : "Auto-close is off.");

  $("cleanNow").disabled = !candidates.length;
  $("cleanNow").textContent = `Close ${candidates.length} tab${candidates.length === 1 ? "" : "s"}`;
  fill($("candidates"), candidates, now, `Nothing unused for more than ${settings.thresholdDays} days.`);
  fill($("all"), [...rows].sort((a, b) => a.lastActive - b.lastActive), now, "No tabs open.");
}

async function save() {
  const days = parseFloat($("thresholdDays").value);
  if (!(days > 0)) return;
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
