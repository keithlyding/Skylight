"""Weather for where a screen is ("📍 Here"), instead of Home Assistant's home weather entity.

A screen set to "Here" sends its location (rounded to about 1 km). Home Assistant asks Open-Meteo
(free, no key) for current conditions and the hourly/daily forecast, and returns them shaped like a
Home Assistant weather entity and its `weather.get_forecasts` response, so the panel draws them the
same way. The town name comes from Photon (OpenStreetMap), best effort.
"""

from __future__ import annotations

import asyncio
import time
from typing import Any

import aiohttp
import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .const import DOMAIN, VERSION

FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
REVERSE_URL = "https://photon.komoot.io/reverse"
CACHE_KEY = f"{DOMAIN}_wx_here"
CACHE_SECONDS = 10 * 60
TIMEOUT = aiohttp.ClientTimeout(total=10)
HEADERS = {"User-Agent": f"HomeAssistant-LydingStrike/{VERSION} (family display)"}


def condition(code: Any, is_day: Any = 1) -> str:
    """WMO weather code (Open-Meteo) → Home Assistant condition."""
    try:
        c = int(code)
    except (TypeError, ValueError):
        return "exceptional"
    if c == 0:
        return "sunny" if is_day not in (0, False) else "clear-night"
    if c in (1, 2):
        return "partlycloudy"
    if c == 3:
        return "cloudy"
    if c in (45, 48):
        return "fog"
    if c in (65, 82):
        return "pouring"
    if c in (66, 67):
        return "snowy-rainy"
    if c in (71, 73, 75, 77, 85, 86):
        return "snowy"
    if c in (95, 96, 99):
        return "lightning-rainy"
    if 51 <= c <= 82:
        return "rainy"
    return "exceptional"


def _offset(seconds: Any) -> str:
    s = int(seconds or 0)
    sign = "+" if s >= 0 else "-"
    s = abs(s)
    return f"{sign}{s // 3600:02d}:{s % 3600 // 60:02d}"


def shape(data: dict, metric: bool) -> dict[str, Any]:
    """Open-Meteo response → {state, attributes, daily, hourly} like a Home Assistant weather entity."""
    off = _offset(data.get("utc_offset_seconds"))
    cur = data.get("current") or {}
    h = data.get("hourly") or {}
    d = data.get("daily") or {}

    def col(block: dict, name: str, i: int):
        vals = block.get(name) or []
        return vals[i] if i < len(vals) else None

    hourly = [{
        "datetime": f"{t}:00{off}" if len(t) == 16 else f"{t}{off}",
        "condition": condition(col(h, "weather_code", i), col(h, "is_day", i)),
        "temperature": col(h, "temperature_2m", i),
        "precipitation_probability": col(h, "precipitation_probability", i),
        "precipitation": col(h, "precipitation", i),
        "wind_speed": col(h, "wind_speed_10m", i),
        "uv_index": col(h, "uv_index", i),
    } for i, t in enumerate(h.get("time") or [])]
    daily = [{
        "datetime": f"{t}T00:00:00{off}",
        "condition": condition(col(d, "weather_code", i)),
        "temperature": col(d, "temperature_2m_max", i), "templow": col(d, "temperature_2m_min", i),
        "precipitation_probability": col(d, "precipitation_probability_max", i),
        "precipitation": col(d, "precipitation_sum", i), "uv_index": col(d, "uv_index_max", i),
    } for i, t in enumerate(d.get("time") or [])]
    now_uv = next((x["uv_index"] for x in hourly if x["uv_index"] is not None), None)
    return {
        "state": condition(cur.get("weather_code"), cur.get("is_day")),
        "attributes": {
            "temperature": cur.get("temperature_2m"), "apparent_temperature": cur.get("apparent_temperature"),
            "humidity": cur.get("relative_humidity_2m"), "pressure": cur.get("pressure_msl"),
            "wind_speed": cur.get("wind_speed_10m"), "wind_bearing": cur.get("wind_direction_10m"),
            "uv_index": now_uv,
            "temperature_unit": "°C" if metric else "°F", "wind_speed_unit": "km/h" if metric else "mph",
            "precipitation_unit": "mm" if metric else "in", "pressure_unit": "hPa",
        },
        "daily": daily, "hourly": hourly,
    }


async def _get(hass: HomeAssistant, url: str, params: dict) -> dict:
    session = async_get_clientsession(hass)
    async with session.get(url, params=params, timeout=TIMEOUT, headers=HEADERS) as resp:
        if resp.status != 200:
            raise RuntimeError(f"HTTP {resp.status}")
        return await resp.json(content_type=None)


async def _place(hass: HomeAssistant, lat: float, lon: float) -> str | None:
    try:
        data = await _get(hass, REVERSE_URL, {"lat": lat, "lon": lon, "limit": 1})
        p = (data.get("features") or [{}])[0].get("properties") or {}
    except Exception:  # the name is only a nicety
        return None
    town = p.get("city") or p.get("town") or p.get("village") or p.get("county") or p.get("name")
    return ", ".join(x for x in (town, p.get("state")) if x) or None


async def async_here(hass: HomeAssistant, lat: float, lon: float) -> dict[str, Any]:
    lat, lon = round(lat, 2), round(lon, 2)  # about 1 km; also what's sent onward
    metric = hass.config.units.temperature_unit != "°F"
    key = f"{lat},{lon},{metric}"
    cache = hass.data.setdefault(CACHE_KEY, {})
    hit = cache.get(key)
    if hit and time.monotonic() - hit[0] < CACHE_SECONDS:
        return hit[1]
    params = {
        "latitude": lat, "longitude": lon, "timezone": "auto", "forecast_days": 10,
        "current": "temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,is_day,wind_speed_10m,wind_direction_10m,pressure_msl",
        "hourly": "temperature_2m,weather_code,precipitation_probability,precipitation,wind_speed_10m,is_day,uv_index",
        "daily": "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,uv_index_max",
        "temperature_unit": "celsius" if metric else "fahrenheit", "wind_speed_unit": "kmh" if metric else "mph",
        "precipitation_unit": "mm" if metric else "inch",
    }
    try:
        data, place = await asyncio.gather(_get(hass, FORECAST_URL, params), _place(hass, lat, lon))
    except (aiohttp.ClientError, TimeoutError, RuntimeError) as err:
        return {"error": f"Couldn't get the weather here: {err or type(err).__name__}"}
    out = {**shape(data, metric), "place": place, "lat": lat, "lon": lon}
    cache[key] = (time.monotonic(), out)
    if len(cache) > 50:
        cache.pop(next(iter(cache)))
    return out


@callback
def async_register(hass: HomeAssistant) -> None:
    websocket_api.async_register_command(hass, ws_here)


@websocket_api.websocket_command({
    vol.Required("type"): "skylight/weather/here",
    vol.Required("lat"): vol.All(vol.Coerce(float), vol.Range(min=-90, max=90)),
    vol.Required("lon"): vol.All(vol.Coerce(float), vol.Range(min=-180, max=180)),
})
@websocket_api.async_response
async def ws_here(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    connection.send_result(msg["id"], await async_here(hass, msg["lat"], msg["lon"]))
