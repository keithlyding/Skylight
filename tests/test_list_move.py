"""Phase 4: reordering list items on the server."""

import pytest
from homeassistant.core import HomeAssistant
from homeassistant.setup import async_setup_component
from pytest_homeassistant_custom_component.common import MockConfigEntry

from panel_js import ALL, HELPERS

DOMAIN = "skylight"


@pytest.fixture
async def entry(hass: HomeAssistant, tmp_path):
    hass.config.config_dir = str(tmp_path)
    (tmp_path / ".storage").mkdir()
    assert await async_setup_component(hass, "http", {})
    e = MockConfigEntry(domain=DOMAIN, data={})
    e.add_to_hass(hass)
    assert await hass.config_entries.async_setup(e.entry_id)
    return e


async def _cmd(ws, msg, _id=[4000]):
    _id[0] += 1
    my_id = _id[0]  # keep our own id: calls may run concurrently
    await ws.send_json({"id": my_id, **msg})
    while True:
        r = await ws.receive_json()
        if r.get("id") == my_id and r["type"] == "result":
            return r


def _items(hass):
    return [i["id"] for i in hass.data[DOMAIN]["store"].data["lists"][0]["items"]]


async def test_move_up_down_and_bounds(hass, entry, hass_ws_client, hass_storage):
    ws = await hass_ws_client(hass)
    items = [{"id": x, "text": x, "done": x == "d"} for x in ("a", "b", "d", "c")]
    lists = [{"id": "g", "name": "Groceries", "color": "#fff", "items": items}]
    assert (await _cmd(ws, {"type": "skylight/set", "key": "lists", "value": lists}))["success"]

    move = lambda item, **kw: _cmd(ws, {"type": "skylight/list/move", "list_id": "g", "item_id": item, **kw})
    r = await move("c", direction="up")
    assert r["result"] == {"index": 1}
    assert _items(hass) == ["a", "c", "b", "d"]  # open items first, done item stays below

    assert (await move("a", direction="up"))["result"] == {"index": 0}  # top can't go up
    assert _items(hass) == ["a", "c", "b", "d"]
    assert (await move("b", direction="down"))["result"] == {"index": 2}  # bottom can't go down
    assert (await move("b", to_index=0))["result"] == {"index": 0}
    assert _items(hass) == ["b", "a", "c", "d"]
    assert (await move("a", to_index=99))["result"] == {"index": 2}  # clamped
    assert _items(hass) == ["b", "c", "a", "d"]

    assert (await move("d", direction="up"))["error"]["code"] == "not_found"  # done items don't move
    assert (await move("zzz", direction="up"))["error"]["code"] == "not_found"
    assert not (await _cmd(ws, {"type": "skylight/list/move", "list_id": "g", "item_id": "a"}))["success"]
    assert not (await _cmd(ws, {"type": "skylight/list/move", "list_id": "g", "item_id": "a",
                                "to_index": 1, "direction": "up"}))["success"]

    # Order survives a reload
    await hass.async_block_till_done()
    assert await hass.config_entries.async_reload(entry.entry_id)
    await hass.async_block_till_done()
    assert _items(hass) == ["b", "c", "a", "d"]


def test_done_items_in_completion_order():
    import json
    import pathlib
    import subprocess
    helpers = HELPERS
    items = [{"id": "x", "done": True, "done_at": "2026-09-29T10:00:00Z"}, {"id": "a"},
             {"id": "old1", "done": True}, {"id": "y", "done": True, "done_at": "2026-09-28T10:00:00Z"},
             {"id": "b"}, {"id": "old2", "done": True}]
    script = helpers + f"""
const items = {json.dumps(items)};
console.log(JSON.stringify(orderItems(items).map((i) => i.id)));"""
    try:
        out = subprocess.run(["node", "-e", script], capture_output=True, text=True, check=True).stdout
    except FileNotFoundError:
        pytest.skip("node not installed")
    # open first in list order; done: no-time items (older) in list order, then by check-off time
    assert json.loads(out) == ["a", "b", "old1", "old2", "y", "x"]


async def test_item_commands_are_atomic(hass, entry, hass_ws_client):
    """Two screens editing the same list at once: nothing is lost (each call changes one item on the server)."""
    import asyncio
    ws1, ws2 = await hass_ws_client(hass), await hass_ws_client(hass)
    store = hass.data[DOMAIN]["store"]
    lid = store.data["lists"][0]["id"]
    r = await _cmd(ws1, {"type": "skylight/list/item/add", "list_id": lid, "text": " Milk "})
    milk = r["result"]["id"]
    assert r["result"] == {"id": milk, "text": "Milk", "done": False}

    # interleave: ws1 checks Milk while ws2 adds Eggs; both survive
    await asyncio.gather(
        _cmd(ws1, {"type": "skylight/list/item/update", "list_id": lid, "item_id": milk, "done": True}),
        _cmd(ws2, {"type": "skylight/list/item/add", "list_id": lid, "text": "Eggs"}),
    )
    items = store.data["lists"][0]["items"]
    assert [(i["text"], i["done"]) for i in items] == [("Eggs", False), ("Milk", True)]  # open first
    assert items[1]["done_at"].endswith("Z")

    # rename + uncheck returns it to the bottom of the open items, without its done time
    r = await _cmd(ws2, {"type": "skylight/list/item/update", "list_id": lid, "item_id": milk, "done": False, "text": "Oat milk"})
    assert r["result"]["text"] == "Oat milk" and "done_at" not in r["result"]
    assert [i["text"] for i in store.data["lists"][0]["items"]] == ["Eggs", "Oat milk"]

    await _cmd(ws1, {"type": "skylight/list/item/update", "list_id": lid, "item_id": milk, "done": True})
    assert (await _cmd(ws1, {"type": "skylight/list/item/delete", "list_id": lid, "done": True}))["result"] == 1
    eggs = store.data["lists"][0]["items"][0]["id"]
    assert (await _cmd(ws1, {"type": "skylight/list/item/delete", "list_id": lid, "item_ids": [eggs]}))["result"] == 1
    assert store.data["lists"][0]["items"] == []

    # errors
    assert (await _cmd(ws1, {"type": "skylight/list/item/add", "list_id": lid, "text": "   "}))["error"]["code"] == "invalid"
    assert (await _cmd(ws1, {"type": "skylight/list/item/add", "list_id": "nope", "text": "x"}))["error"]["code"] == "not_found"
    assert (await _cmd(ws1, {"type": "skylight/list/item/update", "list_id": lid, "item_id": "nope", "done": True}))["error"]["code"] == "not_found"


async def test_list_save_and_delete_keep_items(hass, entry, hass_ws_client):
    ws = await hass_ws_client(hass)
    store = hass.data[DOMAIN]["store"]
    await _cmd(ws, {"type": "skylight/set", "key": "members", "value": [
        {"id": "dad", "name": "Dad", "color": "#fff", "avatar": "x", "calendars": [], "role": "adult"},
        {"id": "kid", "name": "Kid", "color": "#fff", "avatar": "x", "calendars": [], "role": "kid"}]})
    new = (await _cmd(ws, {"type": "skylight/list/save", "name": "Honey-do", "color": "#e67e22", "owner": "dad"}))["result"]
    assert new["name"] == "Honey-do" and new["owner"] == "dad" and "items" not in new
    await _cmd(ws, {"type": "skylight/list/item/add", "list_id": new["id"], "text": "Fix fence"})
    # renaming (from a screen that never saw the new item) keeps the items; a kid can't own it
    r = await _cmd(ws, {"type": "skylight/list/save", "list_id": new["id"], "name": "Chores for Dad", "owner": "kid"})
    lst = next(l for l in store.data["lists"] if l["id"] == new["id"])
    assert lst["name"] == "Chores for Dad" and "owner" not in lst and [i["text"] for i in lst["items"]] == ["Fix fence"]
    assert (await _cmd(ws, {"type": "skylight/list/delete", "list_id": new["id"]}))["success"]
    assert all(l["id"] != new["id"] for l in store.data["lists"])
