"""Mealie meal planning, via Home Assistant's Mealie integration.

Reads and writes go through the `mealie.*` services so Skylight reuses the
connection the user already configured. Two things those services don't
cover are done with the same Mealie URL/token from that config entry:
removing a meal-plan entry, and fetching recipe images for the tablet.
"""

from __future__ import annotations

import re
import time
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

from . import security
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
    for cmd in (ws_info, ws_week, ws_recipes, ws_recipe, ws_set, ws_remove, ws_import, ws_browse, ws_organizers, ws_cook, ws_delete_recipe):
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


def parse_query(query: str) -> tuple[list[str], list[str]]:
    """("exact phrases", words) from a search box, lowercased. Text in "quotes" is one phrase."""
    q = query.replace("\u201c", '"').replace("\u201d", '"').lower()
    phrases = [p.strip() for p in re.findall(r'"([^"]+)"', q) if p.strip()]
    rest = re.sub(r'"[^"]*"?', " ", q)
    return phrases, [w for w in re.findall(r"[\w'&-]+", rest) if w]


def _hits(text: str, terms: list[str]) -> int:
    """How many terms appear in text, each starting at a word (so "pie" finds "Pie" and "pies", not "recipe")."""
    return sum(1 for t in terms if re.search(r"(?<!\w)" + re.escape(t), text))


def rank_recipes(query: str, recipes: list[dict], content_ids: list[str], limit: int = 40) -> list[dict]:
    """Recipes whose title has the search words come first (all words before some, then a title that
    starts with them), then ones found in the description, then Mealie's own ingredient/instruction
    matches. Quoted phrases must match exactly wherever they're checked."""
    phrases, words = parse_query(query)
    terms = phrases + words
    if not terms:
        return recipes[:limit]
    by_id = {r.get("id"): r for r in recipes}
    scored = []
    for i, r in enumerate(recipes):
        name = str(r.get("name") or "").lower()
        n = _hits(name, terms)
        if n and _hits(name, phrases) == len(phrases):
            whole = n == len(terms)
            starts = name.startswith(terms[0])
            scored.append(((0 if whole else 1), -n, 0 if starts else 1, name, r))
    scored.sort(key=lambda x: x[:4])
    out = [x[4] for x in scored]
    seen = {r.get("id") for r in out}
    for r in recipes:  # description (summaries include it)
        desc = str(r.get("description") or "").lower()
        if r.get("id") not in seen and _hits(desc, terms) == len(terms):
            out.append(r); seen.add(r.get("id"))
    for rid in content_ids:  # Mealie's full-text matches (ingredients, instructions)
        if rid not in seen and rid in by_id:
            out.append(by_id[rid]); seen.add(rid)
    return out[:limit]


def _summary_as_service(r: dict[str, Any]) -> dict[str, Any]:
    """A recipe from Mealie's own API in the shape the meal-plan service uses."""
    return {"recipe_id": r.get("id"), "name": r.get("name"), "slug": r.get("slug"),
            "description": r.get("description"), "total_time": r.get("totalTime") or r.get("total_time")}


ALL_RECIPES_CACHE = f"{DOMAIN}_mealie_all"


async def _all_recipes(hass: HomeAssistant) -> list[dict]:
    hit = hass.data.get(ALL_RECIPES_CACHE)
    if hit and time.monotonic() - hit[0] < 300:
        return hit[1]
    data = await _mealie_json(hass, "api/recipes", {"perPage": -1, "orderBy": "name", "orderDirection": "asc"})
    items = data.get("items", []) if isinstance(data, dict) else []
    hass.data[ALL_RECIPES_CACHE] = (time.monotonic(), items)
    return items


@websocket_api.websocket_command(
    {vol.Required("type"): "skylight/mealie/recipes", vol.Optional("query", default=""): str}
)
@websocket_api.async_response
@_wrap
async def ws_recipes(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    query = msg["query"].strip()
    try:
        recipes = await _all_recipes(hass)
    except MealieError:
        recipes = None
    if recipes is None:  # Mealie's API not reachable directly: fall back to the integration's search
        data: dict[str, Any] = {"result_limit": 24}
        if query:
            data["search_terms"] = query
        try:
            res = await _service(hass, "get_recipes", data)
        except MealieError as err:
            if "no recipes" in str(err).lower():
                connection.send_result(msg["id"], [])
                return
            raise
        items = res.get("recipes", {}).get("items", [])
        connection.send_result(msg["id"], [_recipe(hass, r, connection.refresh_token_id) for r in items])
        return
    content: list[str] = []
    if query:
        try:
            found = await _mealie_json(hass, "api/recipes", {"search": query, "perPage": 40, "page": 1})
            content = [r.get("id") for r in found.get("items", [])]
        except MealieError:
            pass
    ranked = rank_recipes(query, recipes, content) if query else recipes[:24]
    connection.send_result(msg["id"], [_recipe(hass, _summary_as_service(r), connection.refresh_token_id) for r in ranked])


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


async def _mealie_json(hass: HomeAssistant, path: str, params: dict[str, Any] | None = None) -> Any:
    """GET a Mealie API path with the integration's own URL and token."""
    entry = _entry(hass)
    host = entry.data["host"].rstrip("/")
    session = async_get_clientsession(hass, verify_ssl=entry.data.get("verify_ssl", True))
    try:
        async with session.get(f"{host}/{path}", params=params, timeout=TIMEOUT,
                               headers={"Authorization": f"Bearer {entry.data['api_token']}"}) as resp:
            if resp.status == 404:
                raise MealieError("Not found in Mealie")
            if resp.status >= 400:
                raise MealieError(f"Mealie returned HTTP {resp.status}")
            return await resp.json(content_type=None)
    except (aiohttp.ClientError, TimeoutError) as err:
        raise MealieError(f"Cannot reach Mealie: {err}") from err


def _time(v: Any) -> str | None:
    return str(v).strip() if v not in (None, "", 0) else None


def _card(hass: HomeAssistant, r: dict[str, Any], token_id: str | None) -> dict[str, Any]:
    """A recipe from Mealie's REST list (camelCase) in the same shape as _recipe()."""
    rid = r.get("id")
    return {
        "id": rid, "name": r.get("name"), "slug": r.get("slug"), "description": r.get("description") or "",
        "total_time": _time(r.get("totalTime")), "rating": r.get("rating"),
        "categories": [c.get("name") for c in r.get("recipeCategory") or [] if c.get("name")],
        "image": _sign(hass, f"/api/skylight/mealie/image/{rid}", token_id) if rid and r.get("image") is not False else None,
    }


SORTS = {"name": ("name", "asc"), "new": ("created_at", "desc"), "rating": ("rating", "desc"), "updated": ("updated_at", "desc")}


@websocket_api.websocket_command(
    {
        vol.Required("type"): "skylight/mealie/browse",
        vol.Optional("query", default=""): str,
        vol.Optional("category"): str,
        vol.Optional("tag"): str,
        vol.Optional("sort", default="name"): vol.In(list(SORTS)),
        vol.Optional("page", default=1): vol.All(int, vol.Range(min=1)),
    }
)
@websocket_api.async_response
@_wrap
async def ws_browse(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    order, direction = SORTS[msg["sort"]]
    params: dict[str, Any] = {"page": msg["page"], "perPage": 24, "orderBy": order, "orderDirection": direction}
    if msg["query"].strip():
        params["search"] = msg["query"].strip()
    if msg.get("category"):
        params["categories"] = msg["category"]
    if msg.get("tag"):
        params["tags"] = msg["tag"]
    data = await _mealie_json(hass, "api/recipes", params)
    connection.send_result(msg["id"], {
        "items": [_card(hass, r, connection.refresh_token_id) for r in data.get("items", [])],
        "page": data.get("page", msg["page"]), "total_pages": data.get("total_pages") or data.get("totalPages") or 1,
        "total": data.get("total"),
    })


@websocket_api.websocket_command({vol.Required("type"): "skylight/mealie/organizers"})
@websocket_api.async_response
@_wrap
async def ws_organizers(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    out = {}
    for key, path in (("categories", "api/organizers/categories"), ("tags", "api/organizers/tags")):
        try:
            data = await _mealie_json(hass, path, {"perPage": -1, "orderBy": "name", "orderDirection": "asc"})
            out[key] = [{"id": x.get("id"), "name": x.get("name"), "slug": x.get("slug")} for x in data.get("items", []) if x.get("name")]
        except MealieError:
            out[key] = []
    connection.send_result(msg["id"], out)


def _unit(u: Any, plural: bool = False) -> str:
    if not u:
        return ""
    if isinstance(u, str):
        return u
    if u.get("useAbbreviation") and u.get("abbreviation"):
        return u.get("pluralAbbreviation") if plural and u.get("pluralAbbreviation") else u["abbreviation"]
    return (u.get("pluralName") if plural and u.get("pluralName") else u.get("name")) or ""


def _food(f: Any, plural: bool = False) -> str:
    if not f:
        return ""
    if isinstance(f, str):
        return f
    return (f.get("pluralName") if plural and f.get("pluralName") else f.get("name")) or ""


def _servings(r: dict[str, Any]) -> float | None:
    for key in ("recipeServings", "recipeYieldQuantity"):
        try:
            v = float(r.get(key) or 0)
        except (TypeError, ValueError):
            v = 0
        if v > 0:
            return v
    m = re.search(r"\d+(?:\.\d+)?", str(r.get("recipeYield") or ""))
    return float(m.group()) if m else None


async def _recipe_link(hass: HomeAssistant, slug: str) -> str | None:
    """Link to the recipe in Mealie's web app, for the QR code."""
    base = (hass.data[DOMAIN]["store"].data["settings"].get("mealie_phone_url") or _entry(hass).data["host"]).rstrip("/")
    cache = hass.data.setdefault(f"{DOMAIN}_mealie_group", {})
    entry_id = _entry(hass).entry_id
    if entry_id not in cache:
        try:
            cache[entry_id] = (await _mealie_json(hass, "api/groups/self")).get("slug")
        except MealieError:
            return None
    group = cache[entry_id]
    return f"{base}/g/{group}/r/{slug}" if group and slug else None


@websocket_api.websocket_command(
    {vol.Required("type"): "skylight/mealie/cook", vol.Required("recipe"): str}
)
@websocket_api.async_response
@_wrap
async def ws_cook(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    """Everything cook mode needs: structured (scalable) ingredients, steps, servings, link."""
    key = msg["recipe"].strip()
    if not re.match(r"^[\w-]{1,200}$", key):
        connection.send_error(msg["id"], "invalid", "Bad recipe id")
        return
    r = await _mealie_json(hass, f"api/recipes/{key}")
    no_amounts = bool((r.get("settings") or {}).get("disableAmount"))
    ingredients = []
    for i in r.get("recipeIngredient") or []:
        qty = i.get("quantity")
        try:
            qty = float(qty) if qty not in (None, "") else None
        except (TypeError, ValueError):
            qty = None
        text = (i.get("display") or i.get("originalText") or i.get("note") or "").strip()
        scalable = not no_amounts and qty is not None and qty > 0 and bool(i.get("food") or i.get("unit"))
        ingredients.append({
            "section": (i.get("title") or "").strip(), "text": text, "scalable": scalable, "qty": qty if scalable else None,
            "unit": _unit(i.get("unit")), "unit_plural": _unit(i.get("unit"), True),
            "food": _food(i.get("food")), "food_plural": _food(i.get("food"), True), "note": (i.get("note") or "").strip(),
        })
    steps = [{"section": (s.get("title") or "").strip(), "text": (s.get("text") or "").strip()}
             for s in r.get("recipeInstructions") or [] if (s.get("text") or "").strip()]
    connection.send_result(msg["id"], {
        **_card(hass, r, connection.refresh_token_id),
        "servings": _servings(r), "yield": r.get("recipeYield") or "",
        "prep_time": _time(r.get("prepTime")), "cook_time": _time(r.get("performTime") or r.get("cookTime")),
        "ingredients": [x for x in ingredients if x["text"] or x["food"]],
        "steps": steps,
        "notes": [{"title": n.get("title") or "", "text": n.get("text") or ""} for n in r.get("notes") or [] if n.get("text")],
        "source": r.get("orgURL") or "",
        "link": await _recipe_link(hass, r.get("slug") or key),
    })


@websocket_api.websocket_command(
    {vol.Required("type"): "skylight/mealie/delete_recipe", vol.Required("recipe"): str}
)
@websocket_api.async_response
@security.gated
@_wrap
async def ws_delete_recipe(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    """Permanently delete a recipe from Mealie."""
    key = msg["recipe"].strip()
    if not re.match(r"^[\w-]{1,200}$", key):
        connection.send_error(msg["id"], "invalid", "Bad recipe id")
        return
    try:
        resp = await _mealie_http(hass, "DELETE", f"api/recipes/{key}")
    except (aiohttp.ClientError, TimeoutError) as err:
        raise MealieError(f"Cannot reach Mealie: {err}") from err
    if resp.status in (401, 403):
        raise MealieError("Mealie won't let this account delete that recipe (it may be locked or owned by someone else).")
    if resp.status >= 400:
        raise MealieError(f"Mealie refused to delete the recipe (HTTP {resp.status})")
    connection.send_result(msg["id"])


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
