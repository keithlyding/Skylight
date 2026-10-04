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


def test_daily_toggle_reports_done_state():
    c = {"repeat": "daily", "completions": []}
    assert chores.toggle(c, MON) is True
    assert chores.is_done(c, MON) and not chores.is_done(c, TUE)
    assert chores.toggle(c, MON) is False
    assert not chores.is_done(c, MON)


def test_weekly_done_for_whole_iso_week():
    c = {"repeat": "weekly", "stars": 1, "completions": []}
    chores.toggle(c, MON)
    assert chores.is_done(c, TUE)
    assert not chores.is_done(c, NEXT_MON)
    # untoggling on another day of the same week clears it
    assert chores.toggle(c, TUE) is False
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
    for i in range(450):
        chores.toggle(c, date.fromordinal(MON.toordinal() + i))
    assert len(c["completions"]) == 400
    assert c["completions"][-1] == date.fromordinal(MON.toordinal() + 449).isoformat()  # newest kept


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
        {"repeat": "monthly", "month_days": [1, 15]},
        {"repeat": "monthly", "month_days": [31], "start": "2026-09-01"},
        {"repeat": "monthly", "month_days": [-1], "every_months": 3, "start": "2026-10-10"},
        {"repeat": "monthly", "month_days": [1], "carry": True, "completions": ["2026-10-03", "2027-01-01"]},
        {"repeat": "days", "days": [5], "every_weeks": 13, "start": "2026-09-05", "carry": True,
         "completions": ["2026-09-08", "2027-03-01"]},
    ]
    days = [(date(2026, 9, 1) + timedelta(days=i)).isoformat() for i in range(366)]
    script = helpers + f"""
const cases = {json.dumps(cases)}, days = {json.dumps(days)};
console.log(JSON.stringify(cases.map((c) => days.map((d) => [choreDue({{completions: [], ...c}}, parseYmd(d)), choreDone({{completions: [], ...c}}, parseYmd(d))]))));"""
    try:
        out = subprocess.run(["node", "-e", script], capture_output=True, text=True, check=True).stdout
    except FileNotFoundError:
        import pytest
        pytest.skip("node not installed")
    js = json.loads(out)
    py = [[[chores.is_due({"completions": [], **c}, date.fromisoformat(d)), chores.is_done({"completions": [], **c}, date.fromisoformat(d))]
           for d in days] for c in cases]
    assert js == py



def test_monthly_dates():
    c = {"repeat": "monthly", "month_days": [1, 15], "completions": []}
    assert chores.is_due(c, date(2026, 10, 1)) and chores.is_due(c, date(2026, 10, 15))
    assert not chores.is_due(c, date(2026, 10, 2))
    last = {"repeat": "monthly", "month_days": [31], "completions": []}
    assert chores.is_due(last, date(2026, 2, 28)) and chores.is_due(last, date(2026, 4, 30))
    assert not chores.is_due(last, date(2026, 4, 29))
    lastday = {"repeat": "monthly", "month_days": [-1], "completions": []}
    assert chores.is_due(lastday, date(2028, 2, 29)) and not chores.is_due(lastday, date(2028, 2, 28))


def test_every_three_months_from_start():
    c = {"repeat": "monthly", "month_days": [1], "every_months": 3, "start": "2026-10-01", "completions": []}
    due = [m for m in range(1, 13) if chores.is_due(c, date(2027, m, 1))]
    assert due == [1, 4, 7, 10]
    assert not chores.is_due(c, date(2026, 7, 1))  # never before the start


def test_every_52_weeks():
    c = {"repeat": "days", "days": [5], "every_weeks": 52, "start": "2026-10-03", "completions": []}
    assert chores.is_due(c, date(2026, 10, 3))
    assert not chores.is_due(c, date(2026, 10, 10))
    assert chores.is_due(c, date(2027, 10, 2))


def test_keep_showing_until_done():
    c = {"repeat": "monthly", "month_days": [1], "carry": True, "completions": []}
    assert chores.is_due(c, date(2026, 10, 1))
    assert chores.is_due(c, date(2026, 10, 5))  # missed: still showing
    assert chores.overdue_since(c, date(2026, 10, 5)) == date(2026, 10, 1)
    assert chores.overdue_since(c, date(2026, 10, 1)) is None
    assert chores.toggle(c, date(2026, 10, 5)) is True
    assert chores.is_due(c, date(2026, 10, 5)) and chores.is_done(c, date(2026, 10, 5))  # shows checked today
    assert not chores.is_due(c, date(2026, 10, 6))  # gone afterwards
    assert chores.is_due(c, date(2026, 11, 1)) and not chores.is_done(c, date(2026, 11, 1))
    assert chores.toggle(c, date(2026, 10, 5)) is False  # uncheck brings it back
    assert chores.is_due(c, date(2026, 10, 6))
    # Without carry, a missed date simply disappears.
    plain = {"repeat": "monthly", "month_days": [1], "completions": []}
    assert not chores.is_due(plain, date(2026, 10, 5))
