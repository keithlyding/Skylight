"""Persistent storage for Skylight family data."""

from __future__ import annotations

import asyncio
import copy
import json
import logging
import secrets
from datetime import datetime, timezone
from datetime import date
from typing import Any

from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.storage import Store

from . import chores, security
from .const import DEFAULT_DATA, EVENT_UPDATED, STORAGE_KEY, STORAGE_VERSION, app_name

_LOGGER = logging.getLogger(__name__)


def _write_text(path: str, text: str) -> None:
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(text)
ROLES = ("adult", "kid", "home")  # home = Household (house maintenance etc.): has chores, not in Progress


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


OCCASION_TYPES = ("birthday", "anniversary", "other")
DAYS_IN_MONTH = (31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31)  # Feb 29 allowed (shown Feb 28 in other years)


def clean_date(value: Any) -> dict[str, int] | None:
    """{"month", "day", "year"?} if it's a real calendar day, else None."""
    if not isinstance(value, dict):
        return None
    try:
        month, day = int(value["month"]), int(value["day"])
        year = int(value["year"]) if value.get("year") not in (None, "") else None
    except (KeyError, TypeError, ValueError):
        return None
    if not 1 <= month <= 12 or not 1 <= day <= DAYS_IN_MONTH[month - 1]:
        return None
    if year is not None and not 1900 <= year <= 2200:
        year = None
    if year is not None and month == 2 and day == 29 and not (year % 4 == 0 and (year % 100 != 0 or year % 400 == 0)):
        return None
    return {"month": month, "day": day, **({"year": year} if year is not None else {})}


def clean_members(members: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Every member gets a valid role (new members default to adult) and a valid or no birthday."""
    out = []
    for m in members:
        m = {**m, "role": m.get("role") if m.get("role") in ROLES else "adult"}
        bday = clean_date(m.get("birthday"))
        if bday:
            m["birthday"] = bday
        else:
            m.pop("birthday", None)
        out.append(m)
    return out


def clean_occasions(occasions: list[Any], member_ids: set[str]) -> list[dict[str, Any]]:
    out = []
    for o in occasions:
        if not isinstance(o, dict) or not str(o.get("title", "")).strip() or not o.get("id"):
            continue
        when = clean_date(o)
        if not when:
            continue
        rec = {"id": str(o["id"]), "title": str(o["title"]).strip()[:80],
               "type": o.get("type") if o.get("type") in OCCASION_TYPES else "other", **when}
        members = [m for m in o.get("members") or [] if m in member_ids]
        if members:
            rec["members"] = members
        if o.get("emoji"):
            rec["emoji"] = str(o["emoji"])[:8]
        out.append(rec)
    return out


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

    # ----- backup / restore -----
    SECRET_KEYS = ("security", "places")  # never exported, never overwritten by an import

    def export(self) -> dict[str, Any]:
        """Everything a family set up, without API keys or the PIN hash."""
        data = copy.deepcopy({k: v for k, v in self.data.items() if k not in self.SECRET_KEYS})
        data["immich"] = {k: v for k, v in data.get("immich", {}).items() if k != "api_key"}
        return data

    async def async_import(self, incoming: dict[str, Any], keep_photos: set[str]) -> str:
        """Replace family data with a backup. The current data is written to a side file first.

        Secrets (PIN, API keys) stay as they are. Returns the side file's path.
        """
        data = copy.deepcopy(incoming)
        for k in self.SECRET_KEYS:
            data.pop(k, None)
        migrate(data)
        async with self._lock:
            before = self.hass.config.path(".storage", "skylight.data.before_import")
            snapshot = json.dumps({"version": STORAGE_VERSION, "key": STORAGE_KEY, "data": self.data}, indent=2)
            await self.hass.async_add_executor_job(_write_text, before, snapshot)
            new = copy.deepcopy(DEFAULT_DATA)
            for key in new:
                if key in data and isinstance(data[key], type(new[key])):
                    new[key] = data[key]
            new["settings"] = {**DEFAULT_DATA["settings"], **(data.get("settings") or {})}
            new["members"] = clean_members(new["members"])
            new["lists"] = clean_list_owners(new["lists"], adult_ids(new))
            new["occasions"] = clean_occasions(new["occasions"], {m["id"] for m in new["members"]})
            new["photos"] = [p for p in new["photos"] if p in keep_photos]  # only files that are really here
            new["immich"] = {**new["immich"], "api_key": self.data["immich"].get("api_key", "")}
            for k in self.SECRET_KEYS:
                new[k] = self.data[k]
            self.data = new
            self._changed()
        return before

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
                if "app_name" in value:
                    value["app_name"] = app_name({"settings": value})
            elif key == "members":
                value = clean_members(value)
            elif key == "lists":
                value = clean_list_owners(value, adult_ids(self.data))
            elif key == "occasions":
                value = clean_occasions(value, {m["id"] for m in self.data["members"]})
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

    # ----- list edits: one item at a time, under the lock, so two screens never overwrite each other -----
    def _list(self, list_id: str) -> dict[str, Any]:
        lst = next((l for l in self.data["lists"] if l.get("id") == list_id), None)
        if lst is None:
            raise KeyError(f"list {list_id}")
        return lst

    async def async_list_add_item(self, list_id: str, text: str, item_id: str | None = None) -> dict[str, Any]:
        """Add an open item (placed after the other open items)."""
        async with self._lock:
            lst = self._list(list_id)
            item = {"id": item_id or secrets.token_hex(6), "text": text.strip()[:500], "done": False}
            if any(i.get("id") == item["id"] for i in lst["items"]):
                raise ValueError(f"item {item['id']} exists")
            open_items = [i for i in lst["items"] if not i.get("done")]
            lst["items"] = open_items + [item] + [i for i in lst["items"] if i.get("done")]
            self._changed()
            return item

    async def async_list_update_item(self, list_id: str, item_id: str, text: str | None = None,
                                     done: bool | None = None) -> dict[str, Any]:
        """Rename and/or check/uncheck one item. Checking records when (done items show in that order)."""
        async with self._lock:
            lst = self._list(list_id)
            item = next((i for i in lst["items"] if i.get("id") == item_id), None)
            if item is None:
                raise KeyError(f"item {item_id}")
            if text is not None and text.strip():
                item["text"] = text.strip()[:500]
            if done is not None and bool(done) != bool(item.get("done")):
                item["done"] = bool(done)
                if done:
                    item["done_at"] = datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
                else:
                    item.pop("done_at", None)
                    # back among the open items, at the bottom
                    others = [i for i in lst["items"] if i is not item]
                    lst["items"] = [i for i in others if not i.get("done")] + [item] + [i for i in others if i.get("done")]
            self._changed()
            return item

    async def async_list_delete_items(self, list_id: str, item_ids: list[str] | None = None, done: bool = False) -> int:
        """Delete the given items, or (done=True) every checked item. Returns how many were removed."""
        async with self._lock:
            lst = self._list(list_id)
            ids = set(item_ids or [])
            keep = [i for i in lst["items"] if not (i.get("id") in ids or (done and i.get("done")))]
            removed = len(lst["items"]) - len(keep)
            if removed:
                lst["items"] = keep
                self._changed()
            return removed

    async def async_list_save(self, meta: dict[str, Any]) -> dict[str, Any]:
        """Create a list or change its name/color/owner. Items are never touched here."""
        async with self._lock:
            lst = next((l for l in self.data["lists"] if l.get("id") == meta.get("id")), None)
            if lst is None:
                lst = {"id": meta.get("id") or secrets.token_hex(6), "items": []}
                self.data["lists"].append(lst)
            lst["name"] = str(meta.get("name") or lst.get("name") or "List").strip()[:80]
            lst["color"] = str(meta.get("color") or lst.get("color") or "#4a7dff")
            if meta.get("owner") in adult_ids(self.data):
                lst["owner"] = meta["owner"]
            else:
                lst.pop("owner", None)
            self._changed()
            return {k: v for k, v in lst.items() if k != "items"}

    async def async_list_remove(self, list_id: str) -> None:
        async with self._lock:
            self._list(list_id)
            self.data["lists"] = [l for l in self.data["lists"] if l.get("id") != list_id]
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
