"""Create calendar events the way Google's own app does: all-day events show as Free.

Home Assistant's calendar/event/create command has no free/busy field, and Google's API
defaults every event it creates to "busy" (opaque). Google Calendar's own app marks all-day
events as "free" (transparent), so a family's "Vacation" or "Spirit week" doesn't block anyone's
availability. This module reproduces that default for Google calendars and leaves every other
calendar on Home Assistant's normal path.
"""

from __future__ import annotations

from datetime import datetime
import logging
from typing import Any

from homeassistant.util import dt as dt_util

_LOGGER = logging.getLogger(__name__)

TRANSPARENT = "transparent"  # Google's "Free"
OPAQUE = "opaque"  # Google's "Busy"
RRULE_PREFIX = "RRULE:"


def is_google(entity: Any) -> bool:
    """True for entities of Home Assistant's Google Calendar integration."""
    return getattr(getattr(entity, "platform", None), "platform_name", None) == "google"


def default_busy(event: dict[str, Any]) -> bool:
    """Google's own default: timed events are busy, all-day events are free."""
    return isinstance(event.get("dtstart"), datetime)


async def async_create_event(entity: Any, event: dict[str, Any], busy: bool | None = None) -> None:
    """Create an event on a calendar entity; on Google calendars, mark it Free unless busy."""
    if busy is None:
        busy = default_busy(event)
    if busy or not is_google(entity):
        await entity.async_create_event(**event)
        return
    try:
        from gcal_sync.model import DateOrDatetime, Event  # noqa: PLC0415  (installed with the google integration)
    except ImportError:  # pragma: no cover - google integration not loaded
        await entity.async_create_event(**event)
        return
    dtstart, dtend = event["dtstart"], event["dtend"]
    if isinstance(dtstart, datetime):
        tz = str(dt_util.get_default_time_zone())
        start = DateOrDatetime(date_time=dt_util.as_local(dtstart), timezone=tz)
        end = DateOrDatetime(date_time=dt_util.as_local(dtend), timezone=tz)
    else:
        start = DateOrDatetime(date=dtstart)
        end = DateOrDatetime(date=dtend)
    ev = Event.model_validate({"summary": event["summary"], "start": start, "end": end, "description": event.get("description")})
    ev.transparency = TRANSPARENT
    if location := event.get("location"):
        ev.location = location
    if rrule := event.get("rrule"):
        ev.recurrence = [f"{RRULE_PREFIX}{rrule}"]
    await entity.coordinator.sync.store_service.async_add_event(ev)
    await entity.coordinator.async_refresh()


async def async_free_all_day(entity: Any, start: datetime, end: datetime) -> int:
    """Mark the Google calendar's existing all-day events between start and end as Free.

    A repeating series is patched once (its base event), so every occurrence changes.
    Returns how many events were changed.
    """
    coordinator = entity.coordinator
    events = await coordinator.async_get_events(start, end)
    done: set[str] = set()
    changed = 0
    for ev in events:
        if not getattr(ev.start, "date", None) or ev.transparency == TRANSPARENT:
            continue  # timed, or already Free
        event_id = ev.recurring_event_id or ev.id
        if not event_id or event_id in done:
            continue
        done.add(event_id)
        await coordinator.sync.api.async_patch_event(entity.calendar_id, event_id, {"transparency": TRANSPARENT})
        changed += 1
    if changed:
        await coordinator.async_refresh()
    return changed
