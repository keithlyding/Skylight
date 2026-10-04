"""Pure chore-completion rules (no Home Assistant imports, unit-testable)."""

from __future__ import annotations

from datetime import date, timedelta


def _week_key(d: date) -> tuple[int, int]:
    iso = d.isocalendar()
    return (iso[0], iso[1])


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


def matching_completions(chore: dict, on: date) -> list[str]:
    """Completions that make `chore` count as done on day `on`."""
    repeat = chore.get("repeat", "daily")
    done = chore.get("completions", [])
    if repeat == "once":
        return list(done)
    if repeat == "weekly":
        return [c for c in done if _week_key(date.fromisoformat(c)) == _week_key(on)]
    if carries(chore):
        since = last_occurrence(chore, on)
        if since is None:
            return []
        return [c for c in done if since.isoformat() <= c <= on.isoformat()]
    # daily, specific weekdays, monthly: completion must be for that exact day
    return [c for c in done if c == on.isoformat()]


def is_done(chore: dict, on: date) -> bool:
    return bool(matching_completions(chore, on))


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


def toggle(chore: dict, on: date, keep: int = KEEP_COMPLETIONS) -> bool:
    """Toggle completion for `on`. Mutates chore; returns whether it is now done."""
    matches = matching_completions(chore, on)
    comps = [c for c in chore.get("completions", []) if c not in matches]
    if matches:
        chore["completions"] = comps
        return False
    comps.append(on.isoformat())
    chore["completions"] = sorted(comps)[-keep:]
    return True
