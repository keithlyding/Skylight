"""Websocket commands used by the Skylight panel."""

from __future__ import annotations

from datetime import date
from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.config_entries import SOURCE_USER
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import entity_registry as er
from homeassistant.util import dt as dt_util

from .const import DOMAIN, EDITABLE_KEYS, EVENT_UPDATED, VERSION
from . import chores, immich, photos, security
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
        ws_chore_view,
        ws_move_list_item,
        ws_list_add_item,
        ws_list_update_item,
        ws_list_delete_items,
        ws_list_save,
        ws_list_remove,
        ws_backup_export,
        ws_backup_import,
        ws_delete_photo,
        ws_create_calendar,
        ws_subscribe_calendar,
        ws_photo_urls,
        ws_immich_albums,
        ws_immich_configure,
        ws_calendars,
    ):
        websocket_api.async_register_command(hass, command)


@websocket_api.websocket_command({vol.Required("type"): "skylight/get"})
@callback
def ws_get(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    connection.send_result(msg["id"], _store(hass).public())


@websocket_api.websocket_command({vol.Required("type"): "skylight/subscribe"})
@callback
def ws_subscribe(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    """Push the full data set now and on every change."""

    @callback
    def forward(_event=None) -> None:
        connection.send_message(websocket_api.event_message(msg["id"], _store(hass).public()))

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
    if msg["key"] in security.GATED_KEYS and not security.is_unlocked(hass, connection):
        security.send_locked(connection, msg["id"])
        return
    await _store(hass).async_set(msg["key"], msg["value"])
    connection.send_result(msg["id"])


BACKUP_FORMAT = 1


@websocket_api.websocket_command({vol.Required("type"): "skylight/backup/export"})
@websocket_api.async_response
@security.gated
async def ws_backup_export(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    connection.send_result(msg["id"], {
        "skylight_backup": BACKUP_FORMAT, "version": VERSION,
        "created": dt_util.utcnow().isoformat(timespec="seconds"), "data": _store(hass).export(),
    })


@websocket_api.websocket_command(
    {vol.Required("type"): "skylight/backup/import", vol.Required("backup"): dict}
)
@websocket_api.async_response
@security.gated
async def ws_backup_import(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    backup = msg["backup"]
    data = backup.get("data")
    if backup.get("skylight_backup") != BACKUP_FORMAT or not isinstance(data, dict) or not isinstance(data.get("members"), list):
        connection.send_error(msg["id"], "invalid", "That file isn't a backup from this display.")
        return
    folder = photos.photo_dir(hass)
    existing = set(await hass.async_add_executor_job(lambda: [p.name for p in folder.iterdir()] if folder.exists() else []))
    before = await _store(hass).async_import(data, existing)
    connection.send_result(msg["id"], {"previous_saved_to": before})


async def _list_call(connection, msg_id: int, coro) -> None:
    try:
        result = await coro
    except KeyError as err:
        connection.send_error(msg_id, "not_found", str(err))
        return
    except ValueError as err:
        connection.send_error(msg_id, "invalid", str(err))
        return
    connection.send_result(msg_id, result)


@websocket_api.websocket_command(
    {
        vol.Required("type"): "skylight/list/item/add",
        vol.Required("list_id"): str,
        vol.Required("text"): vol.All(str, vol.Length(min=1)),
        vol.Optional("item_id"): str,
    }
)
@websocket_api.async_response
async def ws_list_add_item(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    if not msg["text"].strip():
        connection.send_error(msg["id"], "invalid", "Empty item")
        return
    await _list_call(connection, msg["id"], _store(hass).async_list_add_item(msg["list_id"], msg["text"], msg.get("item_id")))


@websocket_api.websocket_command(
    {
        vol.Required("type"): "skylight/list/item/update",
        vol.Required("list_id"): str,
        vol.Required("item_id"): str,
        vol.Optional("text"): str,
        vol.Optional("done"): bool,
    }
)
@websocket_api.async_response
async def ws_list_update_item(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    await _list_call(connection, msg["id"], _store(hass).async_list_update_item(
        msg["list_id"], msg["item_id"], msg.get("text"), msg.get("done")))


@websocket_api.websocket_command(
    {
        vol.Required("type"): "skylight/list/item/delete",
        vol.Required("list_id"): str,
        vol.Optional("item_ids", default=[]): [str],
        vol.Optional("done", default=False): bool,
    }
)
@websocket_api.async_response
async def ws_list_delete_items(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    await _list_call(connection, msg["id"], _store(hass).async_list_delete_items(msg["list_id"], msg["item_ids"], msg["done"]))


@websocket_api.websocket_command(
    {
        vol.Required("type"): "skylight/list/save",
        vol.Optional("list_id"): str,
        vol.Required("name"): str,
        vol.Optional("color"): str,
        vol.Optional("owner"): vol.Any(str, None),
    }
)
@websocket_api.async_response
async def ws_list_save(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    meta = {"id": msg.get("list_id"), "name": msg["name"], "color": msg.get("color"), "owner": msg.get("owner")}
    await _list_call(connection, msg["id"], _store(hass).async_list_save(meta))


@websocket_api.websocket_command({vol.Required("type"): "skylight/list/delete", vol.Required("list_id"): str})
@websocket_api.async_response
async def ws_list_remove(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    await _list_call(connection, msg["id"], _store(hass).async_list_remove(msg["list_id"]))


@websocket_api.websocket_command(
    {
        vol.Required("type"): "skylight/list/move",
        vol.Required("list_id"): str,
        vol.Required("item_id"): str,
        vol.Exclusive("to_index", "where"): vol.All(int, vol.Range(min=0)),
        vol.Exclusive("direction", "where"): vol.In(["up", "down"]),
    }
)
@websocket_api.async_response
async def ws_move_list_item(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    """Move a list item up/down or to a position; done on the server so two screens can't clash."""
    if "to_index" not in msg and "direction" not in msg:
        connection.send_error(msg["id"], "invalid", "Give to_index or direction")
        return
    try:
        index = await _store(hass).async_move_list_item(
            msg["list_id"], msg["item_id"], msg.get("to_index"), msg.get("direction"))
    except KeyError as err:
        connection.send_error(msg["id"], "not_found", str(err))
        return
    connection.send_result(msg["id"], {"index": index})


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
        done = await _store(hass).async_toggle_chore(msg["chore_id"], date.fromisoformat(msg["date"]))
    except (KeyError, ValueError) as err:
        connection.send_error(msg["id"], "not_found", str(err))
        return
    connection.send_result(msg["id"], {"done": done})


MAX_VIEW_DAYS = 400


def _day(value: str) -> date:
    return date.fromisoformat(value)


@websocket_api.websocket_command(
    {
        vol.Required("type"): "skylight/chores/view",
        vol.Required("start"): str,
        vol.Required("end"): str,
        # Ranges [from, to] to total up per person (Progress weeks, "this week" on the Chores tab).
        vol.Optional("ranges", default=[]): vol.All([vol.All([str], vol.Length(min=2, max=2))], vol.Length(max=12)),
    }
)
@callback
def ws_chore_view(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    """Which chores show on which days, and completion totals. The panel only draws this."""
    try:
        start, end = _day(msg["start"]), _day(msg["end"])
        ranges = [(_day(a), _day(b)) for a, b in msg["ranges"]]
    except ValueError as err:
        connection.send_error(msg["id"], "invalid", str(err))
        return
    if not start <= end or (end - start).days > MAX_VIEW_DAYS or any((b - a).days > MAX_VIEW_DAYS for a, b in ranges):
        connection.send_error(msg["id"], "invalid", "date range too long")
        return
    data = _store(hass).data
    today = dt_util.now().date()
    week_start = int(data["settings"].get("week_start") or 0)
    days = {c["id"]: chores.day_states(c, start, end, week_start) for c in data["chores"]}
    totals = []
    for a, b in ranges:
        per: dict[str, list[int]] = {}
        for c in data["chores"]:
            due, done = chores.stats(c, a, b, today, week_start)
            t = per.setdefault(c.get("member_id") or "", [0, 0])
            t[0] += due
            t[1] += done
        totals.append(per)
    connection.send_result(msg["id"], {"today": today.isoformat(), "days": days, "stats": totals})


@websocket_api.websocket_command(
    {vol.Required("type"): "skylight/photo/delete", vol.Required("name"): str}
)
@websocket_api.async_response
@security.gated
async def ws_delete_photo(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    await async_delete_photo(hass, msg["name"])
    connection.send_result(msg["id"])


@websocket_api.websocket_command(
    {vol.Required("type"): "skylight/calendar/create", vol.Required("name"): str}
)
@websocket_api.async_response
@security.gated
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


@websocket_api.websocket_command(
    {
        vol.Required("type"): "skylight/calendar/subscribe",
        vol.Required("name"): str,
        vol.Required("url"): str,
    }
)
@websocket_api.async_response
@security.gated
async def ws_subscribe_calendar(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    """Subscribe to an iCal feed (Plan to Eat, school, sports...) via Remote Calendar."""
    name, url = msg["name"].strip(), msg["url"].strip()
    if not name or not url:
        connection.send_error(msg["id"], "invalid", "Name and URL required")
        return
    flow = await hass.config_entries.flow.async_init(
        "remote_calendar", context={"source": SOURCE_USER}
    )
    result = await hass.config_entries.flow.async_configure(
        flow["flow_id"], {"calendar_name": name, "url": url, "verify_ssl": True}
    )
    if result.get("type") != "create_entry":
        if "flow_id" in result:
            hass.config_entries.flow.async_abort(result["flow_id"])
        reason = result.get("errors") or result.get("reason")
        connection.send_error(msg["id"], "flow_failed", f"Could not subscribe: {reason}")
        return
    connection.send_result(msg["id"], {"entry_id": result["result"].entry_id})


@websocket_api.websocket_command({vol.Required("type"): "skylight/photos/urls"})
@websocket_api.async_response
async def ws_photo_urls(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    """All slideshow URLs: uploaded photos plus signed Immich proxy URLs."""
    store = _store(hass)
    items = [
        {"url": photos.signed_photo_url(hass, p, connection.refresh_token_id), "name": p, **await photos.async_photo_meta(hass, p)}
        for p in store.data["photos"]
    ]
    error = None
    try:
        items += await immich.async_signed_items(hass, store, connection.refresh_token_id)
    except immich.ImmichError as err:
        error = str(err)
    # "urls" kept for older cached frontends; "items" add date taken and place.
    connection.send_result(msg["id"], {"urls": [i["url"] for i in items], "items": items, "error": error})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "skylight/immich/albums",
        vol.Optional("url"): str,
        vol.Optional("api_key"): str,
    }
)
@websocket_api.async_response
async def ws_immich_albums(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    # Listing the saved server's albums is harmless; trying a new URL/key is configuration.
    if (msg.get("url") or msg.get("api_key")) and not security.is_unlocked(hass, connection):
        security.send_locked(connection, msg["id"])
        return
    cfg = _store(hass).data["immich"]
    url = (msg.get("url") or cfg["url"]).rstrip("/")
    key = msg.get("api_key") or cfg["api_key"]
    try:
        albums = await immich.async_list_albums(hass, url, key)
    except immich.ImmichError as err:
        connection.send_error(msg["id"], "immich_error", str(err))
        return
    connection.send_result(msg["id"], albums)


@websocket_api.websocket_command(
    {
        vol.Required("type"): "skylight/immich/configure",
        vol.Required("url"): str,
        vol.Optional("api_key"): str,
        vol.Required("albums"): [str],
        vol.Required("favorites"): bool,
    }
)
@websocket_api.async_response
@security.gated
async def ws_immich_configure(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    store = _store(hass)
    await store.async_set_immich(msg["url"], msg.get("api_key") or None, msg["albums"], msg["favorites"])
    immich.invalidate(hass)
    connection.send_result(msg["id"])


@websocket_api.websocket_command({vol.Required("type"): "skylight/calendars"})
@callback
def ws_calendars(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    """Calendar entities with the account/integration they come from.

    Google creates one "Birthdays"/"Holidays" per account, so the name alone
    can't tell them apart; the config entry title (the account) can.
    """
    registry = er.async_get(hass)
    out = []
    for state in hass.states.async_all("calendar"):
        entry = registry.async_get(state.entity_id)
        cfg = hass.config_entries.async_get_entry(entry.config_entry_id) if entry and entry.config_entry_id else None
        out.append({
            "entity_id": state.entity_id,
            "name": state.attributes.get("friendly_name", state.entity_id),
            "account": cfg.title if cfg else None,
            "integration": entry.platform if entry else None,
        })
    connection.send_result(msg["id"], sorted(out, key=lambda c: (c["name"].lower(), c["account"] or "")))
