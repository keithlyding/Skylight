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


def test_day_states_match_the_rules():
    """day_states (what screens draw) agrees with is_due / is_done / overdue_since for every day."""
    from datetime import timedelta
    cases = [
        {"repeat": "daily", "completions": ["2026-10-02"]},
        {"repeat": "weekly", "completions": ["2026-10-07"]},
        {"repeat": "once", "completions": []},
        {"repeat": "once", "completions": ["2026-10-09"]},
        {"repeat": "days", "days": [0, 3], "every_weeks": 2, "start": "2026-09-28", "completions": ["2026-10-12"]},
        {"repeat": "monthly", "month_days": [1, 15], "completions": ["2026-10-15"]},
        {"repeat": "monthly", "month_days": [-1], "every_months": 3, "start": "2026-10-01", "carry": True,
         "completions": ["2026-11-03", "2027-02-01"]},
        {"repeat": "days", "days": [5], "every_weeks": 13, "start": "2026-09-05", "carry": True,
         "completions": ["2026-09-08", "2027-03-01"]},
        {"repeat": "monthly", "month_days": [1], "carry": True, "completions": ["2026-10-03", "2027-01-01"]},
    ]
    start, end = date(2026, 9, 1), date(2027, 6, 30)
    for c in cases:
        got = chores.day_states(c, start, end)
        want = {}
        d = start
        while d <= end:
            if chores.is_due(c, d):
                since = chores.overdue_since(c, d)
                want[d.isoformat()] = [chores.is_done(c, d), since.isoformat() if since else None]
            d += timedelta(days=1)
        assert got == want, c


def test_stats_counts():
    today = date(2026, 10, 14)
    daily = {"repeat": "daily", "created": "2026-10-05", "completions": ["2026-10-05", "2026-10-06", "2026-10-08"]}
    assert chores.stats(daily, date(2026, 10, 4), date(2026, 10, 10), today) == (6, 3)  # starts at creation
    assert chores.stats(daily, date(2026, 10, 12), date(2026, 10, 20), today) == (3, 0)  # never past today
    weekly = {"repeat": "weekly", "created": "2026-09-01", "completions": ["2026-10-07"]}
    assert chores.stats(weekly, date(2026, 10, 5), date(2026, 10, 18), today, week_start=1) == (2, 1)
    filt = {"repeat": "monthly", "month_days": [1], "carry": True, "created": "2026-09-01",
            "completions": ["2026-09-03"]}
    assert chores.stats(filt, date(2026, 9, 1), date(2026, 10, 14), today) == (2, 1)  # Sep done late, Oct missed


async def test_chore_view_command(hass, tmp_path, hass_storage, hass_ws_client):
    from homeassistant.setup import async_setup_component
    from pytest_homeassistant_custom_component.common import MockConfigEntry
    from homeassistant.util import dt as dt_util
    hass.config.config_dir = str(tmp_path)
    today = dt_util.now().date()
    hass_storage["skylight.data"] = {"version": 1, "key": "skylight.data", "data": {
        "members": [{"id": "k", "name": "Kid", "role": "kid", "color": "#123456", "avatar": "x", "calendars": []}],
        "chores": [{"id": "c1", "member_id": "k", "title": "Bed", "repeat": "daily", "created": today.isoformat(),
                    "completions": [today.isoformat()]}]}}
    assert await async_setup_component(hass, "http", {})
    e = MockConfigEntry(domain="skylight", data={})
    e.add_to_hass(hass)
    assert await hass.config_entries.async_setup(e.entry_id)
    ws = await hass_ws_client(hass)
    t = today.isoformat()
    await ws.send_json({"id": 1, "type": "skylight/chores/view", "start": t, "end": t, "ranges": [[t, t]]})
    r = await ws.receive_json()
    assert r["success"], r
    assert r["result"]["days"] == {"c1": {t: [True, None]}}
    assert r["result"]["stats"] == [{"k": [1, 1]}]
    await ws.send_json({"id": 2, "type": "skylight/chores/view", "start": "2020-01-01", "end": "2026-01-01"})
    assert not (await ws.receive_json())["success"]  # range too long


async def test_chore_view_kinds(hass, tmp_path, hass_storage, hass_ws_client):
    """Homework and grown-ups' tasks share the engine; the totals can be limited to one kind."""
    from homeassistant.setup import async_setup_component
    from pytest_homeassistant_custom_component.common import MockConfigEntry
    from homeassistant.util import dt as dt_util
    from custom_components.skylight import chores as ch
    from custom_components.skylight.store import clean_chores
    hass.config.config_dir = str(tmp_path)
    t = dt_util.now().date().isoformat()
    hass_storage["skylight.data"] = {"version": 1, "key": "skylight.data", "data": {
        "members": [{"id": "k", "name": "Kid", "role": "kid", "color": "#123456", "avatar": "x", "calendars": []},
                    {"id": "a", "name": "Mom", "role": "adult", "color": "#123456", "avatar": "y", "calendars": []}],
        "chores": [{"id": "c1", "member_id": "k", "title": "Bed", "repeat": "daily", "created": t, "completions": [t]},
                   {"id": "h1", "member_id": "k", "title": "Math", "kind": "homework", "repeat": "daily", "created": t, "completions": []},
                   {"id": "t1", "member_id": "a", "title": "Bills", "kind": "task", "repeat": "once", "start": t, "created": t, "completions": []}]}}
    assert await async_setup_component(hass, "http", {})
    e = MockConfigEntry(domain="skylight", data={})
    e.add_to_hass(hass)
    assert await hass.config_entries.async_setup(e.entry_id)
    ws = await hass_ws_client(hass)
    await ws.send_json({"id": 1, "type": "skylight/chores/view", "start": t, "end": t, "ranges": [[t, t]], "kinds": ["chore"]})
    r = (await ws.receive_json())["result"]
    assert set(r["days"]) == {"c1", "h1", "t1"}  # every kind has its days
    assert r["stats"] == [{"k": [1, 1]}]  # only the chore counted
    await ws.send_json({"id": 2, "type": "skylight/chores/view", "start": t, "end": t, "ranges": [[t, t]], "kinds": ["homework", "task"]})
    assert (await ws.receive_json())["result"]["stats"] == [{"k": [1, 0], "a": [1, 0]}]
    await ws.send_json({"id": 3, "type": "skylight/chores/view", "start": t, "end": t, "ranges": [[t, t]]})
    assert (await ws.receive_json())["result"]["stats"] == [{"k": [2, 1], "a": [1, 0]}]
    await ws.send_json({"id": 4, "type": "skylight/chores/view", "start": t, "end": t, "kinds": ["laundry"]})
    assert not (await ws.receive_json())["success"]
    assert ch.kind_of({}) == "chore" and ch.kind_of({"kind": "task"}) == "task" and ch.kind_of({"kind": "x"}) == "chore"
    assert clean_chores([{"id": "1", "kind": "nope"}, {"id": "2", "kind": "homework"}]) == [{"id": "1"}, {"id": "2", "kind": "homework"}]


def test_weekly_follows_week_start_setting():
    """A "once a week" chore done on Wednesday Oct 7 covers that week, Sunday- or Monday-based."""
    c = {"repeat": "weekly", "completions": ["2026-10-07"]}
    sun, mon = 0, 1
    assert chores.is_done(c, date(2026, 10, 4), sun) and chores.is_done(c, date(2026, 10, 10), sun)  # Sun Oct 4 - Sat Oct 10
    assert not chores.is_done(c, date(2026, 10, 11), sun)  # next Sunday starts a new week
    assert chores.is_done(c, date(2026, 10, 11), mon)  # Monday weeks: Sunday Oct 11 is still that week
    assert not chores.is_done(c, date(2026, 10, 4), mon)
    today = date(2026, 10, 14)
    c2 = {"repeat": "weekly", "created": "2026-09-01", "completions": ["2026-10-07"]}
    assert chores.stats(c2, date(2026, 10, 4), date(2026, 10, 17), today, week_start=sun) == (2, 1)
    # Unchecking on Saturday removes Wednesday's check-off (same week)
    assert chores.toggle(c, date(2026, 10, 10), week_start=sun) is False and c["completions"] == []


def test_done_log_records_when_and_who():
    c = {"repeat": "monthly", "month_days": [1], "carry": True, "completions": ["2026-08-01"]}
    assert chores.toggle(c, date(2026, 10, 3), at="2026-10-03T18:32:05-05:00", by="Alex") is True
    assert c["done_log"] == {"2026-10-03": {"at": "2026-10-03T18:32:05-05:00", "by": "Alex"}}
    assert chores.toggle(c, date(2026, 10, 3), at="2026-10-03T18:40:00-05:00") is False  # unchecked: entry gone
    assert c["done_log"] == {} and c["completions"] == ["2026-08-01"]
    assert chores.toggle(c, date(2026, 10, 4), at="2026-10-04T09:00:00-05:00") is True
    assert c["done_log"] == {"2026-10-04": {"at": "2026-10-04T09:00:00-05:00"}}
    old = {"repeat": "daily", "completions": ["2026-10-01"]}
    assert chores.toggle(old, date(2026, 10, 2)) is True and "done_log" not in old  # no time given: no log


async def test_toggle_records_time_and_user(hass, tmp_path, hass_storage, hass_ws_client):
    from homeassistant.setup import async_setup_component
    from pytest_homeassistant_custom_component.common import MockConfigEntry
    hass.config.config_dir = str(tmp_path)
    hass_storage["skylight.data"] = {"version": 1, "key": "skylight.data", "data": {
        "members": [{"id": "h", "name": "House", "role": "home", "color": "#777777", "avatar": "x", "calendars": []}],
        "chores": [{"id": "f", "member_id": "h", "title": "Furnace filter", "repeat": "monthly", "month_days": [1],
                    "carry": True, "completions": []}]}}
    assert await async_setup_component(hass, "http", {})
    e = MockConfigEntry(domain="skylight", data={})
    e.add_to_hass(hass)
    assert await hass.config_entries.async_setup(e.entry_id)
    ws = await hass_ws_client(hass)
    await ws.send_json({"id": 1, "type": "skylight/chore/toggle", "chore_id": "f", "date": "2026-10-03"})
    assert (await ws.receive_json())["success"]
    entry = hass.data["skylight"]["store"].data["chores"][0]["done_log"]["2026-10-03"]
    assert entry["at"].startswith("20") and "T" in entry["at"]
    assert entry.get("by")  # the logged-in test user's name
