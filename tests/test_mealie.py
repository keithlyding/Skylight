"""Mealie meal planning through HA's mealie.* services (stubbed with real response shapes)."""

from datetime import date

import pytest
from homeassistant.config_entries import ConfigEntryState
from homeassistant.core import HomeAssistant, ServiceCall, SupportsResponse
from homeassistant.exceptions import ServiceValidationError
from homeassistant.setup import async_setup_component
from homeassistant.components.mealie import services as real
from pytest_homeassistant_custom_component.common import MockConfigEntry

MEALIE_URL = "http://mealie.local:9000"
RID = "6b0d2a3c-1111-4222-8333-944455556666"


def _recipe(name="Chicken Tacos", rid=RID):
    return {"recipe_id": rid, "user_id": "u", "group_id": "g", "name": name, "slug": "chicken-tacos",
            "description": "Weeknight tacos", "total_time": "30 min", "prep_time": None}


@pytest.fixture
async def setup(hass: HomeAssistant, tmp_path):
    hass.config.config_dir = str(tmp_path)
    (tmp_path / ".storage").mkdir()
    assert await async_setup_component(hass, "http", {})
    MockConfigEntry(domain="mealie", title="Mealie", data={"host": MEALIE_URL, "api_token": "tok"},
                    state=ConfigEntryState.LOADED).add_to_hass(hass)
    calls = []

    def handler(name, fn):
        async def run(call: ServiceCall):
            calls.append((name, dict(call.data)))
            return fn(call)
        return run

    def set_mealplan(call):
        if call.data["entry_type"] == "snack":  # emulate Mealie < 3.7
            raise ServiceValidationError("snack not supported")
        return None

    schemas = {
        "get_mealplan": real.SERVICE_GET_MEALPLAN_SCHEMA, "get_recipes": real.SERVICE_GET_RECIPES_SCHEMA,
        "get_recipe": real.SERVICE_GET_RECIPE_SCHEMA, "set_mealplan": real.SERVICE_SET_MEALPLAN_SCHEMA,
        "set_random_mealplan": real.SERVICE_SET_RANDOM_MEALPLAN_SCHEMA, "import_recipe": real.SERVICE_IMPORT_RECIPE_SCHEMA,
    }
    for name, fn, resp in [
        ("get_mealplan", lambda c: {"mealplan": [
            {"mealplan_id": 7, "user_id": "u", "group_id": "g", "entry_type": "dinner",
             "mealplan_date": date(2026, 9, 26), "title": None, "description": None, "recipe": _recipe()},
            {"mealplan_id": 8, "user_id": "u", "group_id": "g", "entry_type": "side",
             "mealplan_date": date(2026, 9, 26), "title": "Fruit salad", "description": "", "recipe": None},
        ]}, SupportsResponse.ONLY),
        ("get_recipes", lambda c: {"recipes": {"items": [_recipe(), _recipe("Pancakes", RID.replace("6", "7"))]}}, SupportsResponse.ONLY),
        ("get_recipe", lambda c: {"recipe": {**_recipe(), "tags": [],
            "ingredients": [{"display": "1 lb chicken", "note": "", "original_text": None},
                            {"display": None, "note": "8 tortillas", "original_text": None}],
            "instructions": [{"text": "Cook chicken."}, {"text": "Assemble."}]}}, SupportsResponse.ONLY),
        ("set_mealplan", set_mealplan, SupportsResponse.OPTIONAL),
        ("set_random_mealplan", lambda c: None, SupportsResponse.OPTIONAL),
        ("import_recipe", lambda c: {"recipe": _recipe("Imported")}, SupportsResponse.OPTIONAL),
    ]:
        hass.services.async_register("mealie", name, handler(name, fn), schema=schemas[name], supports_response=resp)

    entry = MockConfigEntry(domain="skylight", data={})
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    return calls


async def _cmd(ws, msg, _id=[500]):
    _id[0] += 1
    await ws.send_json({"id": _id[0], **msg})
    while True:
        res = await ws.receive_json()
        if res.get("id") == _id[0] and res["type"] == "result":
            return res


async def test_info_and_week(hass, setup, hass_ws_client, hass_client, aioclient_mock):
    ws = await hass_ws_client(hass)
    info = (await _cmd(ws, {"type": "skylight/mealie/info"}))["result"]
    assert info["entries"][0]["title"] == "Mealie" and info["selected"]

    res = await _cmd(ws, {"type": "skylight/mealie/week", "start": "2026-09-20", "end": "2026-09-26"})
    assert res["success"], res
    tacos, salad = res["result"]
    assert tacos == {**tacos, "id": 7, "date": "2026-09-26", "slot": "dinner"}
    assert tacos["recipe"]["name"] == "Chicken Tacos" and "authSig=" in tacos["recipe"]["image"]
    assert salad["slot"] == "snack" and salad["title"] == "Fruit salad" and salad["recipe"] is None
    assert setup[-1] == ("get_mealplan", {"config_entry_id": info["selected"], "start_date": date(2026, 9, 20), "end_date": date(2026, 9, 26)})

    # image proxied through HA with the Mealie token
    aioclient_mock.get(f"{MEALIE_URL}/api/media/recipes/{RID}/images/min-original.webp", content=b"WEBP",
                       headers={"Content-Type": "image/webp"})
    http = await hass_client()
    img = await http.get(tacos["recipe"]["image"])
    assert img.status == 200 and await img.read() == b"WEBP"
    assert aioclient_mock.mock_calls[-1][3]["Authorization"] == "Bearer tok"
    assert (await http.get("/api/skylight/mealie/image/..%2Fetc")).status in (400, 404)
    assert (await http.get("/api/skylight/mealie/image/not_a_valid_id!")).status in (400, 401, 404)


async def test_search_recipe_and_set(hass, setup, hass_ws_client, aioclient_mock):
    aioclient_mock.get(f"{MEALIE_URL}/api/recipes", status=500)  # direct API unusable: falls back to the integration's search
    ws = await hass_ws_client(hass)
    res = await _cmd(ws, {"type": "skylight/mealie/recipes", "query": "taco"})
    assert [r["name"] for r in res["result"]] == ["Chicken Tacos", "Pancakes"]
    assert setup[-1][1]["search_terms"] == "taco"

    r = (await _cmd(ws, {"type": "skylight/mealie/recipe", "recipe_id": RID}))["result"]
    assert r["ingredients"] == ["1 lb chicken", "8 tortillas"]
    assert r["instructions"] == ["Cook chicken.", "Assemble."]

    assert (await _cmd(ws, {"type": "skylight/mealie/set", "date": "2026-09-27", "slot": "dinner", "recipe_id": RID}))["success"]
    assert setup[-1] == ("set_mealplan", {**setup[-1][1], "date": date(2026, 9, 27), "entry_type": "dinner", "recipe_id": RID})

    # snack row falls back to "side" on older Mealie
    assert (await _cmd(ws, {"type": "skylight/mealie/set", "date": "2026-09-27", "slot": "snack", "note_title": "Apples"}))["success"]
    assert [c[1]["entry_type"] for c in setup[-2:]] == ["snack", "side"]

    assert (await _cmd(ws, {"type": "skylight/mealie/set", "date": "2026-09-28", "slot": "lunch", "random": True}))["success"]
    assert setup[-1][0] == "set_random_mealplan"

    assert not (await _cmd(ws, {"type": "skylight/mealie/set", "date": "2026-09-28", "slot": "lunch"}))["success"]

    imp = (await _cmd(ws, {"type": "skylight/mealie/import", "url": "https://example.com/r"}))["result"]
    assert imp["name"] == "Imported"


async def test_remove(hass, setup, hass_ws_client, aioclient_mock):
    aioclient_mock.delete(f"{MEALIE_URL}/api/households/mealplans/7", status=200)
    ws = await hass_ws_client(hass)
    assert (await _cmd(ws, {"type": "skylight/mealie/remove", "mealplan_id": 7}))["success"]
    aioclient_mock.clear_requests()
    aioclient_mock.delete(f"{MEALIE_URL}/api/households/mealplans/9", status=403)
    res = await _cmd(ws, {"type": "skylight/mealie/remove", "mealplan_id": 9})
    assert not res["success"] and "403" in res["error"]["message"]


async def test_not_connected(hass: HomeAssistant, tmp_path, hass_ws_client):
    hass.config.config_dir = str(tmp_path)
    assert await async_setup_component(hass, "http", {})
    entry = MockConfigEntry(domain="skylight", data={})
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    ws = await hass_ws_client(hass)
    assert (await _cmd(ws, {"type": "skylight/mealie/info"}))["result"] == {"entries": [], "selected": None}
    res = await _cmd(ws, {"type": "skylight/mealie/week", "start": "2026-09-20", "end": "2026-09-26"})
    assert not res["success"] and "Mealie" in res["error"]["message"]


async def test_browse_organizers_and_cook(hass, setup, hass_ws_client, aioclient_mock):
    ws = await hass_ws_client(hass)
    aioclient_mock.get(f"{MEALIE_URL}/api/recipes", json={"page": 1, "total_pages": 3, "total": 60, "items": [
        {"id": RID, "name": "Chicken Tacos", "slug": "chicken-tacos", "totalTime": "30 minutes", "rating": 5,
         "recipeCategory": [{"name": "Dinner", "slug": "dinner"}]}]})
    res = await _cmd(ws, {"type": "skylight/mealie/browse", "query": "taco", "category": "dinner", "sort": "new", "page": 1})
    assert res["success"], res
    r = res["result"]
    assert r["total_pages"] == 3 and r["items"][0]["categories"] == ["Dinner"] and "authSig=" in r["items"][0]["image"]
    q = str(aioclient_mock.mock_calls[-1][1])
    assert "search=taco" in q and "categories=dinner" in q and "orderBy=created_at" in q and "orderDirection=desc" in q
    assert aioclient_mock.mock_calls[-1][3]["Authorization"] == "Bearer tok"

    aioclient_mock.get(f"{MEALIE_URL}/api/organizers/categories", json={"items": [{"id": "c1", "name": "Dinner", "slug": "dinner"}]})
    aioclient_mock.get(f"{MEALIE_URL}/api/organizers/tags", status=500)
    org = (await _cmd(ws, {"type": "skylight/mealie/organizers"}))["result"]
    assert org == {"categories": [{"id": "c1", "name": "Dinner", "slug": "dinner"}], "tags": []}

    aioclient_mock.get(f"{MEALIE_URL}/api/groups/self", json={"slug": "home"})
    aioclient_mock.get(f"{MEALIE_URL}/api/recipes/chicken-tacos", json={
        "id": RID, "name": "Chicken Tacos", "slug": "chicken-tacos", "recipeServings": 4, "recipeYield": "4 servings",
        "prepTime": "10 minutes", "performTime": "20 minutes", "settings": {"disableAmount": False},
        "recipeIngredient": [
            {"title": "Filling", "quantity": 1.5, "unit": {"name": "pound", "pluralName": "pounds"}, "food": {"name": "chicken"},
             "note": "boneless", "display": "1 1/2 pounds chicken boneless"},
            {"quantity": 0, "unit": None, "food": None, "note": "salt to taste", "display": "salt to taste"},
        ],
        "recipeInstructions": [{"title": "", "text": "Cook chicken."}, {"text": ""}, {"title": "Serve", "text": "Assemble."}],
        "notes": [{"title": "Tip", "text": "Warm the tortillas."}], "orgURL": "https://example.com/tacos"})
    res = await _cmd(ws, {"type": "skylight/mealie/cook", "recipe": "chicken-tacos"})
    assert res["success"], res
    c = res["result"]
    assert c["servings"] == 4 and c["prep_time"] == "10 minutes" and c["cook_time"] == "20 minutes"
    chicken, salt = c["ingredients"]
    assert chicken == {"section": "Filling", "text": "1 1/2 pounds chicken boneless", "scalable": True, "qty": 1.5,
                       "unit": "pound", "unit_plural": "pounds", "food": "chicken", "food_plural": "chicken", "note": "boneless"}
    assert salt["scalable"] is False and salt["qty"] is None and salt["text"] == "salt to taste"
    assert c["steps"] == [{"section": "", "text": "Cook chicken."}, {"section": "Serve", "text": "Assemble."}]
    assert c["link"] == f"{MEALIE_URL}/g/home/r/chicken-tacos"

    bad = await _cmd(ws, {"type": "skylight/mealie/cook", "recipe": "../api/users"})
    assert not bad["success"]


async def test_delete_recipe(hass, setup, hass_ws_client, aioclient_mock):
    ws = await hass_ws_client(hass)
    aioclient_mock.delete(f"{MEALIE_URL}/api/recipes/chicken-tacos", json={})
    res = await _cmd(ws, {"type": "skylight/mealie/delete_recipe", "recipe": "chicken-tacos"})
    assert res["success"], res
    assert aioclient_mock.mock_calls[-1][0] == "DELETE" and aioclient_mock.mock_calls[-1][3]["Authorization"] == "Bearer tok"
    aioclient_mock.clear_requests()
    aioclient_mock.delete(f"{MEALIE_URL}/api/recipes/locked-one", status=403)
    res = await _cmd(ws, {"type": "skylight/mealie/delete_recipe", "recipe": "locked-one"})
    assert not res["success"] and "locked" in res["error"]["message"]
    res = await _cmd(ws, {"type": "skylight/mealie/delete_recipe", "recipe": "../users/self"})
    assert not res["success"]


def test_rank_recipes():
    from custom_components.skylight.mealie import parse_query, rank_recipes
    assert parse_query('chicken "pot pie" Easy') == (["pot pie"], ["chicken", "easy"])
    rs = [{"id": str(i), "name": n, "description": d} for i, n, d in [
        (1, "Apple Pie", ""), (2, "Chicken Pot Pie", ""), (3, "Pot Roast", "a pie-like dish"),
        (4, "Chicken Soup", ""), (5, "Grilled Chicken", "great with pot pie crust"), (6, "Shepherd's Pie", "")]]
    names = lambda q, content=(): [r["name"] for r in rank_recipes(q, rs, list(content))]
    assert names("chicken pie")[:2] == ["Chicken Pot Pie", "Chicken Soup"]  # both words in the title first
    assert set(names("chicken pie")[2:]) == {"Grilled Chicken", "Apple Pie", "Shepherd's Pie"}  # one word in the title
    assert names('"pot pie"') == ["Chicken Pot Pie", "Grilled Chicken"]  # exact phrase: title, then description
    assert names("roast", content=["4"]) == ["Pot Roast", "Chicken Soup"]  # then Mealie's ingredient matches
    assert names("ipe") == []  # words match at word starts only (no "recipe" inside other words)


async def test_search_ranks_titles_first(hass, setup, hass_ws_client, aioclient_mock):
    aioclient_mock.get(f"{MEALIE_URL}/api/recipes", params={"search": "taco", "perPage": 40, "page": 1}, json={"items": [{"id": "a"}]})
    aioclient_mock.get(f"{MEALIE_URL}/api/recipes", json={"items": [
        {"id": "a", "name": "Beef Stew", "slug": "beef-stew"},
        {"id": "b", "name": "Taco Soup", "slug": "taco-soup"},
        {"id": "c", "name": "Chicken Tacos", "slug": "chicken-tacos", "totalTime": "30 min"}]})
    ws = await hass_ws_client(hass)
    res = (await _cmd(ws, {"type": "skylight/mealie/recipes", "query": "taco"}))["result"]
    assert [r["name"] for r in res] == ["Taco Soup", "Chicken Tacos", "Beef Stew"]  # stew: Mealie found "taco" inside it
    assert res[1]["total_time"] == "30 min" and res[1]["id"] == "c"
