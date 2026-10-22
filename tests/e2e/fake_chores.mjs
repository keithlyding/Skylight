// Test double only: a stand-in for Home Assistant's chores.py, so the fake HA page can answer
// skylight/chores/view. The real panel has no chore rules; the Python tests cover the real ones.

import { ymd, parseYmd, addDays, startOfDay, pyWeekday, isoWeek } from "/src/helpers.js";
// ---------- the rules, as the panel had them before v1.37 (when chores.py became the only copy) ----------
export const EVERY_WEEKS = [1, 2, 3, 4, 5, 6, 8, 10, 12, 13, 16, 20, 26, 52];
export const EVERY_MONTHS = [1, 2, 3, 4, 6, 12];
export const CARRY_REPEATS = ["days", "monthly"]; // repeats that can "keep showing until done"
export const LOOKBACK_DAYS = 400;
export const mondayOf = (d) => addDays(startOfDay(d), -pyWeekday(d));
export const lastDayOfMonth = (y, m) => new Date(y, m + 1, 0).getDate(); // m: 0-11
// Every-N-weeks for "days" chores: whole Mon-Sun weeks since the start date.
export const choreWeekOk = (c, day) => {
  const every = Number(c.every_weeks) || 1;
  if (every <= 1 && !c.start) return true;
  const anchor = c.start ? parseYmd(c.start) : day;
  const weeks = Math.round((mondayOf(day) - mondayOf(anchor)) / (7 * 86400000));
  return weeks >= 0 && weeks % every === 0;
};
// Every-N-months: whole calendar months since the start date's month (never before the start).
export const choreMonthOk = (c, day) => {
  if (c.start && ymd(day) < c.start) return false;
  const every = Math.max(1, Number(c.every_months) || 1);
  const anchor = c.start ? parseYmd(c.start) : day;
  const months = (day.getFullYear() * 12 + day.getMonth()) - (anchor.getFullYear() * 12 + anchor.getMonth());
  return months >= 0 && months % every === 0;
};
// One of the chosen days of the month; -1 = last day; 29-31 fall on the last day of shorter months.
export const choreMonthDayOk = (c, day) => {
  const last = lastDayOfMonth(day.getFullYear(), day.getMonth());
  return (c.month_days && c.month_days.length ? c.month_days : [1]).some((d) => (Number(d) === -1 ? last : Math.min(Number(d), last)) === day.getDate());
};
export const choreScheduled = (c, day) => {
  if (c.repeat === "days") return (c.days || []).includes(pyWeekday(day)) && choreWeekOk(c, day);
  if (c.repeat === "monthly") return choreMonthOk(c, day) && choreMonthDayOk(c, day);
  return true;
};
export const choreCarries = (c) => !!c.carry && CARRY_REPEATS.includes(c.repeat);
export const choreLastOccurrence = (c, day) => {
  for (let back = 0; back <= LOOKBACK_DAYS; back++) { const d = addDays(startOfDay(day), -back); if (choreScheduled(c, d)) return d; }
  return null;
};
export const choreMatches = (c, day) => {
  const comps = c.completions || [];
  if (c.repeat === "once") return comps;
  if (c.repeat === "weekly") return comps.filter((x) => isoWeek(parseYmd(x)) === isoWeek(day));
  if (choreCarries(c)) {
    const since = choreLastOccurrence(c, day);
    if (!since) return [];
    const a = ymd(since), b = ymd(day);
    return comps.filter((x) => x >= a && x <= b);
  }
  return comps.filter((x) => x === ymd(day));
};
export const choreDone = (c, day) => choreMatches(c, day).length > 0;
export const choreDue = (c, day) => {
  if (c.repeat === "once") { const comps = c.completions || []; return !comps.length || comps.includes(ymd(day)); }
  if (choreCarries(c)) {
    const since = choreLastOccurrence(c, day);
    if (!since) return false;
    const a = ymd(since), b = ymd(day);
    return !(c.completions || []).some((x) => x >= a && x < b);
  }
  return choreScheduled(c, day);
};
// A carried-over chore due today but scheduled earlier: the day it was scheduled (else null).
export const choreOverdueSince = (c, day) => {
  if (!choreCarries(c) || !choreDue(c, day) || choreDone(c, day)) return null;
  const since = choreLastOccurrence(c, day);
  return since && ymd(since) < ymd(day) ? since : null;
};

const weekStartOf = (d, ws) => addDays(startOfDay(d), -((d.getDay() - ws + 7) % 7));
const stats = (c, from, to, ws) => {
  const today = startOfDay(new Date());
  const end = startOfDay(to) > today ? today : startOfDay(to);
  let due = 0, done = 0;
  const firstDone = (c.completions || [])[0];
  const began = c.created || firstDone || c.start;
  let d = startOfDay(from);
  if (began && parseYmd(began) > d) d = parseYmd(began);
  if (!began && d < weekStartOf(today, ws)) d = weekStartOf(today, ws);
  if (choreCarries(c)) {
    for (; d <= end; d = addDays(d, 1)) {
      if (!choreScheduled(c, d)) continue;
      due++;
      let next = addDays(d, 1);
      for (let i = 0; i < LOOKBACK_DAYS && !choreScheduled(c, next); i++) next = addDays(next, 1);
      if ((c.completions || []).some((x) => x >= ymd(d) && x < ymd(next))) done++;
    }
    return [due, done];
  }
  if (c.repeat === "weekly") {
    for (let w = weekStartOf(d, ws); w <= end; w = addDays(w, 7)) {
      due++;
      if ([...Array(7)].some((_, i) => addDays(w, i) <= end && choreDone(c, addDays(w, i)))) done++;
    }
    return [due, done];
  }
  for (; d <= end; d = addDays(d, 1)) if (choreDue(c, d)) { due++; if (choreDone(c, d)) done++; }
  return [due, done];
};

// Same shape as the real skylight/chores/view result.
export function choreView(D, msg) {
  const days = {};
  const repeating = (D.lists || []).flatMap((l) => (l.items || []).filter((i) => i.repeat));
  for (const c of [...(D.chores || []), ...repeating]) {
    const out = (days[c.id] = {});
    for (let d = parseYmd(msg.start); ymd(d) <= msg.end; d = addDays(d, 1)) {
      if (!choreDue(c, d)) continue;
      const since = choreOverdueSince(c, d);
      out[ymd(d)] = [choreDone(c, d), since ? ymd(since) : null];
    }
  }
  const ws = Number(D.settings?.week_start || 0);
  const statsOut = (msg.ranges || []).map(([a, b]) => {
    const per = {};
    for (const c of D.chores || []) {
      if (msg.kinds && !msg.kinds.includes(c.kind || "chore")) continue;
      const [due, done] = stats(c, parseYmd(a), parseYmd(b), ws);
      const t = (per[c.member_id || ""] ||= [0, 0]); t[0] += due; t[1] += done;
    }
    return per;
  });
  return { today: ymd(new Date()), days, stats: statsOut };
}
