"""Skylight family display for Home Assistant."""

from __future__ import annotations

import pathlib

from homeassistant.components import frontend, panel_custom
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from . import websocket_api
from .const import (
    DOMAIN,
    PANEL_ELEMENT,
    PANEL_PATH,
    URL_FRONTEND,
    URL_PHOTOS,
    VERSION,
)
from .photos import SkylightPhotoUploadView, photo_dir
from .store import SkylightStore

MODULE_URL = f"{URL_FRONTEND}/skylight-panel.js?v={VERSION}"


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
            # Photo names are random 24-hex tokens, so they are unguessable.
            StaticPathConfig(URL_PHOTOS, str(photo_dir(hass)), True),
        ]
    )
    hass.http.register_view(SkylightPhotoUploadView())
    websocket_api.async_register(hass)
    # Also load the element on every dashboard so it can be used as a card.
    frontend.add_extra_js_url(hass, MODULE_URL)
    hass.data[f"{DOMAIN}_http"] = True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    store = SkylightStore(hass)
    await store.async_load()
    hass.data[DOMAIN] = {"store": store}

    await _async_register_once(hass)
    await panel_custom.async_register_panel(
        hass,
        frontend_url_path=PANEL_PATH,
        webcomponent_name=PANEL_ELEMENT,
        sidebar_title="Skylight",
        sidebar_icon="mdi:calendar-heart",
        module_url=MODULE_URL,
        require_admin=False,
        config={},
    )
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    frontend.async_remove_panel(hass, PANEL_PATH)
    hass.data.pop(DOMAIN, None)
    return True
