"""Event reminders, sent by Home Assistant.

Home Assistant can't attach a reminder to a calendar event (create_event has no alarm field), so
reminders live here: the event editor stores {calendar, event uid or summary+start, who, when}.
Every minute this looks up the event's real start time in its calendar (so edits made in Google
still count) and, when a reminder is due:

- sends a push notification to each phone (notify.mobile_app_*) that opted in under Setup →
  Reminders, either for all events or only for chosen family members, and
- fires a `skylight_reminder` event that screens running the panel show as a pop-up (each screen
  chooses for itself in Setup).

Each reminder is sent once (remembered for a few days, across restarts).
"""

from __future__ import annotations

import logging
from datetime import date, datetime, timedelta
from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.event import async_track_time_interval
from homeassistant.util import dt as dt_util

from .const import DOMAIN, app_name

_LOGGER = logging.getLogger(__name__)

EVENT_REMINDER = "skylight_reminder"
CHECK_EVERY = timedelta(minutes=1)
REFRESH_EVERY = timedelta(minutes=10)  # how often calendars are read again
LOOK_AHEAD = timedelta(days=2)  # reminders are at most 1 day (or "the evening before") ahead
LATE_OK = timedelta(minutes=15)  # still send if Home Assistant was busy/restarting for a bit
EVENING = 19  # "the evening before" = 7 PM the day before
# Choices offered in the event editor: minutes before the start, or "eve".
CHOICES = ("0", "5", "10", "15", "30", "60", "120", "1440", "eve")


def fire_time(start: datetime, remind: str) -> datetime:
    """When a reminder for an event starting at `start` (aware) goes off."""
    if remind == "eve":
        day = (start - timedelta(days=1)).date()
        return datetime(day.year, day.month, day.day, EVENING, tzinfo=start.tzinfo)
    return start - timedelta(minutes=int(remind))


def _as_dt(value: date | datetime) -> datetime:
    """Event start as an aware datetime (all-day events start at local midnight)."""
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=dt_util.get_default_time_zone())
    return datetime(value.year, value.month, value.day, tzinfo=dt_util.get_default_time_zone())


def _when_text(start: datetime, all_day: bool, now: datetime) -> str:
    local = dt_util.as_local(start)
    days = (local.date() - dt_util.as_local(now).date()).days
    day = "Today" if days == 0 else "Tomorrow" if days == 1 else local.strftime("%A")
    if all_day:
        return f"{day} (all day)"
    t = local.strftime("%I:%M %p").lstrip("0")
    return f"{day} at {t}"


def clean_meta(value: Any) -> dict[str, Any] | None:
    """One stored reminder, or None if it isn't valid."""
    if not isinstance(value, dict) or str(value.get("remind")) not in CHOICES:
        return None
    entity = str(value.get("entity") or "")
    if not entity.startswith("calendar."):
        return None
    out = {"entity": entity, "remind": str(value["remind"]),
           "summary": str(value.get("summary") or "")[:200],
           "members": [str(m) for m in (value.get("members") or [])][:20]}
    if value.get("uid"):
        out["uid"] = str(value["uid"])[:300]
    if value.get("start"):
        out["start"] = str(value["start"])[:40]
    return out if out.get("uid") or (out["summary"] and out.get("start")) else None


def meta_key(meta: dict[str, Any]) -> str:
    return meta["uid"] if meta.get("uid") else f'{meta["entity"]}|{meta["summary"]}|{meta["start"]}'


class Reminders:
    def __init__(self, hass: HomeAssistant, store) -> None:
        self.hass = hass
        self.store = store
        self._occurrences: list[tuple[str, dict[str, Any], datetime, bool, str | None]] = []
        self._refreshed: datetime | None = None
        self._busy = False

    @callback
    def async_start(self):
        return async_track_time_interval(self.hass, self._tick, CHECK_EVERY)

    @callback
    def invalidate(self) -> None:
        self._refreshed = None

    async def _events(self, entity_id: str, start: datetime, end: datetime) -> list:
        component = self.hass.data.get("calendar")
        entity = component.get_entity(entity_id) if component else None
        if entity is None:
            return []
        try:
            return await entity.async_get_events(self.hass, start, end)
        except Exception as err:  # a calendar being offline must not stop the others
            _LOGGER.debug("Reminders: couldn't read %s: %s", entity_id, err)
            return []

    async def refresh(self, now: datetime) -> None:
        """Find the real start time of every event that has a reminder."""
        metas = self.store.data.get("event_meta", {})
        occ = []
        by_entity: dict[str, list[tuple[str, dict]]] = {}
        for key, meta in metas.items():
            by_entity.setdefault(meta["entity"], []).append((key, meta))
        changed = False
        for entity_id, items in by_entity.items():
            events = await self._events(entity_id, now - LATE_OK, now + LOOK_AHEAD)
            for key, meta in items:
                for ev in events:
                    start = _as_dt(ev.start)
                    if meta.get("uid"):
                        hit = ev.uid == meta["uid"]
                    else:  # saved from the panel before the calendar gave the event an id
                        hit = ev.summary == meta["summary"] and start == dt_util.parse_datetime(meta["start"])
                        if hit and ev.uid and not ev.rrule:
                            meta["uid"] = ev.uid  # remember it, so later edits in Google still match
                            changed = True
                    if hit:
                        all_day = not isinstance(ev.start, datetime)
                        occ.append((key, meta, start, all_day, ev.location))
        if changed:  # re-key entries that just learned their uid
            self.store.data["event_meta"] = {meta_key(m): m for m in metas.values()}
            self.store.save_soon()
        self._occurrences = occ
        self._refreshed = now

    async def _tick(self, now: datetime) -> None:
        if self._busy or not self.store.data.get("event_meta"):
            return
        self._busy = True
        try:
            if self._refreshed is None or now - self._refreshed > REFRESH_EVERY:
                await self.refresh(now)
            await self.send_due(now)
        finally:
            self._busy = False

    async def send_due(self, now: datetime) -> None:
        sent: dict[str, str] = self.store.data.setdefault("reminders_sent", {})
        new = False
        for key, meta, start, all_day, location in self._occurrences:
            when = fire_time(start, meta["remind"])
            if not (when <= now < when + LATE_OK):
                continue
            mark = f"{key}|{start.isoformat()}|{meta['remind']}"
            if mark in sent:
                continue
            sent[mark] = now.isoformat()
            new = True
            await self.notify(meta, start, all_day, location, now)
        if new:
            cutoff = (now - timedelta(days=3)).isoformat()
            self.store.data["reminders_sent"] = {k: v for k, v in sent.items() if v >= cutoff}
            self.store.save_soon()

    async def notify(self, meta: dict, start: datetime, all_day: bool, location: str | None, now: datetime) -> None:
        summary = meta.get("summary") or "Event"
        title = f"⏰ {summary}"
        message = _when_text(start, all_day, now) + (f" · {location}" if location else "")
        members = set(meta.get("members") or [])
        phones = self.store.data["settings"].get("reminder_phones") or {}
        for service, cfg in phones.items():
            mode = (cfg or {}).get("mode", "off")
            if mode == "all" or (mode == "members" and members & set(cfg.get("members") or [])):
                if not self.hass.services.has_service("notify", service):
                    continue
                try:
                    await self.hass.services.async_call("notify", service, {
                        "title": title, "message": message,
                        "data": {"group": app_name(self.store.data), "tag": f"skylight-{meta_key(meta)}"[:60]},
                    }, blocking=False)
                except Exception as err:
                    _LOGGER.warning("Reminders: couldn't notify %s: %s", service, err)
        self.hass.bus.async_fire(EVENT_REMINDER, {
            "summary": summary, "message": message, "start": start.isoformat(), "all_day": all_day,
            "members": sorted(members), "location": location,
        })


# ----- websocket commands -----

def _rem(hass: HomeAssistant) -> Reminders:
    return hass.data[DOMAIN]["reminders"]


@callback
def async_register(hass: HomeAssistant) -> None:
    websocket_api.async_register_command(hass, ws_set_meta)
    websocket_api.async_register_command(hass, ws_subscribe)


@websocket_api.websocket_command({
    vol.Required("type"): "skylight/reminder/set",
    vol.Required("key"): str,  # the event's current key ("" for a new event)
    vol.Optional("meta"): vol.Any(None, dict),  # None removes the reminder
})
@websocket_api.async_response
async def ws_set_meta(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    """Set or clear the reminder for one event (not PIN-protected, like editing events)."""
    store = hass.data[DOMAIN]["store"]
    metas = store.data.setdefault("event_meta", {})
    metas.pop(msg["key"], None)
    meta = clean_meta(msg.get("meta"))
    if meta:
        metas[meta_key(meta)] = meta
    store.changed()
    _rem(hass).invalidate()
    connection.send_result(msg["id"], {"key": meta_key(meta) if meta else None})


@websocket_api.websocket_command({vol.Required("type"): "skylight/reminder/subscribe"})
@callback
def ws_subscribe(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    """Screens get each reminder as it goes off (they decide themselves whether to show it)."""
    @callback
    def forward(event) -> None:
        connection.send_message(websocket_api.event_message(msg["id"], event.data))

    connection.subscriptions[msg["id"]] = hass.bus.async_listen(EVENT_REMINDER, forward)
    connection.send_result(msg["id"])
