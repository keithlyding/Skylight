"""Weather for where the screen is (Open-Meteo), shaped like a Home Assistant weather entity."""

import re

import pytest
from homeassistant.core import HomeAssistant
from homeassistant.setup import async_setup_component
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.skylight import weather_here

FORECAST = re.compile(r"^https://api\.open-meteo\.com/v1/forecast")
REVERSE = re.compile(r"^https://photon\.komoot\.io/reverse")
SAMPLE = {
    "utc_offset_seconds": -25200,
    "current": {"temperature_2m": 71.2, "apparent_temperature": 70, "relative_humidity_2m": 20, "weather_code": 0, "is_day": 1,
                "wind_speed_10m": 5, "wind_direction_10m": 180, "pressure_msl": 1012},
    "hourly": {"time": ["2026-10-13T14:00", "2026-10-13T15:00"], "temperature_2m": [71, 72], "weather_code": [0, 61],
               "precipitation_probability": [0, 40], "precipitation": [0, 0.1], "wind_speed_10m": [5, 6], "is_day": [1, 1], "uv_index": [6, 5]},
    "daily": {"time": ["2026-10-13", "2026-10-14"], "weather_code": [2, 95], "temperature_2m_max": [80, 75], "temperature_2m_min": [55, 52],
              "precipitation_probability_max": [10, 70], "precipitation_sum": [0, 0.4], "uv_index_max": [7, 4]},
}


def test_conditions():
    assert weather_here.condition(0, 1) == "sunny" and weather_here.condition(0, 0) == "clear-night"
    assert [weather_here.condition(c) for c in (2, 3, 45, 61, 65, 71, 95, None)] == [
        "partlycloudy", "cloudy", "fog", "rainy", "pouring", "snowy", "lightning-rainy", "exceptional"]


def test_shape():
    out = weather_here.shape(SAMPLE, metric=False)
    assert out["state"] == "sunny" and out["attributes"]["temperature"] == 71.2 and out["attributes"]["temperature_unit"] == "°F"
    assert out["hourly"][1] == {"datetime": "2026-10-13T15:00:00-07:00", "condition": "rainy", "temperature": 72,
                                "precipitation_probability": 40, "precipitation": 0.1, "wind_speed": 6, "uv_index": 5}
    assert out["daily"][1]["datetime"] == "2026-10-14T00:00:00-07:00" and out["daily"][1]["templow"] == 52
    assert out["attributes"]["uv_index"] == 6


@pytest.fixture
async def ws(hass: HomeAssistant, tmp_path, hass_ws_client):
    hass.config.config_dir = str(tmp_path)
    assert await async_setup_component(hass, "http", {})
    entry = MockConfigEntry(domain="skylight", data={})
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    return await hass_ws_client(hass)


async def test_ws_here(hass, ws, aioclient_mock):
    aioclient_mock.get(FORECAST, json=SAMPLE)
    aioclient_mock.get(REVERSE, json={"features": [{"properties": {"city": "Flagstaff", "state": "Arizona"}}]})
    await ws.send_json({"id": 1, "type": "skylight/weather/here", "lat": 35.198284, "lon": -111.651299})
    r = (await ws.receive_json())["result"]
    assert r["place"] == "Flagstaff, Arizona" and r["lat"] == 35.2 and r["lon"] == -111.65
    sent = aioclient_mock.mock_calls[0][1]
    assert "latitude=35.2" in str(sent) and "35.198" not in str(sent)  # only the rounded location leaves
    assert r["daily"][0]["condition"] == "partlycloudy"
