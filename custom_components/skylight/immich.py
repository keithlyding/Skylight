"""Immich photo source: lists album/favorite assets and proxies images.

The Immich API key stays on the server. The browser only gets signed,
expiring URLs to /api/skylight/immich/<asset_id>, which this view proxies.
"""

from __future__ import annotations

import random
import re
import time
from datetime import timedelta
from typing import Any

import aiohttp
from aiohttp import web

from homeassistant.components.http import HomeAssistantView
from homeassistant.components.http.auth import async_sign_path
from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .const import DOMAIN

CACHE_KEY = f"{DOMAIN}_immich_cache"
CACHE_SECONDS = 30 * 60
MAX_ASSETS = 500
PAGE_SIZE = 250
ASSET_ID = re.compile(r"^[0-9a-fA-F-]{36}$")
TIMEOUT = aiohttp.ClientTimeout(total=30)


class ImmichError(Exception):
    """Immich is unreachable or rejected the request."""


async def _request(hass: HomeAssistant, method: str, url: str, key: str, path: str, **kwargs) -> Any:
    if not url or not key:
        raise ImmichError("Immich URL and API key are required")
    session = async_get_clientsession(hass)
    try:
        async with session.request(
            method, f"{url}/api{path}", headers={"x-api-key": key, "Accept": "application/json"},
            timeout=TIMEOUT, **kwargs,
        ) as resp:
            if resp.status in (401, 403):
                raise ImmichError("Immich rejected the API key")
            if resp.status >= 400:
                raise ImmichError(f"Immich returned HTTP {resp.status} for {path}")
            return await resp.json()
    except (aiohttp.ClientError, TimeoutError) as err:
        raise ImmichError(f"Cannot reach Immich at {url}: {err}") from err


async def async_list_albums(hass: HomeAssistant, url: str, key: str) -> list[dict[str, Any]]:
    albums = await _request(hass, "GET", url, key, "/albums")
    return sorted(
        ({"id": a["id"], "name": a.get("albumName", "?"), "count": a.get("assetCount", 0)} for a in albums),
        key=lambda a: a["name"].lower(),
    )


US_NAMES = {"united states", "united states of america", "usa", "us"}


def place_name(city: str | None, state: str | None, country: str | None) -> str | None:
    """'Estes Park, Colorado' in the US, 'Paris, France' elsewhere."""
    region = state if (country or "").strip().lower() in US_NAMES else (country or state)
    parts = [p for p in (city, region) if p]
    return ", ".join(dict.fromkeys(parts)) or None


def _meta(asset: dict[str, Any]) -> dict[str, Any]:
    """Date taken (local wall-clock, YYYY-MM-DD) and place for one Immich asset."""
    exif = asset.get("exifInfo") or {}
    taken = asset.get("localDateTime") or exif.get("dateTimeOriginal") or asset.get("fileCreatedAt")
    # People Immich recognized and that were given a name (hidden people left out).
    people = []
    for person in asset.get("people") or []:
        name = (person.get("name") or "").strip()
        if name and not person.get("isHidden") and name not in people:
            people.append(name)
    return {
        "id": asset["id"],
        "taken": str(taken)[:10] if taken else None,
        "place": place_name(exif.get("city"), exif.get("state"), exif.get("country")),
        "people": people[:8],
    }


async def _search(hass: HomeAssistant, url: str, key: str, criteria: dict[str, Any]) -> list[dict[str, Any]]:
    """Image assets (id, date taken, place, people) matching Immich metadata search criteria."""
    found: list[dict[str, Any]] = []
    page: int | None = 1
    # Ask for place names and people; some Immich versions reject or fail on these (withPeople has had
    # server errors), so step down: exif + people -> exif only -> plain.
    extras = [{"withExif": True, "withPeople": True}, {"withExif": True}, {}]
    level = 0
    while page and len(found) < MAX_ASSETS:
        body = {**criteria, "type": "IMAGE", "size": PAGE_SIZE, "page": page, **extras[level]}
        try:
            res = await _request(hass, "POST", url, key, "/search/metadata", json=body)
        except ImmichError:
            if level == len(extras) - 1:
                raise
            level += 1
            continue
        assets = res.get("assets", {})
        found += [_meta(a) for a in assets.get("items", [])]
        nxt = assets.get("nextPage")
        page = int(nxt) if nxt else None
    return found


async def _album_assets(hass: HomeAssistant, url: str, key: str, album_id: str) -> list[dict[str, Any]]:
    try:
        return await _search(hass, url, key, {"albumIds": [album_id]})
    except ImmichError:
        # Older Immich without albumIds search: assets are embedded in the album.
        album = await _request(hass, "GET", url, key, f"/albums/{album_id}")
        return [_meta(a) for a in album.get("assets", []) if a.get("type") == "IMAGE"]


async def async_assets(hass: HomeAssistant, cfg: dict[str, Any]) -> list[dict[str, Any]]:
    cache = hass.data.get(CACHE_KEY)
    if cache and time.monotonic() - cache["at"] < CACHE_SECONDS:
        return cache["assets"]
    found: list[dict[str, Any]] = []
    for album_id in cfg.get("albums", []):
        found += await _album_assets(hass, cfg["url"], cfg["api_key"], album_id)
    if cfg.get("favorites"):
        found += await _search(hass, cfg["url"], cfg["api_key"], {"isFavorite": True})
    assets = list({a["id"]: a for a in found}.values())  # de-duplicate
    random.shuffle(assets)
    assets = assets[:MAX_ASSETS]
    hass.data[CACHE_KEY] = {"at": time.monotonic(), "assets": assets, "allowed": {a["id"] for a in assets}}
    return assets


async def async_asset_ids(hass: HomeAssistant, cfg: dict[str, Any]) -> list[str]:
    return [a["id"] for a in await async_assets(hass, cfg)]


def invalidate(hass: HomeAssistant) -> None:
    hass.data.pop(CACHE_KEY, None)


async def async_signed_items(hass: HomeAssistant, store, refresh_token_id: str | None) -> list[dict[str, Any]]:
    """Slideshow items: signed proxy URL plus date taken, place and people."""
    cfg = store.data["immich"]
    if not cfg.get("url") or not (cfg.get("albums") or cfg.get("favorites")):
        return []
    return [
        {
            "url": async_sign_path(hass, f"/api/skylight/immich/{a['id']}", timedelta(hours=24), refresh_token_id=refresh_token_id),
            "taken": a.get("taken"), "place": a.get("place"), "people": a.get("people") or [],
        }
        for a in await async_assets(hass, cfg)
    ]


async def async_signed_urls(hass: HomeAssistant, store, refresh_token_id: str | None) -> list[str]:
    return [i["url"] for i in await async_signed_items(hass, store, refresh_token_id)]


class SkylightImmichView(HomeAssistantView):
    """Proxy an Immich preview image (auth via signed path)."""

    url = "/api/skylight/immich/{asset_id}"
    name = "api:skylight:immich"
    requires_auth = True

    async def get(self, request: web.Request, asset_id: str) -> web.StreamResponse:
        hass: HomeAssistant = request.app["hass"]
        cache = hass.data.get(CACHE_KEY)
        # Only proxy assets from the configured albums, never arbitrary ids.
        if not ASSET_ID.match(asset_id) or not cache or asset_id not in cache["allowed"]:
            return web.Response(status=404)
        cfg = hass.data[DOMAIN]["store"].data["immich"]
        session = async_get_clientsession(hass)
        try:
            async with session.get(
                f"{cfg['url']}/api/assets/{asset_id}/thumbnail",
                params={"size": "preview"},
                headers={"x-api-key": cfg["api_key"]},
                timeout=TIMEOUT,
            ) as resp:
                if resp.status != 200:
                    return web.Response(status=502)
                body = await resp.read()
                return web.Response(
                    body=body,
                    content_type=resp.content_type or "image/jpeg",
                    headers={"Cache-Control": "private, max-age=86400"},
                )
        except (aiohttp.ClientError, TimeoutError):
            return web.Response(status=504)
