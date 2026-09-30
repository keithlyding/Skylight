"""Extra weather data: Open-Meteo rain/comparisons/air quality and Google pollen."""

import pytest
from homeassistant.core import HomeAssistant
from homeassistant.setup import async_setup_component
from pytest_homeassistant_custom_component.common import MockConfigEntry

FORECAST = "https://api.open-meteo.com/v1/forecast"
ARCHIVE = "https://archive-api.open-meteo.com/v1/archive"
AIR = "https://air-quality-api.open-meteo.com/v1/air-quality"
POLLEN = "https://pollen.googleapis.com/v1/forecast:lookup"


@pytest.fixture
async def ws(hass: HomeAssistant, tmp_path, hass_ws_client):
    hass.config.config_dir = str(tmp_path)
    hass.config.latitude, hass.config.longitude = 39.7392, -104.9903
    assert await async_setup_component(hass, "http", {})
    entry = MockConfigEntry(domain="skylight", data={})
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    return await hass_ws_client(hass)


async def _call(ws, msg, _id=[900]):
    _id[0] += 1
    await ws.send_json({"id": _id[0], **msg})
    while True:
        r = await ws.receive_json()
        if r.get("id") == _id[0]:
            return r


async def test_extra_without_google(hass, ws, aioclient_mock):
    aioclient_mock.get(FORECAST, json={
        "minutely_15": {"time": ["2026-09-27T09:00", "2026-09-27T09:15"], "precipitation": [0, 0.02]},
        "daily": {"time": ["2026-09-26", "2026-09-27"], "temperature_2m_max": [70, 78],
                  "temperature_2m_min": [50, 55], "precipitation_sum": [0.1, 0]}})
    aioclient_mock.get(ARCHIVE, json={"daily": {"time": ["2025-09-27"], "temperature_2m_max": [81],
                                                 "temperature_2m_min": [60], "precipitation_sum": [0]}})
    aioclient_mock.get(AIR, json={"current": {"us_aqi": 42, "pm2_5": 8.1, "grass_pollen": None},
                                  "hourly": {"time": ["2026-09-27T09:00"], "us_aqi": [42]}})
    res = await _call(ws, {"type": "skylight/weather/extra"})
    assert res["success"], res
    r = res["result"]
    assert r["forecast"]["minutely"][1] == {"time": "2026-09-27T09:15", "precip": 0.02}
    assert r["forecast"]["days"][0]["high"] == 70
    assert r["last_year"]["high"] == 81
    assert r["air"]["aqi"] == 42 and r["air"]["eu_pollen"] == []
    assert r["pollen_source"] is None and "pollen" not in r
    assert not any(POLLEN in str(c[1]) for c in aioclient_mock.mock_calls)
    n = len(aioclient_mock.mock_calls)
    await _call(ws, {"type": "skylight/weather/extra"})  # cached
    assert len(aioclient_mock.mock_calls) == n


async def test_google_pollen_and_partial_failure(hass, ws, aioclient_mock):
    await _call(ws, {"type": "skylight/places/configure", "google_key": "k123"})
    aioclient_mock.get(FORECAST, status=500)
    aioclient_mock.get(ARCHIVE, json={"daily": {}})
    aioclient_mock.get(AIR, json={"current": {"us_aqi": 120}})
    aioclient_mock.get(POLLEN, json={"dailyInfo": [{"date": {"year": 2026, "month": 9, "day": 27}, "pollenTypeInfo": [
        {"code": "WEED", "displayName": "Weed", "inSeason": True, "indexInfo": {"value": 4, "category": "High"}}]}]})
    r = (await _call(ws, {"type": "skylight/weather/extra", "force": True}))["result"]
    assert r["forecast"] is None and "500" in r["errors"]["forecast"]
    assert r["air"]["aqi"] == 120 and r["last_year"] is None
    assert r["pollen"][0] == {"date": "2026-09-27", "types": [
        {"code": "WEED", "name": "Weed", "value": 4, "category": "High", "in_season": True}]}
    assert r["pollen_source"] == "google"


async def test_location_is_rounded_for_outside_services(hass, ws, aioclient_mock):
    """Only ~1 km precision leaves Home Assistant (privacy)."""
    for url in (FORECAST, ARCHIVE, AIR):
        aioclient_mock.get(url, json={})
    await _call(ws, {"type": "skylight/weather/extra", "force": True})
    sent = " ".join(str(c[1]) for c in aioclient_mock.mock_calls)
    assert "39.74" in sent and "-104.99" in sent and "39.7392" not in sent and "104.9903" not in sent
