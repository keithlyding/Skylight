"""Skylight's own lists as Home Assistant to-do entities.

Each Skylight list (Groceries, a honey-do list, ...) appears in Home Assistant's
To-do panel, the HA phone app and Assist. Changes from either side go through the
same atomic store methods the panel uses, so nothing overwrites anything else.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from homeassistant.components.todo import TodoItem, TodoItemStatus, TodoListEntity, TodoListEntityFeature
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.util import dt as dt_util

from .const import DOMAIN, EVENT_UPDATED


def _unique_id(entry: ConfigEntry, list_id: str) -> str:
    return f"{entry.entry_id}_list_{list_id}"


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback) -> None:
    store = hass.data[DOMAIN]["store"]
    entities: dict[str, SkylightTodoList] = {}

    @callback
    def sync(_event=None) -> None:
        """Add entities for new lists, drop deleted ones, refresh the rest."""
        current = {l["id"]: l for l in store.data["lists"]}
        new = [SkylightTodoList(entry, store, lid) for lid in current if lid not in entities]
        for ent in new:
            entities[ent.list_id] = ent
        if new:
            async_add_entities(new)
        registry = er.async_get(hass)
        for lid in [lid for lid in entities if lid not in current]:
            ent = entities.pop(lid)
            if (eid := registry.async_get_entity_id("todo", DOMAIN, _unique_id(entry, lid))) is not None:
                registry.async_remove(eid)
            elif ent.hass is not None:
                hass.async_create_task(ent.async_remove())
        for ent in entities.values():
            if ent.hass is not None:
                ent.refresh()

    sync()
    entry.async_on_unload(hass.bus.async_listen(EVENT_UPDATED, sync))


class SkylightTodoList(TodoListEntity):
    _attr_has_entity_name = False
    _attr_should_poll = False
    _attr_icon = "mdi:format-list-checks"
    _attr_supported_features = (
        TodoListEntityFeature.CREATE_TODO_ITEM
        | TodoListEntityFeature.UPDATE_TODO_ITEM
        | TodoListEntityFeature.DELETE_TODO_ITEM
        | TodoListEntityFeature.MOVE_TODO_ITEM
    )

    def __init__(self, entry: ConfigEntry, store, list_id: str) -> None:
        self._store = store
        self.list_id = list_id
        self._attr_unique_id = _unique_id(entry, list_id)
        self._load()

    def _list(self) -> dict[str, Any] | None:
        return next((l for l in self._store.data["lists"] if l.get("id") == self.list_id), None)

    def _load(self) -> None:
        lst = self._list() or {"name": "List", "items": []}
        self._attr_name = f"Skylight {lst.get('name') or 'List'}"
        items = []
        for i in lst.get("items", []):
            done = bool(i.get("done"))
            completed = dt_util.parse_datetime(i["done_at"]) if done and i.get("done_at") else None
            items.append(TodoItem(summary=i.get("text", ""), uid=i.get("id"),
                                  status=TodoItemStatus.COMPLETED if done else TodoItemStatus.NEEDS_ACTION,
                                  completed=completed if isinstance(completed, datetime) else None))
        self._attr_todo_items = items

    @callback
    def refresh(self) -> None:
        self._load()
        self.async_write_ha_state()

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        lst = self._list() or {}
        owner = next((m.get("name") for m in self._store.data["members"] if m.get("id") == lst.get("owner")), None)
        return {"skylight_list_id": self.list_id, "owner": owner or "Shared"}

    async def _call(self, coro) -> Any:
        try:
            return await coro
        except (KeyError, ValueError) as err:
            raise HomeAssistantError(str(err)) from err

    async def async_create_todo_item(self, item: TodoItem) -> None:
        added = await self._call(self._store.async_list_add_item(self.list_id, item.summary or ""))
        if item.status == TodoItemStatus.COMPLETED:
            await self._call(self._store.async_list_update_item(self.list_id, added["id"], done=True))

    async def async_update_todo_item(self, item: TodoItem) -> None:
        done = None if item.status is None else item.status == TodoItemStatus.COMPLETED
        await self._call(self._store.async_list_update_item(self.list_id, item.uid, text=item.summary, done=done))

    async def async_delete_todo_items(self, uids: list[str]) -> None:
        await self._call(self._store.async_list_delete_items(self.list_id, uids))

    async def async_move_todo_item(self, uid: str, previous_uid: str | None = None) -> None:
        lst = self._list() or {"items": []}
        open_ids = [i["id"] for i in lst["items"] if not i.get("done") and i["id"] != uid]
        if previous_uid is None:
            target = 0
        elif previous_uid in open_ids:
            target = open_ids.index(previous_uid) + 1
        else:  # placed after a checked item: checked items stay below the open ones
            target = len(open_ids)
        await self._call(self._store.async_move_list_item(self.list_id, uid, to_index=target))
