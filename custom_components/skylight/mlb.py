"""Favorite MLB team: today's game (time, countdown, live score), schedule, standings and rooting guide.

Data comes from MLB's free public stats feed (statsapi.mlb.com, no key), fetched by Home Assistant.
Standings, the wild-card race and the "root for / against" advice are worked out here from plain
wins and losses, so the panel only draws the result.
"""

from __future__ import annotations

import asyncio
import time
from datetime import date, timedelta
from typing import Any

import aiohttp
import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.util import dt as dt_util

from .const import DOMAIN, VERSION

API = "https://statsapi.mlb.com/api/v1"
TIMEOUT = aiohttp.ClientTimeout(total=12)
HEADERS = {"User-Agent": f"HomeAssistant-LydingStrike/{VERSION} (family display)"}
CACHE_KEY = f"{DOMAIN}_mlb"
DEFAULT_TEAM = 109  # Arizona Diamondbacks
CLOSE_GAMES = 5.0  # a team this many games behind (or anywhere ahead) is "in the race"
WILD_CARDS = 3  # wild-card spots per league
NEXT_DAYS = 10  # how far ahead the Today note looks for the next game

# id: (abbreviation, short name, full name, league id, division id)
TEAMS: dict[int, tuple[str, str, str, int, int]] = {
    110: ("BAL", "Orioles", "Baltimore Orioles", 103, 201), 111: ("BOS", "Red Sox", "Boston Red Sox", 103, 201),
    147: ("NYY", "Yankees", "New York Yankees", 103, 201), 139: ("TB", "Rays", "Tampa Bay Rays", 103, 201),
    141: ("TOR", "Blue Jays", "Toronto Blue Jays", 103, 201),
    145: ("CWS", "White Sox", "Chicago White Sox", 103, 202), 114: ("CLE", "Guardians", "Cleveland Guardians", 103, 202),
    116: ("DET", "Tigers", "Detroit Tigers", 103, 202), 118: ("KC", "Royals", "Kansas City Royals", 103, 202),
    142: ("MIN", "Twins", "Minnesota Twins", 103, 202),
    117: ("HOU", "Astros", "Houston Astros", 103, 200), 108: ("LAA", "Angels", "Los Angeles Angels", 103, 200),
    133: ("ATH", "Athletics", "Athletics", 103, 200), 136: ("SEA", "Mariners", "Seattle Mariners", 103, 200),
    140: ("TEX", "Rangers", "Texas Rangers", 103, 200),
    144: ("ATL", "Braves", "Atlanta Braves", 104, 204), 146: ("MIA", "Marlins", "Miami Marlins", 104, 204),
    121: ("NYM", "Mets", "New York Mets", 104, 204), 143: ("PHI", "Phillies", "Philadelphia Phillies", 104, 204),
    120: ("WSH", "Nationals", "Washington Nationals", 104, 204),
    112: ("CHC", "Cubs", "Chicago Cubs", 104, 205), 113: ("CIN", "Reds", "Cincinnati Reds", 104, 205),
    158: ("MIL", "Brewers", "Milwaukee Brewers", 104, 205), 134: ("PIT", "Pirates", "Pittsburgh Pirates", 104, 205),
    138: ("STL", "Cardinals", "St. Louis Cardinals", 104, 205),
    109: ("ARI", "D-backs", "Arizona Diamondbacks", 104, 203), 115: ("COL", "Rockies", "Colorado Rockies", 104, 203),
    119: ("LAD", "Dodgers", "Los Angeles Dodgers", 104, 203), 135: ("SD", "Padres", "San Diego Padres", 104, 203),
    137: ("SF", "Giants", "San Francisco Giants", 104, 203),
}
DIVISIONS = {200: "AL West", 201: "AL East", 202: "AL Central", 203: "NL West", 204: "NL East", 205: "NL Central"}
LEAGUES = {103: "AL", 104: "NL"}


class MlbError(Exception):
    """MLB's feed couldn't be read."""


def short(team_id: int) -> str:
    return TEAMS.get(team_id, ("", f"Team {team_id}"))[1]


# ---------- pure helpers (unit-tested) ----------

def games_between(a: dict, b: dict) -> float:
    """How many games team a is ahead of team b (negative = behind), from wins and losses."""
    return ((a["w"] - b["w"]) + (b["l"] - a["l"])) / 2


def _pct(r: dict) -> float:
    g = r["w"] + r["l"]
    return r["w"] / g if g else 0.0


def build_standings(records: list[dict]) -> dict[int, dict]:
    """{team_id: {id, w, l}} from the standings feed (any league, any division)."""
    out: dict[int, dict] = {}
    for rec in records:
        for tr in rec.get("teamRecords", []):
            tid = (tr.get("team") or {}).get("id")
            if tid in TEAMS:
                out[tid] = {"id": tid, "w": int(tr.get("wins") or 0), "l": int(tr.get("losses") or 0)}
    return out


def division_table(table: dict[int, dict], division: int) -> list[dict]:
    rows = sorted((r for tid, r in table.items() if TEAMS[tid][4] == division), key=lambda r: (-_pct(r), -r["w"]))
    if not rows:
        return []
    lead = rows[0]
    return [{**r, "name": short(r["id"]), "abbr": TEAMS[r["id"]][0], "gb": max(0.0, -games_between(r, lead))} for r in rows]


def wildcard_table(table: dict[int, dict], league: int) -> list[dict]:
    """League teams that aren't leading their division, best first; gb measured to the last wild-card spot
    (negative = that far ahead of it). The first WILD_CARDS rows hold the spots."""
    divisions = {TEAMS[t][4] for t in TEAMS if TEAMS[t][3] == league}
    leaders = {rows[0]["id"] for rows in (division_table(table, d) for d in divisions) if rows}
    rows = sorted((r for tid, r in table.items() if TEAMS[tid][3] == league and tid not in leaders),
                  key=lambda r: (-_pct(r), -r["w"]))
    if len(rows) < WILD_CARDS:
        return [{**r, "name": short(r["id"]), "abbr": TEAMS[r["id"]][0], "gb": 0.0, "in": True} for r in rows]
    cut = rows[WILD_CARDS - 1]
    return [{**r, "name": short(r["id"]), "abbr": TEAMS[r["id"]][0], "gb": -games_between(r, cut), "in": i < WILD_CARDS}
            for i, r in enumerate(rows)]


def rivals(table: dict[int, dict], team: int) -> dict[int, str]:
    """Teams in the race with ours, and why: ahead of us, or within CLOSE_GAMES behind us,
    in our division or in our league's wild-card race. {team_id: reason}."""
    if team not in table:
        return {}
    me = table[team]
    league, division = TEAMS[team][3], TEAMS[team][4]
    out: dict[int, str] = {}

    def note(tid: int, race: str) -> None:
        gap = games_between(table[tid], me)  # > 0: they're ahead of us
        if gap < -CLOSE_GAMES:
            return
        where = f"{abs(gap):g} game{'s' if abs(gap) != 1 else ''} {'ahead of' if gap > 0 else 'behind'} us" if gap else "tied with us"
        out.setdefault(tid, f"{short(tid)} are {where} in the {race}")

    for r in division_table(table, division):
        if r["id"] != team:
            note(r["id"], DIVISIONS[division])
    wc = wildcard_table(table, league)
    if any(r["id"] == team for r in wc):  # we're chasing (or holding) a wild card
        for r in wc:
            if r["id"] != team:
                note(r["id"], f"{LEAGUES[league]} wild-card race")
    return out


def rooting(games: list[dict], table: dict[int, dict], team: int) -> list[dict]:
    """Advice for today's games: [{game, root_for, root_against, reason}]. Our own game is left out
    (root for us!). Rival vs non-rival: root against the rival. Rival vs rival: root against the one
    closest to us in the standings (the one we're most directly competing with)."""
    race = rivals(table, team)
    me = table.get(team)
    out = []
    for g in games:
        a, h = g["away"], g["home"]
        if team in (a, h) or not (a in race or h in race):
            continue
        if a in race and h in race and me:
            ga, gh = abs(games_between(table[a], me)), abs(games_between(table[h], me))
            against = a if ga < gh or (ga == gh and games_between(table[a], me) > 0) else h
        else:
            against = a if a in race else h
        forteam = h if against == a else a
        out.append({**g, "root_for": forteam, "root_against": against, "reason": race[against]})
    return out


def game_info(g: dict) -> dict:
    """The parts of one schedule entry the panel needs."""
    teams = g.get("teams") or {}
    away, home = teams.get("away") or {}, teams.get("home") or {}
    st = g.get("status") or {}
    ls = g.get("linescore") or {}
    return {
        "pk": g.get("gamePk"),
        "start": g.get("gameDate"),  # UTC ISO
        "away": (away.get("team") or {}).get("id"), "home": (home.get("team") or {}).get("id"),
        "away_score": away.get("score"), "home_score": home.get("score"),
        "state": st.get("abstractGameState"),  # Preview / Live / Final
        "detail": st.get("detailedState"),
        "inning": ls.get("currentInningOrdinal"), "half": ls.get("inningState"),
        "venue": (g.get("venue") or {}).get("name"),
        "type": g.get("gameType"),  # R regular season; F wild card, D division series, L LCS, W World Series
        "series_games": g.get("gamesInSeries"),
    }


POSTSEASON = ("F", "D", "L", "W")
SERIES_LENGTH = {"F": 3, "D": 5, "L": 7, "W": 7}


def postseason_status(games: list[dict], team: int) -> str:
    """Our postseason so far: "missed" (no postseason games), "out" (lost our latest series),
    "champions", or "alive". From our postseason games (game_info), any order."""
    ours = [g for g in games if g.get("type") in POSTSEASON and team in (g["away"], g["home"])]
    if not ours:
        return "missed"
    last = max(ours, key=lambda g: g.get("start") or "")
    opp = last["away"] if last["home"] == team else last["home"]
    series = [g for g in ours if g.get("type") == last.get("type") and opp in (g["away"], g["home"])]
    length = int(last.get("series_games") or SERIES_LENGTH.get(last.get("type"), 7))
    need = length // 2 + 1
    won = lost = 0
    for g in series:
        if g.get("state") != "Final" or g.get("away_score") is None or g.get("home_score") is None:
            continue
        mine, theirs = (g["home_score"], g["away_score"]) if g["home"] == team else (g["away_score"], g["home_score"])
        won += mine > theirs
        lost += mine < theirs
    if lost >= need:
        return "out"
    if won >= need and last.get("type") == "W":
        return "champions"
    return "alive"


def division_rooting(games: list[dict], team: int) -> list[dict]:
    """Once we're out of it: root for teams from our division (a tough division makes us look better).
    Our division against itself: no pick."""
    division = TEAMS[team][4]
    mates = {t for t, info in TEAMS.items() if info[4] == division and t != team}
    out = []
    for g in games:
        a, h = g["away"], g["home"]
        if team in (a, h) or (a in mates) == (h in mates):  # our own game, or no pick to make
            continue
        mate = a if a in mates else h
        out.append({**g, "root_for": mate, "root_against": h if mate == a else a,
                    "reason": f"{short(mate)} are in our division ({DIVISIONS[division]}): a tough {DIVISIONS[division]} makes us look better"})
    return out


# ---------- fetching ----------

async def _get(hass: HomeAssistant, path: str, params: dict[str, Any]) -> dict:
    session = async_get_clientsession(hass)
    try:
        async with session.get(f"{API}{path}", params=params, timeout=TIMEOUT, headers=HEADERS) as resp:
            if resp.status != 200:
                raise MlbError(f"HTTP {resp.status}")
            return await resp.json(content_type=None)
    except (aiohttp.ClientError, TimeoutError) as err:
        raise MlbError(str(err) or type(err).__name__) from err


def _games(data: dict) -> list[dict]:
    return [game_info(g) for d in data.get("dates", []) for g in d.get("games", [])]


async def _cached(hass: HomeAssistant, key: str, seconds: float, fetch):
    cache = hass.data.setdefault(CACHE_KEY, {})
    hit = cache.get(key)
    if hit and time.monotonic() - hit[0] < seconds:
        return hit[1]
    value = await fetch()
    cache[key] = (time.monotonic(), value)
    return value


async def async_today(hass: HomeAssistant, team: int) -> dict:
    """Our game today (if any) and the next one after today. Cached 60 s while live or within the hour, else 10 min."""
    today = dt_util.now().date()
    key = f"today-{team}-{today}"
    cache = hass.data.setdefault(CACHE_KEY, {})
    hit = cache.get(key)
    if hit:
        g = hit[1].get("game")
        soon = g and g["state"] == "Live" or (g and g["state"] == "Preview" and g["start"]
                                              and dt_util.parse_datetime(g["start"]) - dt_util.utcnow() < timedelta(hours=1))
        if time.monotonic() - hit[0] < (60 if soon else 600):
            return hit[1]
    data = await _get(hass, "/schedule", {"sportId": 1, "teamId": team, "startDate": today.isoformat(),
                                          "endDate": (today + timedelta(days=NEXT_DAYS)).isoformat(), "hydrate": "linescore"})
    games = _games(data)
    todays = [g for g in games if g["start"] and dt_util.as_local(dt_util.parse_datetime(g["start"])).date() == today]
    # Today's game: the one being played, else the next one today, else the last one (final).
    game = next((g for g in todays if g["state"] == "Live"), None) or next((g for g in todays if g["state"] == "Preview"), None) \
        or (todays[-1] if todays else None)
    upcoming = next((g for g in games if g not in todays and g["state"] == "Preview"), None)
    result = {"team": team, "date": today.isoformat(), "game": game, "games": todays, "next": upcoming}
    cache[key] = (time.monotonic(), result)
    return result


async def async_team(hass: HomeAssistant, team: int) -> dict:
    """Schedule (next 3 weeks), division and wild-card tables, rivals and today's rooting guide."""
    today = dt_util.now().date()

    async def standings():
        data = await _get(hass, "/standings", {"leagueId": "103,104", "season": today.year, "standingsTypes": "regularSeason"})
        return data.get("records", [])

    async def schedule():
        return _games(await _get(hass, "/schedule", {"sportId": 1, "teamId": team, "startDate": today.isoformat(),
                                                     "endDate": (today + timedelta(days=21)).isoformat()}))

    async def league_today():
        return _games(await _get(hass, "/schedule", {"sportId": 1, "date": today.isoformat(), "hydrate": "linescore"}))

    async def season():
        data = await _get(hass, f"/seasons/{today.year}", {"sportId": 1})
        return (data.get("seasons") or [{}])[0]

    async def our_postseason():
        return _games(await _get(hass, "/schedule", {"sportId": 1, "teamId": team, "season": today.year,
                                                     "gameType": ",".join(POSTSEASON)}))

    out: dict[str, Any] = {"team": team, "errors": {}}
    jobs = {"standings": _cached(hass, f"standings-{today.year}", 900, standings),
            "schedule": _cached(hass, f"sched-{team}-{today}", 1800, schedule),
            "league_today": _cached(hass, f"league-{today}", 300, league_today),
            "season": _cached(hass, f"season-{today.year}", 6 * 3600, season),
            "postseason": _cached(hass, f"post-{team}-{today.year}", 300, our_postseason)}
    results = await asyncio.gather(*jobs.values(), return_exceptions=True)
    got = {}
    for name, res in zip(jobs, results):
        if isinstance(res, Exception):
            out["errors"][name] = str(res)
            got[name] = []
        else:
            got[name] = res
    table = build_standings(got["standings"])
    league, division = TEAMS[team][3], TEAMS[team][4]
    out["schedule"] = got["schedule"][:12]
    out["division"] = {"name": DIVISIONS[division], "rows": division_table(table, division)}
    out["wildcard"] = {"name": f"{LEAGUES[league]} wild card", "spots": WILD_CARDS, "rows": wildcard_table(table, league)}
    out["rivals"] = rivals(table, team)
    phase = season_phase(got["season"] or {}, today, got["league_today"])
    out["phase"] = phase
    if phase == "regular":
        out["rooting"] = rooting([g for g in got["league_today"] if g.get("type") in (None, "R")], table, team)
        out["rooting_note"] = None
        return out
    if "postseason" in out["errors"]:  # can't tell whether we're still in it: no advice rather than wrong advice
        out["rooting"], out["rooting_note"] = [], None
        return out
    status = postseason_status(got["postseason"], team)
    out["postseason"] = status
    games = [g for g in got["league_today"] if g.get("type") in POSTSEASON]
    if status in ("missed", "out"):
        out["rooting"] = division_rooting(games, team)
        why = "didn't make the postseason" if status == "missed" else "are out of the postseason"
        out["rooting_note"] = f"The {short(team)} {why}, so root for {DIVISIONS[TEAMS[team][4]]} teams."
    else:
        out["rooting"] = []
        out["rooting_note"] = ("World Series champions! 🏆" if status == "champions"
                               else f"The {short(team)} are still in the postseason: root for the {short(team)}!")
    if phase == "offseason":
        out["rooting_note"] = "The season's over. See you in spring training! ⚾" if status != "champions" else out["rooting_note"]
    return out


def season_phase(season: dict, today: date, league_today: list[dict]) -> str:
    """"regular", "postseason" or "offseason", from MLB's season dates (or today's game types)."""
    def day(key):
        try:
            return date.fromisoformat(str(season.get(key))[:10])
        except ValueError:
            return None
    reg_end, post_end = day("regularSeasonEndDate"), day("postSeasonEndDate")
    if reg_end is None:  # no season dates: go by today's games
        return "postseason" if any(g.get("type") in POSTSEASON for g in league_today) else "regular"
    if today <= reg_end:
        return "regular"
    if post_end is None or today <= post_end:
        return "postseason"
    return "offseason"


# ---------- websocket ----------

@callback
def async_register(hass: HomeAssistant) -> None:
    websocket_api.async_register_command(hass, ws_today)
    websocket_api.async_register_command(hass, ws_team)


def _team(hass: HomeAssistant) -> int | None:
    t = hass.data[DOMAIN]["store"].data["settings"].get("mlb_team", DEFAULT_TEAM)
    return int(t) if t and int(t) in TEAMS else None


@websocket_api.websocket_command({vol.Required("type"): "skylight/mlb/today"})
@websocket_api.async_response
async def ws_today(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    team = _team(hass)
    if team is None:
        connection.send_result(msg["id"], {"team": None})
        return
    try:
        connection.send_result(msg["id"], await async_today(hass, team))
    except MlbError as err:
        connection.send_result(msg["id"], {"team": team, "error": str(err), "game": None})


@websocket_api.websocket_command({vol.Required("type"): "skylight/mlb/team"})
@websocket_api.async_response
async def ws_team(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    team = _team(hass)
    if team is None:
        connection.send_result(msg["id"], {"team": None})
        return
    connection.send_result(msg["id"], await async_team(hass, team))
