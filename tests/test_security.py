"""Phase 1 security: authenticated photos, upload switch, settings PIN."""

import time
from datetime import timedelta
from unittest.mock import patch

import aiohttp
import pytest
from homeassistant.components.http.auth import async_sign_path
from homeassistant.core import HomeAssistant
from homeassistant.setup import async_setup_component
from pytest_homeassistant_custom_component.common import MockConfigEntry

DOMAIN = "skylight"


@pytest.fixture
async def entry(hass: HomeAssistant, tmp_path):
    hass.config.config_dir = str(tmp_path)
    (tmp_path / ".storage").mkdir()
    assert await async_setup_component(hass, "http", {})
    e = MockConfigEntry(domain=DOMAIN, data={})
    e.add_to_hass(hass)
    assert await hass.config_entries.async_setup(e.entry_id)
    await hass.async_block_till_done()
    return e


async def _cmd(ws, msg, _id=[2000]):
    _id[0] += 1
    await ws.send_json({"id": _id[0], **msg})
    while True:
        r = await ws.receive_json()
        if r.get("id") == _id[0] and r["type"] == "result":
            return r


async def _upload(http) -> str:
    form = aiohttp.FormData()
    form.add_field("file", b"\xff\xd8photo", filename="pic.jpg", content_type="image/jpeg")
    resp = await http.post("/api/skylight/photo", data=form)
    assert resp.status == 200, await resp.text()
    return (await resp.json())["name"]


# ---------------------------------------------------------------- 1.1 photos
async def test_uploaded_photos_need_auth(hass, entry, hass_client, hass_client_no_auth, hass_ws_client):
    name = await _upload(await hass_client())
    anon = await hass_client_no_auth()
    assert (await anon.get(f"/api/skylight/photo_file/{name}")).status in (401, 404)
    assert (await anon.get(f"/skylight_photos/{name}")).status in (401, 404)

    ws = await hass_ws_client(hass)
    items = (await _cmd(ws, {"type": "skylight/photos/urls"}))["result"]["items"]
    url = next(i["url"] for i in items if i.get("name") == name)
    assert "authSig=" in url
    ok = await anon.get(url)  # the signed URL alone is enough, like the Immich proxy
    assert ok.status == 200 and await ok.read() == b"\xff\xd8photo"

    tampered = url[:-3] + ("aaa" if not url.endswith("aaa") else "bbb")
    assert (await anon.get(tampered)).status == 401
    other_file = url.replace(name, "0" * 24 + ".jpg")  # signature is for a different path
    assert (await anon.get(other_file)).status == 401

    expired = async_sign_path(hass, f"/api/skylight/photo_file/{name}", timedelta(seconds=-5))
    assert (await anon.get(expired)).status == 401

    # A logged-in client can't read files Skylight didn't store
    http = await hass_client()
    assert (await http.get("/api/skylight/photo_file/..%2F.storage%2Fskylight.data")).status in (400, 404)
    assert (await http.get("/api/skylight/photo_file/" + "f" * 24 + ".jpg")).status == 404


async def test_upload_switch(hass, entry, hass_client, hass_ws_client):
    http = await hass_client()
    name = await _upload(http)
    ws = await hass_ws_client(hass)
    assert (await _cmd(ws, {"type": "skylight/set", "key": "settings", "value": {"allow_uploads": False}}))["success"]
    form = aiohttp.FormData()
    form.add_field("file", b"\xff\xd8x", filename="b.jpg", content_type="image/jpeg")
    assert (await http.post("/api/skylight/photo", data=form)).status == 403
    assert (await http.get(f"/api/skylight/photo_file/{name}")).status == 200  # existing photos still show


# ---------------------------------------------------------------- 1.2 PIN
async def test_pin_gates_configuration(hass, entry, hass_ws_client):
    ws = await hass_ws_client(hass)
    # No PIN yet: everything is open
    assert (await _cmd(ws, {"type": "skylight/set", "key": "members", "value": []}))["success"]
    st = (await _cmd(ws, {"type": "skylight/security/status"}))["result"]
    assert st["pin_set"] is False and st["unlocked"] is True

    assert not (await _cmd(ws, {"type": "skylight/pin/set", "pin": "12"}))["success"]  # too short
    assert (await _cmd(ws, {"type": "skylight/pin/set", "pin": "4321"}))["success"]
    # PIN hash/salt never reach the browser
    data = (await _cmd(ws, {"type": "skylight/get"}))["result"]
    assert data["security"] == {"pin_set": True}
    stored = hass.data[DOMAIN]["store"].data["security"]
    assert stored["pin_hash"] and stored["pin_hash"] not in str(data) and stored["salt"] not in str(data)
    assert "4321" not in str(hass.data[DOMAIN]["store"].data)

    ws2 = await hass_ws_client(hass)  # another screen: locked
    for msg in (
        {"type": "skylight/set", "key": "members", "value": []},
        {"type": "skylight/set", "key": "settings", "value": {"clock_24h": True}},
        {"type": "skylight/set", "key": "chores", "value": []},
        {"type": "skylight/calendar/create", "name": "Soccer"},
        {"type": "skylight/calendar/subscribe", "name": "School", "url": "https://example.com/a.ics"},
        {"type": "skylight/immich/configure", "url": "http://x", "albums": [], "favorites": False},
        {"type": "skylight/immich/albums", "url": "http://x", "api_key": "k"},
        {"type": "skylight/places/configure", "google_key": "abc"},
        {"type": "skylight/photo/delete", "name": "x.jpg"},
    ):
        r = await _cmd(ws2, msg)
        assert not r["success"] and r["error"]["code"] == "locked", msg
    # Everyday actions stay open
    assert (await _cmd(ws2, {"type": "skylight/set", "key": "lists", "value": []}))["success"]
    assert (await _cmd(ws2, {"type": "skylight/set", "key": "meals", "value": {}}))["success"]
    assert hass.data[DOMAIN]["store"].data["settings"]["clock_24h"] is False

    # Unlock this connection only
    r = await _cmd(ws2, {"type": "skylight/unlock", "pin": "0000"})
    assert r["error"]["code"] == "wrong_pin"
    r = await _cmd(ws2, {"type": "skylight/unlock", "pin": "4321"})
    assert r["success"] and r["result"]["seconds_left"] == 300
    assert (await _cmd(ws2, {"type": "skylight/set", "key": "settings", "value": {"clock_24h": True}}))["success"]
    ws3 = await hass_ws_client(hass)
    assert (await _cmd(ws3, {"type": "skylight/set", "key": "members", "value": []}))["error"]["code"] == "locked"

    # Expiry: jump the clock past the unlock window
    real = time.monotonic
    with patch("custom_components.skylight.security.time.monotonic", lambda: real() + 301):
        assert (await _cmd(ws2, {"type": "skylight/set", "key": "members", "value": []}))["error"]["code"] == "locked"
    # Explicit relock (leaving Settings / screensaver)
    assert (await _cmd(ws2, {"type": "skylight/lock"}))["success"]
    assert (await _cmd(ws2, {"type": "skylight/set", "key": "members", "value": []}))["error"]["code"] == "locked"

    # Changing the PIN needs the current one
    assert (await _cmd(ws2, {"type": "skylight/pin/set", "pin": "5555"}))["error"]["code"] == "wrong_pin"
    assert (await _cmd(ws2, {"type": "skylight/pin/set", "pin": "5555", "current": "4321"}))["success"]
    assert (await _cmd(ws3, {"type": "skylight/unlock", "pin": "4321"}))["error"]["code"] == "wrong_pin"
    assert (await _cmd(ws3, {"type": "skylight/unlock", "pin": "5555"}))["success"]


async def test_lockout_after_five_wrong(hass, entry, hass_ws_client):
    ws = await hass_ws_client(hass)
    await _cmd(ws, {"type": "skylight/pin/set", "pin": "2468"})
    ws2 = await hass_ws_client(hass)
    codes = [(await _cmd(ws2, {"type": "skylight/unlock", "pin": "1111"}))["error"]["code"] for _ in range(5)]
    assert codes == ["wrong_pin"] * 4 + ["lockout"]
    r = await _cmd(ws2, {"type": "skylight/unlock", "pin": "2468"})  # even the right PIN waits
    assert r["error"]["code"] == "lockout" and "try again in 5 min" in r["error"]["message"]
    ws3 = await hass_ws_client(hass)  # reconnecting doesn't reset it
    assert (await _cmd(ws3, {"type": "skylight/unlock", "pin": "2468"}))["error"]["code"] == "lockout"
    real = time.monotonic
    with patch("custom_components.skylight.security.time.monotonic", lambda: real() + 301):
        assert (await _cmd(ws3, {"type": "skylight/unlock", "pin": "2468"}))["success"]


async def test_admin_options_flow_clears_pin(hass, entry, hass_ws_client):
    ws = await hass_ws_client(hass)
    await _cmd(ws, {"type": "skylight/pin/set", "pin": "13579"})
    assert hass.data[DOMAIN]["store"].data["security"]["pin_hash"]
    flow = await hass.config_entries.options.async_init(entry.entry_id)
    assert flow["type"] == "form" and flow["step_id"] == "init"
    res = await hass.config_entries.options.async_configure(flow["flow_id"], {"clear_pin": True})
    assert res["type"] == "create_entry"
    assert hass.data[DOMAIN]["store"].data["security"]["pin_hash"] == ""
    ws2 = await hass_ws_client(hass)
    assert (await _cmd(ws2, {"type": "skylight/set", "key": "members", "value": []}))["success"]


async def test_salt_created_for_existing_install(hass, tmp_path, hass_storage):
    """Upgrading from v1.26 (no 'security' key) creates a salt and keeps the data."""
    hass.config.config_dir = str(tmp_path)
    hass_storage["skylight.data"] = {"version": 1, "key": "skylight.data", "data": {
        "members": [{"id": "m1", "name": "Sam", "color": "#fff", "avatar": "🙂", "calendars": []}], "settings": {"clock_24h": True}}}
    assert await async_setup_component(hass, "http", {})
    e = MockConfigEntry(domain=DOMAIN, data={})
    e.add_to_hass(hass)
    assert await hass.config_entries.async_setup(e.entry_id)
    data = hass.data[DOMAIN]["store"].data
    assert data["members"][0]["name"] == "Sam" and data["settings"]["clock_24h"] is True
    assert len(data["security"]["salt"]) == 32 and data["security"]["pin_hash"] == ""
    assert data["settings"]["allow_uploads"] is True


# ---------------------------------------------------------------- Phase 2 migration
async def test_migration_removes_stars_and_rewards(hass, tmp_path, hass_storage, caplog):
    hass.config.config_dir = str(tmp_path)
    hass_storage["skylight.data"] = {"version": 1, "key": "skylight.data", "data": {
        "members": [{"id": "k1", "name": "Kid", "color": "#fff", "avatar": "🙂", "calendars": []}],
        "chores": [{"id": "c1", "member_id": "k1", "title": "Bed", "stars": 2, "repeat": "daily", "completions": ["2026-09-01"]}],
        "stars": {"k1": 12}, "rewards": [{"id": "r1", "title": "Movie", "cost": 5}]}}
    assert await async_setup_component(hass, "http", {})
    e = MockConfigEntry(domain=DOMAIN, data={})
    e.add_to_hass(hass)
    with caplog.at_level("INFO"):
        assert await hass.config_entries.async_setup(e.entry_id)
    data = hass.data[DOMAIN]["store"].data
    assert "stars" not in data and "rewards" not in data
    assert data["chores"][0] == {"id": "c1", "member_id": "k1", "title": "Bed", "repeat": "daily", "completions": ["2026-09-01"]}
    assert sum("removed stars and rewards" in r.message for r in caplog.records) == 1


# ---------------------------------------------------------------- backup / restore
async def test_backup_export_and_import(hass, entry, hass_ws_client, hass_client, tmp_path):
    ws = await hass_ws_client(hass)
    store = hass.data[DOMAIN]["store"]
    await _cmd(ws, {"type": "skylight/places/configure", "google_key": "GKEY123"})
    await _cmd(ws, {"type": "skylight/immich/configure", "url": "http://immich.local", "api_key": "IKEY456", "albums": ["a"], "favorites": True})
    await _cmd(ws, {"type": "skylight/set", "key": "members", "value": [
        {"id": "z", "name": "Kid One", "color": "#123456", "avatar": "x", "calendars": [], "role": "kid"}]})
    photo = await _upload(await hass_client())
    await _cmd(ws, {"type": "skylight/pin/set", "pin": "2468"})

    b = (await _cmd(ws, {"type": "skylight/backup/export"}))["result"]
    text = str(b)
    assert b["skylight_backup"] == 1 and b["data"]["members"][0]["name"] == "Kid One"
    for secret in ("GKEY123", "IKEY456", store.data["security"]["pin_hash"], store.data["security"]["salt"]):
        assert secret not in text
    assert b["data"]["immich"]["url"] == "http://immich.local" and photo in b["data"]["photos"]

    # locked screens can neither export nor import
    ws2 = await hass_ws_client(hass)
    assert (await _cmd(ws2, {"type": "skylight/backup/export"}))["error"]["code"] == "locked"
    assert (await _cmd(ws2, {"type": "skylight/backup/import", "backup": b}))["error"]["code"] == "locked"

    # change things, then restore
    await _cmd(ws, {"type": "skylight/set", "key": "members", "value": []})
    b["data"]["photos"].append("f" * 24 + ".jpg")  # a photo file that isn't here
    b["data"]["stars"] = {"z": 5}                   # an old-format key: migrated away
    r = await _cmd(ws, {"type": "skylight/backup/import", "backup": b})
    assert r["success"], r
    assert [m["name"] for m in store.data["members"]] == ["Kid One"]
    assert store.data["photos"] == [photo] and "stars" not in store.data
    # secrets are untouched by the import
    assert store.data["places"]["google_key"] == "GKEY123" and store.data["immich"]["api_key"] == "IKEY456"
    assert store.data["security"]["pin_hash"]
    # the data from before the import was saved
    import json as _json
    before = _json.loads((tmp_path / ".storage" / "skylight.data.before_import").read_text())
    assert before["data"]["members"] == []

    assert (await _cmd(ws, {"type": "skylight/backup/import", "backup": {"hello": 1}}))["error"]["code"] == "invalid"


def test_display_tokens_are_kept_plain():
    """Avatars, icons, emoji and colors go straight into the page, so they can never be markup."""
    from custom_components.skylight.store import clean_chores, clean_members, clean_occasions, safe_color, safe_token
    bad = '<img src=x onerror="x()">'
    assert safe_token(bad) == "img src=" and safe_token("🧑‍🚀") == "🧑‍🚀" and safe_token(None) == ""
    assert safe_color("#A1b2C3", "#000") == "#A1b2C3" and safe_color("red; background:url(x)", "#000") == "#000"
    m = clean_members([{"id": "a", "name": "A", "avatar": bad, "color": "javascript:alert(1)"}])[0]
    assert "<" not in m["avatar"] and m["color"] == "#4a7dff"
    assert clean_chores([{"id": "c", "icon": bad}])[0]["icon"] == safe_token(bad)
    o = clean_occasions([{"id": "o", "title": "T", "month": 5, "day": 1, "emoji": bad}], set())[0]
    assert "<" not in o["emoji"]
