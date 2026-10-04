/* Skylight panel: flight recorder for "the screen froze" reports (no DOM).

   Notes what the app does (start, background/foreground, redraws, connection, server calls, errors)
   with timestamps, plus a heartbeat every second, and saves it on this device every second, so the
   record survives a freeze and a force-close. The next session shows it in Setup > Diagnostics.
   If the heartbeat stopped, the app's code was stuck (the last entries show where); if it kept going,
   the code was running and the screen/touch handling froze instead. */

const KEY = "skylight.diag";
const MAX = 250;
let cur = null;

const now = () => Date.now();

export function diagStart(info) {
  if (cur) return;
  let prev = null;
  try { prev = JSON.parse(localStorage.getItem(`${KEY}.cur`) || "null"); } catch (e) { /* none */ }
  try { if (prev) localStorage.setItem(`${KEY}.prev`, JSON.stringify(prev)); } catch (e) { /* storage full / private */ }
  cur = { started: now(), beat: now(), info, log: [] };
  setInterval(() => { // heartbeat + save
    if (!cur) return;
    cur.beat = now();
    try { localStorage.setItem(`${KEY}.cur`, JSON.stringify(cur)); } catch (e) { /* ignore */ }
  }, 1000);
  diag("start", info);
}

export function diag(type, detail) {
  if (!cur) return;
  const d = detail === undefined || detail === null ? undefined : String(detail).slice(0, 160);
  const last = cur.log[cur.log.length - 1];
  // Collapse repeats of the same thing (e.g. many resizes) into a count.
  if (last && last.type === type && last.detail === d && now() - last.t < 5000) { last.n = (last.n || 1) + 1; last.t = now(); return; }
  cur.log.push({ t: now(), type, detail: d });
  if (cur.log.length > MAX) cur.log.splice(0, cur.log.length - MAX);
}

export function diagCurrent() { return cur; }

export function diagPrevious() {
  try { return JSON.parse(localStorage.getItem(`${KEY}.prev`) || "null"); } catch (e) { return null; }
}

// Plain-text report of a session (for copying or sending to the Home Assistant log).
export function diagText(s) {
  if (!s) return "No previous session recorded on this device.";
  const tm = (t) => { const d = new Date(t); return `${d.toLocaleTimeString([], { hour12: false })}.${String(d.getMilliseconds()).padStart(3, "0")}`; };
  const end = s.log.length ? s.log[s.log.length - 1].t : s.started;
  const gap = Math.round((s.beat - end) / 1000);
  const lines = [
    `Session started ${new Date(s.started).toLocaleString()}; ${s.info || ""}`,
    `Last heartbeat ${new Date(s.beat).toLocaleString()} (${gap >= 0 ? `${gap}s after the last event` : "before the last event"})`,
    ...s.log.map((e) => `${tm(e.t)} ${e.type}${e.detail !== undefined ? ` ${e.detail}` : ""}${e.n ? ` ×${e.n}` : ""}`),
  ];
  return lines.join("\n");
}
