"""Night hours: when dark mode / dimming apply, and setting the screen brightness.

Night hours come from either a fixed schedule (start/end times, may cross
midnight) or the sun ("sunset to sunrise", from sun.sun). The panel has the
same rules in JavaScript for dark mode; tests keep the two in step.

When a brightness entity is configured (for example the Fully Kiosk Browser
integration's "Screen brightness" number), Home Assistant sets it to the day
or night level whenever night starts or ends. Only on those changes, so a
manual brightness change sticks until the next switch.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.event import async_track_time_interval
from homeassistant.util import dt as dt_util

from .const import DOMAIN, EVENT_UPDATED

STATE_KEY = f"{DOMAIN}_night_state"
BRIGHTNESS_DOMAINS = ("number", "light", "input_number")


def parse_hm(value: Any, default: int) -> int:
    """'21:30' -> minutes after midnight."""
    try:
        h, m = str(value).split(":")[:2]
        mins = int(h) * 60 + int(m)
        return mins if 0 <= mins < 24 * 60 else default
    except (TypeError, ValueError):
        return default


def in_window(now_min: int, start_min: int, end_min: int) -> bool:
    """Is a time of day inside [start, end)? The window may cross midnight; start == end is empty."""
    if start_min == end_min:
        return False
    if start_min < end_min:
        return start_min <= now_min < end_min
    return now_min >= start_min or now_min < end_min


def sun_is_down(next_rising: datetime | None, next_setting: datetime | None) -> bool | None:
    """Between sunset and sunrise the next sun event is the sunrise. None if unknown."""
    if next_rising is None or next_setting is None:
        return None
    return next_rising < next_setting


def night_source(settings: dict[str, Any]) -> str:
    """Night hours follow the sun when dark mode does; otherwise the start/end times."""
    return "sun" if settings.get("dark_mode") == "sun" else "schedule"


def is_night(settings: dict[str, Any], now: datetime, next_rising: datetime | None = None,
             next_setting: datetime | None = None) -> bool:
    if night_source(settings) == "sun":
        down = sun_is_down(next_rising, next_setting)
        return bool(down)
    return in_window(now.hour * 60 + now.minute, parse_hm(settings.get("night_start"), 21 * 60),
                     parse_hm(settings.get("night_end"), 6 * 60 + 30))


def _sun_times(hass: HomeAssistant) -> tuple[datetime | None, datetime | None]:
    sun = hass.states.get("sun.sun")
    if sun is None:
        return None, None
    rise, set_ = sun.attributes.get("next_rising"), sun.attributes.get("next_setting")
    return (dt_util.parse_datetime(str(rise)) if rise else None, dt_util.parse_datetime(str(set_)) if set_ else None)


def brightness_call(hass: HomeAssistant, entity_id: str, percent: float) -> tuple[str, str, dict[str, Any]] | None:
    """The service call that sets `entity_id` to `percent` % of its range, or None if unusable."""
    domain = entity_id.split(".", 1)[0]
    state = hass.states.get(entity_id)
    if domain not in BRIGHTNESS_DOMAINS or state is None:
        return None
    pct = max(0.0, min(100.0, float(percent)))
    if domain == "light":
        return "light", "turn_on", {"entity_id": entity_id, "brightness_pct": round(pct)}
    lo = float(state.attributes.get("min", 0))
    hi = float(state.attributes.get("max", 100))
    step = float(state.attributes.get("step", 1) or 1)
    value = lo + (hi - lo) * pct / 100
    value = round(round(value / step) * step, 6)
    return domain, "set_value", {"entity_id": entity_id, "value": value}


async def async_apply(hass: HomeAssistant, now: datetime | None = None, force: bool = False) -> bool | None:
    """Set the brightness entity for day or night if that changed. Returns the night flag used, or None."""
    store = hass.data.get(DOMAIN, {}).get("store")
    if store is None:
        return None
    settings = store.data["settings"]
    entity = settings.get("brightness_entity")
    if not settings.get("night_dim") or not entity:
        hass.data.pop(STATE_KEY, None)
        return None
    now = now or dt_util.now()
    night = is_night(settings, now, *_sun_times(hass))
    pct = settings.get("night_brightness", 20) if night else settings.get("day_brightness", 80)
    key = (entity, night, pct)
    if not force and hass.data.get(STATE_KEY) == key:
        return night
    call = brightness_call(hass, entity, pct)
    if call is None:
        return night
    await hass.services.async_call(*call, blocking=False)
    hass.data[STATE_KEY] = key
    return night


@callback
def async_start(hass: HomeAssistant):
    """Check every minute and whenever Skylight's settings change. Returns an unsubscribe function."""

    async def tick(_now=None) -> None:
        await async_apply(hass)

    unsub_timer = async_track_time_interval(hass, tick, timedelta(minutes=1))
    unsub_event = hass.bus.async_listen(EVENT_UPDATED, tick)
    hass.async_create_task(tick())

    @callback
    def stop() -> None:
        unsub_timer()
        unsub_event()
        hass.data.pop(STATE_KEY, None)

    return stop
