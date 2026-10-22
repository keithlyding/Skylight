/* Skylight panel: chores, chore editor and progress (methods mixed into SkylightPanel). */

import { CHORE_ICONS, WEEKDAYS, kidsOf, choreOwnersOf, ymd, parseYmd, addDays, startOfDay, sameDay, uid, esc } from "./helpers.js?v=1.62.0";

// Choices offered in the chore editor.
const EVERY_WEEKS = [1, 2, 3, 4, 5, 6, 8, 10, 12, 13, 16, 20, 26, 52];
const EVERY_MONTHS = [1, 2, 3, 4, 6, 12];
// Kinds of "chore": kids' chores and homework. Same schedule/check-off engine, separate tabs on the
// Chores screen. (chores.py has the same list.) Grown-ups' repeating things live on their lists.
export const CHORE_KINDS = [["chore", "Chores", "✅", "Make bed"], ["homework", "Homework", "📚", "Math worksheet"]];
export const kindOf = (c) => (CHORE_KINDS.some(([k]) => k === c?.kind) ? c.kind : "chore");
const KIND_WORD = { chore: "chore", homework: "assignment" };

export class ChoresView {
  // Which kind the Chores tab is showing (saved on this device).
  get choreKind() {
    if (!this.ui.choreKind) { try { this.ui.choreKind = localStorage.getItem("skylight.choreKind") || "chore"; } catch (e) { this.ui.choreKind = "chore"; } }
    return CHORE_KINDS.some(([k]) => k === this.ui.choreKind) ? this.ui.choreKind : "chore";
  }
  set choreKind(k) { this.ui.choreKind = k; try { localStorage.setItem("skylight.choreKind", k); } catch (e) { /* private mode */ } }
  // Who can own a kind: chores and homework are for kids (and Household).
  kindOwners(kind) { return choreOwnersOf(this.members); }

  openChoreDialog(c, memberId, kind) {
    const dlg = {
      type: "chore", chore: c, kind: c ? kindOf(c) : (kind || this.choreKind), repeat: c?.repeat || "daily", icon: c?.icon || "✅", iconOpen: false,
      html: () => {
        const spec = CHORE_KINDS.find(([k]) => k === dlg.kind) || CHORE_KINDS[0];
        const owners = this.kindOwners(dlg.kind);
        return `
        <h2>${c ? "Edit" : "New"} ${KIND_WORD[dlg.kind]}</h2>
        ${!this.members.length ? `<p class="hint">Add family members in Setup first.</p>` : ""}
        <div class="seg kindpick">${CHORE_KINDS.map(([k, l, ic]) => `<button class="${dlg.kind === k ? "on" : ""}" data-action="chore-type" data-kind="${k}">${ic} ${l}</button>`).join("")}</div>
        <div class="row">
          <label style="flex:0 0 auto">Icon${this.iconPicker(dlg, CHORE_ICONS)}</label>
          <label>${dlg.kind === "homework" ? "Assignment" : dlg.kind === "task" ? "Task" : "Chore"}<input id="c-title" value="${esc(c?.title)}" data-autofocus placeholder="${spec[3]}"></label>
        </div>
        <label>Who<select id="c-member">${owners.map((m) => `<option value="${m.id}" ${m.id === (c?.member_id || memberId) ? "selected" : ""}>${m.avatar} ${esc(m.name)}</option>`).join("")}</select></label>
        ${this.renderRepeatFields(dlg, c)}
        <div class="actions">
          ${c ? `<button class="danger" data-action="delete-chore">Delete</button>` : ""}
          <span class="spacer"></span>
          <button data-action="close">Cancel</button>
          <button class="primary" data-action="save-chore" ${this.members.length ? "" : "disabled"}>Save</button>
        </div>`;
      },
    };
    this._openDialog(dlg);
  }

  // The schedule part of an editor: shared by chores, homework and repeating list items. `optional` adds
  // "Doesn't repeat" (a plain list item). The ids are the same in every dialog (only one is open at a time).
  renderRepeatFields(dlg, c, { optional = false } = {}) {
    return `
        <label>Repeats<select id="c-repeat" data-change="chore-repeat">
          ${optional ? `<option value="" ${!dlg.repeat ? "selected" : ""}>Doesn't repeat</option>` : ""}
          <option value="daily" ${dlg.repeat === "daily" ? "selected" : ""}>Every day</option>
          <option value="days" ${dlg.repeat === "days" ? "selected" : ""}>On certain days of the week</option>
          <option value="weekly" ${dlg.repeat === "weekly" ? "selected" : ""}>Once a week (any day)</option>
          <option value="monthly" ${dlg.repeat === "monthly" ? "selected" : ""}>Monthly, on certain dates</option>
          <option value="once" ${dlg.repeat === "once" ? "selected" : ""}>Just once</option></select></label>
        <div class="dayopts" ${dlg.repeat === "days" ? "" : "hidden"}>
          <div class="daypick">${WEEKDAYS.map((w, i) => `<label class="daychip"><input type="checkbox" class="c-day" id="cd-${i}" value="${i}" ${(c?.days || [0, 1, 2, 3, 4]).includes(i) ? "checked" : ""}><span>${w}</span></label>`).join("")}</div>
          <label>Every<select id="c-every" data-change="chore-every">${EVERY_WEEKS.map((n) => `<option value="${n}" ${n === (Number(c?.every_weeks) || 1) ? "selected" : ""}>${n === 1 ? "week" : `${n} weeks`}</option>`).join("")}</select></label>
          <p class="hint">For every other week, pick "2 weeks" and a start date in a week the chore happens (e.g. this Friday's recycling week).</p>
        </div>
        <div class="monthopts" ${dlg.repeat === "monthly" ? "" : "hidden"}>
          <div class="daypick monthpick">${[...Array(31)].map((_, i) => i + 1).concat([-1]).map((n) => `<label class="daychip"><input type="checkbox" class="c-mday" value="${n}" ${(c?.month_days || [1]).includes(n) ? "checked" : ""}><span>${n === -1 ? "Last" : n}</span></label>`).join("")}</div>
          <label>Every<select id="c-every-months">${EVERY_MONTHS.map((n) => `<option value="${n}" ${n === (Number(c?.every_months) || 1) ? "selected" : ""}>${n === 1 ? "month" : n === 12 ? "year (12 months)" : `${n} months`}</option>`).join("")}</select></label>
          <p class="hint">Dates 29–31 fall on the last day of shorter months. For every 3 or 6 months, the start date sets which months.</p>
        </div>
        <div class="startopt" ${["days", "monthly"].includes(dlg.repeat) ? "" : "hidden"}>
          <label>Starting<input type="date" id="c-start" value="${c?.start || ymd(new Date())}"></label>
          <label class="check"><input type="checkbox" id="c-carry" ${(c ? c.carry : false) ? "checked" : ""}> Keep showing until done</label>
          <p class="hint">If it's missed, it stays on the list each day (marked "since …") until someone checks it off. Good for filters and maintenance.</p>
        </div>`;
  }
  // The schedule the editor shows, or {error} when a choice is missing. null = doesn't repeat.
  readRepeatFields() {
    const $ = (id) => this.shadowRoot.getElementById(id);
    const repeat = $("c-repeat")?.value || "";
    if (!repeat) return null;
    const rec = {
      repeat,
      days: [...this.shadowRoot.querySelectorAll(".c-day:checked")].map((i) => Number(i.value)),
      every_weeks: Number($("c-every")?.value) || 1,
      month_days: [...this.shadowRoot.querySelectorAll(".c-mday:checked")].map((i) => Number(i.value)),
      every_months: Number($("c-every-months")?.value) || 1,
      carry: !!$("c-carry")?.checked,
      start: $("c-start")?.value || ymd(new Date()),
    };
    if (rec.repeat === "days" && !rec.days.length) return { error: "Pick at least one day" };
    if (rec.repeat === "monthly" && !rec.month_days.length) return { error: "Pick at least one date" };
    return rec;
  }
  _syncChoreDialog() {
    const q = (sel) => this.shadowRoot.querySelector(sel);
    const r = this.ui.dialog.repeat;
    if (q(".dayopts")) q(".dayopts").hidden = r !== "days";
    if (q(".monthopts")) q(".monthopts").hidden = r !== "monthly";
    if (q(".startopt")) q(".startopt").hidden = r !== "days" && r !== "monthly";
    // New chores: default "keep showing until done" on for monthly and for every 2+ weeks.
    const carry = q("#c-carry");
    if (carry && !this.ui.dialog.chore) carry.checked = r === "monthly" || (r === "days" && Number(q("#c-every")?.value) > 1);
  }
  async saveChore() {
    const $ = (id) => this.shadowRoot.getElementById(id);
    const c = this.ui.dialog.chore;
    const title = $("c-title").value.trim();
    if (!title) { this._toast(`Please name the ${KIND_WORD[this.ui.dialog.kind] || "chore"}`); return; }
    const sched = this.readRepeatFields();
    if (sched?.error) { this._toast(sched.error); return; }
    const rec = {
      ...(c || { id: uid(), completions: [], created: ymd(new Date()) }),
      title, icon: this.ui.dialog.icon || "✅", member_id: $("c-member").value, kind: this.ui.dialog.kind || "chore",
      ...(sched || { repeat: "daily" }),
    };
    const chores = c ? this.data.chores.map((x) => (x.id === c.id ? rec : x)) : [...this.data.chores, rec];
    await this._set("chores", chores); this.closeDialog();
    if (this.ui.tab === "chores" && rec.kind !== this.choreKind) { this.choreKind = rec.kind; this.render(); } // show where it went
  }

  // ---------- Mealie ----------
  async _reloadMealie() { this._mealieKey = ""; await this._loadMealie(); }

  // ---------- chore schedule: worked out by Home Assistant (chores.py); the panel only draws it ----------
  // The days and weekly totals this screen needs: about 5 weeks back to a month ahead, plus the
  // Chores tab's day and the Progress weeks.
  _choreRequest() {
    const today = startOfDay(new Date()), day = startOfDay(this.ui.choreDay);
    const lo = addDays(today, -35), hi = addDays(today, 30);
    const start = addDays(day, -1) < lo ? addDays(day, -1) : lo;
    const end = addDays(day, 1) > hi ? addDays(day, 1) : hi;
    const thisWeek = this.weekStart(today);
    const ranges = [3, 2, 1, 0].map((k) => { const w = addDays(thisWeek, -7 * k); return [ymd(w), ymd(addDays(w, 6))]; });
    ranges.push([ymd(this.weekStart(day)), ymd(day)]);
    return { start: ymd(start), end: ymd(end), ranges, kinds: [this.choreKind] }; // totals for the kind on show
  }
  // Fetch again whenever chores change, the day changes or another range is needed; redraw when it arrives.
  // List items with a schedule (grown-ups' repeating things): the chore engine decides their days too.
  _repeatingItems() { return (this.data?.lists || []).flatMap((l) => (l.items || []).filter((i) => i.repeat)); }
  _ensureChoreView() {
    if (!this.data || (!(this.data.chores || []).length && !this._repeatingItems().length)) { this._cv = { days: {}, stats: {} }; return; }
    const req = this._choreRequest();
    const key = `${this._dataRev || 0}|${JSON.stringify(req)}`;
    if (key === this._cvKey) return;
    this._cvKey = key;
    this._hass.callWS({ type: "skylight/chores/view", ...req }).then((r) => {
      if (key !== this._cvKey) return;
      const stats = {};
      req.ranges.forEach(([a, b], i) => { stats[`${a}|${b}`] = r.stats[i] || {}; });
      this._cv = { days: r.days || {}, stats };
      this._cvError = null;
      this.render();
    }).catch((e) => {
      if (key !== this._cvKey) return;
      this._cvKey = null; // try again on the next redraw
      this._cvError = /unknown command/i.test(e?.message || "") ? `Restart Home Assistant to finish updating ${this.appName}.` : e?.message || "Couldn't load chores";
    });
  }
  // null if the chore isn't on that day, else {done, since}.
  _choreState(c, day) {
    const s = this._cv?.days?.[c.id]?.[ymd(day)];
    return s ? { done: !!s[0], since: s[1] ? parseYmd(s[1]) : null } : null;
  }
  // A person's chores (of the given kinds; all if none given) that show on a day, each with its state.
  _choresOn(memberId, day, kinds = null) {
    return (this.data.chores || []).filter((c) => c.member_id === memberId && (!kinds || kinds.includes(kindOf(c))))
      .map((c) => ({ c, st: this._choreState(c, day) })).filter((x) => x.st);
  }
  // "since Oct 1" on a chore that was missed and is kept on the list until done.
  _sinceNote(st) {
    return st?.since ? ` <small class="since">since ${st.since.toLocaleDateString([], { month: "short", day: "numeric" })}</small>` : "";
  }
  // Chores due / done between two days (totals from Home Assistant).
  completionStats(memberId, from, to) {
    const t = this._cv?.stats?.[`${ymd(from)}|${ymd(to)}`]?.[memberId];
    return t ? { due: t[0], done: t[1] } : { due: 0, done: 0 };
  }

  // Progress: last 4 weeks of completion per person, for the kind the Chores tab is showing (read-only).
  renderProgress() {
    const kind = this.choreKind, [, kindLabel] = CHORE_KINDS.find(([k]) => k === kind);
    const has = (m) => (this.data.chores || []).some((c) => c.member_id === m.id && kindOf(c) === kind);
    const people = kidsOf(this.members).filter(has);
    const homes = kind === "chore" ? (this.members || []).filter((m) => m.role === "home" && has(m)) : [];
    const back = `<button data-action="chores-mode" data-mode="day">‹ ${kindLabel}</button>`;
    if (!people.length && !homes.length) return `<div class="toolbar"><div class="nav">${back}<h1>Progress</h1></div></div><div class="empty"><h2>Nothing here yet</h2><p>Add some on the ${kindLabel} tab to see weekly progress here.</p></div>`;
    const thisWeek = this.weekStart(new Date());
    const weeks = [3, 2, 1, 0].map((k) => addDays(thisWeek, -7 * k));
    const label = (w, k) => (k === 3 ? "This week" : w.toLocaleDateString([], { month: "short", day: "numeric" }));
    return `<div class="toolbar"><div class="nav">${back}<h1>Progress · ${kindLabel}</h1></div>${people.length ? `<span class="hint">Done, last 4 weeks</span>` : ""}</div>
      ${people.length ? `<div class="progress">${people.map((m) => `<div class="prow" style="--c:${m.color}">
        <div class="pwho"><span class="av" style="background:${m.color}">${m.avatar}</span><b>${esc(m.name)}</b></div>
        <div class="pbars">${weeks.map((w, k) => {
          const st = this.completionStats(m.id, w, addDays(w, 6));
          const pct = st.due ? Math.round((st.done / st.due) * 100) : null;
          return `<div class="pbar" title="${st.done} of ${st.due} chores">
            <div class="pcol"><i style="height:${pct === null ? 0 : Math.max(3, pct)}%"></i></div>
            <b>${pct === null ? "–" : `${pct}%`}</b><small>${label(w, k)}</small></div>`;
        }).join("")}</div></div>`).join("")}</div>` : ""}
      ${homes.map((m) => this.renderHomeLog(m)).join("")}`;
  }

  // ---------- home maintenance log: when each Household task was really done (date, time, who) ----------
  _repeatText(c) {
    const ord = (n) => (n === -1 ? "last day" : `${n}${[, "st", "nd", "rd"][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10] || "th"}`);
    const every = (n, one, many) => (n > 1 ? `every ${n} ${many}` : `every ${one}`);
    switch (c.repeat) {
      case "days": return `${(c.days || []).map((d) => WEEKDAYS[d]).join(", ")}, ${every(Number(c.every_weeks) || 1, "week", "weeks")}`;
      case "weekly": return "Once a week";
      case "monthly": return `${(c.month_days || [1]).map(ord).join(", ")}, ${every(Number(c.every_months) || 1, "month", "months")}`;
      case "once": return "Once";
      default: return "Every day";
    }
  }
  _doneText(c, day) {
    const log = c.done_log?.[day];
    const d = parseYmd(day).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric", year: "numeric" });
    if (!log?.at) return `${d}`;
    const t = new Date(log.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: !this.settings.clock_24h });
    return `${d} · ${t}${log.by ? ` · ${esc(log.by)}` : ""}`;
  }
  renderHomeLog(m) {
    const today = startOfDay(new Date());
    const chores = (this.data.chores || []).filter((c) => c.member_id === m.id);
    const rows = chores.map((c) => {
      const done = [...(c.completions || [])].sort().reverse();
      const st = this._choreState(c, today);
      const days = this._cv?.days?.[c.id] || {};
      const next = Object.keys(days).sort().find((d) => d > ymd(today));
      const status = st?.since ? `<span class="hlbad">Overdue since ${st.since.toLocaleDateString([], { month: "short", day: "numeric" })}</span>`
        : st && !st.done ? `<span class="hlwarn">Due today</span>`
        : next ? `<span class="hint">Next: ${parseYmd(next).toLocaleDateString([], { month: "short", day: "numeric" })}</span>` : "";
      return `<div class="hlrow">
        <div class="hlhead"><span class="ci">${esc(c.icon || "✅")}</span><div class="hltitle"><b>${esc(c.title)}</b><small>${esc(this._repeatText(c))}</small></div>${status}</div>
        <div class="hllast">${done.length ? `✅ Last done: <b>${this._doneText(c, done[0])}</b>` : `<span class="hint">Not done yet</span>`}</div>
        ${done.length > 1 ? `<details class="hlhist"><summary>History (${done.length})</summary><ul>${done.slice(0, 24).map((d) => `<li>${this._doneText(c, d)}</li>`).join("")}</ul></details>` : ""}
      </div>`;
    }).join("");
    return `<section class="card homelog" style="--c:${m.color}">
      <h2>🏠 ${esc(m.name)}: maintenance log</h2>
      <p class="hint">When each task was checked off. Times and names are recorded from v1.40; older check-offs show the date only.</p>
      ${rows}</section>`;
  }

  renderChores() {
    if (this.ui.choresMode === "progress") return this.renderProgress();
    const day = this.ui.choreDay;
    const isToday = sameDay(day, new Date());
    const kind = this.choreKind, [, kindLabel, , example] = CHORE_KINDS.find(([k]) => k === kind);
    const kindBar = `<div class="seg kindpick">${CHORE_KINDS.map(([k, l, ic]) => `<button class="${kind === k ? "on" : ""}" data-action="chore-kind" data-kind="${k}">${ic} ${l}</button>`).join("")}</div>`;
    const kids = this.kindOwners(kind);
    if (!kids.length) return `${kindBar}<div class="empty"><h2>No kids set up yet</h2><p>${kindLabel} are for kids (and Household profiles like “Maintenance”). Set someone's type in Setup → Family members.</p><button class="primary" data-action="tab" data-tab="settings">Go to Setup</button></div>`;
    const cols = kids.map((m) => {
      const chores = this._choresOn(m.id, day, [kind]);
      const done = chores.filter((x) => x.st.done).length;
      const pct = chores.length ? done / chores.length : 0;
      return `<div class="ccol" style="--c:${m.color}">
        <div class="chead">
          <div class="ring" style="--p:${pct * 360}deg"><span class="av" style="background:${m.color}">${m.avatar}</span></div>
          <div><div class="cname">${esc(m.name)}</div><div class="cstars">${done}/${chores.length} today${(() => { const w = this.completionStats(m.id, this.weekStart(day), day); return w.due ? ` · ${Math.round((w.done / w.due) * 100)}% this week` : ""; })()}</div></div>
        </div>
        <div class="clist">${chores.map(({ c, st }) => {
          const dn = st.done;
          return `<div class="chore ${dn ? "done" : ""}">
            <button class="ctoggle" data-action="toggle-chore" data-chore="${c.id}">
              <span class="ci">${esc(c.icon || "✅")}</span><span class="ct">${esc(c.title)}${this._sinceNote(st)}</span>
<span class="box">${dn ? "✓" : ""}</span></button>
            <button class="cedit" data-action="edit-chore" data-chore="${c.id}">⋯</button></div>`;
        }).join("") || `<p class="hint center">${pct === 0 && !chores.length ? `Nothing ${isToday ? "today" : "this day"}` : ""}</p>`}
        ${chores.length && done === chores.length ? `<div class="alldone">All done! 🎉</div>` : ""}
        </div>
        <button class="add wide" data-action="new-chore" data-member="${m.id}" data-kind="${kind}">+ Add ${KIND_WORD[kind]}</button>
      </div>`;
    }).join("");
    return `<div class="toolbar"><div class="nav">
        <button class="icon" data-action="chore-day" data-dir="-1">‹</button>
        <button data-action="chore-day" data-dir="0">Today</button>
        <button class="icon" data-action="chore-day" data-dir="1">›</button>
        <h1>${isToday ? "Today" : day.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" })}</h1></div>
        ${kindBar}
        <button data-action="chores-mode" data-mode="progress">📊 Progress</button></div>
      ${this._cvError ? `<p class="hint center">${esc(this._cvError)}</p>` : ""}
      <div class="chores">${cols}</div>`;
  }
}
