"""Persistent storage for Skylight family data."""

from __future__ import annotations

import asyncio
import copy
from datetime import date
from typing import Any

from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.storage import Store

from . import chores
from .const import DEFAULT_DATA, EVENT_UPDATED, STORAGE_KEY, STORAGE_VERSION


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
            for key, default in DEFAULT_DATA.items():
                if key not in stored:
                    stored[key] = copy.deepcopy(default)
            stored["settings"] = {**DEFAULT_DATA["settings"], **stored["settings"]}
            self.data = stored

    def public(self) -> dict[str, Any]:
        """Data safe to send to any logged-in user (no Immich API key)."""
        data = dict(self.data)
        immich = dict(data["immich"])
        immich["has_key"] = bool(immich.pop("api_key", ""))
        data["immich"] = immich
        data["places"] = {"has_google_key": bool(data["places"].get("google_key"))}
        return data

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
            if key == "members":
                ids = {m["id"] for m in value}
                self.data["stars"] = {k: v for k, v in self.data["stars"].items() if k in ids}
            self._changed()

    async def async_toggle_chore(self, chore_id: str, on: date) -> None:
        async with self._lock:
            chore = next((c for c in self.data["chores"] if c["id"] == chore_id), None)
            if chore is None:
                raise KeyError(chore_id)
            delta = chores.toggle(chore, on)
            self._adjust(chore["member_id"], delta)
            self._changed()

    def _adjust(self, member_id: str, delta: int) -> None:
        stars = self.data["stars"]
        stars[member_id] = max(0, int(stars.get(member_id, 0)) + delta)

    async def async_adjust_stars(self, member_id: str, delta: int) -> None:
        async with self._lock:
            self._adjust(member_id, delta)
            self._changed()

    async def async_redeem(self, reward_id: str, member_id: str) -> bool:
        async with self._lock:
            reward = next((r for r in self.data["rewards"] if r["id"] == reward_id), None)
            if reward is None:
                raise KeyError(reward_id)
            cost = int(reward.get("cost", 0))
            if int(self.data["stars"].get(member_id, 0)) < cost:
                return False
            self._adjust(member_id, -cost)
            reward.setdefault("history", []).append(
                {"member_id": member_id, "date": date.today().isoformat()}
            )
            reward["history"] = reward["history"][-50:]
            self._changed()
            return True

    async def async_add_photo(self, name: str) -> None:
        async with self._lock:
            self.data["photos"].append(name)
            self._changed()

    async def async_remove_photo(self, name: str) -> None:
        async with self._lock:
            self.data["photos"] = [p for p in self.data["photos"] if p != name]
            self._changed()
