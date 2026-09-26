"""Websocket commands used by the Skylight panel."""

from __future__ import annotations

from datetime import date
from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.config_entries import SOURCE_USER
from homeassistant.core import HomeAssistant, callback

from .const import DOMAIN, EDITABLE_KEYS, EVENT_UPDATED
from .photos import async_delete_photo


def _store(hass: HomeAssistant):
    return hass.data[DOMAIN]["store"]


@callback
def async_register(hass: HomeAssistant) -> None:
    for command in (
        ws_get,
        ws_subscribe,
        ws_set,
        ws_toggle_chore,
        ws_adjust_stars,
        ws_redeem,
        ws_delete_photo,
        ws_create_calendar,
    ):
        websocket_api.async_register_command(hass, command)


@websocket_api.websocket_command({vol.Required("type"): "skylight/get"})
@callback
def ws_get(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    connection.send_result(msg["id"], _store(hass).data)


@websocket_api.websocket_command({vol.Required("type"): "skylight/subscribe"})
@callback
def ws_subscribe(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    """Push the full data set now and on every change."""

    @callback
    def forward(_event=None) -> None:
        connection.send_message(websocket_api.event_message(msg["id"], _store(hass).data))

    connection.subscriptions[msg["id"]] = hass.bus.async_listen(EVENT_UPDATED, forward)
    connection.send_result(msg["id"])
    forward()


@websocket_api.websocket_command(
    {
        vol.Required("type"): "skylight/set",
        vol.Required("key"): vol.In(EDITABLE_KEYS),
        vol.Required("value"): vol.Any(list, dict),
    }
)
@websocket_api.async_response
async def ws_set(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    await _store(hass).async_set(msg["key"], msg["value"])
    connection.send_result(msg["id"])


@websocket_api.websocket_command(
    {
        vol.Required("type"): "skylight/chore/toggle",
        vol.Required("chore_id"): str,
        vol.Required("date"): str,
    }
)
@websocket_api.async_response
async def ws_toggle_chore(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    try:
        await _store(hass).async_toggle_chore(msg["chore_id"], date.fromisoformat(msg["date"]))
    except (KeyError, ValueError) as err:
        connection.send_error(msg["id"], "not_found", str(err))
        return
    connection.send_result(msg["id"])


@websocket_api.websocket_command(
    {
        vol.Required("type"): "skylight/stars/adjust",
        vol.Required("member_id"): str,
        vol.Required("delta"): int,
    }
)
@websocket_api.async_response
async def ws_adjust_stars(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    await _store(hass).async_adjust_stars(msg["member_id"], msg["delta"])
    connection.send_result(msg["id"])


@websocket_api.websocket_command(
    {
        vol.Required("type"): "skylight/reward/redeem",
        vol.Required("reward_id"): str,
        vol.Required("member_id"): str,
    }
)
@websocket_api.async_response
async def ws_redeem(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    try:
        ok = await _store(hass).async_redeem(msg["reward_id"], msg["member_id"])
    except KeyError as err:
        connection.send_error(msg["id"], "not_found", str(err))
        return
    connection.send_result(msg["id"], {"redeemed": ok})


@websocket_api.websocket_command(
    {vol.Required("type"): "skylight/photo/delete", vol.Required("name"): str}
)
@websocket_api.async_response
async def ws_delete_photo(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    await async_delete_photo(hass, msg["name"])
    connection.send_result(msg["id"])


@websocket_api.websocket_command(
    {vol.Required("type"): "skylight/calendar/create", vol.Required("name"): str}
)
@websocket_api.async_response
async def ws_create_calendar(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    """Create a Local Calendar so non-admin tablet users can add calendars."""
    name = msg["name"].strip()
    if not name:
        connection.send_error(msg["id"], "invalid", "Name required")
        return
    flow = await hass.config_entries.flow.async_init(
        "local_calendar", context={"source": SOURCE_USER}
    )
    result = await hass.config_entries.flow.async_configure(
        flow["flow_id"], {"calendar_name": name}
    )
    if result.get("type") != "create_entry":
        # Abort a half-finished flow (e.g. a newer form with more required fields).
        if "flow_id" in result:
            hass.config_entries.flow.async_abort(result["flow_id"])
        connection.send_error(
            msg["id"], "flow_failed", f"Could not create calendar: {result.get('errors') or result.get('reason')}"
        )
        return
    connection.send_result(msg["id"], {"entry_id": result["result"].entry_id})
