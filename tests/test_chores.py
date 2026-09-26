"""Unit tests for chore rules (run: python3 -m pytest tests)."""

import importlib.util
import pathlib
from datetime import date

_spec = importlib.util.spec_from_file_location(
    "chores", pathlib.Path(__file__).parents[1] / "custom_components/skylight/chores.py"
)
chores = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(chores)

MON = date(2026, 9, 21)
TUE = date(2026, 9, 22)
NEXT_MON = date(2026, 9, 28)


def test_daily_toggle_awards_and_removes_stars():
    c = {"repeat": "daily", "stars": 2, "completions": []}
    assert chores.toggle(c, MON) == 2
    assert chores.is_done(c, MON) and not chores.is_done(c, TUE)
    assert chores.toggle(c, MON) == -2
    assert not chores.is_done(c, MON)


def test_weekly_done_for_whole_iso_week():
    c = {"repeat": "weekly", "stars": 1, "completions": []}
    chores.toggle(c, MON)
    assert chores.is_done(c, TUE)
    assert not chores.is_done(c, NEXT_MON)
    # untoggling on another day of the same week clears it
    assert chores.toggle(c, TUE) == -1
    assert c["completions"] == []


def test_specific_days_due():
    c = {"repeat": "days", "days": [0, 2], "completions": []}
    assert chores.is_due(c, MON)
    assert not chores.is_due(c, TUE)


def test_once_disappears_after_completion_day():
    c = {"repeat": "once", "stars": 3, "completions": []}
    assert chores.is_due(c, MON)
    chores.toggle(c, MON)
    assert chores.is_due(c, MON)
    assert not chores.is_due(c, TUE)


def test_completion_history_is_capped():
    c = {"repeat": "daily", "stars": 1, "completions": []}
    for i in range(200):
        chores.toggle(c, date.fromordinal(MON.toordinal() + i))
    assert len(c["completions"]) == 120
