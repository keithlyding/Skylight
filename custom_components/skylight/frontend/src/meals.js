/* Skylight panel: meals, Mealie and cook mode (methods mixed into SkylightPanel). */

import { PANEL_VERSION, MEAL_SLOTS, ymd, parseYmd, addDays, sameDay, esc } from "./helpers.js?v=1.36.0";

export class MealsView {
  async _loadMealie() {
    if (!this.mealieOn) return;
    const s = this.weekStart(this.ui.anchor);
    const key = `${ymd(s)}|${this.mealie.selected}`;
    if (key === this._mealieKey) return;
    this._mealieKey = key;
    try {
      const meals = await this._hass.callWS({ type: "skylight/mealie/week", start: ymd(s), end: ymd(addDays(s, 6)) });
      if (key !== this._mealieKey) return;
      this.mealieMeals = meals; this.ui.mealieError = null;
    } catch (e) { this.mealieMeals = []; this.ui.mealieError = e.message; }
    if (this.ui.tab === "meals") this.render();
  }
  mealieFor(date, slot) { return this.mealieMeals.filter((m) => m.date === date && m.slot === slot); }
  mealieName(m) { return m.recipe?.name || m.title || "Meal"; }

  openMealieDialog(date, slot) {
    const label = MEAL_SLOTS.find((x) => x[0] === slot);
    const dlg = {
      type: "mealie", date, slot, results: null, loading: false,
      html: () => {
        const current = this.mealieFor(date, slot);
        const synced = this.syncedMeals(parseYmd(date), slot);
        return `
        <h2>${label[2]} ${label[1]} · ${parseYmd(date).toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" })}</h2>
        ${current.map((m) => `<div class="mplan">
            ${m.recipe?.image ? `<img src="${m.recipe.image}" alt="">` : `<span class="noimg">📝</span>`}
            <div class="grow" ${m.recipe ? `data-action="view-recipe" data-recipe="${esc(m.recipe.id)}"` : ""}><b>${esc(this.mealieName(m))}</b>${m.recipe ? `<small>View recipe ›</small>` : m.text ? `<small>${esc(m.text)}</small>` : ""}</div>
            <button class="x" data-action="mealie-remove" data-meal="${m.id}">✕</button></div>`).join("")}
        ${synced.map((e) => `<div class="syncedrow">📅 <b>${esc(this.mealTitle(e))}</b> <small>from ${esc(this.entityName(e.entity))}</small></div>`).join("")}
        <div class="additem" style="margin-top:12px"><input id="mealie-q" placeholder="Search recipes…" data-enter="mealie-search" autofocus><button data-action="mealie-search">Search</button><button data-action="mealie-random" title="Random recipe">🎲</button></div>
        <div class="rgrid">${dlg.loading ? `<p class="hint">Searching…</p>` : (dlg.results || []).map((r) => `
          <button class="rcardmini" data-action="mealie-add" data-recipe="${esc(r.id)}">
            ${r.image ? `<img src="${r.image}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">` : ""}<span>${esc(r.name)}</span></button>`).join("") || (dlg.results ? `<p class="hint">No recipes found.</p>` : "")}</div>
        <details><summary>More options</summary>
          <div class="additem"><input id="mealie-note" placeholder="Just a note, e.g. Leftovers / Eat out" data-enter="mealie-note"><button data-action="mealie-note">Add note</button></div>
          <div class="additem"><input id="mealie-url" placeholder="Import recipe from a website URL"><button data-action="mealie-import">Import &amp; add</button></div>
        </details>
        <div class="actions"><span class="spacer"></span><button data-action="close">Done</button></div>`;
      },
    };
    this._openDialog(dlg);
    this._mealieSearch();
  }

  async _mealieSearch() {
    const dlg = this.ui.dialog;
    if (dlg?.type !== "mealie") return;
    const q = this.shadowRoot.getElementById("mealie-q")?.value || "";
    dlg.loading = true; this.renderDialog();
    try { dlg.results = await this._ws({ type: "skylight/mealie/recipes", query: q }); }
    catch (e) { dlg.results = []; }
    dlg.loading = false;
    if (this.ui.dialog === dlg) this.renderDialog();
  }

  async _mealieSet(extra) {
    const dlg = this.ui.dialog;
    await this._ws({ type: "skylight/mealie/set", date: dlg.date, slot: dlg.slot, ...extra });
    await this._reloadMealie();
    this.closeDialog();
  }

  async openRecipe(id) {
    let r;
    try { r = await this._ws({ type: "skylight/mealie/recipe", recipe_id: id }); } catch (e) { return; }
    const lists = [...(this.data.linked_todos || [])].filter((e) => this._hass.states[e]);
    this._openDialog({
      type: "recipe",
      html: () => `
        ${r.image ? `<img class="hero" src="${r.image}" alt="" onerror="this.remove()">` : ""}
        <h2>${esc(r.name)}</h2>
        ${r.total_time ? `<p class="hint">⏱ ${esc(r.total_time)}</p>` : ""}
        ${r.description ? `<p>${esc(r.description)}</p>` : ""}
        <h3>Ingredients</h3>
        <div class="checklist ings">${r.ingredients.map((i) => `<label class="check"><input type="checkbox" class="ing-check" value="${esc(i)}"> ${esc(i)}</label>`).join("") || `<p class="hint">None listed</p>`}</div>
        ${lists.length ? `<div class="additem"><select id="recipe-list">${lists.map((e) => `<option value="${e}">${esc(this.entityName(e))}</option>`).join("")}</select><button data-action="recipe-to-list">Add checked to list</button></div>`
          : `<p class="hint">Link a shopping list in Settings to send ingredients to it.</p>`}
        <h3>Steps</h3>
        <ol class="steps">${r.instructions.map((t) => `<li>${esc(t)}</li>`).join("")}</ol>
        <div class="actions"><span class="spacer"></span><button class="primary" data-action="close">Close</button></div>`,
    });
  }

  // ---------- Mealie: recipe browser ----------
  async _loadOrganizers() {
    if (this._orgLoaded) return;
    this._orgLoaded = true;
    try { this.mealieOrg = await this._hass.callWS({ type: "skylight/mealie/organizers" }); }
    catch (e) { this.mealieOrg = { categories: [], tags: [] }; }
    if (this.ui.tab === "meals") this.render();
  }
  async _browse(more = false) {
    const b = this.browse || (this.browse = { query: "", category: "", tag: "", sort: "name", items: null, page: 0, pages: 1 });
    const page = more ? b.page + 1 : 1;
    const req = (b.req = (b.req || 0) + 1);
    b.loading = true; if (!more) b.items = null;
    if (this.ui.tab === "meals") this.render();
    try {
      const msg = { type: "skylight/mealie/browse", query: b.query, sort: b.sort, page };
      if (b.category) msg.category = b.category;
      if (b.tag) msg.tag = b.tag;
      const r = await this._hass.callWS(msg);
      if (req !== b.req) return;
      b.items = more ? [...(b.items || []), ...r.items] : r.items;
      b.page = r.page; b.pages = r.total_pages; b.total = r.total; b.error = null;
    } catch (e) {
      if (req !== b.req) return;
      b.error = /unknown command/i.test(e.message || "") ? `Restart Home Assistant to finish updating ${this.appName}.` : e.message; b.items = b.items || [];
    }
    b.loading = false;
    if (this.ui.tab === "meals") this.render();
  }
  renderRecipes() {
    this._loadOrganizers();
    if (!this.browse) this._browse();
    const b = this.browse;
    const org = this.mealieOrg || { categories: [], tags: [] };
    const cats = org.categories.slice(0, 30);
    return `<div class="rbrowse">
      <div class="rbar">
        <input id="rb-q" type="search" placeholder="Search recipes or ingredients…" value="${esc(b.query)}" data-enter="rb-search">
        <select data-change="rb-sort" aria-label="Sort">${[["name", "A–Z"], ["new", "Newest"], ["rating", "Top rated"], ["updated", "Recently edited"]].map(([v, l]) => `<option value="${v}" ${b.sort === v ? "selected" : ""}>${l}</option>`).join("")}</select>
        ${org.tags.length ? `<select data-change="rb-tag" aria-label="Tag"><option value="">All tags</option>${org.tags.map((t) => `<option value="${esc(t.slug)}" ${b.tag === t.slug ? "selected" : ""}>${esc(t.name)}</option>`).join("")}</select>` : ""}
      </div>
      ${cats.length ? `<div class="seg rcats"><button class="${!b.category ? "on" : ""}" data-action="rb-cat" data-cat="">All</button>${cats.map((c) => `<button class="${b.category === c.slug ? "on" : ""}" data-action="rb-cat" data-cat="${esc(c.slug)}">${esc(c.name)}</button>`).join("")}</div>` : ""}
      ${b.error ? `<p class="hint">⚠️ ${esc(b.error)}</p>` : ""}
      <div class="rbgrid">${(b.items || []).map((r) => `<div class="rbcard" role="button" tabindex="0" data-action="cook" data-recipe="${esc(r.slug || r.id)}">
          <div class="rbimg">${r.image ? `<img src="${esc(r.image)}" alt="" loading="lazy" onerror="this.remove()">` : ""}<span>🍽️</span></div>
          <b>${esc(r.name)}</b><small>${[r.total_time ? `⏱ ${esc(r.total_time)}` : "", r.rating ? "★".repeat(Math.round(r.rating)) : ""].filter(Boolean).join(" · ")}</small></div>`).join("")}</div>
      ${b.loading ? `<p class="hint center">Loading recipes…</p>` : b.items && !b.items.length ? `<p class="hint center">No recipes found.</p>` : ""}
      ${!b.loading && b.items && b.page < b.pages ? `<div class="center"><button data-action="rb-more">Show more${b.total ? ` (${b.items.length} of ${b.total})` : ""}</button></div>` : ""}
    </div>`;
  }

  // Hidden delete: hold a recipe picture for 5 s to show its Delete button for 15 s.
  _delShown(key) { return this._delReveal?.key === key && Date.now() < this._delReveal.until; }
  _holdStart(e) {
    const t = e.target.closest?.("[data-hold]");
    if (!t || !e.isPrimary || e.target.closest(".rbdel")) return;
    this._holdCancel();
    const key = t.dataset.hold;
    t.classList.add("holding");
    this._hold = { key, el: t, x: e.clientX, y: e.clientY, timer: setTimeout(() => {
      this._hold = null; t.classList.remove("holding");
      this._holdFired = true; // the finger lifting mustn't open the recipe (see pointerup)
      this._delReveal = { key, until: Date.now() + 15000 };
      clearTimeout(this._delHideTimer);
      this._delHideTimer = setTimeout(() => { this._delReveal = null; this._refreshRecipeViews(); }, 15000);
      if (navigator.vibrate) try { navigator.vibrate(40); } catch (err) { /* not supported */ }
      this._refreshRecipeViews();
    }, 5000) };
  }
  _holdMove(e) {
    const h = this._hold;
    if (h && Math.hypot(e.clientX - h.x, e.clientY - h.y) > 12) this._holdCancel(); // scrolling, not holding
  }
  _holdCancel() {
    if (!this._hold) return;
    clearTimeout(this._hold.timer); this._hold.el.classList.remove("holding"); this._hold = null;
  }
  _refreshRecipeViews() {
    if (this.cook?.r) this.renderCook();
  }

  // ---------- Mealie: cook mode ----------
  async openCook(key) {
    this.cook = { loading: true, key };
    this.renderCook();
    try {
      const r = await this._ws({ type: "skylight/mealie/cook", recipe: key });
      if (this.cook?.key !== key) return;
      this.cook = { key, r, servings: r.servings || null, mult: 1, step: 0, got: new Set(), qr: false };
    } catch (e) {
      if (this.cook?.key !== key) return;
      this.cook = { key, error: /unknown command/i.test(e.message || "") ? `Restart Home Assistant to finish updating ${this.appName}.` : e.message };
    }
    this.renderCook();
  }
  closeCook() { this.cook = null; this.$cook.innerHTML = ""; this._lastActivity = Date.now(); }
  _cookFactor() {
    const c = this.cook;
    return c.r.servings && c.servings ? c.servings / c.r.servings : c.mult;
  }
  _fmtQty(q) {
    if (q >= 10) return String(Math.round(q));
    const whole = Math.floor(q + 1e-9), frac = q - whole;
    const fr = [[0, ""], [1 / 8, "⅛"], [1 / 4, "¼"], [1 / 3, "⅓"], [3 / 8, "⅜"], [1 / 2, "½"], [5 / 8, "⅝"], [2 / 3, "⅔"], [3 / 4, "¾"], [7 / 8, "⅞"], [1, ""]];
    const [v, sym] = fr.reduce((best, x) => (Math.abs(x[0] - frac) < Math.abs(best[0] - frac) ? x : best));
    if (Math.abs(v - frac) > 0.04) return String(Math.round(q * 100) / 100);
    const w = v === 1 ? whole + 1 : whole;
    return w && sym ? `${w} ${sym}` : sym || String(w);
  }
  _ingText(i, f) {
    if (!i.scalable || f === 1) return esc(i.text);
    const q = i.qty * f, plural = q > 1;
    const unit = plural ? i.unit_plural || i.unit : i.unit;
    const food = plural && !unit ? i.food_plural || i.food : i.food;
    return `<b>${this._fmtQty(q)}</b> ${esc([unit, food].filter(Boolean).join(" "))}${i.note ? `, ${esc(i.note)}` : ""}`;
  }
  renderCook() {
    if (!this.$cook) return;
    const c = this.cook;
    if (!c) { this.$cook.innerHTML = ""; return; }
    const shell = (inner) => `<div class="cook" role="dialog" aria-label="Cook mode">${inner}</div>`;
    if (c.loading || c.error) {
      this.$cook.innerHTML = shell(`<div class="cktop"><h2>${c.error ? "Couldn't open the recipe" : "Loading recipe…"}</h2><span class="spacer"></span><button class="ckx" data-action="cook-close">✕ Close</button></div>
        ${c.error ? `<p class="hint" style="padding:0 24px">${esc(c.error)}</p>` : ""}`);
      return;
    }
    const r = c.r, f = this._cookFactor();
    const unscalable = f !== 1 && r.ingredients.some((i) => !i.scalable && /\d/.test(i.text));
    const serv = r.servings
      ? `<div class="ckserv"><button data-action="cook-serv" data-d="-1" aria-label="Fewer servings">−</button><span><b>${Math.round(c.servings * 10) / 10}</b> servings</span><button data-action="cook-serv" data-d="1" aria-label="More servings">+</button>${c.servings !== r.servings ? `<button class="reset" data-action="cook-serv" data-d="0">Reset</button>` : ""}</div>`
      : `<div class="seg ckmult">${[0.5, 1, 1.5, 2, 3].map((m) => `<button class="${c.mult === m ? "on" : ""}" data-action="cook-mult" data-m="${m}">×${m === 0.5 ? "½" : m === 1.5 ? "1½" : m}</button>`).join("")}</div>`;
    let lastSec = null;
    const ings = r.ingredients.map((i, k) => {
      const head = i.section && i.section !== lastSec ? `<h4>${esc(i.section)}</h4>` : "";
      lastSec = i.section || lastSec;
      return `${head}<button class="ckii ${c.got.has(k) ? "got" : ""}" data-action="cook-ing" data-k="${k}"><span class="box">${c.got.has(k) ? "✓" : ""}</span><span>${this._ingText(i, f)}</span></button>`;
    }).join("");
    let lastStepSec = null;
    const steps = r.steps.map((s, k) => {
      const head = s.section && s.section !== lastStepSec ? `<h4>${esc(s.section)}</h4>` : "";
      lastStepSec = s.section || lastStepSec;
      return `${head}<button class="ckstep ${k === c.step ? "on" : k < c.step ? "past" : ""}" data-action="cook-step" data-k="${k}"><span class="num">${k + 1}</span><p>${esc(s.text)}</p></button>`;
    }).join("");
    // Rebuilding the screen resets scroll positions; remember them so it doesn't jump to the top.
    const kept = [".ckbody", ".ckings", ".cksteps"].map((sel) => this.$cook.querySelector(sel)?.scrollTop || 0);
    const times = [r.prep_time ? `Prep ${esc(r.prep_time)}` : "", r.cook_time ? `Cook ${esc(r.cook_time)}` : "", r.total_time ? `Total ${esc(r.total_time)}` : ""].filter(Boolean).join(" · ");
    this.$cook.innerHTML = shell(`
      <div class="cktop">
        <div class="ckimg holdable" data-hold="${esc(r.slug || r.id)}">${r.image ? `<img src="${esc(r.image)}" alt="" draggable="false" onerror="this.remove()">` : ""}<span>🍽️</span>
          ${this._delShown(r.slug || r.id) ? `<button class="rbdel" data-action="recipe-delete" data-recipe="${esc(r.slug || r.id)}" data-name="${esc(r.name)}">🗑 Delete</button>` : ""}</div>
        <div class="cktitle"><h2>${esc(r.name)}</h2>${times ? `<small>⏱ ${times}</small>` : ""}</div>
        <span class="spacer"></span>
        ${serv}
        ${r.link ? `<button data-action="cook-qr" title="Open on your phone">📱 On my phone</button>` : ""}
        <button class="ckx" data-action="cook-close">✕ Close</button>
      </div>
      <div class="ckbody">
        <section class="ckings"><h3>Ingredients <small>${c.got.size}/${r.ingredients.length}</small></h3>
          ${unscalable ? `<p class="hint">Some amounts are plain text in Mealie and aren't scaled.</p>` : ""}
          ${ings || `<p class="hint">None listed</p>`}
          ${r.notes.length ? `<h3>Notes</h3>${r.notes.map((n) => `<p class="cknote">${n.title ? `<b>${esc(n.title)}:</b> ` : ""}${esc(n.text)}</p>`).join("")}` : ""}
        </section>
        <section class="cksteps"><h3>Steps${r.steps.length ? ` <small>${Math.min(c.step + 1, r.steps.length)} of ${r.steps.length}</small>` : ""}</h3>
          ${steps || `<p class="hint">No steps in this recipe.${r.source ? ` <br>Source: ${esc(r.source)}` : ""}</p>`}</section>
      </div>
      ${r.steps.length ? `<div class="cknav"><button data-action="cook-prev" ${c.step <= 0 ? "disabled" : ""}>‹ Back</button>
        <span>Step ${c.step + 1} of ${r.steps.length}</span>
        <button class="primary" data-action="${c.step >= r.steps.length - 1 ? "cook-close" : "cook-next"}">${c.step >= r.steps.length - 1 ? "Done 🎉" : "Next ›"}</button></div>` : ""}
      ${c.qr ? `<div class="ckqr" data-action="cook-qr"><div class="ckqrcard"><h3>Scan with your phone</h3><div class="qrbox">${c.qrSvg || "…"}</div>
        <p class="hint">Opens this recipe in Mealie. Your phone must be able to reach Mealie (same Wi-Fi, or a link set in Settings → Mealie).</p><small class="qrurl">${esc(r.link)}</small></div></div>` : ""}`);
    [".ckbody", ".ckings", ".cksteps"].forEach((sel, i) => { const el = this.$cook.querySelector(sel); if (el) el.scrollTop = kept[i]; });
    const on = this.$cook.querySelector(".ckstep.on");
    if (on && c.scrollStep) { on.scrollIntoView({ block: "center", behavior: "smooth" }); c.scrollStep = false; }
  }
  async _cookQr() {
    const c = this.cook;
    c.qr = !c.qr;
    if (c.qr && !c.qrSvg) {
      try {
        const m = await import(new URL(`qrcode.js?v=${PANEL_VERSION}`, new URL("..", import.meta.url)).href);
        const q = m.default(0, "M"); q.addData(c.r.link); q.make();
        c.qrSvg = q.createSvgTag({ cellSize: 6, margin: 4, scalable: true });
      } catch (e) { c.qrSvg = `<p class="hint">Couldn't make the QR code.</p>`; }
    }
    this.renderCook();
  }

  // ---------- settings PIN ----------
  get pinSet() { return !!this.data?.security?.pin_set; }
  get unlocked() { return !this.pinSet || (this._unlockUntil || 0) > Date.now(); }

  openMealDialog(date, slot) {
    const current = this.data.meals?.[date]?.[slot] || "";
    const label = MEAL_SLOTS.find((s) => s[0] === slot);
    const recent = [...new Set(Object.values(this.data.meals || {}).map((m) => m[slot]).filter(Boolean))].slice(-8);
    const synced = this.syncedMeals(parseYmd(date), slot);
    this._openDialog({
      type: "meal", date, slot,
      html: () => `
        <h2>${label[2]} ${label[1]} · ${parseYmd(date).toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" })}</h2>
        ${synced.map((e) => `<div class="syncedrow">📅 <b>${esc(this.mealTitle(e))}</b> <small>from ${esc(this.entityName(e.entity))}</small>${e.description ? `<p class="hint">${esc(e.description).slice(0, 300)}</p>` : ""}</div>`).join("")}
        ${synced.length ? `<p class="hint">Synced meals are edited in their own app (e.g. Plan to Eat). You can add an extra note below.</p>` : ""}
        <label>What's on the menu?<input id="mealtext" value="${esc(current)}" autofocus data-enter="save-meal" placeholder="Tacos"></label>
        ${recent.length ? `<div class="label">Recent</div><div class="chips">${recent.map((r) => `<button class="chip" onclick="this.getRootNode().getElementById('mealtext').value=this.textContent">${esc(r)}</button>`).join("")}</div>` : ""}
        <div class="actions"><span class="spacer"></span>
          <button data-action="close">Cancel</button>
          <button class="primary" data-action="save-meal">Save</button></div>`,
    });
  }

  mealSlot(ev) {
    const entityText = `${ev.entity} ${this.entityName(ev.entity)}`.toLowerCase();
    const summary = ev.summary.toLowerCase();
    for (const text of [entityText, summary]) {
      for (const [slot] of MEAL_SLOTS) if (text.includes(slot)) return slot;
      if (text.includes("supper")) return "dinner";
    }
    if (ev.allDay) return "dinner";
    const h = ev.start.getHours() + ev.start.getMinutes() / 60;
    return h < 10.5 ? "breakfast" : h < 15 ? "lunch" : h < 17 ? "snack" : "dinner";
  }
  mealTitle(ev) { return ev.summary.replace(/^\s*(breakfast|lunch|dinner|supper|snacks?)\s*[:\-–]\s*/i, ""); }

  async _loadMealEvents() {
    const cals = (this.data.meal_calendars || []).filter((e) => this._hass.states[e]);
    const s = this.weekStart(this.ui.anchor), e = addDays(s, 7);
    const key = `${ymd(s)}|${cals.join(",")}`;
    if (key === this._mealKey) return;
    this._mealKey = key;
    const res = await Promise.all(cals.map(async (entity) => {
      try {
        const evs = await this._hass.callApi("GET", `calendars/${entity}?start=${encodeURIComponent(s.toISOString())}&end=${encodeURIComponent(e.toISOString())}`);
        return evs.map((x) => this._normalizeEvent(x, entity));
      } catch (err) { console.warn("Skylight: meal calendar failed", entity, err); return []; }
    }));
    if (key !== this._mealKey) return;
    this.mealEvents = res.flat();
    if (this.ui.tab === "meals") this.render();
  }
  syncedMeals(day, slot) {
    return this.mealEvents.filter((e) => sameDay(e.start, day) && this.mealSlot(e) === slot);
  }

  renderMeals() {
    const toggle = this.mealieOn ? `<div class="seg mealsview"><button class="${this.ui.mealsView !== "recipes" ? "on" : ""}" data-action="meals-view" data-view="week">📅 Meal plan</button><button class="${this.ui.mealsView === "recipes" ? "on" : ""}" data-action="meals-view" data-view="recipes">📖 Recipes</button></div>` : "";
    if (this.mealieOn && this.ui.mealsView === "recipes") return `<div class="toolbar"><div class="nav"><h1>Recipes</h1></div>${toggle}</div>${this.renderRecipes()}`;
    this._loadMealEvents();
    this._loadMealie();
    const [s] = [this.weekStart(this.ui.anchor)];
    const days = [...Array(7)].map((_, i) => addDays(s, i));
    if (this.isPhone) return this.renderMealsPhone(days, toggle);
    return `<div class="toolbar"><div class="nav"><button class="icon" data-action="prev">‹</button><button data-action="today">This week</button><button class="icon" data-action="next">›</button>
      <h1>Meals · ${s.toLocaleDateString([], { month: "short", day: "numeric" })}</h1></div>
      ${toggle}</div>
      ${this.ui.mealieError ? `<p class="hint">⚠️ Mealie: ${esc(this.ui.mealieError)}</p>` : ""}
      <div class="meals">
        <div class="mrow head"><div></div>${days.map((d) => `<div class="${sameDay(d, new Date()) ? "today" : ""}">${d.toLocaleDateString([], { weekday: "short" })} <b>${d.getDate()}</b></div>`).join("")}</div>
        ${MEAL_SLOTS.map(([slot, label, icon]) => `<div class="mrow">
          <div class="slot">${icon}<span>${label}</span></div>
          ${days.map((d) => {
            const t = this.mealieOn ? "" : this.data.meals?.[ymd(d)]?.[slot];
            const synced = this.syncedMeals(d, slot);
            const mm = this.mealieOn ? this.mealieFor(ymd(d), slot) : [];
            const has = t || synced.length || mm.length;
            const img = mm.find((m) => m.recipe?.image)?.recipe.image;
            return `<button class="meal ${has ? "" : "emptymeal"} ${img ? "withimg" : ""} ${sameDay(d, new Date()) ? "today" : ""}" data-action="edit-meal" data-date="${ymd(d)}" data-slot="${slot}" >
              ${img ? `<img class="mbg" src="${esc(img)}" alt="" onerror="this.parentNode.classList.remove('withimg');this.remove()">` : ""}
              ${mm.map((m) => `<span class="mname">${esc(this.mealieName(m))}</span>`).join("")}
              ${synced.map((e) => `<span class="synced">${esc(this.mealTitle(e))}</span>`).join("")}${t ? `<span>${esc(t)}</span>` : ""}${has ? "" : "+"}</button>`;
          }).join("")}
        </div>`).join("")}
      </div>`;
  }

  // Phone: one card per day with its meals listed, instead of the 7-column grid.
  renderMealsPhone(days, toggle) {
    const s = days[0];
    return `<div class="toolbar"><div class="nav"><button class="icon" data-action="prev">‹</button><button data-action="today">This week</button><button class="icon" data-action="next">›</button>
      <h1>${s.toLocaleDateString([], { month: "short", day: "numeric" })}</h1></div>${toggle}</div>
      ${this.ui.mealieError ? `<p class="hint">⚠️ Mealie: ${esc(this.ui.mealieError)}</p>` : ""}
      <div class="pmeals">${days.map((d) => `<section class="pmday ${sameDay(d, new Date()) ? "today" : ""}">
        <h3>${d.toLocaleDateString([], { weekday: "long" })} <small>${d.toLocaleDateString([], { month: "short", day: "numeric" })}</small></h3>
        ${MEAL_SLOTS.map(([slot, label, icon]) => {
          const t = this.mealieOn ? "" : this.data.meals?.[ymd(d)]?.[slot];
          const synced = this.syncedMeals(d, slot);
          const mm = this.mealieOn ? this.mealieFor(ymd(d), slot) : [];
          const img = mm.find((m) => m.recipe?.image)?.recipe.image;
          const names = [...mm.map((m) => esc(this.mealieName(m))), ...synced.map((e) => esc(this.mealTitle(e))), ...(t ? [esc(t)] : [])];
          return `<button class="pmslot ${names.length ? "" : "pmempty"}" data-action="edit-meal" data-date="${ymd(d)}" data-slot="${slot}">
            <span class="pmicon">${img ? `<img src="${esc(img)}" alt="" onerror="this.replaceWith('${icon}')">` : icon}</span>
            <span class="pmtext"><small>${label}</small>${names.length ? `<b>${names.join(" · ")}</b>` : `<b class="add">+ Add</b>`}</span></button>`;
        }).join("")}
      </section>`).join("")}</div>`;
  }

  renderMealieSettings() {
    const m = this.mealie || { entries: [] };
    const todos = Object.keys(this._hass.states).filter((e) => e.startsWith("todo.") && !this._ownTodo(e)).sort();
    const linked = new Set(this.data.linked_todos || []);
    return `<section class="card">
      <h2>Mealie</h2>
      ${m.entries.length ? `
        <p class="hint">✅ Connected. The Meals tab reads and writes your Mealie meal plan: tap a meal slot to search recipes, pick a random one, or add a note.</p>
        <label class="inline">Link for phones (QR codes) <input placeholder="Optional, e.g. https://mealie.example.com" value="${esc(this.settings.mealie_phone_url || "")}" data-change="mealie-phone-url"></label>
        <p class="hint">The recipe QR code in cook mode uses the Mealie address Home Assistant uses. If your phone reaches Mealie by a different address, enter it here.</p>
        ${m.entries.length > 1 ? `<label class="inline">Mealie server <select data-change="mealie-entry">${m.entries.map((e) => `<option value="${e.entry_id}" ${e.entry_id === m.selected ? "selected" : ""}>${esc(e.title)}</option>`).join("")}</select></label>` : ""}`
        : `<p class="hint">Not connected. An admin adds it once: Home Assistant → Settings → Devices &amp; Services → Add Integration → <b>Mealie</b> (needs your Mealie URL and an API token from Mealie → User profile → API Tokens). Then reload this page.</p>`}
      <div class="label">Shopping &amp; to-do lists to show in the Lists tab</div>
      <div class="checklist">${todos.map((e) => `<label class="check"><input type="checkbox" data-change="linked-todo" data-entity="${e}" ${linked.has(e) ? "checked" : ""}> ${esc(this.entityName(e))}</label>`).join("") || `<p class="hint">No to-do lists in Home Assistant.</p>`}</div>
    </section>`;
  }
}
