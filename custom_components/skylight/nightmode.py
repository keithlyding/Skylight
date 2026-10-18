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
from homeassistant.helpers.dispatcher import async_dispatcher_send
from homeassistant.helpers.event import async_track_state_change_event, async_track_time_interval
from homeassistant.util import dt as dt_util

from .const import DOMAIN, EVENT_UPDATED

STATE_KEY = f"{DOMAIN}_night_state"
NIGHT_KEY = f"{DOMAIN}_night_now"  # the night flag as last worked out (for the Night binary sensor)
SIGNAL_NIGHT = f"{DOMAIN}_night"
OFF_KEY = f"{DOMAIN}_screen_off_now"
OFF_STATE_KEY = f"{DOMAIN}_screen_off_state"
SIGNAL_SCREEN_OFF = f"{DOMAIN}_screen_off"
DISPLAY_DOMAINS = ("light", "switch")
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
    """Night is sunset to sunrise, or the start/end times (Setup > Look & night mode > Night is)."""
    return "sun" if settings.get("night_by") == "sun" else "schedule"


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


def is_screen_off(settings: dict[str, Any], now: datetime) -> bool:
    """Inside the "screen off" window (Setup → Look & night mode → Turn the screen off)? Always a schedule."""
    if not settings.get("screen_off"):
        return False
    start = parse_hm(settings.get("screen_off_start"), 23 * 60 + 30)
    end = parse_hm(settings.get("screen_off_end"), 6 * 60)
    return in_window(now.hour * 60 + now.minute, start, end)


def night_levels(settings: dict[str, Any]) -> tuple[float | None, int]:
    """(backlight % at night or None without an entity, picture darkening %) from the one "how dark at
    night" slider. With a backlight entity: 0-50 turns the backlight from 100% down to 0, 50-100 then
    darkens the picture up to 85% (a backlight at 0 still glows). Same rule as helpers.js nightLevels."""
    try:
        level = min(100.0, max(0.0, float(settings.get("night_level", 60))))
    except (TypeError, ValueError):
        level = 60.0
    half_up = lambda x: int(x + 0.5)  # like Math.round in helpers.js (Python's round() halves to even)
    if settings.get("brightness_entity"):
        return max(0.0, 100 - 2 * level), (half_up((level - 50) / 50 * 85) if level > 50 else 0)
    return None, half_up(level * 0.85)


def display_call(entity_id: str, off: bool) -> tuple[str, str, dict[str, Any]] | None:
    domain = entity_id.split(".")[0]
    if domain not in DISPLAY_DOMAINS:
        return None
    return domain, "turn_off" if off else "turn_on", {"entity_id": entity_id}


async def _apply_screen_off(hass: HomeAssistant, settings: dict[str, Any], now: datetime, force: bool) -> None:
    off = is_screen_off(settings, now)
    if hass.data.get(OFF_KEY) != off:
        hass.data[OFF_KEY] = off
        async_dispatcher_send(hass, SIGNAL_SCREEN_OFF, off)
    entity = settings.get("screen_off_entity")
    if not settings.get("screen_off") or not entity:
        hass.data.pop(OFF_STATE_KEY, None)
        return
    key = (entity, off)
    if not force and hass.data.get(OFF_STATE_KEY) == key:
        return
    call = display_call(entity, off)
    if call is None:
        return
    await hass.services.async_call(*call, blocking=False)
    hass.data[OFF_STATE_KEY] = key


def room_empty(hass: HomeAssistant, settings: dict[str, Any]) -> bool:
    """The "also dim when nobody's around" entity says the room is empty (state off). Unknown/unavailable
    counts as occupied, so a broken sensor never leaves the screen dim."""
    entity = settings.get("idle_entity")
    if not entity:
        return False
    st = hass.states.get(entity)
    return st is not None and st.state == "off"


def current_night(settings: dict[str, Any], hass: HomeAssistant | None = None, now: datetime | None = None) -> bool:
    """Is it night right now, by the family's rule (used by the Night binary sensor too)."""
    sun = _sun_times(hass) if hass is not None else (None, None)
    return is_night(settings, now or dt_util.now(), *sun)


async def async_apply(hass: HomeAssistant, now: datetime | None = None, force: bool = False) -> bool | None:
    """Work out night/day, tell the Night sensor, and set the brightness entity for day or night if that
    changed. Returns the night flag used for the brightness entity, or None when none is configured."""
    store = hass.data.get(DOMAIN, {}).get("store")
    if store is None:
        return None
    settings = store.data["settings"]
    now = now or dt_util.now()
    night = is_night(settings, now, *_sun_times(hass))
    if hass.data.get(NIGHT_KEY) != night:
        hass.data[NIGHT_KEY] = night
        async_dispatcher_send(hass, SIGNAL_NIGHT, night)
    await _apply_screen_off(hass, settings, now, force)
    entity = settings.get("brightness_entity")
    if not settings.get("night_dim") or not entity:
        hass.data.pop(STATE_KEY, None)
        return None
    dim = night or room_empty(hass, settings)
    pct = night_levels(settings)[0] if dim else settings.get("day_brightness", 80)
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
    watch: dict[str, Any] = {"entity": None, "unsub": None}

    @callback
    def on_presence(_event) -> None:
        hass.async_create_task(tick())

    @callback
    def watch_idle_entity() -> None:
        """React the moment the presence entity changes, not at the next minute."""
        store = hass.data.get(DOMAIN, {}).get("store")
        entity = store.data["settings"].get("idle_entity") if store else None
        if entity == watch["entity"]:
            return
        if watch["unsub"]:
            watch["unsub"]()
            watch["unsub"] = None
        watch["entity"] = entity
        if entity:
            watch["unsub"] = async_track_state_change_event(hass, [entity], on_presence)

    async def on_updated(_event=None) -> None:
        watch_idle_entity()
        await tick()

    unsub_event = hass.bus.async_listen(EVENT_UPDATED, on_updated)
    watch_idle_entity()
    hass.async_create_task(tick())

    @callback
    def stop() -> None:
        unsub_timer()
        unsub_event()
        if watch["unsub"]:
            watch["unsub"]()
        hass.data.pop(STATE_KEY, None)
        hass.data.pop(NIGHT_KEY, None)
        hass.data.pop(OFF_KEY, None)
        hass.data.pop(OFF_STATE_KEY, None)

    return stop
