"""Lyding Strike family display for Home Assistant (internal id: skylight)."""

from __future__ import annotations

import hashlib
import pathlib

from homeassistant.components import frontend, panel_custom
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import Event, HomeAssistant, callback

from . import mealie, nightmode, places, reminders, security, weather_alerts, weather_extra, websocket_api
from .const import (
    DOMAIN,
    EVENT_UPDATED,
    PANEL_ELEMENT,
    PANEL_PATH,
    URL_FRONTEND,
    VERSION,
    app_name,
)
from .immich import SkylightImmichView
from .photos import SkylightPhotoFileView, SkylightPhotoUploadView, photo_dir
from .store import SkylightStore

PANEL_JS = pathlib.Path(__file__).parent / "frontend" / "skylight-panel.js"
PLATFORMS = ["todo"]


def _module_url() -> str:
    """URL that changes whenever any panel file changes, so browsers never run a stale copy.

    The panel's own modules (frontend/src) are imported with ?v=<version>; tests check that.
    """
    sha = hashlib.sha1()
    for path in [PANEL_JS, *sorted((PANEL_JS.parent / "src").glob("*.js"))]:
        sha.update(path.read_bytes())
    digest = sha.hexdigest()[:10]
    return f"{URL_FRONTEND}/skylight-panel.js?v={VERSION}-{digest}"


async def _async_register_once(hass: HomeAssistant) -> None:
    """HTTP routes and websocket commands can't be unregistered; add them once."""
    if hass.data.get(f"{DOMAIN}_http"):
        return
    await hass.async_add_executor_job(lambda: photo_dir(hass).mkdir(exist_ok=True))
    await hass.http.async_register_static_paths(
        [
            StaticPathConfig(
                URL_FRONTEND, str(pathlib.Path(__file__).parent / "frontend"), False
            ),
            # Uploaded photos are NOT a static path: SkylightPhotoFileView serves them with login.
        ]
    )
    hass.http.register_view(SkylightPhotoUploadView())
    hass.http.register_view(SkylightPhotoFileView())
    hass.http.register_view(SkylightImmichView())
    websocket_api.async_register(hass)
    security.async_register(hass)
    mealie.async_register(hass)
    places.async_register(hass)
    weather_alerts.async_register(hass)
    weather_extra.async_register(hass)
    reminders.async_register(hass)
    # Also load the element on every dashboard so it can be used as a card.
    hass.data[f"{DOMAIN}_module_url"] = await hass.async_add_executor_job(_module_url)
    frontend.add_extra_js_url(hass, hass.data[f"{DOMAIN}_module_url"])
    hass.data[f"{DOMAIN}_http"] = True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    store = SkylightStore(hass)
    await store.async_load()
    hass.data[DOMAIN] = {"store": store}
    entry.async_on_unload(nightmode.async_start(hass))
    hass.data[DOMAIN]["reminders"] = rem = reminders.Reminders(hass, store)
    entry.async_on_unload(rem.async_start())

    await _async_register_once(hass)
    # Skylight's lists as Home Assistant to-do entities (HA's To-do panel, phone app, Assist).
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    await _async_register_panel(hass, app_name(store.data))
    _sync_entry_title(hass, entry, app_name(store.data))

    @callback
    def _name_changed(_event: Event) -> None:
        """Renaming in Settings updates the sidebar and the integration's title right away."""
        name = app_name(store.data)
        _sync_entry_title(hass, entry, name)
        if hass.data.get(f"{DOMAIN}_panel_title") != name:
            frontend.async_remove_panel(hass, PANEL_PATH)
            hass.async_create_task(_async_register_panel(hass, name))

    entry.async_on_unload(hass.bus.async_listen(EVENT_UPDATED, _name_changed))
    return True


async def _async_register_panel(hass: HomeAssistant, title: str) -> None:
    hass.data[f"{DOMAIN}_panel_title"] = title
    await panel_custom.async_register_panel(
        hass,
        frontend_url_path=PANEL_PATH,
        webcomponent_name=PANEL_ELEMENT,
        sidebar_title=title,
        sidebar_icon="mdi:calendar-heart",
        module_url=hass.data[f"{DOMAIN}_module_url"],
        require_admin=False,
        config={},
    )


@callback
def _sync_entry_title(hass: HomeAssistant, entry: ConfigEntry, title: str) -> None:
    if entry.title != title:
        hass.config_entries.async_update_entry(entry, title=title)


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    if not await hass.config_entries.async_unload_platforms(entry, PLATFORMS):
        return False
    if (store := hass.data.get(DOMAIN, {}).get("store")) is not None:
        await store.async_flush()
    frontend.async_remove_panel(hass, PANEL_PATH)
    hass.data.pop(f"{DOMAIN}_panel_title", None)
    hass.data.pop(DOMAIN, None)
    return True
