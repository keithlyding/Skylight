"""Persistent storage for Skylight family data."""

from __future__ import annotations

import asyncio
import copy
import logging
import secrets
from datetime import date
from typing import Any

from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.storage import Store

from . import chores, security
from .const import DEFAULT_DATA, EVENT_UPDATED, STORAGE_KEY, STORAGE_VERSION

_LOGGER = logging.getLogger(__name__)


def migrate(data: dict[str, Any]) -> bool:
    """Bring older stored data up to date in place. Returns True if anything changed."""
    changed = False
    # v1.28: stars and rewards were removed; chore completion history is kept.
    removed = [k for k in ("stars", "rewards") if k in data]
    for k in removed:
        data.pop(k)
    star_fields = 0
    for chore in data.get("chores", []):
        if "stars" in chore:
            chore.pop("stars")
            star_fields += 1
    if removed or star_fields:
        _LOGGER.info("Skylight: removed stars and rewards (%s; star values on %d chores). Chore history is kept.",
                     ", ".join(removed) or "no top-level keys", star_fields)
        changed = True
    return changed


class SkylightStore:
    """Holds all family data and notifies listeners on change."""

    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass
        self._store: Store[dict[str, Any]] = Store(hass, STORAGE_VERSION, STORAGE_KEY)
        self._lock = asyncio.Lock()
        self.data: dict[str, Any] = copy.deepcopy(DEFAULT_DATA)

    async def async_load(self) -> None:
        stored = await self._store.async_load()
        if stored:
            migrated = migrate(stored)
            for key, default in DEFAULT_DATA.items():
                if key not in stored:
                    stored[key] = copy.deepcopy(default)
            stored["settings"] = {**DEFAULT_DATA["settings"], **stored["settings"]}
            self.data = stored
            if migrated:
                self._store.async_delay_save(lambda: self.data, 1)
        if not self.data["security"].get("salt"):
            # New install or upgrade from before the settings PIN: make the per-install salt.
            self.data["security"] = {"salt": secrets.token_hex(16), "pin_hash": ""}
            self._store.async_delay_save(lambda: self.data, 1)

    def public(self) -> dict[str, Any]:
        """Data safe to send to any logged-in user (no API keys, no PIN hash or salt)."""
        data = dict(self.data)
        data["security"] = {"pin_set": bool(data["security"].get("pin_hash"))}
        immich = dict(data["immich"])
        immich["has_key"] = bool(immich.pop("api_key", ""))
        data["immich"] = immich
        data["places"] = {"has_google_key": bool(data["places"].get("google_key"))}
        return data

    async def async_set_pin(self, pin: str | None) -> None:
        """Store a new PIN hash, or clear the PIN with None."""
        salt = self.data["security"]["salt"]
        digest = await self.hass.async_add_executor_job(security.hash_pin, pin, salt) if pin else ""
        async with self._lock:
            self.data["security"] = {"salt": salt, "pin_hash": digest}
            self._changed()

    async def async_set_places_key(self, key: str) -> None:
        async with self._lock:
            self.data["places"] = {"google_key": key}
            self._changed()

    async def async_set_immich(self, url: str, api_key: str | None, albums: list, favorites: bool) -> None:
        async with self._lock:
            current = self.data["immich"]
            self.data["immich"] = {
                "url": url.rstrip("/"),
                "api_key": current.get("api_key", "") if api_key is None else api_key,
                "albums": albums,
                "favorites": favorites,
            }
            self._changed()

    @callback
    def _changed(self) -> None:
        self._store.async_delay_save(lambda: self.data, 1)
        self.hass.bus.async_fire(EVENT_UPDATED)

    async def async_set(self, key: str, value: Any) -> None:
        async with self._lock:
            if key == "settings":
                value = {**self.data["settings"], **value}
            self.data[key] = value
            self._changed()

    async def async_toggle_chore(self, chore_id: str, on: date) -> bool:
        async with self._lock:
            chore = next((c for c in self.data["chores"] if c["id"] == chore_id), None)
            if chore is None:
                raise KeyError(chore_id)
            done = chores.toggle(chore, on)
            self._changed()
            return done

    async def async_add_photo(self, name: str) -> None:
        async with self._lock:
            self.data["photos"].append(name)
            self._changed()

    async def async_remove_photo(self, name: str) -> None:
        async with self._lock:
            self.data["photos"] = [p for p in self.data["photos"] if p != name]
            self._changed()
