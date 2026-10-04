"""Tests for Immich photos, calendar feed subscription and recurring-event edits."""

import httpx
import pytest
import respx
from homeassistant.core import HomeAssistant
from homeassistant.setup import async_setup_component
from pytest_homeassistant_custom_component.common import MockConfigEntry

DOMAIN = "skylight"
IMMICH = "http://immich.local:2283"
A1 = "11111111-1111-1111-1111-111111111111"
A2 = "22222222-2222-2222-2222-222222222222"


@pytest.fixture
async def setup(hass: HomeAssistant, tmp_path):
    hass.config.config_dir = str(tmp_path)
    (tmp_path / ".storage").mkdir()
    assert await async_setup_component(hass, "http", {})
    entry = MockConfigEntry(domain=DOMAIN, data={})
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    return entry


async def _cmd(ws, msg, _id=[100]):
    _id[0] += 1
    await ws.send_json({"id": _id[0], **msg})
    while True:
        res = await ws.receive_json()
        if res.get("id") == _id[0] and res["type"] == "result":
            return res


# ---------------------------------------------------------------- Immich
async def test_immich_albums_photos_and_proxy(hass, setup, hass_ws_client, hass_client, aioclient_mock):
    aioclient_mock.get(f"{IMMICH}/api/albums", json=[
        {"id": "alb1", "albumName": "Family", "assetCount": 2},
        {"id": "alb2", "albumName": "Beach", "assetCount": 9},
    ])
    aioclient_mock.post(f"{IMMICH}/api/search/metadata", json={
        "assets": {"items": [{"id": A1}, {"id": A2}], "nextPage": None}})
    aioclient_mock.get(f"{IMMICH}/api/assets/{A1}/thumbnail", content=b"JPEGDATA",
                       headers={"Content-Type": "image/jpeg"})

    ws = await hass_ws_client(hass)
    res = await _cmd(ws, {"type": "skylight/immich/albums", "url": IMMICH, "api_key": "secret"})
    assert res["success"], res
    assert [a["name"] for a in res["result"]] == ["Beach", "Family"]
    assert aioclient_mock.mock_calls[0][3]["x-api-key"] == "secret"

    res = await _cmd(ws, {"type": "skylight/immich/configure", "url": IMMICH + "/", "api_key": "secret",
                          "albums": ["alb1"], "favorites": False})
    assert res["success"]

    # API key never leaves the server
    res = await _cmd(ws, {"type": "skylight/get"})
    assert "api_key" not in res["result"]["immich"]
    assert res["result"]["immich"]["has_key"] is True
    assert res["result"]["immich"]["url"] == IMMICH

    # Reconfigure without a key keeps the stored key
    await _cmd(ws, {"type": "skylight/immich/configure", "url": IMMICH, "albums": ["alb1"], "favorites": False})
    assert hass.data[DOMAIN]["store"].data["immich"]["api_key"] == "secret"

    res = await _cmd(ws, {"type": "skylight/photos/urls"})
    urls = res["result"]["urls"]
    assert res["result"]["error"] is None and len(urls) == 2
    assert all("authSig=" in u for u in urls)

    http = await hass_client()
    signed = next(u for u in urls if A1 in u)
    img = await http.get(signed)
    assert img.status == 200 and await img.read() == b"JPEGDATA"

    # ids not in the configured albums are refused
    other = "33333333-3333-3333-3333-333333333333"
    assert (await http.get(f"/api/skylight/immich/{other}")).status == 404


async def test_immich_older_server_fallback(hass, setup, hass_ws_client, aioclient_mock):
    aioclient_mock.post(f"{IMMICH}/api/search/metadata", status=400)
    aioclient_mock.get(f"{IMMICH}/api/albums/alb1", json={"assets": [
        {"id": A1, "type": "IMAGE"}, {"id": A2, "type": "VIDEO"}]})
    ws = await hass_ws_client(hass)
    await _cmd(ws, {"type": "skylight/immich/configure", "url": IMMICH, "api_key": "k", "albums": ["alb1"], "favorites": False})
    res = await _cmd(ws, {"type": "skylight/photos/urls"})
    assert len(res["result"]["urls"]) == 1  # video skipped


async def test_immich_bad_key_reported(hass, setup, hass_ws_client, aioclient_mock):
    aioclient_mock.get(f"{IMMICH}/api/albums", status=401)
    ws = await hass_ws_client(hass)
    res = await _cmd(ws, {"type": "skylight/immich/albums", "url": IMMICH, "api_key": "bad"})
    assert not res["success"] and "API key" in res["error"]["message"]


# ---------------------------------------------------------------- calendar feed (Plan to Eat)
PLAN_TO_EAT_ICS = """BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//EN
BEGIN:VEVENT
UID:meal-1
DTSTAMP:20260901T000000Z
DTSTART;VALUE=DATE:20260926
DTEND;VALUE=DATE:20260927
SUMMARY:Dinner: Chicken Tacos
END:VEVENT
END:VCALENDAR
"""


@respx.mock
async def test_subscribe_calendar_feed(hass, setup, hass_ws_client, hass_client):
    respx.get("https://www.plantoeat.com/feed/abc.ics").mock(return_value=httpx.Response(200, text=PLAN_TO_EAT_ICS))
    ws = await hass_ws_client(hass)
    res = await _cmd(ws, {"type": "skylight/calendar/subscribe", "name": "Plan to Eat",
                          "url": "webcal://www.plantoeat.com/feed/abc.ics"})
    assert res["success"], res
    await hass.async_block_till_done()
    assert hass.states.get("calendar.plan_to_eat") is not None

    res = await _cmd(ws, {"type": "skylight/set", "key": "meal_calendars", "value": ["calendar.plan_to_eat"]})
    assert res["success"]

    http = await hass_client()
    events = await (await http.get(
        "/api/calendars/calendar.plan_to_eat?start=2026-09-20T00:00:00Z&end=2026-10-01T00:00:00Z")).json()
    assert events[0]["summary"] == "Dinner: Chicken Tacos"


@respx.mock
async def test_subscribe_bad_feed_reports_error(hass, setup, hass_ws_client):
    respx.get("https://example.com/nope.ics").mock(return_value=httpx.Response(404))
    ws = await hass_ws_client(hass)
    res = await _cmd(ws, {"type": "skylight/calendar/subscribe", "name": "Nope", "url": "https://example.com/nope.ics"})
    assert not res["success"]


# ---------------------------------------------------------------- recurring edits
async def _weekly_series(hass, ws, http):
    await _cmd(ws, {"type": "skylight/calendar/create", "name": "Family"})
    await hass.async_block_till_done()
    res = await _cmd(ws, {"type": "calendar/event/create", "entity_id": "calendar.family", "event": {
        "summary": "Piano", "dtstart": "2026-09-07T15:00:00-05:00", "dtend": "2026-09-07T16:00:00-05:00",
        "rrule": "FREQ=WEEKLY"}})
    assert res["success"], res
    return await _events(http)


async def _events(http):
    resp = await http.get("/api/calendars/calendar.family?start=2026-09-01T00:00:00Z&end=2026-10-06T00:00:00Z")
    return sorted(await resp.json(), key=lambda e: e["start"]["dateTime"])


def _occ(events):
    return [(e["start"]["dateTime"][:16], e["summary"]) for e in events]


async def test_edit_this_event_only(hass, setup, hass_ws_client, hass_client):
    ws, http = await hass_ws_client(hass), await hass_client()
    evs = await _weekly_series(hass, ws, http)
    third = evs[2]
    # payload exactly as the UI sends for "This event" (no rrule)
    res = await _cmd(ws, {"type": "calendar/event/update", "entity_id": "calendar.family", "uid": third["uid"],
                          "recurrence_id": third["recurrence_id"], "event": {
                              "summary": "Piano recital", "dtstart": "2026-09-21T18:00:00-05:00",
                              "dtend": "2026-09-21T19:00:00-05:00"}})
    assert res["success"], res
    names = [s for _, s in _occ(await _events(http))]
    assert names == ["Piano", "Piano", "Piano recital", "Piano", "Piano"]


async def test_edit_this_and_following(hass, setup, hass_ws_client, hass_client):
    ws, http = await hass_ws_client(hass), await hass_client()
    evs = await _weekly_series(hass, ws, http)
    third = evs[2]
    res = await _cmd(ws, {"type": "calendar/event/update", "entity_id": "calendar.family", "uid": third["uid"],
                          "recurrence_id": third["recurrence_id"], "recurrence_range": "THISANDFUTURE",
                          "event": {"summary": "Guitar", "dtstart": "2026-09-21T15:00:00-05:00",
                                    "dtend": "2026-09-21T16:00:00-05:00", "rrule": "FREQ=WEEKLY"}})
    assert res["success"], res
    names = [s for _, s in _occ(await _events(http))]
    assert names == ["Piano", "Piano", "Guitar", "Guitar", "Guitar"]


async def test_edit_all_events(hass, setup, hass_ws_client, hass_client):
    ws, http = await hass_ws_client(hass), await hass_client()
    evs = await _weekly_series(hass, ws, http)
    # UI: user opened the 3rd occurrence, changed title+time; "All" re-anchors to the series start (Sep 7)
    res = await _cmd(ws, {"type": "calendar/event/update", "entity_id": "calendar.family", "uid": evs[2]["uid"],
                          "event": {"summary": "Piano (new time)", "dtstart": "2026-09-07T17:00:00-05:00",
                                    "dtend": "2026-09-07T18:00:00-05:00", "rrule": "FREQ=WEEKLY"}})
    assert res["success"], res
    occ = _occ(await _events(http))
    assert len(occ) == 5
    assert all(s == "Piano (new time)" for _, s in occ)
    assert occ[0][0].startswith("2026-09-07")


async def test_delete_scopes(hass, setup, hass_ws_client, hass_client):
    ws, http = await hass_ws_client(hass), await hass_client()
    evs = await _weekly_series(hass, ws, http)
    base = {"type": "calendar/event/delete", "entity_id": "calendar.family", "uid": evs[0]["uid"]}
    assert (await _cmd(ws, {**base, "recurrence_id": evs[1]["recurrence_id"]}))["success"]
    assert len(await _events(http)) == 4
    assert (await _cmd(ws, {**base, "recurrence_id": evs[3]["recurrence_id"], "recurrence_range": "THISANDFUTURE"}))["success"]
    assert len(await _events(http)) == 2
    assert (await _cmd(ws, base))["success"]
    assert await _events(http) == []


async def test_calendar_accounts(hass, setup, hass_ws_client):
    ws = await hass_ws_client(hass)
    await _cmd(ws, {"type": "skylight/calendar/create", "name": "Birthdays"})
    await hass.async_block_till_done()
    res = await _cmd(ws, {"type": "skylight/calendars"})
    cal = next(c for c in res["result"] if c["entity_id"] == "calendar.birthdays")
    assert cal["account"] == "Birthdays" and cal["integration"] == "local_calendar"


async def test_every_two_weeks_event(hass, setup, hass_ws_client, hass_client):
    ws, http = await hass_ws_client(hass), await hass_client()
    await _cmd(ws, {"type": "skylight/calendar/create", "name": "Family"})
    await hass.async_block_till_done()
    res = await _cmd(ws, {"type": "calendar/event/create", "entity_id": "calendar.family", "event": {
        "summary": "Recycling", "dtstart": "2026-10-02", "dtend": "2026-10-03", "rrule": "FREQ=WEEKLY;INTERVAL=2"}})
    assert res["success"], res
    evs = await (await http.get("/api/calendars/calendar.family?start=2026-10-01T00:00:00Z&end=2026-11-01T00:00:00Z")).json()
    assert [e["start"]["date"] for e in evs] == ["2026-10-02", "2026-10-16", "2026-10-30"]


@pytest.mark.parametrize(
    ("event", "expected"),
    [
        # Tue+Thu every 2 weeks, all-day, until Oct 29 (Sep 29 is a Tuesday)
        ({"dtstart": "2026-09-29", "dtend": "2026-09-30", "rrule": "FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,TH;UNTIL=20261029"},
         ["2026-09-29", "2026-10-01", "2026-10-13", "2026-10-15", "2026-10-27", "2026-10-29"]),
        # Mon/Wed/Fri every 3 weeks, timed, 5 times
        ({"dtstart": "2026-09-28T16:00:00-04:00", "dtend": "2026-09-28T17:00:00-04:00", "rrule": "FREQ=WEEKLY;INTERVAL=3;BYDAY=MO,WE,FR;COUNT=5"},
         ["2026-09-28", "2026-09-30", "2026-10-02", "2026-10-19", "2026-10-21"]),
        # Weekly on Sat, timed, UNTIL as end of that local day (the form the panel sends)
        ({"dtstart": "2026-10-03T09:00:00-04:00", "dtend": "2026-10-03T10:00:00-04:00", "rrule": "FREQ=WEEKLY;BYDAY=SA;UNTIL=20261017T235959"},
         ["2026-10-03", "2026-10-10", "2026-10-17"]),
    ],
)
async def test_repeat_builder_rules(hass, setup, hass_ws_client, hass_client, event, expected):
    ws, http = await hass_ws_client(hass), await hass_client()
    await _cmd(ws, {"type": "skylight/calendar/create", "name": "Family"})
    await hass.async_block_till_done()
    res = await _cmd(ws, {"type": "calendar/event/create", "entity_id": "calendar.family", "event": {"summary": "Lesson", **event}})
    assert res["success"], res
    evs = await (await http.get("/api/calendars/calendar.family?start=2026-09-20T00:00:00Z&end=2026-12-31T00:00:00Z")).json()
    got = [(e["start"].get("date") or e["start"]["dateTime"])[:10] for e in evs]
    assert got == expected


# ---------------------------------------------------------------- slideshow captions
async def test_photo_captions_immich_and_upload(hass, setup, hass_ws_client, aioclient_mock):
    import io
    from PIL import Image

    aioclient_mock.post(f"{IMMICH}/api/search/metadata", json={"assets": {"nextPage": None, "items": [
        {"id": A1, "localDateTime": "2024-06-14T19:30:00.000Z",
         "exifInfo": {"city": "Estes Park", "state": "Colorado", "country": "United States of America"}},
        {"id": A2, "fileCreatedAt": "2023-12-25T08:00:00.000Z",
         "exifInfo": {"city": "Paris", "state": "Île-de-France", "country": "France"}}]}})
    aioclient_mock.get("https://photon.komoot.io/reverse", json={"features": [
        {"properties": {"city": "Boulder", "state": "Colorado", "country": "United States"}}]})

    # An uploaded JPEG with EXIF date taken and GPS (40.02 N, 105.27 W)
    img = Image.new("RGB", (8, 8), "red")
    exif = Image.Exif()
    exif.get_ifd(0x8769)[36867] = "2025:07:04 21:15:00"
    exif[0x8825] = {1: "N", 2: (40.0, 1.0, 12.0), 3: "W", 4: (105.0, 16.0, 12.0)}
    buf = io.BytesIO(); img.save(buf, "JPEG", exif=exif.tobytes())
    photo_dir = hass.config.path("skylight_photos")
    import os
    os.makedirs(photo_dir, exist_ok=True)
    with open(os.path.join(photo_dir, "aaaaaaaaaaaaaaaaaaaaaaaa.jpg"), "wb") as f:
        f.write(buf.getvalue())
    img.save(os.path.join(photo_dir, "bbbbbbbbbbbbbbbbbbbbbbbb.jpg"), "JPEG")  # no EXIF at all
    store = hass.data[DOMAIN]["store"]
    await store.async_add_photo("aaaaaaaaaaaaaaaaaaaaaaaa.jpg")
    await store.async_add_photo("bbbbbbbbbbbbbbbbbbbbbbbb.jpg")

    ws = await hass_ws_client(hass)
    await _cmd(ws, {"type": "skylight/immich/configure", "url": IMMICH, "api_key": "k", "albums": ["alb1"], "favorites": False})
    res = await _cmd(ws, {"type": "skylight/photos/urls"})
    assert res["success"], res
    items = {i["url"].split("?")[0].rsplit("/", 1)[-1]: i for i in res["result"]["items"]}
    assert items["aaaaaaaaaaaaaaaaaaaaaaaa.jpg"]["taken"] == "2025-07-04"
    assert items["aaaaaaaaaaaaaaaaaaaaaaaa.jpg"]["place"] == "Boulder, Colorado"
    assert items["bbbbbbbbbbbbbbbbbbbbbbbb.jpg"] == {**items["bbbbbbbbbbbbbbbbbbbbbbbb.jpg"], "taken": None, "place": None}
    assert items[A1]["taken"] == "2024-06-14" and items[A1]["place"] == "Estes Park, Colorado"
    assert items[A2]["taken"] == "2023-12-25" and items[A2]["place"] == "Paris, France"
    assert len(res["result"]["urls"]) == 4  # old field still there
    body = next(c[2] for c in aioclient_mock.mock_calls if "search/metadata" in str(c[1]))
    assert body["withExif"] is True
    lat = next(str(c[1]) for c in aioclient_mock.mock_calls if "photon" in str(c[1]))
    assert "lat=40.020" in lat and "lon=-105.270" in lat  # ~100 m precision is enough for a town name


def test_immich_people_names():
    from custom_components.skylight import immich
    meta = immich._meta({"id": "a", "localDateTime": "2025-07-04T10:00:00", "people": [
        {"name": "Alex"}, {"name": ""}, {"name": "Sam", "isHidden": True}, {"name": "Jordan"}, {"name": "Alex"}]})
    assert meta["people"] == ["Alex", "Jordan"]  # named, not hidden, once each
    assert immich._meta({"id": "b"})["people"] == []


async def test_immich_search_falls_back_when_people_fail(hass, monkeypatch):
    """Some Immich versions fail on withPeople: retry with exif only, then plain."""
    from custom_components.skylight import immich
    bodies = []

    async def fake_request(hass_, method, url, key, path, **kw):
        body = kw["json"]
        bodies.append(dict(body))
        if body.get("withPeople"):
            raise immich.ImmichError("HTTP 500")
        return {"assets": {"items": [{"id": "x", "exifInfo": {"city": "Paris", "country": "France"}}], "nextPage": None}}

    monkeypatch.setattr(immich, "_request", fake_request)
    found = await immich._search(hass, "http://immich", "k", {"isFavorite": True})
    assert [b.get("withPeople") for b in bodies] == [True, None]
    assert found == [{"id": "x", "taken": None, "place": "Paris, France", "people": []}]
