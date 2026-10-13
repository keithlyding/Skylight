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
SEASONS = re.compile(r"^https://statsapi\.mlb\.com/api/v1/seasons/")

# (team id, wins, losses): a late-season National League
NL = [
    (119, 90, 60), (109, 85, 65), (135, 84, 66), (137, 75, 75), (115, 50, 100),  # NL West
    (143, 92, 58), (121, 86, 64), (144, 80, 70), (146, 60, 90), (120, 62, 88),  # NL East
    (158, 91, 59), (112, 87, 63), (113, 78, 72), (138, 70, 80), (134, 65, 85),  # NL Central
]


def _records(teams=NL):
    return [{"teamRecords": [{"team": {"id": t}, "wins": w, "losses": l} for t, w, l in teams]}]


def _game(pk, away, home, state="Preview", start="2026-09-20T01:40:00Z", a=None, h=None, gtype="R", n=None, **ls):
    return {"gamePk": pk, "gameDate": start, "status": {"abstractGameState": state, "detailedState": state}, "gameType": gtype,
            **({"gamesInSeries": n} if n else {}),
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
    aioclient_mock.get(SEASONS, json={"seasons": [{"regularSeasonEndDate": "2099-09-27", "postSeasonEndDate": "2099-11-01"}]})
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
    assert set(team["errors"]) == {"standings", "schedule", "league_today", "season", "postseason"} and team["division"]["rows"] == []
    assert team["rooting"] == [] and team["rooting_note"] is None  # unsure whether we're still in it: no advice


def test_season_phase():
    from datetime import date
    season = {"regularSeasonEndDate": "2026-09-27", "postSeasonEndDate": "2026-11-01"}
    assert mlb.season_phase(season, date(2026, 9, 27), []) == "regular"
    assert mlb.season_phase(season, date(2026, 10, 14), []) == "postseason"
    assert mlb.season_phase(season, date(2026, 11, 20), []) == "offseason"
    assert mlb.season_phase({}, date(2026, 10, 14), [{"type": "L"}]) == "postseason"  # no dates: today's games


def _post(pk, away, home, a, h, gtype="D", n=5, start="2026-10-0"):
    return mlb.game_info(_game(pk, away, home, "Final", start=f"{start}{pk}T00:00:00Z", a=a, h=h, gtype=gtype, n=n))


def test_postseason_status():
    assert mlb.postseason_status([], 109) == "missed"
    wc = [_post(1, 109, 121, 3, 1, "F", 3), _post(2, 109, 121, 4, 2, "F", 3)]  # won the wild-card series 2-0
    assert mlb.postseason_status(wc, 109) == "alive"
    ds = wc + [_post(3, 119, 109, 5, 1), _post(4, 119, 109, 2, 6), _post(5, 109, 119, 1, 3), _post(6, 109, 119, 0, 4)]
    assert mlb.postseason_status(ds, 109) == "out"  # lost the division series 1-3
    assert mlb.postseason_status(ds[:5], 109) == "alive"  # 1-2, still going


def test_division_rooting_when_out():
    games = [mlb.game_info(g) for g in (
        _game(1, 119, 143, gtype="L"),  # Dodgers (our division) vs Phillies: root for the Dodgers
        _game(2, 158, 135, gtype="L"),  # Brewers at Padres: root for the Padres
        _game(3, 147, 117, gtype="L"),  # no NL West team
        _game(4, 109, 119, gtype="L"),  # our own game: never root for the other side
    )]
    r = {x["pk"]: x for x in mlb.division_rooting(games, 109)}
    assert set(r) == {1, 2} and r[1]["root_for"] == 119 and r[2]["root_for"] == 135
    assert "NL West" in r[1]["reason"] and "look better" in r[1]["reason"]


async def test_team_page_after_we_are_out(hass, ws, aioclient_mock):
    from homeassistant.util import dt as dt_util
    today = dt_util.now().date()
    # One mock for every schedule call: our lost series, plus today's LCS game Dodgers vs Phillies.
    done = [_game(1, 109, 119, "Final", a=1, h=5, gtype="D", n=5, start=f"{today - timedelta(days=9)}T00:00:00Z"),
            _game(2, 109, 119, "Final", a=0, h=3, gtype="D", n=5, start=f"{today - timedelta(days=8)}T00:00:00Z"),
            _game(3, 119, 109, "Final", a=4, h=2, gtype="D", n=5, start=f"{today - timedelta(days=6)}T00:00:00Z"),
            _game(4, 119, 143, gtype="L", start=f"{today}T23:00:00Z")]
    aioclient_mock.get(SCHEDULE, json={"dates": [{"games": done}]})
    aioclient_mock.get(STANDINGS, json={"records": _records()})
    aioclient_mock.get(SEASONS, json={"seasons": [{"regularSeasonEndDate": str(today - timedelta(days=15)),
                                                   "postSeasonEndDate": str(today + timedelta(days=20))}]})
    team = await _call(ws, {"type": "skylight/mlb/team"})
    assert team["phase"] == "postseason" and team["postseason"] == "out"
    assert "root for NL West teams" in team["rooting_note"]
    assert [(r["pk"], r["root_for"]) for r in team["rooting"]] == [(4, 119)]
