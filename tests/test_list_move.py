"""Phase 4: reordering list items on the server."""

import pytest
from homeassistant.core import HomeAssistant
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
    return e


async def _cmd(ws, msg, _id=[4000]):
    _id[0] += 1
    await ws.send_json({"id": _id[0], **msg})
    while True:
        r = await ws.receive_json()
        if r.get("id") == _id[0] and r["type"] == "result":
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
    js = (pathlib.Path(__file__).parents[1] / "custom_components/skylight/frontend/skylight-panel.js").read_text()
    helpers = js[js.index("const pad = "):js.index("class SkylightPanel")]
    items = [{"id": "x", "done": True, "done_at": "2026-09-29T10:00:00Z"}, {"id": "a"},
             {"id": "old1", "done": True}, {"id": "y", "done": True, "done_at": "2026-09-28T10:00:00Z"},
             {"id": "b"}, {"id": "old2", "done": True}]
    script = helpers + f"""
const items = {json.dumps(items)};
const t = toggleItem({{id: "n", done: false}}), u = toggleItem(t);
console.log(JSON.stringify([orderItems(items).map((i) => i.id), !!t.done_at && t.done, "done_at" in u, u.done]));"""
    try:
        out = subprocess.run(["node", "-e", script], capture_output=True, text=True, check=True).stdout
    except FileNotFoundError:
        pytest.skip("node not installed")
    order, checked, has_time_after_uncheck, done_after_uncheck = json.loads(out)
    # open first in list order; done: no-time items (older) in list order, then by check-off time
    assert order == ["a", "b", "old1", "old2", "y", "x"]
    assert checked is True and has_time_after_uncheck is False and done_after_uncheck is False
