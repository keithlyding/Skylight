"""Mealie meal planning, via Home Assistant's Mealie integration.

Reads and writes go through the `mealie.*` services so Skylight reuses the
connection the user already configured. Two things those services don't
cover are done with the same Mealie URL/token from that config entry:
removing a meal-plan entry, and fetching recipe images for the tablet.
"""

from __future__ import annotations

import re
from datetime import date, timedelta
from typing import Any

import aiohttp
import voluptuous as vol
from aiohttp import web

from homeassistant.components import websocket_api
from homeassistant.components.http import HomeAssistantView
from homeassistant.components.http.auth import async_sign_path
from homeassistant.config_entries import ConfigEntry, ConfigEntryState
from homeassistant.core import HomeAssistant, callback
from homeassistant.exceptions import HomeAssistantError, ServiceValidationError
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .const import DOMAIN

MEALIE = "mealie"
TIMEOUT = aiohttp.ClientTimeout(total=20)
RECIPE_ID = re.compile(r"^[0-9a-fA-F-]{8,64}$")
# Skylight row -> Mealie entry types shown in it (first one is used when adding).
SLOT_TYPES = {
    "breakfast": ["breakfast"],
    "lunch": ["lunch"],
    "dinner": ["dinner"],
    "snack": ["snack", "side", "dessert", "drink"],
}
TYPE_SLOT = {t: slot for slot, types in SLOT_TYPES.items() for t in types}


class MealieError(Exception):
    """Mealie is not set up or failed."""


def _entries(hass: HomeAssistant) -> list[ConfigEntry]:
    return [e for e in hass.config_entries.async_entries(MEALIE) if e.state is ConfigEntryState.LOADED]


def _entry(hass: HomeAssistant) -> ConfigEntry:
    entries = _entries(hass)
    if not entries:
        raise MealieError("Mealie isn't connected. Add the Mealie integration in Home Assistant first.")
    wanted = hass.data[DOMAIN]["store"].data["settings"].get("mealie_entry")
    return next((e for e in entries if e.entry_id == wanted), entries[0])


async def _service(hass: HomeAssistant, service: str, data: dict[str, Any], response: bool = True) -> Any:
    entry = _entry(hass)
    try:
        return await hass.services.async_call(
            MEALIE, service, {"config_entry_id": entry.entry_id, **data},
            blocking=True, return_response=response,
        )
    except (HomeAssistantError, vol.Invalid) as err:
        raise MealieError(str(err) or f"Mealie {service} failed") from err


def _sign(hass: HomeAssistant, path: str, token_id: str | None) -> str:
    return async_sign_path(hass, path, timedelta(hours=24), refresh_token_id=token_id)


def _recipe(hass: HomeAssistant, r: dict[str, Any] | None, token_id: str | None) -> dict[str, Any] | None:
    if not r:
        return None
    rid = r.get("recipe_id")
    return {
        "id": rid,
        "name": r.get("name"),
        "slug": r.get("slug"),
        "description": r.get("description") or "",
        "total_time": r.get("total_time"),
        "image": _sign(hass, f"/api/skylight/mealie/image/{rid}", token_id) if rid else None,
    }


async def _mealie_http(hass: HomeAssistant, method: str, path: str) -> aiohttp.ClientResponse:
    entry = _entry(hass)
    host = entry.data["host"].rstrip("/")
    session = async_get_clientsession(hass, verify_ssl=entry.data.get("verify_ssl", True))
    return await session.request(
        method, f"{host}/{path}",
        headers={"Authorization": f"Bearer {entry.data['api_token']}"}, timeout=TIMEOUT,
    )


@callback
def async_register(hass: HomeAssistant) -> None:
    for cmd in (ws_info, ws_week, ws_recipes, ws_recipe, ws_set, ws_remove, ws_import):
        websocket_api.async_register_command(hass, cmd)
    hass.http.register_view(MealieImageView())


def _wrap(handler):
    """Turn MealieError into a websocket error."""

    async def run(hass, connection, msg):
        try:
            await handler(hass, connection, msg)
        except MealieError as err:
            connection.send_error(msg["id"], "mealie_error", str(err))

    return run


@websocket_api.websocket_command({vol.Required("type"): "skylight/mealie/info"})
@callback
def ws_info(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    entries = _entries(hass)
    connection.send_result(msg["id"], {
        "entries": [{"entry_id": e.entry_id, "title": e.title} for e in entries],
        "selected": _entry(hass).entry_id if entries else None,
    })


@websocket_api.websocket_command(
    {vol.Required("type"): "skylight/mealie/week", vol.Required("start"): str, vol.Required("end"): str}
)
@websocket_api.async_response
@_wrap
async def ws_week(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    res = await _service(hass, "get_mealplan", {"start_date": msg["start"], "end_date": msg["end"]})
    meals = []
    for m in res.get("mealplan", []):
        d = m.get("mealplan_date")
        meals.append({
            "id": m.get("mealplan_id"),
            "date": d.isoformat() if isinstance(d, date) else str(d),
            "type": str(m.get("entry_type")),
            "slot": TYPE_SLOT.get(str(m.get("entry_type")), "dinner"),
            "title": m.get("title") or "",
            "text": m.get("description") or "",
            "recipe": _recipe(hass, m.get("recipe"), connection.refresh_token_id),
        })
    connection.send_result(msg["id"], meals)


@websocket_api.websocket_command(
    {vol.Required("type"): "skylight/mealie/recipes", vol.Optional("query", default=""): str}
)
@websocket_api.async_response
@_wrap
async def ws_recipes(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    data: dict[str, Any] = {"result_limit": 24}
    if msg["query"].strip():
        data["search_terms"] = msg["query"].strip()
    try:
        res = await _service(hass, "get_recipes", data)
    except MealieError as err:
        if "no recipes" in str(err).lower():
            connection.send_result(msg["id"], [])
            return
        raise
    items = res.get("recipes", {}).get("items", [])
    connection.send_result(msg["id"], [_recipe(hass, r, connection.refresh_token_id) for r in items])


@websocket_api.websocket_command(
    {vol.Required("type"): "skylight/mealie/recipe", vol.Required("recipe_id"): str}
)
@websocket_api.async_response
@_wrap
async def ws_recipe(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    r = (await _service(hass, "get_recipe", {"recipe_id": msg["recipe_id"]}))["recipe"]
    out = _recipe(hass, r, connection.refresh_token_id)
    out["ingredients"] = [
        (i.get("display") or i.get("original_text") or i.get("note") or "").strip()
        for i in r.get("ingredients", [])
    ]
    out["ingredients"] = [i for i in out["ingredients"] if i]
    out["instructions"] = [s.get("text", "") for s in r.get("instructions", []) if s.get("text")]
    connection.send_result(msg["id"], out)


@websocket_api.websocket_command(
    {
        vol.Required("type"): "skylight/mealie/set",
        vol.Required("date"): str,
        vol.Required("slot"): vol.In(list(SLOT_TYPES)),
        vol.Optional("recipe_id"): str,
        vol.Optional("note_title"): str,
        vol.Optional("note_text"): str,
        vol.Optional("random", default=False): bool,
    }
)
@websocket_api.async_response
@_wrap
async def ws_set(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    base = {"date": msg["date"]}
    if msg["random"]:
        service = "set_random_mealplan"
    else:
        service = "set_mealplan"
        if msg.get("recipe_id"):
            base["recipe_id"] = msg["recipe_id"]
        elif msg.get("note_title"):
            base["note_title"] = msg["note_title"]
            if msg.get("note_text"):
                base["note_text"] = msg["note_text"]
        else:
            connection.send_error(msg["id"], "invalid", "Pick a recipe or type a note")
            return
    types = SLOT_TYPES[msg["slot"]]
    for i, entry_type in enumerate(types[:2]):
        try:
            await _service(hass, service, {**base, "entry_type": entry_type}, response=False)
            break
        except MealieError as err:
            # Mealie < 3.7 has no "snack" type; fall back to "side".
            if i == 0 and len(types) > 1 and isinstance(err.__cause__, ServiceValidationError):
                continue
            raise
    connection.send_result(msg["id"])


@websocket_api.websocket_command(
    {vol.Required("type"): "skylight/mealie/remove", vol.Required("mealplan_id"): int}
)
@websocket_api.async_response
@_wrap
async def ws_remove(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    try:
        resp = await _mealie_http(hass, "DELETE", f"api/households/mealplans/{msg['mealplan_id']}")
    except (aiohttp.ClientError, TimeoutError) as err:
        raise MealieError(f"Cannot reach Mealie: {err}") from err
    if resp.status >= 400:
        raise MealieError(f"Mealie refused to remove the meal (HTTP {resp.status})")
    connection.send_result(msg["id"])


@websocket_api.websocket_command(
    {vol.Required("type"): "skylight/mealie/import", vol.Required("url"): str}
)
@websocket_api.async_response
@_wrap
async def ws_import(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    res = await _service(hass, "import_recipe", {"url": msg["url"].strip()})
    connection.send_result(msg["id"], _recipe(hass, res.get("recipe"), connection.refresh_token_id))


class MealieImageView(HomeAssistantView):
    """Recipe image from Mealie, so the tablet needn't reach Mealie directly."""

    url = "/api/skylight/mealie/image/{recipe_id}"
    name = "api:skylight:mealie:image"
    requires_auth = True

    async def get(self, request: web.Request, recipe_id: str) -> web.StreamResponse:
        hass: HomeAssistant = request.app["hass"]
        if not RECIPE_ID.match(recipe_id):
            return web.Response(status=404)
        try:
            resp = await _mealie_http(hass, "GET", f"api/media/recipes/{recipe_id}/images/min-original.webp")
            if resp.status != 200:
                return web.Response(status=404)
            body = await resp.read()
        except (MealieError, aiohttp.ClientError, TimeoutError):
            return web.Response(status=504)
        return web.Response(body=body, content_type=resp.content_type or "image/webp",
                            headers={"Cache-Control": "private, max-age=86400"})
