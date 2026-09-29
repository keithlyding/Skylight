"""Phase 3: adults and kids (role migration, chore picker filter, list owners)."""

import json
import pathlib
import subprocess

import pytest
from homeassistant.core import HomeAssistant
from homeassistant.setup import async_setup_component
from pytest_homeassistant_custom_component.common import MockConfigEntry

DOMAIN = "skylight"
JS = (pathlib.Path(__file__).parents[1] / "custom_components/skylight/frontend/skylight-panel.js").read_text()


async def _load(hass, tmp_path, hass_storage, data):
    hass.config.config_dir = str(tmp_path)
    hass_storage["skylight.data"] = {"version": 1, "key": "skylight.data", "data": data}
    assert await async_setup_component(hass, "http", {})
    e = MockConfigEntry(domain=DOMAIN, data={})
    e.add_to_hass(hass)
    assert await hass.config_entries.async_setup(e.entry_id)
    return hass.data[DOMAIN]["store"]


async def _cmd(ws, msg, _id=[3000]):
    _id[0] += 1
    await ws.send_json({"id": _id[0], **msg})
    while True:
        r = await ws.receive_json()
        if r.get("id") == _id[0] and r["type"] == "result":
            return r


def _m(i, **kw):
    return {"id": i, "name": i.title(), "color": "#123456", "avatar": "🙂", "calendars": [], **kw}


async def test_role_migration(hass, tmp_path, hass_storage):
    store = await _load(hass, tmp_path, hass_storage, {
        "members": [_m("dad"), _m("sam"), _m("mom"), _m("baby", role="kid")],
        "chores": [{"id": "c1", "member_id": "sam", "title": "Bed", "repeat": "daily", "completions": []}],
    })
    roles = {m["id"]: m["role"] for m in store.data["members"]}
    assert roles == {"dad": "adult", "sam": "kid", "mom": "adult", "baby": "kid"}
    assert store.data["settings"]["roles_review"] is True
    assert store.data["chores"][0]["member_id"] == "sam"  # nothing else touched


async def test_no_banner_when_roles_already_set(hass, tmp_path, hass_storage):
    store = await _load(hass, tmp_path, hass_storage, {"members": [_m("dad", role="adult")]})
    assert store.data["settings"]["roles_review"] is False


async def test_list_owners_are_adults_only(hass, tmp_path, hass_storage, hass_ws_client):
    store = await _load(hass, tmp_path, hass_storage, {
        "members": [_m("dad", role="adult"), _m("sam", role="kid")]})
    ws = await hass_ws_client(hass)
    lists = [{"id": "a", "name": "Honey-do", "color": "#fff", "items": [], "owner": "dad"},
             {"id": "b", "name": "Kid list", "color": "#fff", "items": [], "owner": "sam"},
             {"id": "c", "name": "Groceries", "color": "#fff", "items": []}]
    assert (await _cmd(ws, {"type": "skylight/set", "key": "lists", "value": lists}))["success"]
    owners = {l["id"]: l.get("owner") for l in store.data["lists"]}
    assert owners == {"a": "dad", "b": None, "c": None}  # a kid can't own a list

    assert (await _cmd(ws, {"type": "skylight/set", "key": "todo_owners",
                            "value": {"todo.shopping": "dad", "todo.x": "sam", "todo.y": "nobody"}}))["success"]
    assert store.data["todo_owners"] == {"todo.shopping": "dad"}

    # New member without a role defaults to adult; switching dad to kid drops his list ownership
    members = [_m("dad", role="kid"), _m("sam", role="kid"), _m("new")]
    assert (await _cmd(ws, {"type": "skylight/set", "key": "members", "value": members}))["success"]
    assert {m["id"]: m["role"] for m in store.data["members"]} == {"dad": "kid", "sam": "kid", "new": "adult"}
    assert "owner" not in store.data["lists"][0] and store.data["todo_owners"] == {}


def _node(script: str):
    helpers = JS[JS.index("const pad = "):JS.index("class SkylightPanel")]
    try:
        out = subprocess.run(["node", "-e", helpers + script], capture_output=True, text=True, check=True).stdout
    except FileNotFoundError:
        pytest.skip("node not installed")
    return json.loads(out)


def test_chore_picker_shows_kids_only():
    members = [_m("dad", role="adult"), _m("sam", role="kid"), _m("mom", role="adult"), _m("leo", role="kid")]
    assert _node(f"console.log(JSON.stringify(kidsOf({json.dumps(members)}).map((m) => m.id)))") == ["sam", "leo"]
    # the chore editor's "Who" picker uses kidsOf
    assert '<label>Who<select id="c-member">${kidsOf(this.members)' in JS


def test_list_grouping_shared_first_then_adults():
    members = [_m("dad", role="adult"), _m("sam", role="kid"), _m("mom", role="adult")]
    lists = [{"id": "1", "owner": "mom"}, {"id": "2"}, {"id": "3", "owner": "dad"}, {"id": "4", "owner": "sam"},
             {"id": "5", "owner": "gone"}, {"id": "6", "owner": "mom"}]
    groups = _node(f"console.log(JSON.stringify(groupLists({json.dumps(lists)}, {json.dumps(members)})"
                   ".map((g) => [g.owner && g.owner.id, g.lists.map((l) => l.id)])))")
    # kid/unknown owners fall back to Shared; empty groups are left out
    assert groups == [[None, ["2", "4", "5"]], ["dad", ["3"]], ["mom", ["1", "6"]]]
