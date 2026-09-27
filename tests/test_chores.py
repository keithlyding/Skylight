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


FRI = date(2026, 10, 2)  # a recycling Friday


def test_every_other_week_on_friday():
    c = {"repeat": "days", "days": [4], "every_weeks": 2, "start": FRI.isoformat(), "completions": []}
    assert chores.is_due(c, FRI)
    assert not chores.is_due(c, date(2026, 10, 9))       # off week
    assert chores.is_due(c, date(2026, 10, 16))          # two weeks later
    assert not chores.is_due(c, date(2026, 10, 15))      # right week, wrong day
    assert not chores.is_due(c, date(2026, 9, 25))       # before the start week


def test_start_date_mid_week_counts_that_week():
    # Start on Monday of the recycling week; Friday of that week is due.
    c = {"repeat": "days", "days": [4], "every_weeks": 2, "start": "2026-09-28", "completions": []}
    assert chores.is_due(c, FRI) and not chores.is_due(c, date(2026, 10, 9))


def test_weekly_days_without_interval_unchanged():
    c = {"repeat": "days", "days": [0, 2], "completions": []}
    assert chores.is_due(c, MON) and not chores.is_due(c, TUE)


def test_js_rule_matches_python():
    """The panel's choreDue must agree with chores.is_due for every day of a year."""
    import json
    import subprocess
    from datetime import timedelta

    js_path = pathlib.Path(__file__).parents[1] / "custom_components/skylight/frontend/skylight-panel.js"
    src = js_path.read_text()
    helpers = src[src.index("const pad = "):src.index("class SkylightPanel")]
    cases = [
        {"repeat": "days", "days": [4], "every_weeks": 2, "start": "2026-10-02"},
        {"repeat": "days", "days": [0, 3], "every_weeks": 3, "start": "2026-09-30"},
        {"repeat": "days", "days": [6], "every_weeks": 1, "start": "2026-09-27"},
        {"repeat": "days", "days": [1, 5]},
    ]
    days = [(date(2026, 9, 1) + timedelta(days=i)).isoformat() for i in range(366)]
    script = helpers + f"""
const cases = {json.dumps(cases)}, days = {json.dumps(days)};
console.log(JSON.stringify(cases.map((c) => days.map((d) => choreDue({{...c, completions: []}}, parseYmd(d))))));"""
    try:
        out = subprocess.run(["node", "-e", script], capture_output=True, text=True, check=True).stdout
    except FileNotFoundError:
        import pytest
        pytest.skip("node not installed")
    js = json.loads(out)
    py = [[chores.is_due({**c, "completions": []}, date.fromisoformat(d)) for d in days] for c in cases]
    assert js == py
