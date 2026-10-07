/* Skylight panel: location lookup, time picker and emoji/icon pickers (methods mixed into SkylightPanel). */

import { PANEL_VERSION, AVATARS, TONEABLE, withTone, CHORE_ICONS, pad, ymd, parseYmd, esc } from "./helpers.js?v=1.45.0";

export class PickersView {

  // ---------- location lookup ----------
  _locSearch(text) {
    clearTimeout(this._locTimer);
    const q = text.trim();
    if (q.length < 3) { this._clearSugg(); return; }
    this._locTimer = setTimeout(async () => {
      const seq = (this._locSeq = (this._locSeq || 0) + 1);
      let res;
      try { res = await this._hass.callWS({ type: "skylight/places/search", query: q }); }
      catch (e) {
        const msg = /unknown command/i.test(e.message || "")
          ? "Address lookup needs a Home Assistant restart after updating ${this.appName}."
          : e.message;
        this._showSugg([], msg); return;
      }
      if (seq !== this._locSeq) return; // a newer search is running
      this._showSugg(res.results, null, res.provider);
    }, 450);
  }
  _showSugg(results, error, provider) {
    const box = this.shadowRoot.getElementById("loc-sugg");
    if (!box) return;
    const label = (r) => (r.address && !r.address.startsWith(r.name) ? `${r.name}, ${r.address}` : r.address || r.name);
    box.innerHTML = error ? `<div class="hint">⚠️ ${esc(error)}</div>`
      : results.length ? results.map((r) => `<button type="button" data-action="pick-place" data-value="${esc(label(r))}">
          <b>${esc(r.name)}</b><small>${esc(r.address)}</small></button>`).join("") + `<div class="attrib">${provider === "google" ? "Results from Google" : "Results © OpenStreetMap contributors"}</div>`
      : `<div class="hint">No matches. You can still type the address yourself.</div>`;
    box.hidden = false;
    box.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
  _clearSugg() {
    const box = this.shadowRoot.getElementById("loc-sugg");
    if (box) { box.hidden = true; box.innerHTML = ""; }
  }

  // Calendar where a person's copy of an event is saved: their first writable (non-info, non-feed) calendar.
  // Where new events for a person are saved: their chosen default, else a writable calendar that
  // belongs only to them (so shared ones like "Home Maintenance" don't pull in other people).
  targetCalendar(m) {
    if (!m) return null;
    const ok = (e) => this._hass.states[e] && !this.infoCal(e) && this.calInfo?.[e]?.integration !== "remote_calendar";
    if (m.default_calendar && (m.calendars || []).includes(m.default_calendar) && ok(m.default_calendar)) return m.default_calendar;
    const mine = (m.calendars || []).filter(ok);
    return mine.find((e) => this.calendarOwners(e).length === 1) || mine[0] || null;
  }

  // ---------- time picker: 15-minute list + free typing ----------
  fmtHM(h, m) { return this.fmtTime(new Date(2000, 0, 1, h, m)); }
  timeInput(id, hm) {
    const [h, m] = hm.split(":").map(Number);
    // Touch screens: tapping the time opens the 15-minute list without the keyboard; ⌨ switches to typing.
    const touch = !!window.matchMedia?.("(pointer: coarse)").matches;
    return `<span class="tpick ${touch ? "touch" : ""}"><input type="text" id="${id}" class="tinput" inputmode="text" autocomplete="off" ${touch ? "readonly" : ""}
      value="${this.fmtHM(h, m)}" data-hm="${hm}" data-change="time-norm" data-enter="time-norm">${touch ? `<button type="button" class="ttype" data-action="time-type" data-for="${id}" aria-label="Type a time" title="Type a time">⌨</button>` : ""}<span class="tlist" hidden></span></span>`;
  }
  // "4", "4p", "4pm", "4:10", "4:10 pm", "410p", "16:10", "1610" -> [h, m] (null if not a time).
  _parseTime(text, prevH = 12) {
    const t = String(text || "").trim().toLowerCase().replace(/\s+/g, "").replace(/\./g, "");
    const m = /^(\d{1,2})(?::?(\d{2}))?(a|am|p|pm)?$/.exec(t);
    if (!m) return null;
    let h = Number(m[1]), min = Number(m[2] || 0);
    const ap = m[3];
    if (min > 59) return null;
    if (ap) {
      if (h < 1 || h > 12) return null;
      if (ap[0] === "p" && h !== 12) h += 12;
      if (ap[0] === "a" && h === 12) h = 0;
    } else if (h > 23) return null;
    else if (!this.settings.clock_24h && h >= 1 && h <= 12) {
      // No am/pm typed: keep the same half of the day as before (e.g. 4:10 stays PM if it was PM).
      const pm = prevH >= 12;
      if (pm && h !== 12) h += 12;
      if (!pm && h === 12) h = 0;
    }
    return [h, min];
  }
  _readTime(id) {
    const el = this.shadowRoot.getElementById(id);
    if (!el) return null;
    const prev = (el.dataset.hm || "12:00").split(":").map(Number);
    return this._parseTime(el.value, prev[0]) || prev;
  }
  _setTime(id, h, m) {
    const el = this.shadowRoot.getElementById(id);
    if (!el) return;
    el.dataset.hm = `${pad(h)}:${pad(m)}`;
    el.value = this.fmtHM(h, m);
  }
  _openTimeList(input) {
    const list = input.parentElement.querySelector(".tlist");
    if (!list) return;
    const [h0, m0] = this._readTime(input.id) || [9, 0];
    const items = [];
    for (let h = 0; h < 24; h++) for (let m = 0; m < 60; m += 15) items.push([h, m]);
    list.innerHTML = items.map(([h, m]) => `<button type="button" class="${h === h0 && m === m0 ? "on" : ""}" data-action="time-pick" data-for="${input.id}" data-h="${h}" data-m="${m}">${this.fmtHM(h, m)}</button>`).join("");
    list.hidden = false;
    // Scroll so the current time (or the nearest 15 minutes before it) is at the top.
    const idx = h0 * 4 + Math.floor(m0 / 15);
    list.scrollTop = Math.max(0, idx - 1) * (list.firstElementChild?.offsetHeight || 36);
  }
  _closeTimeLists(except) {
    this.shadowRoot.querySelectorAll(".tlist").forEach((l) => { if (l !== except) l.hidden = true; });
  }

  // Current start/end from the form fields.
  _formTimes() {
    const $ = (id) => this.shadowRoot.getElementById(id);
    const at = (dateId, timeId) => {
      const v = $(dateId)?.value; if (!v) return null;
      const d = parseYmd(v);
      const t = this._readTime(timeId);
      if (t) d.setHours(t[0], t[1]);
      return d;
    };
    return { start: at("ev-date", "ev-start"), end: at("ev-enddate", "ev-end") };
  }
  // Moving the start moves the end by the same amount, keeping the event's length.
  _shiftEnd() {
    const dlg = this.ui.dialog;
    const { start, end } = this._formTimes();
    if (!start || !end) return;
    const prev = dlg.prevStart || start;
    const moved = new Date(end.getTime() + (start - prev));
    dlg.prevStart = start;
    const $ = (id) => this.shadowRoot.getElementById(id);
    $("ev-enddate").value = ymd(moved);
    this._setTime("ev-end", moved.getHours(), moved.getMinutes());
  }

  _isRecurring(ev) { return !!(ev && (ev.rrule || ev.recurrence_id)); }

  // ---------- emoji search ----------
  _emojiButtons(list, kind) {
    const dlg = this.ui.dialog || {};
    const current = kind === "avatar" ? dlg.avatar : dlg.icon;
    const attr = kind === "avatar" ? 'data-action="pick-avatar" data-avatar' : 'data-action="icon-pick" data-icon';
    return list.map((e) => `<button type="button" class="emoji ${e === current ? "sel" : ""}" ${attr}="${e}">${e}</button>`).join("");
  }
  async _loadEmojiData() {
    if (!this._emojiData) {
      this._emojiData = import(new URL(`emoji-data.js?v=${PANEL_VERSION}`, new URL("..", import.meta.url)).href).then((m) => {
        // Every emoji that accepts a skin tone becomes toneable in the avatar picker.
        for (const [e, , tone] of m.default) if (tone) TONEABLE.add(e.codePointAt(0));
        return m.default;
      });
    }
    return this._emojiData;
  }
  // Every typed word must start a word in the emoji's keywords ("bea" finds bear; "lawn mow" finds 🚜).
  async _emojiSearch(input) {
    const kind = input.dataset.emojiSearch;
    const grid = this.shadowRoot.getElementById(kind === "avatar" ? "avatar-grid" : "icon-grid");
    const dlg = this.ui.dialog;
    if (!grid || !dlg) return;
    const q = input.value.trim().toLowerCase();
    const base = kind === "avatar" ? AVATARS : CHORE_ICONS;
    const tone = (e) => (kind === "avatar" ? withTone(e, dlg.tone) : e);
    if (!q) { grid.innerHTML = this._emojiButtons(base.map(tone), kind); return; }
    let data;
    try { data = await this._loadEmojiData(); } catch (e) { grid.innerHTML = `<p class="hint">Emoji search unavailable (${esc(e.message)})</p>`; return; }
    if (input.value.trim().toLowerCase() !== q) return; // user kept typing
    const terms = q.split(/\s+/);
    const scored = [];
    for (const [e, words] of data) {
      const w = " " + words + " ";
      if (!terms.every((t) => w.includes(" " + t))) continue;
      // Whole-word matches ("bear") rank above word-start matches ("beard").
      scored.push([e, terms.filter((t) => w.includes(" " + t + " ")).length]);
    }
    // Curated picks first within each level, then everything else in Unicode order.
    const key = (e) => e.replace(/\uFE0F/g, "");
    const baseKeys = new Set(base.map(key));
    const ranked = scored
      .map(([e, exact], i) => ({ e, i, exact, curated: baseKeys.has(key(e)) }))
      .sort((a, b) => b.exact - a.exact || b.curated - a.curated || a.i - b.i)
      .map((x) => x.e).slice(0, 120);
    grid.innerHTML = ranked.length ? this._emojiButtons(ranked.map(tone), kind) : `<p class="hint">No emoji match “${esc(q)}”.</p>`;
  }

  // Big icon button + expandable grid of choices (used by chores).
  iconPicker(dlg, icons) {
    return `<div class="iconpick">
      <button type="button" class="iconbtn" data-action="icon-open" title="Choose an icon">${dlg.icon}<small>▾</small></button>
      ${dlg.iconOpen ? `<div class="icongrid">
        <input class="emojisearch" id="icon-q" data-fresh="1" autocomplete="off" placeholder="🔍 Search (mow, trash, dishes…)" data-emoji-search="icon">
        <div class="iconitems" id="icon-grid">${this._emojiButtons(icons, "icon")}</div></div>` : ""}
    </div>`;
  }
}
