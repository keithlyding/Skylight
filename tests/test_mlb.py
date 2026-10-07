"""Favorite baseball team: standings, wild-card race, who to root for, and the websocket commands."""

import re
from datetime import timedelta

import pytest
from homeassistant.core import HomeAssistant
from homeassistant.setup import async_setup_component
from homeassistant.util import dt as dt_util
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.skylight import mlb

SCHEDULE = re.compile(r"^https://statsapi\.mlb\.com/api/v1/schedule")
STANDINGS = re.compile(r"^https://statsapi\.mlb\.com/api/v1/standings")

# (team id, wins, losses): a late-season National League
NL = [
    (119, 90, 60), (109, 85, 65), (135, 84, 66), (137, 75, 75), (115, 50, 100),  # NL West
    (143, 92, 58), (121, 86, 64), (144, 80, 70), (146, 60, 90), (120, 62, 88),  # NL East
    (158, 91, 59), (112, 87, 63), (113, 78, 72), (138, 70, 80), (134, 65, 85),  # NL Central
]


def _records(teams=NL):
    return [{"teamRecords": [{"team": {"id": t}, "wins": w, "losses": l} for t, w, l in teams]}]


def _game(pk, away, home, state="Preview", start="2026-09-20T01:40:00Z", a=None, h=None, **ls):
    return {"gamePk": pk, "gameDate": start, "status": {"abstractGameState": state, "detailedState": state},
            "teams": {"away": {"team": {"id": away}, "score": a}, "home": {"team": {"id": home}, "score": h}},
            "linescore": ls, "venue": {"name": "Chase Field"}}


def test_tables():
    table = mlb.build_standings(_records())
    div = mlb.division_table(table, 203)
    assert [r["abbr"] for r in div] == ["LAD", "ARI", "SD", "SF", "COL"]
    assert div[1]["gb"] == 5
    wc = mlb.wildcard_table(table, 104)
    assert [r["abbr"] for r in wc[:4]] == ["CHC", "NYM", "ARI", "SD"]  # division leaders left out
    assert [r["in"] for r in wc[:4]] == [True, True, True, False]
    assert wc[0]["gb"] == -2 and wc[2]["gb"] == 0 and wc[3]["gb"] == 1


def test_rivals_cover_division_and_wild_card():
    table = mlb.build_standings(_records())
    race = mlb.rivals(table, 109)
    # Division: Dodgers (ahead), Padres (1 behind). Wild card: Cubs and Mets ahead, Braves exactly 5 behind.
    assert set(race) == {119, 135, 112, 121, 144}
    assert race[119] == "Dodgers are 5 games ahead of us in the NL West"
    assert race[135] == "Padres are 1 game behind us in the NL West"
    assert race[112] == "Cubs are 2 games ahead of us in the NL wild-card race"
    assert 137 not in race and 113 not in race  # Giants 10 back, Reds 7 back


def test_rooting():
    table = mlb.build_standings(_records())
    games = [mlb.game_info(g) for g in (
        _game(1, 112, 113),  # Cubs (rival) at Reds: root for the Reds
        _game(2, 119, 135),  # Dodgers at Padres, both rivals: against the closer one (Padres, 1 back)
        _game(3, 146, 143),  # nobody in our race
        _game(4, 109, 137),  # our own game
    )]
    advice = {r["pk"]: r for r in mlb.rooting(games, table, 109)}
    assert set(advice) == {1, 2}
    assert advice[1]["root_for"] == 113 and advice[1]["root_against"] == 112
    assert advice[2]["root_for"] == 119 and advice[2]["root_against"] == 135


def test_game_info_live():
    g = mlb.game_info(_game(7, 119, 109, "Live", a=2, h=3, currentInningOrdinal="5th", inningState="Top"))
    assert g["state"] == "Live" and g["home_score"] == 3 and g["inning"] == "5th" and g["half"] == "Top"


@pytest.fixture
async def ws(hass: HomeAssistant, tmp_path, hass_ws_client):
    hass.config.config_dir = str(tmp_path)
    assert await async_setup_component(hass, "http", {})
    entry = MockConfigEntry(domain="skylight", data={})
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    return await hass_ws_client(hass)


async def _call(ws, msg, _id=[700]):
    _id[0] += 1
    await ws.send_json({"id": _id[0], **msg})
    r = await ws.receive_json()
    assert r["success"], r
    return r["result"]


async def test_ws_today_and_team(hass, ws, aioclient_mock):
    now = dt_util.utcnow().replace(microsecond=0)
    aioclient_mock.get(SCHEDULE, json={"dates": [{"games": [
        _game(9, 119, 109, a=1, h=0, state="Live", start=now.isoformat().replace("+00:00", "Z")),
        _game(10, 109, 135, start=(now + timedelta(days=2)).isoformat().replace("+00:00", "Z"))]}]})
    aioclient_mock.get(STANDINGS, json={"records": _records()})
    today = await _call(ws, {"type": "skylight/mlb/today"})
    assert today["team"] == 109 and today["game"]["home"] == 109 and today["game"]["state"] == "Live"
    assert today["next"]["pk"] == 10 and [g["pk"] for g in today["games"]] == [9]

    team = await _call(ws, {"type": "skylight/mlb/team"})
    assert team["errors"] == {}
    assert team["division"]["name"] == "NL West" and team["division"]["rows"][0]["abbr"] == "LAD"
    assert team["wildcard"]["spots"] == 3
    assert team["rooting"] == []  # the only game today is ours

    hass.data["skylight"]["store"].data["settings"]["mlb_team"] = None
    assert await _call(ws, {"type": "skylight/mlb/today"}) == {"team": None}


async def test_ws_feed_down(hass, ws, aioclient_mock):
    aioclient_mock.get(SCHEDULE, status=503)
    aioclient_mock.get(STANDINGS, status=503)
    today = await _call(ws, {"type": "skylight/mlb/today"})
    assert today["game"] is None and "503" in today["error"]
    team = await _call(ws, {"type": "skylight/mlb/team"})
    assert set(team["errors"]) == {"standings", "schedule", "league_today"} and team["division"]["rows"] == []
