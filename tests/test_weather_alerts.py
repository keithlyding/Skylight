"""Weather alerts from api.weather.gov."""

import pytest
from homeassistant.core import HomeAssistant
from homeassistant.setup import async_setup_component
from pytest_homeassistant_custom_component.common import MockConfigEntry

URL = "https://api.weather.gov/alerts/active"


@pytest.fixture
async def ws(hass: HomeAssistant, tmp_path, hass_ws_client):
    hass.config.config_dir = str(tmp_path)
    hass.config.latitude, hass.config.longitude = 39.7392, -104.9903
    assert await async_setup_component(hass, "http", {})
    entry = MockConfigEntry(domain="skylight", data={})
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    return await hass_ws_client(hass)


async def _alerts(ws, force=False, _id=[700]):
    _id[0] += 1
    await ws.send_json({"id": _id[0], "type": "skylight/weather/alerts", "force": force})
    while True:
        r = await ws.receive_json()
        if r.get("id") == _id[0]:
            return r


def _feature(event, severity, ends="2026-09-27T19:45:00-04:00"):
    return {"id": event, "properties": {"event": event, "severity": severity, "urgency": "Immediate",
            "headline": f"{event} issued", "areaDesc": "Denver, CO", "description": "Details...",
            "instruction": "Move indoors.", "senderName": "NWS Boulder CO",
            "effective": "2026-09-27T18:00:00-04:00", "ends": ends}}


async def test_alerts_sorted_and_cached(hass, ws, aioclient_mock):
    aioclient_mock.get(URL, json={"features": [_feature("Heat Advisory", "Minor"), _feature("Severe Thunderstorm Warning", "Severe")]})
    res = await _alerts(ws)
    assert res["success"], res
    alerts = res["result"]["alerts"]
    assert [a["event"] for a in alerts] == ["Severe Thunderstorm Warning", "Heat Advisory"]  # most severe first
    assert alerts[0]["instruction"] == "Move indoors." and alerts[0]["area"] == "Denver, CO"
    call = aioclient_mock.mock_calls[0]
    assert "point=39.74%2C-104.99" in str(call[1]) or "point=39.74,-104.99" in str(call[1])  # rounded to ~1 km
    assert "Skylight" in call[3]["User-Agent"]
    await _alerts(ws)  # cached: no second request
    assert len(aioclient_mock.mock_calls) == 1
    await _alerts(ws, force=True)
    assert len(aioclient_mock.mock_calls) == 2


async def test_outside_us_is_unsupported(hass, ws, aioclient_mock):
    aioclient_mock.get(URL, status=400, json={"title": "Bad Request"})
    res = (await _alerts(ws))["result"]
    assert res["supported"] is False and res["alerts"] == [] and res["error"] is None


async def test_service_down_reports_error(hass, ws, aioclient_mock):
    aioclient_mock.get(URL, status=503)
    res = (await _alerts(ws))["result"]
    assert res["alerts"] == [] and "503" in res["error"]
