"""Skylight family display for Home Assistant."""

from __future__ import annotations

import hashlib
import pathlib

from homeassistant.components import frontend, panel_custom
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from . import mealie, places, security, weather_alerts, weather_extra, websocket_api
from .const import (
    DOMAIN,
    PANEL_ELEMENT,
    PANEL_PATH,
    URL_FRONTEND,
    VERSION,
)
from .immich import SkylightImmichView
from .photos import SkylightPhotoFileView, SkylightPhotoUploadView, photo_dir
from .store import SkylightStore

PANEL_JS = pathlib.Path(__file__).parent / "frontend" / "skylight-panel.js"


def _module_url() -> str:
    """URL that changes whenever the panel file changes, so browsers never run a stale copy."""
    digest = hashlib.sha1(PANEL_JS.read_bytes()).hexdigest()[:10]
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
    # Also load the element on every dashboard so it can be used as a card.
    hass.data[f"{DOMAIN}_module_url"] = await hass.async_add_executor_job(_module_url)
    frontend.add_extra_js_url(hass, hass.data[f"{DOMAIN}_module_url"])
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
        module_url=hass.data[f"{DOMAIN}_module_url"],
        require_admin=False,
        config={},
    )
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    if (store := hass.data.get(DOMAIN, {}).get("store")) is not None:
        await store.async_flush()
    frontend.async_remove_panel(hass, PANEL_PATH)
    hass.data.pop(DOMAIN, None)
    return True
