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
ROLES = ("adult", "kid")


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
    # v1.29: every member is an adult or a kid. Guess from chores; the user confirms in Settings.
    members = data.get("members", [])
    if any(m.get("role") not in ROLES for m in members):
        with_chores = {c.get("member_id") for c in data.get("chores", [])}
        for m in members:
            if m.get("role") not in ROLES:
                m["role"] = "kid" if m.get("id") in with_chores else "adult"
        data.setdefault("settings", {})["roles_review"] = True
        _LOGGER.info("Skylight: set Adult/Kid for %d members from their chores; please check in Settings.", len(members))
        changed = True
    return changed


def clean_members(members: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Every member gets a valid role (new members default to adult)."""
    return [{**m, "role": m.get("role") if m.get("role") in ROLES else "adult"} for m in members]


def adult_ids(data: dict[str, Any]) -> set[str]:
    return {m["id"] for m in data.get("members", []) if m.get("role") == "adult"}


def clean_list_owners(lists: list[dict[str, Any]], adults: set[str]) -> list[dict[str, Any]]:
    """Only adults can own a list; anything else becomes Shared (no owner)."""
    out = []
    for lst in lists:
        lst = dict(lst)
        if lst.get("owner") not in adults:
            lst.pop("owner", None)
        out.append(lst)
    return out


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

    async def async_flush(self) -> None:
        """Write now (a pending delayed save would be lost on an integration reload)."""
        await self._store.async_save(self.data)

    @callback
    def _changed(self) -> None:
        self._store.async_delay_save(lambda: self.data, 1)
        self.hass.bus.async_fire(EVENT_UPDATED)

    async def async_set(self, key: str, value: Any) -> None:
        async with self._lock:
            if key == "settings":
                value = {**self.data["settings"], **value}
            elif key == "members":
                value = clean_members(value)
            elif key == "lists":
                value = clean_list_owners(value, adult_ids(self.data))
            elif key == "todo_owners":
                adults = adult_ids(self.data)
                value = {e: o for e, o in value.items() if isinstance(e, str) and o in adults}
            self.data[key] = value
            if key == "members":
                # A person who is no longer an adult can't own lists.
                adults = adult_ids(self.data)
                self.data["lists"] = clean_list_owners(self.data["lists"], adults)
                self.data["todo_owners"] = {e: o for e, o in self.data.get("todo_owners", {}).items() if o in adults}
            self._changed()

    async def async_move_list_item(
        self, list_id: str, item_id: str, to_index: int | None = None, direction: str | None = None
    ) -> int:
        """Reorder an open item within its list, atomically. Returns its new index among open items.

        Open items keep their order at the top of `items`; done items stay after them untouched.
        """
        async with self._lock:
            lst = next((l for l in self.data["lists"] if l.get("id") == list_id), None)
            if lst is None:
                raise KeyError(f"list {list_id}")
            open_items = [i for i in lst["items"] if not i.get("done")]
            done_items = [i for i in lst["items"] if i.get("done")]
            idx = next((n for n, i in enumerate(open_items) if i.get("id") == item_id), None)
            if idx is None:
                raise KeyError(f"open item {item_id}")
            if direction is not None:
                target = idx + (-1 if direction == "up" else 1)
            else:
                target = int(to_index)
            target = max(0, min(len(open_items) - 1, target))
            if target != idx:
                item = open_items.pop(idx)
                open_items.insert(target, item)
                lst["items"] = open_items + done_items
                self._changed()
            return target

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
