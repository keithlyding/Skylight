""""Leave by" times: drive time from home to an event's location, from Waze.

Uses Home Assistant's own Waze Travel Time integration (its `waze_travel_time.get_travel_times`
action, with live traffic). That action only exists once the Waze integration has been added in
Home Assistant (any destination will do), so without it this simply reports "not available".
Each destination is asked about at most every 10 minutes.
"""

from __future__ import annotations

import logging
import time
from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback

from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)

WAZE = "waze_travel_time"
SERVICE = "get_travel_times"
CACHE_KEY = f"{DOMAIN}_travel"
CACHE_SECONDS = 10 * 60
FAIL_SECONDS = 30 * 60  # don't keep asking about an address Waze can't find
MAX_PLACES = 6


def available(hass: HomeAssistant) -> bool:
    return hass.services.has_service(WAZE, SERVICE)


def best_minutes(response: Any) -> int | None:
    """Fastest route's drive time in whole minutes (Waze gives minutes)."""
    routes = (response or {}).get("routes") or []
    times = [float(r["duration"]) for r in routes if isinstance(r, dict) and r.get("duration") is not None]
    return round(min(times)) if times else None


async def drive_minutes(hass: HomeAssistant, destination: str, region: str) -> int | None:
    cache = hass.data.setdefault(CACHE_KEY, {})
    key = f"{region}|{destination.strip().lower()}"
    hit = cache.get(key)
    if hit and time.monotonic() - hit[0] < (CACHE_SECONDS if hit[1] is not None else FAIL_SECONDS):
        return hit[1]
    minutes = None
    try:
        resp = await hass.services.async_call(WAZE, SERVICE, {
            "origin": "zone.home", "destination": destination, "region": region, "realtime": True,
        }, blocking=True, return_response=True)
        minutes = best_minutes(resp)
    except Exception as err:  # bad address, Waze down: just no leave-by time for it
        _LOGGER.debug("Waze couldn't route to %s: %s", destination, err)
    cache[key] = (time.monotonic(), minutes)
    return minutes


@callback
def async_register(hass: HomeAssistant) -> None:
    websocket_api.async_register_command(hass, ws_leave_by)


@websocket_api.websocket_command({
    vol.Required("type"): "skylight/travel/times",
    vol.Required("places"): [str],
})
@websocket_api.async_response
async def ws_leave_by(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    """{available, minutes: {place: drive minutes or None}} for up to MAX_PLACES event locations."""
    settings = hass.data[DOMAIN]["store"].data["settings"]
    if settings.get("leave_by") is False or not available(hass):
        connection.send_result(msg["id"], {"available": available(hass), "minutes": {}})
        return
    region = str(settings.get("waze_region") or "us")
    places = list(dict.fromkeys(p.strip()[:300] for p in msg["places"] if p and p.strip()))[:MAX_PLACES]
    out = {p: await drive_minutes(hass, p, region) for p in places}  # one at a time: Waze dislikes bursts
    connection.send_result(msg["id"], {"available": True, "minutes": out})
