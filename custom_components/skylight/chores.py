"""Pure chore-completion rules (no Home Assistant imports, unit-testable)."""

from __future__ import annotations

from datetime import date


def _week_key(d: date) -> tuple[int, int]:
    iso = d.isocalendar()
    return (iso[0], iso[1])


def matching_completions(chore: dict, on: date) -> list[str]:
    """Completions that make `chore` count as done on day `on`."""
    repeat = chore.get("repeat", "daily")
    done = chore.get("completions", [])
    if repeat == "once":
        return list(done)
    if repeat == "weekly":
        return [c for c in done if _week_key(date.fromisoformat(c)) == _week_key(on)]
    # daily and specific weekdays: completion must be for that exact day
    return [c for c in done if c == on.isoformat()]


def is_done(chore: dict, on: date) -> bool:
    return bool(matching_completions(chore, on))


def is_due(chore: dict, on: date) -> bool:
    """Whether the chore appears on day `on` (0=Mon .. 6=Sun, Python weekday)."""
    repeat = chore.get("repeat", "daily")
    if repeat == "days":
        return on.weekday() in chore.get("days", [])
    if repeat == "once":
        comps = chore.get("completions", [])
        return not comps or on.isoformat() in comps
    return True


def toggle(chore: dict, on: date, keep: int = 120) -> int:
    """Toggle completion for `on`. Mutates chore; returns star delta."""
    stars = int(chore.get("stars", 1))
    matches = matching_completions(chore, on)
    comps = [c for c in chore.get("completions", []) if c not in matches]
    if matches:
        chore["completions"] = comps
        return -stars
    comps.append(on.isoformat())
    chore["completions"] = sorted(comps)[-keep:]
    return stars
