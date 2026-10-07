"""Family message board (sticky notes on the Today screen) and event countdowns.

Neither needs the setup PIN: anyone at the screen can post or remove a note, and tick "Show
countdown" on an event, the same as adding events.
"""

from __future__ import annotations

import secrets
from datetime import datetime, timedelta
from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback
from homeassistant.util import dt as dt_util

from .const import DOMAIN

MAX_NOTES = 30
MAX_TEXT = 300
EXPIRY = ("today", "tomorrow", "week", "never")
NOTE_COLORS = ("#fff3a8", "#ffd1dc", "#c8f0d0", "#cfe3ff", "#ffe0b8", "#e6d6ff")
MAX_COUNTDOWNS = 20


def expires_at(choice: str, now: datetime) -> str | None:
    """End of the chosen day (local), or None for "never"."""
    days = {"today": 0, "tomorrow": 1, "week": 7}.get(choice)
    if days is None:
        return None
    day = dt_util.as_local(now).date() + timedelta(days=days)
    end = datetime(day.year, day.month, day.day, tzinfo=dt_util.get_default_time_zone()) + timedelta(days=1)
    return end.isoformat()


def live_notes(notes: list[dict], now: datetime) -> list[dict]:
    return [n for n in notes if not n.get("expires") or dt_util.parse_datetime(n["expires"]) > now]


def live_countdowns(cds: dict[str, dict], now: datetime) -> dict[str, dict]:
    """Drop countdowns whose event started more than a day ago."""
    out = {}
    for key, cd in cds.items():
        start = dt_util.parse_datetime(cd.get("start") or "")
        if start is None:  # all-day: a plain date
            try:
                start = datetime.fromisoformat(cd["start"]).replace(tzinfo=dt_util.get_default_time_zone())
            except (KeyError, TypeError, ValueError):
                continue
        if start.tzinfo is None:
            start = start.replace(tzinfo=dt_util.get_default_time_zone())
        if start > now - timedelta(days=1):
            out[key] = cd
    return out


@callback
def async_register(hass: HomeAssistant) -> None:
    websocket_api.async_register_command(hass, ws_note_add)
    websocket_api.async_register_command(hass, ws_note_delete)
    websocket_api.async_register_command(hass, ws_countdown_set)


def _store(hass: HomeAssistant):
    return hass.data[DOMAIN]["store"]


@websocket_api.websocket_command({
    vol.Required("type"): "skylight/note/add",
    vol.Required("text"): str,
    vol.Optional("expires", default="never"): vol.In(EXPIRY),
    vol.Optional("color"): str,
    vol.Optional("by"): vol.Any(None, str),  # family member id
})
@callback
def ws_note_add(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    text = msg["text"].strip()[:MAX_TEXT]
    if not text:
        connection.send_error(msg["id"], "empty", "Write something first")
        return
    store = _store(hass)
    now = dt_util.utcnow()
    notes = live_notes(store.data.setdefault("notes", []), now)
    note = {
        "id": secrets.token_hex(4), "text": text, "created": now.isoformat(),
        "expires": expires_at(msg["expires"], now),
        "color": msg.get("color") if msg.get("color") in NOTE_COLORS else NOTE_COLORS[len(notes) % len(NOTE_COLORS)],
    }
    if msg.get("by"):
        note["by"] = str(msg["by"])[:40]
    store.data["notes"] = (notes + [note])[-MAX_NOTES:]
    store.changed()
    connection.send_result(msg["id"], note)


@websocket_api.websocket_command({vol.Required("type"): "skylight/note/delete", vol.Required("note_id"): str})
@callback
def ws_note_delete(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    store = _store(hass)
    store.data["notes"] = [n for n in live_notes(store.data.get("notes", []), dt_util.utcnow()) if n["id"] != msg["note_id"]]
    store.changed()
    connection.send_result(msg["id"])


@websocket_api.websocket_command({
    vol.Required("type"): "skylight/countdown/set",
    vol.Required("key"): str,  # the event's current countdown key ("" for none yet)
    vol.Optional("countdown"): vol.Any(None, {
        vol.Required("summary"): str, vol.Required("start"): str,
        vol.Optional("all_day", default=False): bool, vol.Optional("uid"): vol.Any(None, str),
        vol.Optional("emoji"): vol.Any(None, str),
    }),
})
@callback
def ws_countdown_set(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    """Show (or stop showing) a countdown to an event in the Today screen's Upcoming card."""
    store = _store(hass)
    cds = live_countdowns(store.data.setdefault("countdowns", {}), dt_util.utcnow())
    cds.pop(msg["key"], None)
    cd = msg.get("countdown")
    key = None
    if cd:
        cd = {"summary": cd["summary"][:200], "start": cd["start"][:40], "all_day": cd["all_day"],
              **({"uid": cd["uid"][:300]} if cd.get("uid") else {}), **({"emoji": cd["emoji"][:8]} if cd.get("emoji") else {})}
        key = cd.get("uid") or f'{cd["summary"]}|{cd["start"]}'
        cds[key] = cd
        if len(cds) > MAX_COUNTDOWNS:
            connection.send_error(msg["id"], "too_many", f"Up to {MAX_COUNTDOWNS} countdowns")
            return
    store.data["countdowns"] = cds
    store.changed()
    connection.send_result(msg["id"], {"key": key})
