"""Config flow: one click to add Lyding Strike. Options: admin reset of the settings PIN."""

from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.config_entries import ConfigEntry, ConfigFlow, ConfigFlowResult, OptionsFlow
from homeassistant.core import callback

from .const import DEFAULT_APP_NAME, DOMAIN


class SkylightConfigFlow(ConfigFlow, domain=DOMAIN):
    VERSION = 1

    async def async_step_user(self, user_input=None) -> ConfigFlowResult:
        if user_input is not None:
            return self.async_create_entry(title=DEFAULT_APP_NAME, data={})
        return self.async_show_form(step_id="user")

    @staticmethod
    @callback
    def async_get_options_flow(config_entry: ConfigEntry) -> OptionsFlow:
        return SkylightOptionsFlow()


class SkylightOptionsFlow(OptionsFlow):
    """Settings → Devices & Services → Skylight → Configure (Home Assistant admins only)."""

    async def async_step_init(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        store = self.hass.data.get(DOMAIN, {}).get("store")
        if user_input is not None:
            if user_input.get("clear_pin") and store is not None:
                from . import security  # noqa: PLC0415

                await store.async_set_pin(None)
                security.lock_all(self.hass)
            return self.async_create_entry(data={})
        pin_set = bool(store and store.data["security"].get("pin_hash"))
        return self.async_show_form(
            step_id="init",
            data_schema=vol.Schema({vol.Optional("clear_pin", default=False): bool}),
            description_placeholders={"status": "A settings PIN is set." if pin_set else "No settings PIN is set."},
        )
