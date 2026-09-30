"""Active weather alerts for the home location from the US National Weather Service.

api.weather.gov is free and needs no key, only a descriptive User-Agent.
Outside the US it returns an error, and Skylight simply shows no alerts.
"""

from __future__ import annotations

import time
from typing import Any

import aiohttp
import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .const import DOMAIN, VERSION, coarse_location

NWS_ALERTS = "https://api.weather.gov/alerts/active"
CACHE_KEY = f"{DOMAIN}_alerts"
CACHE_SECONDS = 2 * 60
TIMEOUT = aiohttp.ClientTimeout(total=10)
SEVERITY_ORDER = {"Extreme": 0, "Severe": 1, "Moderate": 2, "Minor": 3, "Unknown": 4}


def _simplify(feature: dict[str, Any]) -> dict[str, Any]:
    p = feature.get("properties", {})
    return {
        "id": p.get("id") or feature.get("id"),
        "event": p.get("event", "Weather alert"),
        "headline": p.get("headline") or "",
        "severity": p.get("severity") or "Unknown",
        "urgency": p.get("urgency") or "",
        "certainty": p.get("certainty") or "",
        "area": p.get("areaDesc") or "",
        "description": p.get("description") or "",
        "instruction": p.get("instruction") or "",
        "sender": p.get("senderName") or "",
        "effective": p.get("onset") or p.get("effective"),
        "ends": p.get("ends") or p.get("expires"),
    }


async def async_get_alerts(hass: HomeAssistant, force: bool = False) -> dict[str, Any]:
    cache = hass.data.get(CACHE_KEY)
    if cache and not force and time.monotonic() - cache["at"] < CACHE_SECONDS:
        return cache["result"]
    home = coarse_location(hass)
    result: dict[str, Any] = {"supported": True, "alerts": [], "error": None}
    if home is None:
        return {**result, "supported": False}
    session = async_get_clientsession(hass)
    try:
        async with session.get(
            NWS_ALERTS, params={"point": f"{home[0]:.2f},{home[1]:.2f}"}, timeout=TIMEOUT,
            headers={"User-Agent": f"HomeAssistant-Skylight/{VERSION} (family display)", "Accept": "application/geo+json"},
        ) as resp:
            if resp.status in (400, 404):  # outside the NWS coverage area
                result["supported"] = False
            elif resp.status != 200:
                result["error"] = f"Weather alerts unavailable (HTTP {resp.status})"
            else:
                data = await resp.json(content_type=None)
                alerts = [_simplify(f) for f in data.get("features", [])]
                alerts.sort(key=lambda a: SEVERITY_ORDER.get(a["severity"], 9))
                result["alerts"] = alerts
    except (aiohttp.ClientError, TimeoutError) as err:
        result["error"] = f"Weather alerts unavailable: {err}"
    hass.data[CACHE_KEY] = {"at": time.monotonic(), "result": result}
    return result


@callback
def async_register(hass: HomeAssistant) -> None:
    websocket_api.async_register_command(hass, ws_alerts)


@websocket_api.websocket_command(
    {vol.Required("type"): "skylight/weather/alerts", vol.Optional("force", default=False): bool}
)
@websocket_api.async_response
async def ws_alerts(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    connection.send_result(msg["id"], await async_get_alerts(hass, msg["force"]))
