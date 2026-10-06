// Display helpers used by the popup.
export function ago(ms) {
  const m = Math.floor(ms / 60000), h = Math.floor(m / 60), d = Math.floor(h / 24);
  return d ? `${d}d ago` : h ? `${h}h ago` : m ? `${m}m ago` : "just now";
}

export function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
}
