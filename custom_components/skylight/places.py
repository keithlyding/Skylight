"""Location lookup for the event dialog: business/place name -> address.

Uses Google Places (Text Search, New API) when an API key is configured,
otherwise the free OpenStreetMap-based Photon service. Results are biased
toward Home Assistant's home location. Requests go through Home Assistant so
the browser never sees the Google key.
"""

from __future__ import annotations

from typing import Any

import aiohttp
import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from . import security
from .const import DOMAIN, VERSION, coarse_location

PHOTON_URL = "https://photon.komoot.io/api/"
GOOGLE_URL = "https://places.googleapis.com/v1/places:searchText"
TIMEOUT = aiohttp.ClientTimeout(total=8)
LIMIT = 6


class PlacesError(Exception):
    """Lookup failed."""


def _photon_address(p: dict[str, Any]) -> str:
    street = " ".join(x for x in (p.get("housenumber"), p.get("street")) if x)
    parts = [street, p.get("city") or p.get("town") or p.get("village"), p.get("state"), p.get("postcode")]
    return ", ".join(x for x in parts if x)


async def _photon(hass: HomeAssistant, query: str) -> list[dict[str, str]]:
    params = {"q": query, "limit": str(LIMIT), "lang": "en"}
    if (home := coarse_location(hass)) is not None:
        params["lat"], params["lon"] = str(home[0]), str(home[1])
    session = async_get_clientsession(hass)
    try:
        async with session.get(PHOTON_URL, params=params, timeout=TIMEOUT,
                               headers={"User-Agent": f"HomeAssistant-LydingStrike/{VERSION}"}) as resp:
            if resp.status != 200:
                raise PlacesError(f"Address lookup returned HTTP {resp.status}")
            data = await resp.json(content_type=None)
    except (aiohttp.ClientError, TimeoutError) as err:
        raise PlacesError(f"Address lookup unavailable: {err}") from err
    out = []
    for f in data.get("features", []):
        p = f.get("properties", {})
        name = p.get("name") or " ".join(x for x in (p.get("housenumber"), p.get("street")) if x)
        address = _photon_address(p)
        if name or address:
            out.append({"name": name or address, "address": address})
    return out


async def _google(hass: HomeAssistant, key: str, query: str) -> list[dict[str, str]]:
    body: dict[str, Any] = {"textQuery": query, "pageSize": LIMIT}
    if (home := coarse_location(hass)) is not None:
        body["locationBias"] = {"circle": {
            "center": {"latitude": home[0], "longitude": home[1]},
            "radius": 50000.0,
        }}
    session = async_get_clientsession(hass)
    try:
        async with session.post(GOOGLE_URL, json=body, timeout=TIMEOUT, headers={
            "X-Goog-Api-Key": key,
            "X-Goog-FieldMask": "places.displayName,places.formattedAddress",
        }) as resp:
            data = await resp.json(content_type=None)
            if resp.status != 200:
                msg = (data or {}).get("error", {}).get("message", f"HTTP {resp.status}")
                raise PlacesError(f"Google Places: {msg}")
    except (aiohttp.ClientError, TimeoutError) as err:
        raise PlacesError(f"Google Places unavailable: {err}") from err
    return [
        {"name": p.get("displayName", {}).get("text", ""), "address": p.get("formattedAddress", "")}
        for p in data.get("places", [])
    ]


async def async_search(hass: HomeAssistant, query: str) -> dict[str, Any]:
    key = hass.data[DOMAIN]["store"].data["places"].get("google_key")
    if key:
        return {"provider": "google", "results": await _google(hass, key, query)}
    return {"provider": "osm", "results": await _photon(hass, query)}


@callback
def async_register(hass: HomeAssistant) -> None:
    websocket_api.async_register_command(hass, ws_search)
    websocket_api.async_register_command(hass, ws_configure)


@websocket_api.websocket_command(
    {vol.Required("type"): "skylight/places/search", vol.Required("query"): str}
)
@websocket_api.async_response
async def ws_search(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    query = msg["query"].strip()
    if len(query) < 3:
        connection.send_result(msg["id"], {"provider": None, "results": []})
        return
    try:
        connection.send_result(msg["id"], await async_search(hass, query))
    except PlacesError as err:
        connection.send_error(msg["id"], "places_error", str(err))


@websocket_api.websocket_command(
    {vol.Required("type"): "skylight/places/configure", vol.Required("google_key"): str}
)
@websocket_api.async_response
@security.gated
async def ws_configure(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    """Set (or clear, with an empty string) the Google Places API key."""
    await hass.data[DOMAIN]["store"].async_set_places_key(msg["google_key"].strip())
    connection.send_result(msg["id"])
