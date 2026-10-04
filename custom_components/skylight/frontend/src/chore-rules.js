/* Skylight panel: chore rules (mirror of chores.py; tests check they agree). */

import { ymd, parseYmd, addDays, startOfDay, pyWeekday, isoWeek } from "./helpers.js?v=1.36.4";

// ---------- chore rules (mirror of chores.py; tests check they agree day by day) ----------
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
