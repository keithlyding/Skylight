"""Pure chore-completion rules (no Home Assistant imports, unit-testable)."""

from __future__ import annotations

from datetime import date, timedelta


def _week_start(d: date, week_start: int) -> date:
    """Start of d's week; week_start 0 = Sunday, 1 = Monday (the "Week starts on" setting)."""
    first = 6 if week_start == 0 else 0  # Python weekday of the first day
    return d - timedelta(days=(d.weekday() - first) % 7)


CARRY_REPEATS = ("days", "monthly")  # repeats that can "keep showing until done"
LOOKBACK_DAYS = 400  # how far back to look for a missed occurrence


def _last_day(year: int, month: int) -> int:
    nxt = date(year + (month == 12), month % 12 + 1, 1)
    return (nxt - timedelta(days=1)).day


def _month_ok(chore: dict, on: date) -> bool:
    """Every-N-months: whole calendar months since the start date's month (never before the start)."""
    start = chore.get("start")
    if start and on < date.fromisoformat(start):
        return False
    every = max(1, int(chore.get("every_months") or 1))
    anchor = date.fromisoformat(start) if start else on
    months = (on.year * 12 + on.month) - (anchor.year * 12 + anchor.month)
    return months >= 0 and months % every == 0


def _month_day_ok(chore: dict, on: date) -> bool:
    """On one of the chosen days of the month. -1 means the last day; 29-31 fall on the last day of shorter months."""
    last = _last_day(on.year, on.month)
    for d in chore.get("month_days") or [1]:
        d = int(d)
        if (last if d == -1 else min(d, last)) == on.day:
            return True
    return False


def _week_ok(chore: dict, on: date) -> bool:
    """Every-N-weeks check for "days" chores: counts whole weeks (Mon-Sun) from the start date."""
    every = int(chore.get("every_weeks") or 1)
    start = chore.get("start")
    if every <= 1 and not start:
        return True
    anchor = date.fromisoformat(start) if start else on
    weeks = ((on - timedelta(days=on.weekday())) - (anchor - timedelta(days=anchor.weekday()))).days // 7
    return weeks >= 0 and weeks % every == 0


def scheduled(chore: dict, on: date) -> bool:
    """Whether `on` is one of the chore's scheduled days (ignoring "keep showing until done")."""
    repeat = chore.get("repeat", "daily")
    if repeat == "days":
        return on.weekday() in chore.get("days", []) and _week_ok(chore, on)
    if repeat == "monthly":
        return _month_ok(chore, on) and _month_day_ok(chore, on)
    return True


def carries(chore: dict) -> bool:
    return bool(chore.get("carry")) and chore.get("repeat") in CARRY_REPEATS


def last_occurrence(chore: dict, on: date) -> date | None:
    """The most recent scheduled day on or before `on` (within LOOKBACK_DAYS)."""
    for back in range(LOOKBACK_DAYS + 1):
        d = on - timedelta(days=back)
        if scheduled(chore, d):
            return d
    return None


def matching_completions(chore: dict, on: date, week_start: int = 1) -> list[str]:
    """Completions that make `chore` count as done on day `on`."""
    repeat = chore.get("repeat", "daily")
    done = chore.get("completions", [])
    if repeat == "once":
        return list(done)
    if repeat == "weekly":
        # "once a week (any day)": done for the whole week it was checked off in
        week = _week_start(on, week_start)
        return [c for c in done if _week_start(date.fromisoformat(c), week_start) == week]
    if carries(chore):
        since = last_occurrence(chore, on)
        if since is None:
            return []
        return [c for c in done if since.isoformat() <= c <= on.isoformat()]
    # daily, specific weekdays, monthly: completion must be for that exact day
    return [c for c in done if c == on.isoformat()]


def is_done(chore: dict, on: date, week_start: int = 1) -> bool:
    return bool(matching_completions(chore, on, week_start))


def is_due(chore: dict, on: date) -> bool:
    """Whether the chore appears on day `on` (0=Mon .. 6=Sun, Python weekday).

    With "keep showing until done", a missed occurrence stays due every day until it is checked off
    (and shows as done on the day it was checked off).
    """
    repeat = chore.get("repeat", "daily")
    if repeat == "once":
        comps = chore.get("completions", [])
        return not comps or on.isoformat() in comps
    if carries(chore):
        since = last_occurrence(chore, on)
        if since is None:
            return False
        earlier = [c for c in chore.get("completions", []) if since.isoformat() <= c < on.isoformat()]
        return not earlier
    return scheduled(chore, on)


def overdue_since(chore: dict, on: date) -> date | None:
    """For a carried-over chore that's due on `on` but was scheduled earlier: the day it was scheduled."""
    if not carries(chore) or not is_due(chore, on) or is_done(chore, on):
        return None
    since = last_occurrence(chore, on)
    return since if since and since < on else None


KEEP_COMPLETIONS = 400  # per chore: over a year of daily history for the Progress view


def toggle(chore: dict, on: date, keep: int = KEEP_COMPLETIONS, week_start: int = 1,
           at: str | None = None, by: str | None = None) -> bool:
    """Toggle completion for `on`. Mutates chore; returns whether it is now done.

    `at` (ISO time) and `by` (who) go into chore["done_log"][day], so the Progress screen can show
    exactly when house-maintenance tasks were done. Older check-offs have no log entry (date only).
    """
    matches = matching_completions(chore, on, week_start)
    comps = [c for c in chore.get("completions", []) if c not in matches]
    if matches:
        chore["completions"] = comps
    else:
        comps.append(on.isoformat())
        chore["completions"] = sorted(comps)[-keep:]
        if at:
            entry = {"at": at}
            if by:
                entry["by"] = by
            chore.setdefault("done_log", {})[on.isoformat()] = entry
    log = chore.get("done_log")
    if log is not None:
        chore["done_log"] = {d: v for d, v in log.items() if d in chore["completions"]}
    return not matches


# ----- What the screens show. The panel draws these results; it has no chore rules of its own. -----

def day_states(chore: dict, start: date, end: date, week_start: int = 1) -> dict[str, list]:
    """Days in [start, end] the chore appears on: {"YYYY-MM-DD": [done, since]}.

    `since` is the ISO day a missed "keep showing until done" chore was scheduled (else None).
    Same answers as is_due / is_done / overdue_since, but walks the range once.
    """
    out: dict[str, list] = {}
    if end < start:
        return out
    if not carries(chore):
        d = start
        while d <= end:
            if is_due(chore, d):
                out[d.isoformat()] = [is_done(chore, d, week_start), None]
            d += timedelta(days=1)
        return out
    comps = sorted(chore.get("completions", []))
    occ = last_occurrence(chore, start)
    d = start
    while d <= end:
        if scheduled(chore, d):
            occ = d
        if occ is not None:
            a, b = occ.isoformat(), d.isoformat()
            earlier = any(a <= c < b for c in comps)
            if not earlier:
                done = any(c == b for c in comps)
                out[b] = [done, a if (not done and occ < d) else None]
        d += timedelta(days=1)
    return out


def stats(chore: dict, start: date, end: date, today: date, week_start: int = 0) -> tuple[int, int]:
    """(due, done) between two days (inclusive, never past today). Days before the chore existed
    don't count; "weekly" chores count once per week; "keep showing until done" chores count once
    per scheduled date, done if checked off before the next one."""
    end = min(end, today)
    comps = chore.get("completions", [])
    began = chore.get("created") or (comps[0] if comps else None) or chore.get("start")
    d = start
    if began and date.fromisoformat(began) > d:
        d = date.fromisoformat(began)
    if not began and d < _week_start(today, week_start):
        d = _week_start(today, week_start)  # no history: count from this week
    due = done = 0
    if carries(chore):
        while d <= end:
            if scheduled(chore, d):
                due += 1
                nxt = d + timedelta(days=1)
                for _ in range(LOOKBACK_DAYS):
                    if scheduled(chore, nxt):
                        break
                    nxt += timedelta(days=1)
                a, b = d.isoformat(), nxt.isoformat()
                if any(a <= c < b for c in comps):
                    done += 1
            d += timedelta(days=1)
        return due, done
    if chore.get("repeat") == "weekly":
        w = _week_start(d, week_start)
        while w <= end:
            due += 1
            if any(w + timedelta(days=i) <= end and is_done(chore, w + timedelta(days=i), week_start) for i in range(7)):
                done += 1
            w += timedelta(days=7)
        return due, done
    while d <= end:
        if is_due(chore, d):
            due += 1
            if is_done(chore, d):
                done += 1
        d += timedelta(days=1)
    return due, done
