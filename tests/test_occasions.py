"""Phase 5: birthdays, anniversaries and other yearly dates."""

import json
import pathlib
import subprocess

import pytest
from homeassistant.core import HomeAssistant
from homeassistant.setup import async_setup_component
from pytest_homeassistant_custom_component.common import MockConfigEntry

DOMAIN = "skylight"
JS = (pathlib.Path(__file__).parents[1] / "custom_components/skylight/frontend/skylight-panel.js").read_text()


def _run(expr: str):
    helpers = JS[JS.index("const pad = "):JS.index("class SkylightPanel")]
    try:
        out = subprocess.run(["node", "-e", helpers + f"\nconsole.log(JSON.stringify({expr}));"],
                             capture_output=True, text=True, check=True).stdout
    except FileNotFoundError:
        pytest.skip("node not installed")
    return json.loads(out)


def _up(occ, today, days=60, count=3):
    """upcomingOccasions for one or more occasions at a local date 'YYYY-MM-DD'."""
    return _run(f"upcomingOccasions({json.dumps(occ)}, parseYmd('{today}'), {days}, {count})"
                ".map((u) => [ymd(u.date), u.days, u.years, occasionText(u)])")


def test_across_year_boundary():
    mom = {"title": "Mom's birthday", "type": "birthday", "emoji": "🎂", "month": 1, "day": 10, "year": 1988}
    assert _up([mom], "2026-12-29") == [["2027-01-10", 12, 39, "🎂 Mom's birthday — 12 days (turning 39)"]]
    # the day after, it's a year away (outside the 60-day window)
    assert _up([mom], "2027-01-11") == []
    assert _up([mom], "2027-01-11", days=366)[0][:3] == ["2028-01-10", 364, 40]


def test_today_and_tomorrow():
    ann = {"title": "Anniversary", "type": "anniversary", "emoji": "💍", "month": 6, "day": 14, "year": 2011}
    assert _up([ann], "2026-06-14") == [["2026-06-14", 0, 15, "💍 Anniversary — Today! 🎉 (15 years)"]]
    assert _up([ann], "2026-06-13")[0][3] == "💍 Anniversary — tomorrow (15 years)"
    first = {**ann, "year": 2025}
    assert _up([first], "2026-06-01")[0][3] == "💍 Anniversary — 13 days (1 year)"


def test_feb_29():
    leap = {"title": "Leap birthday", "type": "birthday", "emoji": "🎂", "month": 2, "day": 29, "year": 2012}
    assert _up([leap], "2027-02-01")[0][:3] == ["2027-02-28", 27, 15]   # non-leap year: Feb 28
    assert _up([leap], "2028-02-01")[0][:3] == ["2028-02-29", 28, 16]   # leap year: Feb 29
    assert _up([leap], "2027-02-28")[0][1] == 0


def test_no_year_and_ordering_and_limits():
    a = {"title": "B day", "type": "birthday", "emoji": "🎂", "month": 10, "day": 5}
    b = {"title": "Other", "type": "other", "emoji": "📅", "month": 10, "day": 1}
    c = {"title": "Far", "type": "other", "emoji": "📅", "month": 12, "day": 25}
    d = {"title": "Near", "type": "other", "emoji": "📅", "month": 10, "day": 2}
    got = _up([a, b, c, d], "2026-09-29", days=60, count=3)
    assert [g[3] for g in got] == ["📅 Other — 2 days", "📅 Near — 3 days", "🎂 B day — 6 days"]  # no age without a year
    assert len(_up([a, b, c, d], "2026-09-29", days=100, count=10)) == 4


def test_member_birthdays_and_colors():
    members = [{"id": "z", "name": "Sam", "color": "#1abc9c", "birthday": {"month": 3, "day": 4, "year": 2016}},
               {"id": "k", "name": "Ana", "color": "#e74c3c"}]
    occ = [{"id": "o1", "title": "Mom & Dad", "type": "anniversary", "month": 5, "day": 1, "members": ["k"]},
           {"id": "o2", "title": "Grandma's birthday", "type": "birthday", "month": 7, "day": 7}]
    got = _run(f"allOccasions({json.dumps(members)}, {json.dumps(occ)}, '#ff9f43').map((o) => [o.title, o.color, o.emoji])")
    assert got == [["Sam's birthday", "#1abc9c", "🎂"], ["Mom & Dad", "#e74c3c", "💍"], ["Grandma's birthday", "#ff9f43", "🎂"]]


async def test_server_validation_and_gating(hass: HomeAssistant, tmp_path, hass_ws_client):
    hass.config.config_dir = str(tmp_path)
    (tmp_path / ".storage").mkdir()
    assert await async_setup_component(hass, "http", {})
    e = MockConfigEntry(domain=DOMAIN, data={})
    e.add_to_hass(hass)
    assert await hass.config_entries.async_setup(e.entry_id)
    store = hass.data[DOMAIN]["store"]
    ws = await hass_ws_client(hass)
    n = [5000]

    async def cmd(msg, conn=ws):
        n[0] += 1
        await conn.send_json({"id": n[0], **msg})
        while True:
            r = await conn.receive_json()
            if r.get("id") == n[0] and r["type"] == "result":
                return r

    members = [{"id": "z", "name": "Sam", "color": "#fff", "avatar": "x", "calendars": [], "role": "kid",
                "birthday": {"month": "3", "day": 4, "year": 2016}},
               {"id": "a", "name": "A", "color": "#fff", "avatar": "x", "calendars": [], "birthday": {"month": 2, "day": 30}}]
    assert (await cmd({"type": "skylight/set", "key": "members", "value": members}))["success"]
    assert store.data["members"][0]["birthday"] == {"month": 3, "day": 4, "year": 2016}
    assert "birthday" not in store.data["members"][1]  # Feb 30 dropped

    occ = [{"id": "1", "title": " Anniversary ", "type": "anniversary", "month": 6, "day": 14, "year": 2011, "members": ["z", "ghost"]},
           {"id": "2", "title": "Leap", "type": "party", "month": 2, "day": 29},             # unknown type -> other
           {"id": "3", "title": "Bad", "type": "other", "month": 2, "day": 29, "year": 2023},  # 2023 not a leap year
           {"id": "4", "title": "", "month": 1, "day": 1}]
    assert (await cmd({"type": "skylight/set", "key": "occasions", "value": occ}))["success"]
    assert store.data["occasions"] == [
        {"id": "1", "title": "Anniversary", "type": "anniversary", "month": 6, "day": 14, "year": 2011, "members": ["z"]},
        {"id": "2", "title": "Leap", "type": "other", "month": 2, "day": 29}]

    # Behind the settings PIN
    await cmd({"type": "skylight/pin/set", "pin": "1234"})
    ws2 = await hass_ws_client(hass)
    r = await cmd({"type": "skylight/set", "key": "occasions", "value": []}, ws2)
    assert r["error"]["code"] == "locked" and len(store.data["occasions"]) == 2
