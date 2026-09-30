"""Extra weather data for the Weather tab and the Today screen's hints.

- Open-Meteo (free, no key): 15-minute rain for the next 2 hours, the past
  30 days (for comparisons), the same day last year, and air quality.
- Google Pollen API (optional): tree/grass/weed pollen, using the Google key
  already saved for location lookup. Open-Meteo's pollen covers Europe only.

Everything is fetched by Home Assistant, so the Google key never reaches the
browser. Each source fails on its own; the rest of the result still returns.
"""

from __future__ import annotations

import asyncio
import time
from datetime import date, timedelta
from typing import Any

import aiohttp
import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .const import DOMAIN, VERSION, coarse_location

FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
AIR_URL = "https://air-quality-api.open-meteo.com/v1/air-quality"
POLLEN_URL = "https://pollen.googleapis.com/v1/forecast:lookup"
CACHE_KEY = f"{DOMAIN}_wx_extra"
CACHE_SECONDS = 10 * 60
TIMEOUT = aiohttp.ClientTimeout(total=10)
HEADERS = {"User-Agent": f"HomeAssistant-Skylight/{VERSION} (family display)"}
EU_POLLEN = ["alder_pollen", "birch_pollen", "grass_pollen", "mugwort_pollen", "olive_pollen", "ragweed_pollen"]


class _Err(Exception):
    """One source failed."""


async def _get(hass: HomeAssistant, url: str, params: dict[str, Any]) -> dict[str, Any]:
    session = async_get_clientsession(hass)
    try:
        async with session.get(url, params=params, timeout=TIMEOUT, headers=HEADERS) as resp:
            if resp.status != 200:
                raise _Err(f"HTTP {resp.status}")
            return await resp.json(content_type=None)
    except (aiohttp.ClientError, TimeoutError) as err:
        raise _Err(str(err) or type(err).__name__) from err


def _units(hass: HomeAssistant) -> dict[str, str]:
    metric = hass.config.units.temperature_unit != "°F"
    return {"temperature_unit": "celsius" if metric else "fahrenheit",
            "precipitation_unit": "mm" if metric else "inch"}


async def _forecast(hass: HomeAssistant, lat: float, lon: float) -> dict[str, Any]:
    data = await _get(hass, FORECAST_URL, {
        "latitude": lat, "longitude": lon, "timezone": "auto",
        "minutely_15": "precipitation", "forecast_minutely_15": 8,
        "daily": "temperature_2m_max,temperature_2m_min,precipitation_sum",
        "past_days": 30, "forecast_days": 2, **_units(hass),
    })
    m = data.get("minutely_15") or {}
    d = data.get("daily") or {}
    return {
        "minutely": [{"time": t, "precip": p} for t, p in zip(m.get("time", []), m.get("precipitation", []))],
        "days": [{"date": t, "high": hi, "low": lo, "precip": p} for t, hi, lo, p in zip(
            d.get("time", []), d.get("temperature_2m_max", []), d.get("temperature_2m_min", []), d.get("precipitation_sum", []))],
        "utc_offset": data.get("utc_offset_seconds"),
    }


async def _last_year(hass: HomeAssistant, lat: float, lon: float) -> dict[str, Any] | None:
    try:
        day = date.today().replace(year=date.today().year - 1)
    except ValueError:  # Feb 29
        day = date.today() - timedelta(days=365)
    data = await _get(hass, ARCHIVE_URL, {
        "latitude": lat, "longitude": lon, "timezone": "auto", "start_date": day.isoformat(), "end_date": day.isoformat(),
        "daily": "temperature_2m_max,temperature_2m_min,precipitation_sum", **_units(hass),
    })
    d = data.get("daily") or {}
    if not d.get("time"):
        return None
    return {"date": d["time"][0], "high": d.get("temperature_2m_max", [None])[0],
            "low": d.get("temperature_2m_min", [None])[0], "precip": d.get("precipitation_sum", [None])[0]}


async def _air(hass: HomeAssistant, lat: float, lon: float) -> dict[str, Any]:
    data = await _get(hass, AIR_URL, {
        "latitude": lat, "longitude": lon, "timezone": "auto", "forecast_days": 2,
        "current": "us_aqi,pm2_5,pm10,ozone," + ",".join(EU_POLLEN),
        "hourly": "us_aqi",
    })
    cur = data.get("current") or {}
    h = data.get("hourly") or {}
    pollen = [{"code": k.replace("_pollen", ""), "value": cur[k]} for k in EU_POLLEN if cur.get(k) is not None]
    return {
        "aqi": cur.get("us_aqi"), "pm2_5": cur.get("pm2_5"), "pm10": cur.get("pm10"), "ozone": cur.get("ozone"),
        "hourly": [{"time": t, "aqi": v} for t, v in zip(h.get("time", []), h.get("us_aqi", [])) if v is not None],
        "eu_pollen": pollen,
    }


async def _google_pollen(hass: HomeAssistant, key: str, lat: float, lon: float) -> list[dict[str, Any]]:
    data = await _get(hass, POLLEN_URL, {
        "key": key, "location.latitude": f"{lat:.2f}", "location.longitude": f"{lon:.2f}", "days": 3,
        "plantsDescription": "false",
    })
    days = []
    for d in data.get("dailyInfo", []):
        dt = d.get("date") or {}
        types = []
        for p in d.get("pollenTypeInfo", []):
            idx = p.get("indexInfo") or {}
            types.append({"code": p.get("code"), "name": p.get("displayName") or p.get("code"),
                          "value": idx.get("value"), "category": idx.get("category"), "in_season": p.get("inSeason")})
        days.append({"date": f"{dt.get('year', 0):04d}-{dt.get('month', 0):02d}-{dt.get('day', 0):02d}", "types": types})
    return days


async def async_get_extra(hass: HomeAssistant, force: bool = False) -> dict[str, Any]:
    cache = hass.data.get(CACHE_KEY)
    if cache and not force and time.monotonic() - cache["at"] < CACHE_SECONDS:
        return cache["result"]
    home = coarse_location(hass)
    if home is None:
        return {"errors": {"location": "Home location isn't set in Home Assistant"}, "pollen_source": None,
                "forecast": None, "last_year": None, "air": None}
    lat, lon = home
    key = hass.data[DOMAIN]["store"].data.get("places", {}).get("google_key")
    jobs = {"forecast": _forecast(hass, lat, lon), "last_year": _last_year(hass, lat, lon), "air": _air(hass, lat, lon)}
    if key:
        jobs["pollen"] = _google_pollen(hass, key, lat, lon)
    results = await asyncio.gather(*jobs.values(), return_exceptions=True)
    out: dict[str, Any] = {"errors": {}, "pollen_source": "google" if key else None}
    for name, res in zip(jobs, results):
        if isinstance(res, Exception):
            out[name] = None
            out["errors"][name] = str(res)
        else:
            out[name] = res
    hass.data[CACHE_KEY] = {"at": time.monotonic(), "result": out}
    return out


@callback
def async_register(hass: HomeAssistant) -> None:
    websocket_api.async_register_command(hass, ws_extra)


@websocket_api.websocket_command(
    {vol.Required("type"): "skylight/weather/extra", vol.Optional("force", default=False): bool}
)
@websocket_api.async_response
async def ws_extra(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    connection.send_result(msg["id"], await async_get_extra(hass, msg["force"]))
