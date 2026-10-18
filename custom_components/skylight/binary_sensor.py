"""`binary_sensor.<app name>_night`: on during the family's night hours (Setup → Look & night mode).

The same hours that switch screens to dark and dim the backlight, so automations can follow Setup
without copying times into YAML: "when night turns on → monitor off; turns off → monitor on".
Updated every minute and whenever Setup changes, by nightmode.py.
"""

from __future__ import annotations

from homeassistant.components.binary_sensor import BinarySensorEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.util import dt as dt_util

from . import nightmode
from .const import DOMAIN, app_name


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback) -> None:
    store = hass.data[DOMAIN]["store"]
    async_add_entities([SkylightNight(entry, store), SkylightScreenOff(entry, store)])


class SkylightNight(BinarySensorEntity):
    _attr_has_entity_name = False
    _attr_should_poll = False
    _attr_icon = "mdi:weather-night"

    def __init__(self, entry: ConfigEntry, store) -> None:
        self._store = store
        self._attr_unique_id = f"{entry.entry_id}-night"
        self._attr_name = f"{app_name(store.data)} Night"
        self._attr_is_on = nightmode.current_night(store.data["settings"])

    async def async_added_to_hass(self) -> None:
        self.async_on_remove(async_dispatcher_connect(self.hass, nightmode.SIGNAL_NIGHT, self._update))

    @callback
    def _update(self, night: bool) -> None:
        self._attr_name = f"{app_name(self._store.data)} Night"
        if night != self._attr_is_on:
            self._attr_is_on = night
            self.async_write_ha_state()

    @property
    def extra_state_attributes(self) -> dict:
        s = self._store.data["settings"]
        sun = nightmode.night_source(s) == "sun"
        return {"night_by": "sunset to sunrise" if sun else "schedule",
                **({} if sun else {"night_start": s.get("night_start", "21:00"), "night_end": s.get("night_end", "06:30")})}


class SkylightScreenOff(BinarySensorEntity):
    """On during the "turn the screen off" window, whether or not a display entity is set."""
    _attr_has_entity_name = False
    _attr_should_poll = False
    _attr_icon = "mdi:monitor-off"

    def __init__(self, entry: ConfigEntry, store) -> None:
        self._store = store
        self._attr_unique_id = f"{entry.entry_id}-screen-off"
        self._attr_name = f"{app_name(store.data)} Screen off"
        self._attr_is_on = nightmode.is_screen_off(store.data["settings"], dt_util.now())

    async def async_added_to_hass(self) -> None:
        self.async_on_remove(async_dispatcher_connect(self.hass, nightmode.SIGNAL_SCREEN_OFF, self._update))

    @callback
    def _update(self, off: bool) -> None:
        self._attr_name = f"{app_name(self._store.data)} Screen off"
        if off != self._attr_is_on:
            self._attr_is_on = off
            self.async_write_ha_state()

    @property
    def extra_state_attributes(self) -> dict:
        s = self._store.data["settings"]
        return {"enabled": bool(s.get("screen_off")), "screen_off_start": s.get("screen_off_start", "23:30"),
                "screen_off_end": s.get("screen_off_end", "06:00"), "entity": s.get("screen_off_entity")}
