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
