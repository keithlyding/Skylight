"""Message board notes (no PIN, optional expiry) and event countdowns."""

from datetime import timedelta

import pytest
from homeassistant.core import HomeAssistant
from homeassistant.setup import async_setup_component
from homeassistant.util import dt as dt_util
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.skylight import notes


def test_expiry():
    now = dt_util.now().replace(hour=15)
    today_end = dt_util.parse_datetime(notes.expires_at("today", now))
    assert dt_util.as_local(today_end).date() == now.date() + timedelta(days=1) and today_end.hour == 0
    week_end = dt_util.parse_datetime(notes.expires_at("week", now))
    # Compare calendar days, not a timedelta: across a DST change the week is an hour short or long.
    assert dt_util.as_local(week_end).date() == dt_util.as_local(today_end).date() + timedelta(days=7) and week_end.hour == 0
    assert notes.expires_at("never", now) is None
    kept = notes.live_notes([{"id": "a", "expires": (now - timedelta(minutes=1)).isoformat()}, {"id": "b", "expires": None}], now)
    assert [n["id"] for n in kept] == ["b"]


@pytest.fixture
async def ws(hass: HomeAssistant, tmp_path, hass_ws_client):
    hass.config.config_dir = str(tmp_path)
    assert await async_setup_component(hass, "http", {})
    entry = MockConfigEntry(domain="skylight", data={})
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    return await hass_ws_client(hass)


async def _call(ws, msg, _id=[300]):
    _id[0] += 1
    await ws.send_json({"id": _id[0], **msg})
    return await ws.receive_json()


async def test_notes_without_pin(hass, ws):
    store = hass.data["skylight"]["store"]
    store.data["security"]["pin_hash"] = "x"  # a setup PIN is set; notes still work
    r = await _call(ws, {"type": "skylight/note/add", "text": "  Soccer moved to 5!  ", "expires": "today", "by": "sam"})
    assert r["success"] and r["result"]["text"] == "Soccer moved to 5!" and r["result"]["by"] == "sam"
    assert not (await _call(ws, {"type": "skylight/note/add", "text": "   "}))["success"]
    assert len(store.public()["notes"]) == 1
    assert (await _call(ws, {"type": "skylight/note/delete", "note_id": r["result"]["id"]}))["success"]
    assert store.data["notes"] == []


async def test_countdowns(hass, ws):
    store = hass.data["skylight"]["store"]
    start = (dt_util.now() + timedelta(days=20)).isoformat()
    r = await _call(ws, {"type": "skylight/countdown/set", "key": "", "countdown": {"summary": "Disney trip", "start": "2099-03-01", "all_day": True}})
    assert r["result"]["key"] == "Disney trip|2099-03-01"
    r = await _call(ws, {"type": "skylight/countdown/set", "key": "", "countdown": {"summary": "Recital", "start": start, "uid": "u1"}})
    assert r["result"]["key"] == "u1"
    assert set(store.data["countdowns"]) == {"Disney trip|2099-03-01", "u1"}
    # moved: old key replaced
    await _call(ws, {"type": "skylight/countdown/set", "key": "Disney trip|2099-03-01", "countdown": {"summary": "Disney trip", "start": "2099-03-02", "all_day": True}})
    assert "Disney trip|2099-03-02" in store.data["countdowns"] and "Disney trip|2099-03-01" not in store.data["countdowns"]
    # past events drop off
    store.data["countdowns"]["old"] = {"summary": "Old", "start": "2020-01-01", "all_day": True}
    await _call(ws, {"type": "skylight/countdown/set", "key": "u1", "countdown": None})
    assert set(store.data["countdowns"]) == {"Disney trip|2099-03-02"}
