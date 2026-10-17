/* Skylight panel: lists and linked HA to-do lists (methods mixed into SkylightPanel). */

import { PALETTE, adultsOf, orderItems, groupLists, uid, esc } from "./helpers.js?v=1.50.3";

export class ListsView {

  // ---------- linked HA to-do lists ----------
  // ----- reordering list items: drag the ≡ handle -----
  _openIds() {
    if (this._isTodo()) return (this.todoItems[this._todoEntity()] || []).filter((t) => t.status !== "completed").map((t) => t.uid);
    return (this.data.lists.find((l) => l.id === this.ui.list)?.items || []).filter((i) => !i.done).map((i) => i.id);
  }
  // Put an open item at position `target` among the open items.
  async _moveItem(itemId, target) {
    const open = this._openIds();
    const k = open.indexOf(itemId);
    target = Math.max(0, Math.min(open.length - 1, target));
    if (k < 0 || target === k) { this.render(); return; }
    if (this._isTodo()) {
      // Home Assistant to-do: "put it after <previous>" (none = top).
      const rest = open.filter((id) => id !== itemId);
      const previous = target === 0 ? null : rest[target - 1];
      try { await this._hass.callWS({ type: "todo/item/move", entity_id: this._todoEntity(), uid: itemId, ...(previous ? { previous_uid: previous } : {}) }); }
      catch (e) { this._toast(e?.message || String(e)); this.render(); }
      return;
    }
    try { await this._ws({ type: "skylight/list/move", list_id: this.ui.list, item_id: itemId, to_index: target }); }
    catch (e) { this.render(); }
  }
  _dragStart(e) {
    const h = e.target.closest?.("[data-drag]");
    if (!h || this._drag || (e.pointerType === "mouse" && e.button !== 0)) return;
    e.preventDefault();
    const row = h.closest(".item");
    const rows = [...row.parentElement.querySelectorAll(".item:not(.done)")];
    const scroller = this.$app.querySelector(".content");
    this._drag = { id: h.dataset.drag, row, rows, from: rows.indexOf(row), to: rows.indexOf(row), y0: e.clientY, s0: scroller?.scrollTop || 0,
      scroller, tops: rows.map((r) => r.getBoundingClientRect().top), h: row.getBoundingClientRect().height, pid: e.pointerId };
    try { h.setPointerCapture(e.pointerId); } catch (err) { /* old WebView */ }
    row.classList.add("dragging");
    rows.forEach((r) => { if (r !== row) r.classList.add("shifting"); });
    if (navigator.vibrate) try { navigator.vibrate(15); } catch (err) { /* not supported */ }
  }
  _dragMove(e) {
    const g = this._drag;
    if (!g || e.pointerId !== g.pid) return;
    // Scroll the page when dragging near its top or bottom edge.
    if (g.scroller) {
      const box = g.scroller.getBoundingClientRect();
      if (e.clientY < box.top + 60) g.scroller.scrollTop -= 12;
      else if (e.clientY > box.bottom - 60) g.scroller.scrollTop += 12;
    }
    const dy = e.clientY - g.y0 + ((g.scroller?.scrollTop || 0) - g.s0);
    g.row.style.transform = `translateY(${dy}px)`;
    // Where would it land? Count the rows whose middle it has passed.
    const center = g.tops[g.from] + dy + g.h / 2;
    let to = 0;
    g.tops.forEach((t, i) => { if (i !== g.from && center > t + g.h / 2) to++; });
    if (to === g.to) return;
    g.to = to;
    // Slide the others out of the way.
    g.rows.forEach((r, i) => {
      if (r === g.row) return;
      const shift = g.from < to && i > g.from && i <= to ? -g.h : g.from > to && i >= to && i < g.from ? g.h : 0;
      r.style.transform = shift ? `translateY(${shift}px)` : "";
    });
  }
  _dragEnd(e) {
    const g = this._drag;
    if (!g || (e && e.pointerId !== g.pid)) return;
    this._drag = null;
    this._suppressClickUntil = Date.now() + 250;
    if (g.to === g.from || e?.type === "pointercancel") {
      g.rows.forEach((r) => { r.style.transform = ""; r.classList.remove("dragging"); });
      return;
    }
    // Leave the rows where they were dropped; the list redraws in its new order when the server confirms.
    g.row.style.transform = `translateY(${g.tops[g.to] - g.tops[g.from]}px)`;
    g.row.classList.remove("dragging");
    // If no update arrives (a move that didn't take), redraw anyway so nothing stays out of place.
    clearTimeout(this._dropTimer);
    this._dropTimer = setTimeout(() => this.render(), 1500);
    this._moveItem(g.id, g.to);
  }
  // A short slide when list items change places (a drop, a check-off, another screen's change).
  _snapshotItems() {
    const m = new Map();
    this.$app?.querySelectorAll(".items .item[data-key]").forEach((r) => m.set(r.dataset.key, r.getBoundingClientRect().top));
    return m;
  }
  _animateItems(before) {
    if (!before?.size || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    this.$app.querySelectorAll(".items .item[data-key]").forEach((r) => {
      const old = before.get(r.dataset.key);
      if (old === undefined) return;
      const dy = old - r.getBoundingClientRect().top;
      if (Math.abs(dy) < 2) return;
      r.animate?.([{ transform: `translateY(${dy}px)` }, { transform: "translateY(0)" }], { duration: 280, easing: "cubic-bezier(.2,.8,.2,1)" });
    });
  }

  // Skylight's own lists are also HA to-do entities; never offer those back as "linked" lists.
  _ownTodo(e) { return this._hass.entities?.[e]?.platform === "skylight" || this._hass.states[e]?.attributes?.skylight_list_id !== undefined; }
  _isTodo() { return String(this.ui.list || "").startsWith("todo:"); }
  _todoEntity() { return this.ui.list.slice(5); }
  _subscribeTodo(entity) {
    if (this._todoSubs[entity]) return;
    this._todoSubs[entity] = this._hass.connection.subscribeMessage((msg) => {
      this.todoItems[entity] = msg.items || [];
      if (this.ui.tab === "lists") this.render();
    }, { type: "todo/item/subscribe", entity_id: entity });
    this._todoSubs[entity].catch((e) => { console.warn("Skylight: todo subscribe failed", entity, e); delete this._todoSubs[entity]; });
  }
  linkedLists() {
    return (this.data.linked_todos || []).filter((e) => this._hass.states[e] && !this._ownTodo(e)).map((e, i) => {
      this._subscribeTodo(e);
      return {
        id: `todo:${e}`, linked: true, entity: e, canMove: !!((this._hass.states[e]?.attributes?.supported_features || 0) & 8) /* TodoListEntityFeature.MOVE_TODO_ITEM */, owner: (this.data.todo_owners || {})[e], name: this.entityName(e), color: PALETTE[(i * 5 + 3) % PALETTE.length],
        items: (this.todoItems[e] || []).map((t) => ({ id: t.uid, text: t.summary, done: t.status === "completed" })),
      };
    });
  }
  allLists() { return [...(this.data.lists || []), ...this.linkedLists()]; }
  async _listToggle(listId, itemId) {
    if (listId.startsWith("todo:")) {
      const entity_id = listId.slice(5);
      const it = (this.todoItems[entity_id] || []).find((t) => t.uid === itemId);
      try { await this._hass.callService("todo", "update_item", { item: itemId, status: it?.status === "completed" ? "needs_action" : "completed" }, { entity_id }); }
      catch (e) { this._toast(e?.message || String(e)); }
    } else {
      const it = (this.data.lists.find((l) => l.id === listId)?.items || []).find((i) => i.id === itemId);
      if (it) await this._ws({ type: "skylight/list/item/update", list_id: listId, item_id: itemId, done: !it.done });
    }
  }
  async _listAdd(listId, text) {
    if (listId.startsWith("todo:")) {
      try { await this._hass.callService("todo", "add_item", { item: text }, { entity_id: listId.slice(5) }); }
      catch (e) { this._toast(e?.message || String(e)); }
    } else {
      await this._ws({ type: "skylight/list/item/add", list_id: listId, text });
    }
  }

  async _todoAction(kind, itemId) {
    const entity_id = this._todoEntity();
    const target = { entity_id };
    try {
      if (kind === "add") {
        const input = this.shadowRoot.getElementById("newitem");
        const text = input.value.trim(); if (!text) return;
        input.value = "";
        await this._hass.callService("todo", "add_item", { item: text }, target);
        this.shadowRoot.getElementById("newitem")?.focus();
      } else if (kind === "toggle") {
        const it = (this.todoItems[entity_id] || []).find((t) => t.uid === itemId);
        await this._hass.callService("todo", "update_item", { item: itemId, status: it?.status === "completed" ? "needs_action" : "completed" }, target);
      } else if (kind === "delete") {
        await this._hass.callService("todo", "remove_item", { item: itemId }, target);
      } else if (kind === "clear") {
        await this._hass.callService("todo", "remove_completed_items", {}, target);
      }
    } catch (e) { this._toast(e?.message || String(e)); }
  }

  openListDialog(l) {
    const dlg = {
      type: "list", list: l, color: l?.color || PALETTE[(this.data.lists.length * 3) % PALETTE.length],
      html: () => `
        <h2>${l ? "Edit" : "New"} list</h2>
        <label>Name<input id="l-name" value="${esc(l?.name)}" data-autofocus placeholder="Packing list"></label>
        <label>Whose list<select id="l-owner"><option value="">👪 Shared</option>${adultsOf(this.members).map((m) => `<option value="${m.id}" ${l?.owner === m.id ? "selected" : ""}>${m.avatar} ${esc(m.name)}</option>`).join("")}</select></label>
        <div class="label">Color</div>
        <div class="swatches">${PALETTE.map((c) => `<button class="swatch ${c === dlg.color ? "sel" : ""}" style="background:${c}" data-action="pick-color" data-color="${c}"></button>`).join("")}</div>
        <div class="actions">
          ${l ? `<button class="danger" data-action="delete-list">Delete</button>` : ""}
          <span class="spacer"></span>
          <button data-action="close">Cancel</button>
          <button class="primary" data-action="save-list">Save</button>
        </div>`,
    };
    this._openDialog(dlg);
  }
  async saveList() {
    const dlg = this.ui.dialog;
    const name = this.shadowRoot.getElementById("l-name").value.trim();
    if (!name) return;
    const owner = this.shadowRoot.getElementById("l-owner")?.value || "";
    const saved = await this._ws({ type: "skylight/list/save", ...(dlg.list ? { list_id: dlg.list.id } : {}), name, color: dlg.color, owner: owner || null });
    this.ui.list = saved.id; this.closeDialog(); this.render();
  }

  // Lists in the family's chosen order (Arrange); new ones go at the end.
  orderedLists() {
    const lists = [...(this.data.lists || []), ...this.linkedLists()];
    const order = this.settings.list_order || [];
    const pos = (l) => { const i = order.indexOf(l.id); return i < 0 ? order.length + lists.indexOf(l) : i; };
    return lists.sort((a, b) => pos(a) - pos(b));
  }
  // Which list the Lists tab opens on: the chosen one, none ("pick a list"), or the first.
  _defaultList(lists) {
    const def = this.settings.list_default;
    if (def === "none") return null;
    return lists.find((l) => l.id === def)?.id || lists[0]?.id || null;
  }
  async _moveList(id, dir) {
    const ids = this.orderedLists().map((l) => l.id);
    const i = ids.indexOf(id), j = i + dir;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    this.settings.list_order = ids; this.render(); // show it right away
    await this._set("settings", { list_order: ids });
  }

  renderLists() {
    const lists = this.orderedLists();
    if (this.ui.list === undefined) this.ui.list = this._defaultList(lists); // just opened the tab
    if (this.ui.list && !lists.find((l) => l.id === this.ui.list)) this.ui.list = this._defaultList(lists);
    const cur = lists.find((l) => l.id === this.ui.list);
    const arrange = !!this.ui.listArrange;
    const def = this.settings.list_default || "";
    return `<div class="lists">
      <aside>${groupLists(lists, this.members).map((g) => `
        <div class="lgroup" ${g.owner ? `style="--oc:${g.owner.color}"` : ""}>${g.owner ? `<span class="av sm" style="background:${g.owner.color}">${g.owner.avatar}</span>${esc(g.owner.name)}` : "👪 Shared"}</div>
        ${g.lists.map((l, k) => arrange ? `<div class="lname arr" style="--c:${l.color}"><span class="dot"></span>${l.linked ? "🔗 " : ""}${esc(l.name)}
          <span class="lmove"><button data-action="list-move" data-list="${esc(l.id)}" data-dir="-1" ${k ? "" : "disabled"} aria-label="Move up">▲</button><button data-action="list-move" data-list="${esc(l.id)}" data-dir="1" ${k < g.lists.length - 1 ? "" : "disabled"} aria-label="Move down">▼</button></span></div>`
          : `<button class="lname ${l.id === this.ui.list ? "on" : ""}" style="--c:${l.color}" data-action="pick-list" data-list="${l.id}">
        <span class="dot"></span>${l.linked ? "🔗 " : ""}${esc(l.name)}<span class="count">${l.items.filter((i) => !i.done).length}</span></button>`).join("")}`).join("")}
        ${arrange ? `<label class="lopen">Open first<select data-change="setting" data-key="list_default">
            <option value="" ${!def ? "selected" : ""}>The top list</option><option value="none" ${def === "none" ? "selected" : ""}>None (pick each time)</option>
            ${lists.map((l) => `<option value="${esc(l.id)}" ${def === l.id ? "selected" : ""}>${esc(l.name)}</option>`).join("")}</select></label>
          <button class="primary wide" data-action="list-arrange">Done</button>`
        : `<button class="add wide" data-action="new-list">+ New list</button><button class="wide subtle" data-action="list-arrange">↕ Arrange lists</button>`}</aside>
      <section>${cur ? `
        <div class="toolbar"><div class="nav"><h1 style="color:${cur.color}">${esc(cur.name)}</h1></div>
          <div><button data-action="clear-done">Clear completed</button> ${cur.linked
            ? `<select class="ownerpick" data-change="todo-owner" data-entity="${esc(cur.entity)}" aria-label="Whose list"><option value="">👪 Shared</option>${adultsOf(this.members).map((m) => `<option value="${m.id}" ${cur.owner === m.id ? "selected" : ""}>${m.avatar} ${esc(m.name)}</option>`).join("")}</select>`
            : `<button data-action="edit-list" data-list="${cur.id}">Edit</button>`}</div></div>
        <div class="additem"><input id="newitem" data-fresh="1" placeholder="Add an item…" data-enter="add-item"><button class="primary" data-action="add-item">Add</button></div>
        <div class="items">${(() => {
          const ordered = orderItems(cur.items), open = ordered.filter((i) => !i.done);
          const movable = (!cur.linked || cur.canMove) && open.length > 1;
          return ordered.map((i) => `
          <div class="item ${i.done ? "done" : ""}" style="--c:${cur.color}" data-key="${esc(i.id)}">
            ${!i.done && movable ? `<span class="dragh" data-drag="${esc(i.id)}" role="button" aria-label="Drag to move ${esc(i.text)}" title="Drag to move">≡</span>` : movable ? `<span class="dragh off"></span>` : ""}
            <button class="box" data-action="toggle-item" data-item="${esc(i.id)}">${i.done ? "✓" : ""}</button>
            <span data-action="toggle-item" data-item="${esc(i.id)}">${esc(i.text)}</span>
            <button class="x" data-action="delete-item" data-item="${esc(i.id)}">✕</button></div>`).join("") || `<p class="hint">Empty list</p>`;
        })()}
        </div>` : lists.length ? `<div class="empty"><h2>Pick a list</h2><p class="hint">Choose one on the left.</p></div>` : `<div class="empty"><h2>No lists</h2></div>`}</section></div>`;
  }
}
