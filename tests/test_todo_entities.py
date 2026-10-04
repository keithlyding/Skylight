"""Skylight lists as Home Assistant to-do entities."""

import pytest
from homeassistant.core import HomeAssistant
from homeassistant.helpers import entity_registry as er
from homeassistant.setup import async_setup_component
from pytest_homeassistant_custom_component.common import MockConfigEntry

DOMAIN = "skylight"


@pytest.fixture
async def entry(hass: HomeAssistant, tmp_path):
    hass.config.config_dir = str(tmp_path)
    (tmp_path / ".storage").mkdir()
    assert await async_setup_component(hass, "http", {})
    e = MockConfigEntry(domain=DOMAIN, data={})
    e.add_to_hass(hass)
    assert await hass.config_entries.async_setup(e.entry_id)
    await hass.async_block_till_done()
    return e


def _items(hass, eid="todo.lyding_strike_groceries"):
    return hass.data[DOMAIN]["store"].data["lists"][0]["items"]


async def _todo(hass, service, **data):
    await hass.services.async_call("todo", service, data, target={"entity_id": "todo.lyding_strike_groceries"}, blocking=True)
    await hass.async_block_till_done()


async def test_lists_become_todo_entities(hass, entry, hass_ws_client):
    state = hass.states.get("todo.lyding_strike_groceries")
    assert state is not None and state.state == "0"
    assert state.attributes["skylight_list_id"] == "groceries" and state.attributes["owner"] == "Shared"
    assert hass.states.get("todo.lyding_strike_to_do") is not None

    # Home Assistant -> Skylight
    await _todo(hass, "add_item", item="Milk")
    await _todo(hass, "add_item", item="Eggs")
    assert [i["text"] for i in _items(hass)] == ["Milk", "Eggs"]
    assert hass.states.get("todo.lyding_strike_groceries").state == "2"
    await _todo(hass, "update_item", item="Milk", status="completed")
    milk = next(i for i in _items(hass) if i["text"] == "Milk")
    assert milk["done"] and milk["done_at"]
    assert hass.states.get("todo.lyding_strike_groceries").state == "1"
    await _todo(hass, "update_item", item="Eggs", rename="Brown eggs")
    await _todo(hass, "remove_completed_items")
    assert [i["text"] for i in _items(hass)] == ["Brown eggs"]

    # Skylight -> Home Assistant (a change in the panel shows up in the entity)
    ws = await hass_ws_client(hass)
    await ws.send_json({"id": 1, "type": "skylight/list/item/add", "list_id": "groceries", "text": "Bread"})
    assert (await ws.receive_json())["success"]
    await hass.async_block_till_done()
    await ws.send_json({"id": 2, "type": "todo/item/list", "entity_id": "todo.lyding_strike_groceries"})
    items = (await ws.receive_json())["result"]["items"]
    assert [i["summary"] for i in items] == ["Brown eggs", "Bread"]

    # move via HA's websocket (to the top)
    bread = next(i["uid"] for i in items if i["summary"] == "Bread")
    await ws.send_json({"id": 3, "type": "todo/item/move", "entity_id": "todo.lyding_strike_groceries", "uid": bread})
    assert (await ws.receive_json())["success"]
    assert [i["text"] for i in _items(hass)] == ["Bread", "Brown eggs"]

    # new list -> new entity; deleted list -> entity removed
    await ws.send_json({"id": 4, "type": "skylight/list/save", "name": "Honey-do"})
    new_id = (await ws.receive_json())["result"]["id"]
    await hass.async_block_till_done()
    assert hass.states.get("todo.lyding_strike_honey_do") is not None
    await ws.send_json({"id": 5, "type": "skylight/list/delete", "list_id": new_id})
    assert (await ws.receive_json())["success"]
    await hass.async_block_till_done()
    assert hass.states.get("todo.lyding_strike_honey_do") is None
    assert er.async_get(hass).async_get_entity_id("todo", DOMAIN, f"{entry.entry_id}_list_{new_id}") is None


async def test_unload_and_reload(hass, entry):
    assert await hass.config_entries.async_reload(entry.entry_id)
    await hass.async_block_till_done()
    assert hass.states.get("todo.lyding_strike_groceries") is not None


async def test_rename_in_settings(hass, entry, hass_ws_client):
    """Renaming updates the sidebar, the integration title and list names; entity ids stay the same."""
    from homeassistant.components.frontend import DATA_PANELS

    assert hass.data[DATA_PANELS]["skylight"].sidebar_title == "Lyding Strike"
    assert entry.title == "Lyding Strike"
    ws = await hass_ws_client(hass)
    await ws.send_json({"id": 1, "type": "skylight/set", "key": "settings", "value": {"app_name": "  The   Smith Board "}})
    assert (await ws.receive_json())["success"]
    await hass.async_block_till_done()
    assert hass.data[DOMAIN]["store"].data["settings"]["app_name"] == "The Smith Board"
    assert hass.data[DATA_PANELS]["skylight"].sidebar_title == "The Smith Board"
    assert entry.title == "The Smith Board"
    state = hass.states.get("todo.lyding_strike_groceries")  # same entity id, so automations keep working
    assert state.attributes["friendly_name"] == "The Smith Board Groceries"
    # Empty name falls back to the default
    await ws.send_json({"id": 2, "type": "skylight/set", "key": "settings", "value": {"app_name": None}})
    assert (await ws.receive_json())["success"]
    await hass.async_block_till_done()
    assert hass.data[DATA_PANELS]["skylight"].sidebar_title == "Lyding Strike"
