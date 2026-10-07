"""Leave-by times: drive minutes from Home Assistant's Waze Travel Time action."""

import pytest
from homeassistant.core import HomeAssistant, SupportsResponse
from homeassistant.setup import async_setup_component
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.skylight import travel


def test_best_minutes():
    assert travel.best_minutes({"routes": [{"duration": 24.6}, {"duration": 21.2}]}) == 21
    assert travel.best_minutes({"routes": []}) is None
    assert travel.best_minutes(None) is None


@pytest.fixture
async def ws(hass: HomeAssistant, tmp_path, hass_ws_client):
    hass.config.config_dir = str(tmp_path)
    assert await async_setup_component(hass, "http", {})
    entry = MockConfigEntry(domain="skylight", data={})
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    return await hass_ws_client(hass)


async def _call(ws, places, _id=[500]):
    _id[0] += 1
    await ws.send_json({"id": _id[0], "type": "skylight/travel/times", "places": places})
    r = await ws.receive_json()
    assert r["success"], r
    return r["result"]


async def test_leave_by(hass, ws):
    assert await _call(ws, ["Main Park"]) == {"available": False, "minutes": {}}

    asked = []

    async def waze(call):
        asked.append(dict(call.data))
        if call.data["destination"] == "Nowhere":
            raise ValueError("no route")
        return {"routes": [{"name": "I-10", "duration": 22.4, "distance": 18.0}]}

    hass.services.async_register("waze_travel_time", "get_travel_times", waze, supports_response=SupportsResponse.ONLY)
    r = await _call(ws, ["Main Park", "Nowhere", "Main Park"])
    assert r == {"available": True, "minutes": {"Main Park": 22, "Nowhere": None}}
    assert asked[0] == {"origin": "zone.home", "destination": "Main Park", "region": "us", "realtime": True}
    await _call(ws, ["main park"])
    assert len(asked) == 2  # cached (also the failed one)

    hass.data["skylight"]["store"].data["settings"]["leave_by"] = False
    assert (await _call(ws, ["Main Park"]))["minutes"] == {}
