"""Location lookup: OpenStreetMap (Photon) by default, Google Places with a key."""

import pytest
from homeassistant.core import HomeAssistant
from homeassistant.setup import async_setup_component
from pytest_homeassistant_custom_component.common import MockConfigEntry

PHOTON = "https://photon.komoot.io/api/"
GOOGLE = "https://places.googleapis.com/v1/places:searchText"


@pytest.fixture
async def ws(hass: HomeAssistant, tmp_path, hass_ws_client):
    hass.config.config_dir = str(tmp_path)
    hass.config.latitude, hass.config.longitude = 39.1, -94.5
    assert await async_setup_component(hass, "http", {})
    entry = MockConfigEntry(domain="skylight", data={})
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    return await hass_ws_client(hass)


async def _cmd(ws, msg, _id=[900]):
    _id[0] += 1
    await ws.send_json({"id": _id[0], **msg})
    while True:
        r = await ws.receive_json()
        if r.get("id") == _id[0] and r["type"] == "result":
            return r


async def test_osm_default(hass, ws, aioclient_mock):
    aioclient_mock.get(PHOTON, json={"features": [
        {"properties": {"name": "Chick-fil-A", "housenumber": "123", "street": "Main St",
                        "city": "Springfield", "state": "Missouri", "postcode": "65806"}},
        {"properties": {"street": "Oak Ave", "housenumber": "9", "city": "Springfield"}},
    ]})
    res = await _cmd(ws, {"type": "skylight/places/search", "query": "chick fil a"})
    assert res["success"], res
    assert res["result"]["provider"] == "osm"
    assert res["result"]["results"][0] == {"name": "Chick-fil-A", "address": "123 Main St, Springfield, Missouri, 65806"}
    assert res["result"]["results"][1]["name"] == "9 Oak Ave"
    url = str(aioclient_mock.mock_calls[0][1])
    assert "lat=39.1" in url and "lon=-94.5" in url  # biased to home


async def test_short_query_skips_lookup(hass, ws, aioclient_mock):
    res = await _cmd(ws, {"type": "skylight/places/search", "query": "ab"})
    assert res["result"]["results"] == [] and not aioclient_mock.mock_calls


async def test_google_with_key_and_key_hidden(hass, ws, aioclient_mock):
    aioclient_mock.post(GOOGLE, json={"places": [
        {"displayName": {"text": "Riverside Park"}, "formattedAddress": "1 River Rd, Springfield, MO 65806, USA"}]})
    assert (await _cmd(ws, {"type": "skylight/places/configure", "google_key": "gkey"}))["success"]
    data = (await _cmd(ws, {"type": "skylight/get"}))["result"]
    assert data["places"] == {"has_google_key": True}  # key never sent to the browser
    res = await _cmd(ws, {"type": "skylight/places/search", "query": "riverside park"})
    assert res["result"]["provider"] == "google"
    assert res["result"]["results"] == [{"name": "Riverside Park", "address": "1 River Rd, Springfield, MO 65806, USA"}]
    call = aioclient_mock.mock_calls[-1]
    assert call[3]["X-Goog-Api-Key"] == "gkey"
    assert call[2]["locationBias"]["circle"]["center"] == {"latitude": 39.1, "longitude": -94.5}


async def test_google_error_reported(hass, ws, aioclient_mock):
    aioclient_mock.post(GOOGLE, status=403, json={"error": {"message": "API key not valid"}})
    await _cmd(ws, {"type": "skylight/places/configure", "google_key": "bad"})
    res = await _cmd(ws, {"type": "skylight/places/search", "query": "anything"})
    assert not res["success"] and "API key not valid" in res["error"]["message"]
