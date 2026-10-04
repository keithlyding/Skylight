/* Skylight panel: Today screen (methods mixed into SkylightPanel). */

import { MEAL_SLOTS, orderItems, ymd, addDays, startOfDay, allOccasions, upcomingOccasions, occasionText, esc } from "./helpers.js?v=1.36.2";
import { choreDone, choreDue } from "./chore-rules.js?v=1.36.2";

export class HomeView {

  // ---------- Today screen: upcoming birthdays and anniversaries ----------
  renderUpcoming() {
    const list = upcomingOccasions(allOccasions(this.members, this.data.occasions, this.settings.family_color || "#ff9f43"),
      new Date(), Number(this.settings.upcoming_days ?? 60), Number(this.settings.upcoming_count ?? 3));
    if (!list.length) return "";
    return `<div class="upcoming"><div class="uhead">Upcoming</div>${list.map((u) => `
      <div class="urow ${u.days === 0 ? "today" : ""}" style="--c:${u.color}"><span class="uemoji">${u.emoji}</span>
        <span class="utext"><b>${esc(u.title)}</b><small>${esc(occasionText(u).split(" — ")[1] || "")}</small></span></div>`).join("")}</div>`;
  }

  // ---------- Mealie: tonight's dinner on the Today screen ----------
  async _loadTodayMeals() {
    if (!this.mealieOn) return;
    const today = ymd(new Date());
    if (this._todayMeals && this._todayMeals.date === today && Date.now() - this._todayMeals.at < 10 * 60000) return;
    if (this._todayLoading) return;
    this._todayLoading = true;
    try {
      const meals = await this._hass.callWS({ type: "skylight/mealie/week", start: today, end: today });
      this._todayMeals = { date: today, at: Date.now(), meals };
    } catch (e) { this._todayMeals = { date: today, at: Date.now(), meals: [] }; }
    finally { this._todayLoading = false; }
    if (this.ui.tab === "home") this.render();
  }
  renderTonight() {
    if (!this.mealieOn) return "";
    this._loadTodayMeals();
    const meals = this._todayMeals?.date === ymd(new Date()) ? this._todayMeals.meals : [];
    if (!meals.length) return "";
    const order = ["dinner", "lunch", "breakfast", "snack"];
    const after = new Date().getHours() >= 14; // afternoon: dinner is what matters
    const main = [...meals].sort((a, b) => order.indexOf(a.slot) - order.indexOf(b.slot)).find((m) => m.recipe && (after ? m.slot === "dinner" : true))
      || meals.find((m) => m.slot === "dinner") || meals[0];
    const others = meals.filter((m) => m !== main);
    const label = { dinner: "Tonight's dinner", lunch: "Lunch today", breakfast: "Breakfast today", snack: "Snack today" }[main.slot] || "Today";
    const img = main.recipe?.image;
    return `<div class="tonight ${main.recipe ? "tap" : ""}" ${main.recipe ? `data-action="cook" data-recipe="${esc(main.recipe.slug || main.recipe.id)}"` : ""}>
      ${img ? `<img src="${esc(img)}" alt="" onerror="this.remove()">` : `<span class="tnoimg">🍽️</span>`}
      <div><small>${label}</small><b>${esc(this.mealieName(main))}</b>${main.recipe ? `<span class="cookbtn">👩‍🍳 Cook ›</span>` : ""}
      ${others.length ? `<small class="tothers">${others.map((m) => `${(MEAL_SLOTS.find((s) => s[0] === m.slot) || [])[2] || ""} ${esc(this.mealieName(m))}`).join(" · ")}</small>` : ""}</div></div>`;
  }

  renderHome() {
    const today = startOfDay(new Date());
    const n = this.homeDays;
    const days = [...Array(n)].map((_, i) => addDays(today, i));
    const noCals = !this.shownCalendars().length;
    const label = (d) => this.dayLabel(d, n);
    const agenda = this.homeAgenda;
    const picker = `<div class="seg daypick"><button class="${agenda ? "on" : ""}" data-action="home-days" data-days="agenda">Agenda</button>${(this.isPhone ? [1, 3] : [1, 3, 5, 7]).map((k) => `<button class="${!agenda && k === n ? "on" : ""}" data-action="home-days" data-days="${k}">${k} day${k > 1 ? "s" : ""}</button>`).join("")}</div>`;
    const cal = noCals
      ? `<div class="empty"><h2>No calendars yet</h2><button class="primary" data-action="tab" data-tab="settings">Set up in Settings</button></div>`
      : agenda ? `<div class="hagenda">${this.renderSchedule()}</div>`
      : this.renderTimeGrid(days, { labels: label });
    const members = this.ui.filter ? this.members.filter((m) => m.id === this.ui.filter) : this.members;
    const free = [];
    const lists = this.allLists();
    // Chores first so they're never pushed out of view; to-do lists after them.
    const ordered = [...members.filter((m) => m.today !== "list"), ...members.filter((m) => m.today === "list")];
    const chores = ordered.map((m) => {
      if (m.today === "none") return "";
      if (m.today === "list") return this.renderHomeList(m, lists.find((l) => l.id === m.today_list));
      if (m.role !== "kid" && m.role !== "home") return ""; // chores are for kids and household profiles
      const list = this.data.chores.filter((c) => c.member_id === m.id && choreDue(c, today));
      const done = list.filter((c) => choreDone(c, today)).length;
      if (!list.length) { free.push(m); return ""; } // summarized in one line below
      return `<div class="hchores" style="--c:${m.color}">
        <div class="hhead"><span class="av" style="background:${m.color}">${m.avatar}</span><b>${esc(m.name)}</b>
          <span class="hint">${done}/${list.length}</span></div>
        ${list.map((c) => { const dn = choreDone(c, today); return `<div class="chore ${dn ? "done" : ""}">
          <button class="ctoggle" data-action="toggle-chore" data-chore="${c.id}" data-date="${ymd(today)}">
            <span class="ci">${esc(c.icon || "✅")}</span><span class="ct">${esc(c.title)}${this._sinceNote(c, today)}</span><span class="box">${dn ? "✓" : ""}</span></button></div>`; }).join("")
          || `<p class="hint">No chores today</p>`}
        ${list.length && done === list.length ? `<div class="alldone">All done! 🎉</div>` : ""}
      </div>`;
    }).join("");
    if (this.settings.weather_hints !== false && this.settings.weather_entity) this._loadWeatherFull();
    return `<div class="toolbar hometool">${picker}<button class="primary fab" data-action="new-event">+ Event</button></div>
      <div class="home ${n >= 5 ? "wide" : ""}">
      <section class="hcal">${cal}</section>
      <aside class="hside">
        ${this.settings.weather_hints !== false ? this.renderHints(4) : ""}
        ${this.renderTonight()}
        ${this.renderUpcoming()}
        ${chores ? `<div class="hcols">${chores}</div>` : ""}
        ${free.length ? `<p class="nochores">No chores today: ${free.map((m) => `<span class="av sm" style="background:${m.color}">${m.avatar}</span>${esc(m.name)}`).join(", ")}</p>` : ""}
        ${this.members.length ? "" : `<div class="empty"><p>Add your family in Settings to see chores here.</p></div>`}
      </aside></div>`;
  }

  // A person's to-do / honey-do list on the Today screen.
  renderHomeList(m, list) {
    if (!list) return `<div class="hchores" style="--c:${m.color}"><div class="hhead"><span class="av" style="background:${m.color}">${m.avatar}</span><b>${esc(m.name)}</b></div>
      <p class="hint">List not found. Pick one in Settings → Family members.</p></div>`;
    const ordered = list.linked ? list.items : orderItems(list.items);
    const open = ordered.filter((i) => !i.done), done = ordered.filter((i) => i.done);
    const shown = [...open, ...done.slice(-2)]; // keep the two most recent check-offs visible
    return `<div class="hchores hlist" style="--c:${m.color}">
      <div class="hhead"><span class="av" style="background:${m.color}">${m.avatar}</span><b>${esc(m.name)}</b>
        <span class="hint">📝 ${esc(list.name)} · ${open.length} left</span></div>
      ${shown.map((i) => `<div class="chore ${i.done ? "done" : ""}">
        <button class="ctoggle" data-action="home-item" data-list="${esc(list.id)}" data-item="${esc(i.id)}">
          <span class="ct">${esc(i.text)}</span><span class="box">${i.done ? "✓" : ""}</span></button></div>`).join("")
        || `<p class="hint">Nothing on the list 🎉</p>`}
      <input class="hadd" id="hadd-${esc(list.id)}" data-list="${esc(list.id)}" data-enter="home-add" placeholder="＋ Add to ${esc(list.name)}">
    </div>`;
  }
}
