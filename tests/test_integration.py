"""End-to-end tests against a real Home Assistant core (pytest-homeassistant-custom-component)."""

from datetime import date

import aiohttp
import pytest
from pytest_homeassistant_custom_component.common import MockConfigEntry

from homeassistant.core import HomeAssistant
from homeassistant.setup import async_setup_component

DOMAIN = "skylight"


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


async def test_config_flow(hass: HomeAssistant) -> None:
    result = await hass.config_entries.flow.async_init(DOMAIN, context={"source": "user"})
    assert result["type"] == "form"
    result = await hass.config_entries.flow.async_configure(result["flow_id"], {})
    assert result["type"] == "create_entry"


async def test_panel_registered(hass: HomeAssistant, setup) -> None:
    panels = hass.data["frontend_panels"]
    assert "skylight" in panels
    assert panels["skylight"].require_admin is False


async def test_websocket_flow(hass: HomeAssistant, setup, hass_ws_client) -> None:
    client = await hass_ws_client(hass)
    await client.send_json({"id": 1, "type": "skylight/subscribe"})
    assert (await client.receive_json())["success"]
    first = await client.receive_json()
    assert first["event"]["lists"][0]["name"] == "Groceries"

    member = {"id": "a", "name": "Alex", "color": "#f00", "avatar": "x", "calendars": []}
    await client.send_json({"id": 2, "type": "skylight/set", "key": "members", "value": [member]})
    assert (await client.receive_json())["event"]["members"][0]["name"] == "Alex"
    assert (await client.receive_json())["success"]

    chore = {"id": "c", "member_id": "a", "title": "Bed", "stars": 3, "repeat": "daily", "completions": []}
    await client.send_json({"id": 3, "type": "skylight/set", "key": "chores", "value": [chore]})
    await client.receive_json(); await client.receive_json()

    today = date.today().isoformat()
    await client.send_json({"id": 4, "type": "skylight/chore/toggle", "chore_id": "c", "date": today})
    ev = await client.receive_json()
    assert ev["event"]["stars"]["a"] == 3
    assert ev["event"]["chores"][0]["completions"] == [today]
    assert (await client.receive_json())["success"]

    reward = {"id": "r", "title": "Movie", "icon": "x", "cost": 5, "member_id": None}
    await client.send_json({"id": 5, "type": "skylight/set", "key": "rewards", "value": [reward]})
    await client.receive_json(); await client.receive_json()
    await client.send_json({"id": 6, "type": "skylight/reward/redeem", "reward_id": "r", "member_id": "a"})
    res = await client.receive_json()
    assert res["result"] == {"redeemed": False}

    await client.send_json({"id": 7, "type": "skylight/set", "key": "photos", "value": []})
    assert not (await client.receive_json())["success"]  # photos not editable wholesale


async def test_nonadmin_access(hass: HomeAssistant, setup, hass_ws_client, hass_read_only_access_token) -> None:
    client = await hass_ws_client(hass, hass_read_only_access_token)
    await client.send_json({"id": 1, "type": "skylight/get"})
    msg = await client.receive_json()
    assert msg["success"], msg
    await client.send_json({"id": 2, "type": "skylight/set", "key": "settings", "value": {"clock_24h": True}})
    assert (await client.receive_json())["success"]
    assert hass.data[DOMAIN]["store"].data["settings"]["clock_24h"] is True
    assert hass.data[DOMAIN]["store"].data["settings"]["week_start"] == 0  # merged, not replaced


async def test_create_local_calendar(hass: HomeAssistant, setup, hass_ws_client) -> None:
    client = await hass_ws_client(hass)
    await client.send_json({"id": 1, "type": "skylight/calendar/create", "name": "Soccer"})
    msg = await client.receive_json()
    assert msg["success"], msg
    await hass.async_block_till_done()
    assert hass.states.get("calendar.soccer") is not None


async def test_photo_upload_and_delete(hass: HomeAssistant, setup, hass_client, hass_ws_client, tmp_path) -> None:
    http = await hass_client()
    form = aiohttp.FormData()
    form.add_field("file", b"\xff\xd8fakejpeg", filename="pic.jpg", content_type="image/jpeg")
    resp = await http.post("/api/skylight/photo", data=form)
    assert resp.status == 200, await resp.text()
    name = (await resp.json())["name"]
    assert (tmp_path / "skylight_photos" / name).exists()

    served = await http.get(f"/skylight_photos/{name}")
    assert served.status == 200

    bad = aiohttp.FormData()
    bad.add_field("file", b"x", filename="evil.exe")
    assert (await http.post("/api/skylight/photo", data=bad)).status == 400

    ws = await hass_ws_client(hass)
    await ws.send_json({"id": 1, "type": "skylight/photo/delete", "name": name})
    assert (await ws.receive_json())["success"]
    assert not (tmp_path / "skylight_photos" / name).exists()


async def test_reload(hass: HomeAssistant, setup) -> None:
    assert await hass.config_entries.async_reload(setup.entry_id)
    await hass.async_block_till_done()
    assert "skylight" in hass.data["frontend_panels"]


async def test_ui_event_payloads_accepted(hass: HomeAssistant, setup, hass_ws_client, hass_client) -> None:
    """The exact event shapes skylight-panel.js sends to calendar/event/create."""
    ws = await hass_ws_client(hass)
    await ws.send_json({"id": 1, "type": "skylight/calendar/create", "name": "Family"})
    assert (await ws.receive_json())["success"]
    await hass.async_block_till_done()

    payloads = [
        {"summary": "Soccer", "dtstart": "2026-09-26T09:00:00-05:00", "dtend": "2026-09-26T10:00:00-05:00", "location": "Park"},
        {"summary": "Trip", "dtstart": "2026-09-27", "dtend": "2026-09-30"},
        {"summary": "Piano", "dtstart": "2026-09-28T15:00:00-05:00", "dtend": "2026-09-28T16:00:00-05:00", "rrule": "FREQ=WEEKLY"},
    ]
    for i, event in enumerate(payloads, start=2):
        await ws.send_json({"id": i, "type": "calendar/event/create", "entity_id": "calendar.family", "event": event})
        msg = await ws.receive_json()
        assert msg["success"], msg

    http = await hass_client()
    resp = await http.get("/api/calendars/calendar.family?start=2026-09-20T00:00:00Z&end=2026-10-15T00:00:00Z")
    events = await resp.json()
    names = [e["summary"] for e in events]
    assert names.count("Piano") >= 2  # weekly recurrence expanded
    assert "Soccer" in names and "Trip" in names

    piano = next(e for e in events if e["summary"] == "Piano")
    await ws.send_json({
        "id": 10, "type": "calendar/event/delete", "entity_id": "calendar.family",
        "uid": piano["uid"], "recurrence_id": piano["recurrence_id"],
    })
    assert (await ws.receive_json())["success"]


async def test_info_calendars_saved(hass: HomeAssistant, setup, hass_ws_client) -> None:
    client = await hass_ws_client(hass)
    value = [{"entity": "calendar.birthdays", "icon": "🎂", "color": "#9e9e9e"}]
    await client.send_json({"id": 1, "type": "skylight/set", "key": "info_calendars", "value": value})
    assert (await client.receive_json())["success"]
    store = hass.data["skylight"]["store"]
    assert store.data["info_calendars"] == value
    assert store.data["settings"]["info_on_today"] is True
