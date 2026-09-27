/* Skylight Family Display - full-screen panel (also usable as a Lovelace card:
 *   type: custom:skylight-panel
 * ). Plain web component, no build step. */

const PANEL_VERSION = "1.11.0";
const PALETTE = [
  "#ff6b6b", "#ff9f43", "#feca57", "#2ecc71", "#1abc9c", "#48dbfb",
  "#4a7dff", "#a66bff", "#f368e0", "#8d6e63", "#607d8b", "#222f3e",
];
const AVATARS = [
  // family: dads, moms, kids
  "👨", "🧔", "🧔‍♂️", "👨‍🦰", "👨‍🦱", "👨‍🦳", "👱‍♂️", "👨‍🍳", "🍖", "🥩", "👨‍💼", "👨‍🔧", "👨‍💻", "👨‍🏫", "👨‍🌾", "👨‍🚒",
  "👩", "👱‍♀️", "👩‍🦰", "👩‍🦱", "👩‍🦳", "👩‍🍳", "🥘", "👩‍💼", "👩‍💻", "👩‍🏫", "👩‍⚕️", "👩‍🌾", "👩‍🎨", "💐",
  "👦", "👧", "🧒", "👶", "👴", "👵",
  // faces & animals
  "😀", "😎", "🤓", "🥳", "🦄", "🐶", "🐱", "🦊", "🐼", "🐨", "🐯", "🦁", "🐸", "🐵", "🦖", "🐢", "🐙", "🦋", "🐝", "🦉",
  // sports
  "⚾", "🥎", "⚽", "🏀", "🏈", "🏐", "🎾", "🏒", "🥍", "⛳", "🏓", "🏊", "🚴", "⛸️", "🛹", "🥋", "🤸", "🏋️", "💪", "🏃",
  // music & arts
  "🎸", "🎹", "🥁", "🎻", "🎺", "🎷", "🎤", "🎧", "🎨", "🩰", "📷", "🎭",
  // home, food & hobbies
  "🍳", "🧁", "🍕", "🌮", "📚", "✏️", "🔬", "🧩", "🎮", "♟️", "🧶", "🪴", "🎣", "⛺", "🏕️",
  // fun
  "🚀", "🚗", "🚂", "✈️", "🌈", "⭐", "🌸", "🌻", "👑", "🧸", "💎", "🔥",
];
// Emoji skin tones (Unicode modifiers). "" = default yellow.
const SKIN_TONES = [["", "Default"], ["\u{1F3FB}", "Light"], ["\u{1F3FC}", "Medium-light"], ["\u{1F3FD}", "Medium"], ["\u{1F3FE}", "Medium-dark"], ["\u{1F3FF}", "Dark"]];
const TONE_RE = /[\u{1F3FB}-\u{1F3FF}]/gu;
// People emoji that accept a skin tone (the first code point of the emoji).
const TONEABLE = new Set([..."👨👩🧔👱👦👧🧒👶👴👵🧑🏊🚴🏋🤸🏃💪"].map((c) => c.codePointAt(0)));
// Apply a tone to a person emoji (also inside sequences like 👨‍🍳); other emoji are unchanged.
const withTone = (emoji, tone) => {
  const plain = emoji.replace(TONE_RE, "");
  const cps = [...plain];
  if (!tone || !TONEABLE.has(cps[0].codePointAt(0))) return plain;
  const rest = cps.slice(1);
  if (rest[0] === "\uFE0F") rest.shift(); // e.g. 🏋️ -> 🏋🏻
  return cps[0] + tone + rest.join("");
};
const toneOf = (emoji) => (emoji.match(TONE_RE) || [""])[0];
// The original picker emoji for a (possibly toned) avatar, so switching back to Default restores it exactly.
const baseOf = (emoji) => {
  const key = (e) => e.replace(TONE_RE, "").replace(/\uFE0F/g, "");
  return AVATARS.find((x) => key(x) === key(emoji)) || emoji.replace(TONE_RE, "");
};

// Info-only calendars (birthdays, holidays, school...): icon + muted color choices.
const INFO_ICONS = ["🎂", "🎉", "🇺🇸", "🎄", "⛪", "🏫", "🏈", "⚽", "🗓️", "🌙", "✈️", "💼", "🗑️", "🌱", "📌"];
const INFO_COLORS = ["#9e9e9e", "#b0a58f", "#c29fa3", "#9fb3c8", "#a8c3a0", "#c9b37e", "#b39ddb", "#80cbc4"];

const MEAL_SLOTS = [["breakfast", "Breakfast", "🥞"], ["lunch", "Lunch", "🥪"], ["dinner", "Dinner", "🍝"], ["snack", "Snack", "🍎"]];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
// Calendar tab views, in display order. N-day views start on the selected day, like the Today screen.
const CAL_VIEWS = [["agenda", "Agenda"], ["day", "Day"], ["3day", "3 days"], ["5day", "5 days"], ["7day", "7 days"], ["month", "Month"]];
const LEGACY_VIEWS = { schedule: "agenda", week: "7day" };
const viewDays = (v) => ({ day: 1, "3day": 3, "5day": 5, "7day": 7 }[v] || 0);

const TABS = [
  ["home", "Today", "mdi:view-dashboard"],
  ["calendar", "Calendar", "mdi:calendar-month"],
  ["chores", "Chores", "mdi:checkbox-marked-circle-outline"],
  ["rewards", "Rewards", "mdi:star-circle"],
  ["meals", "Meals", "mdi:silverware-fork-knife"],
  ["lists", "Lists", "mdi:format-list-checks"],
  ["photos", "Photos", "mdi:image-multiple"],
  ["settings", "Settings", "mdi:cog"],
];
const WEATHER_ICONS = {
  "clear-night": "🌙", cloudy: "☁️", fog: "🌫️", hail: "🌨️", lightning: "🌩️", "lightning-rainy": "⛈️",
  partlycloudy: "⛅", pouring: "🌧️", rainy: "🌦️", snowy: "❄️", "snowy-rainy": "🌨️", sunny: "☀️",
  windy: "💨", "windy-variant": "💨", exceptional: "⚠️",
};

// ---------- date helpers (all local time) ----------
const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseYmd = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const sameDay = (a, b) => ymd(a) === ymd(b);
// Python weekday: Mon=0..Sun=6
const pyWeekday = (d) => (d.getDay() + 6) % 7;
const isoWeek = (d) => {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return `${t.getUTCFullYear()}-${Math.ceil(((t - y0) / 86400000 + 1) / 7)}`;
};
const localIso = (d) => {
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? "+" : "-";
  return `${ymd(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:00${sign}${pad(Math.floor(Math.abs(off) / 60))}:${pad(Math.abs(off) % 60)}`;
};
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ---------- chore rules (mirror of chores.py) ----------
const choreMatches = (c, day) => {
  const comps = c.completions || [];
  if (c.repeat === "once") return comps;
  if (c.repeat === "weekly") return comps.filter((x) => isoWeek(parseYmd(x)) === isoWeek(day));
  return comps.filter((x) => x === ymd(day));
};
const choreDone = (c, day) => choreMatches(c, day).length > 0;
const choreDue = (c, day) => {
  if (c.repeat === "days") return (c.days || []).includes(pyWeekday(day));
  if (c.repeat === "once") { const comps = c.completions || []; return !comps.length || comps.includes(ymd(day)); }
  return true;
};

class SkylightPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.data = null;
    this.events = [];
    this.mealEvents = [];
    this.mealieMeals = [];
    this.mealie = null; // {entries, selected}
    this.todoItems = {}; // entity_id -> items
    this._todoSubs = {};
    this.forecast = {};
    this.ui = {
      tab: "home", view: null, anchor: startOfDay(new Date()), filter: null,
      list: null, dialog: null, saver: false, choreDay: startOfDay(new Date()),
    };
    this._eventsKey = "";
    this._shadowBuilt = false;
  }

  // ---------- HA lifecycle ----------
  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    if (first) this._start();
  }
  get hass() { return this._hass; }
  set panel(_p) {}
  set narrow(n) { this._narrow = n; }
  setConfig(config) { this.config = config || {}; }
  getCardSize() { return 12; }

  connectedCallback() { if (this._hass && !this._unsub) this._start(); }
  disconnectedCallback() {
    if (this._unsub) { this._unsub.then((u) => u && u()).catch(() => {}); this._unsub = null; }
    clearInterval(this._clockTimer); clearInterval(this._idleTimer); clearInterval(this._slideTimer);
    clearInterval(this._refreshTimer);
    if (this._onResize) { window.removeEventListener("resize", this._onResize); this._onResize = null; }
    if (this._ro) { this._ro.disconnect(); this._ro = null; }
    for (const u of Object.values(this._todoSubs)) u.then((f) => f && f()).catch(() => {});
    this._todoSubs = {};
  }

  _start() {
    if (!this.isConnected) return;
    this._buildShadow();
    this._unsub = this._hass.connection.subscribeMessage((data) => this._onData(data), { type: "skylight/subscribe" });
    this._unsub.catch((e) => this._fatal(e));
    this._clockTimer = setInterval(() => this._tickClock(), 10000);
    this._refreshTimer = setInterval(() => { this._eventsKey = ""; this._loadEvents(); this._loadForecast(); }, 5 * 60000);
    this._lastActivity = Date.now();
    this._idleTimer = setInterval(() => this._checkIdle(), 15000);
    if (!this._onResize) {
      this._onResize = () => {
        this._fitMonth();
        const g = this.$app?.querySelector(".tg-scroll");
        if (!g || !this._tgH) return;
        const hours = g.scrollTop / this._tgH;
        this._fitGrid();
        g.scrollTop = hours * this._tgH;
      };
      window.addEventListener("resize", this._onResize);
      if (window.ResizeObserver) {
        this._ro = new ResizeObserver(() => this._onResize());
        this._ro.observe(this.$app);
      }
    }
  }

  _fatal(e) {
    this.$app.innerHTML = `<div class="empty"><h2>Skylight is not available</h2><p>${esc(e?.message || e)}</p>
      <p>Make sure the Skylight integration is installed and added under Settings → Devices &amp; Services.</p></div>`;
  }

  _onData(data) {
    const firstLoad = !this.data;
    this.data = data;
    if (firstLoad) {
      const v = data.settings.default_view || "7day";
      this.ui.view = LEGACY_VIEWS[v] || v;
    }
    if (this.ui.filter && !data.members.find((m) => m.id === this.ui.filter)) this.ui.filter = null;
    this.render();
    this._loadEvents();
    if (firstLoad) { this._loadForecast(); this._loadMealieInfo(); this._loadCalInfo(); }
  }

  async _loadMealieInfo() {
    try { this.mealie = await this._hass.callWS({ type: "skylight/mealie/info" }); }
    catch (e) { this.mealie = { entries: [], selected: null }; }
    this._mealieKey = "";
    this.render();
  }
  get mealieOn() { return !!this.mealie?.selected; }

  // ---------- shadow & events ----------
  _buildShadow() {
    if (this._shadowBuilt) return;
    this._shadowBuilt = true;
    this.shadowRoot.innerHTML = `<style>${STYLES}</style><div id="app" class="app"><div class="empty">Loading…</div></div><div id="dialog"></div><div id="saver"></div>`;
    this.$app = this.shadowRoot.getElementById("app");
    this.$dialog = this.shadowRoot.getElementById("dialog");
    this.$saver = this.shadowRoot.getElementById("saver");
    this.shadowRoot.addEventListener("click", (e) => this._onClick(e));
    this.shadowRoot.addEventListener("change", (e) => this._onChange(e));
    this.shadowRoot.addEventListener("input", (e) => { if (e.target.id === "ev-loc") this._locSearch(e.target.value); });
    this.shadowRoot.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && e.target.dataset.enter) { e.preventDefault(); this._action(e.target.dataset.enter, e.target); }
    });
    for (const ev of ["pointerdown", "keydown", "touchstart"]) {
      this.shadowRoot.addEventListener(ev, () => { this._lastActivity = Date.now(); }, { passive: true });
    }
  }

  _onClick(e) {
    const el = e.target.closest("[data-action]");
    if (!el) return;
    if (el.classList.contains("backdrop") && e.target !== el) return;
    e.stopPropagation();
    this._action(el.dataset.action, el);
  }

  _onChange(e) {
    const el = e.target;
    if (el.dataset.change) this._action(el.dataset.change, el);
  }

  async _ws(msg) {
    try { return await this._hass.callWS(msg); }
    catch (err) { this._toast(err?.message || String(err)); throw err; }
  }
  _set(key, value) { return this._ws({ type: "skylight/set", key, value }); }

  _toast(text) {
    const t = document.createElement("div");
    t.className = "toast"; t.textContent = text;
    this.shadowRoot.appendChild(t);
    setTimeout(() => t.remove(), 4000);
  }

  // Days shown on the Today screen; remembered per device (tablet vs phone).
  get homeDays() {
    if (!this._homeDays) {
      try { this._homeDays = Number(localStorage.getItem("skylight.homeDays")) || 3; } catch (e) { this._homeDays = 3; }
    }
    return this._homeDays;
  }
  set homeDays(n) {
    this._homeDays = n;
    try { localStorage.setItem("skylight.homeDays", String(n)); } catch (e) { /* private mode */ }
  }

  // ---------- data helpers ----------
  get members() { return this.data?.members || []; }
  get settings() { return this.data?.settings || {}; }
  member(id) { return this.members.find((m) => m.id === id); }
  calendarOwner(entity) {
    return this.members.find((m) => (m.calendars || []).includes(entity));
  }
  calendarOwners(entity) {
    return this.members.filter((m) => (m.calendars || []).includes(entity));
  }
  // Apply a list of owners to an event: colors, avatars and Skylight-style diagonal stripes.
  _applyOwners(ev, owners) {
    const fam = this.settings.family_color || "#ff9f43";
    ev.members = owners.map((m) => m.id);
    ev.member = owners[0]?.id || null;
    ev.color = owners[0]?.color || fam;
    ev.avatar = owners.length ? owners.map((m) => m.avatar).join("") : "🏠";
    ev.stripes = "";
    if (owners.length > 1) {
      const W = 9; // px per stripe
      const stops = (tint) => owners.map((m, i) => {
        const c = tint ? `color-mix(in srgb, ${m.color} 32%, var(--card))` : m.color;
        return `${c} ${i * W}px ${(i + 1) * W}px`;
      }).join(", ");
      ev.stripes = `--stripes-soft:repeating-linear-gradient(135deg, ${stops(true)});--stripes-solid:repeating-linear-gradient(135deg, ${stops(false)});--bar:linear-gradient(${owners.map((m) => m.color).join(", ")});`;
    }
    return ev;
  }
  allCalendars() {
    return Object.keys(this._hass.states).filter((e) => e.startsWith("calendar.")).sort();
  }
  entityName(e) { return this._hass.states[e]?.attributes?.friendly_name || e; }
  // Calendar name, plus the account when another calendar has the same name.
  calName(e) {
    const name = this.entityName(e);
    const info = this.calInfo?.[e];
    if (!info?.account) return name;
    const dupes = Object.values(this.calInfo).filter((c) => c.name === info.name).length;
    return dupes > 1 ? `${name} · ${info.account}` : name;
  }
  async _loadCalInfo() {
    try {
      const list = await this._hass.callWS({ type: "skylight/calendars" });
      this.calInfo = Object.fromEntries(list.map((c) => [c.entity_id, c]));
      if (this.ui.tab === "settings") this.render();
    } catch (e) { console.warn("Skylight: calendar info", e); }
  }
  infoCal(entity) { return (this.data.info_calendars || []).find((c) => c.entity === entity); }
  shownCalendars() {
    const set = new Set(this.data.family_calendars || []);
    for (const m of this.members) for (const c of m.calendars || []) set.add(c);
    for (const c of this.data.info_calendars || []) set.add(c.entity);
    return [...set].filter((e) => this._hass.states[e]);
  }
  weekStart(d) {
    const ws = Number(this.settings.week_start || 0); // 0=Sun, 1=Mon
    const diff = (d.getDay() - ws + 7) % 7;
    return addDays(startOfDay(d), -diff);
  }
  fmtTime(d) {
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: !this.settings.clock_24h });
  }

  // ---------- calendar data ----------
  _range() {
    if (this.ui.tab === "home") { const t = startOfDay(new Date()); return [t, addDays(t, this.homeDays)]; }
    const a = this.ui.anchor;
    switch (this.ui.view) {
      case "month": {
        const first = new Date(a.getFullYear(), a.getMonth(), 1);
        const start = this.weekStart(first);
        return [start, addDays(start, 42)];
      }
      case "agenda": return [a, addDays(a, 14)];
      default: return [a, addDays(a, viewDays(this.ui.view) || 7)];
    }
  }

  async _loadEvents() {
    if (!this.data) return;
    const [start, end] = this._range();
    const cals = this.shownCalendars();
    const key = `${ymd(start)}|${ymd(end)}|${cals.join(",")}`;
    if (key === this._eventsKey) return;
    this._eventsKey = key;
    const results = await Promise.all(cals.map(async (entity) => {
      try {
        const evs = await this._hass.callApi("GET", `calendars/${entity}?start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}`);
        return evs.map((ev) => this._normalizeEvent(ev, entity));
      } catch (e) { console.warn("Skylight: failed to load", entity, e); return []; }
    }));
    if (key !== this._eventsKey) return; // a newer request superseded this one
    this.events = this._mergeShared(results.flat()).sort((a, b) => a.start - b.start);
    if (this.ui.tab === "calendar" || this.ui.tab === "home") this.render();
  }

  // The same event on several people's calendars (e.g. a shared invite) shows once with everyone's colors.
  // The same event on several people's calendars shows once with everyone's colors.
  // Matches either the same Google event (uid) or an identical copy (same title, start and end),
  // which is how Skylight saves an event for several people. Each copy is remembered for edits.
  _mergeShared(events) {
    const byUid = new Map(), byContent = new Map();
    const out = [];
    for (const e of events) {
      e.copies = [{ entity: e.entity, uid: e.uid, recurrence_id: e.recurrence_id, rrule: e.rrule }];
      const uidKey = e.uid ? `${e.uid}|${e.recurrence_id || ""}|${+e.start}` : null;
      const contentKey = `${e.raw}|${+e.start}|${+e.end}|${e.allDay}`;
      const first = (uidKey && byUid.get(uidKey)) || byContent.get(contentKey);
      const mergeable = first && !first.info && !e.info && first.raw === e.raw &&
        !first.copies.some((c) => c.entity === e.entity);
      if (!mergeable) {
        if (uidKey) byUid.set(uidKey, e);
        byContent.set(contentKey, e);
        out.push(e);
        continue;
      }
      first.copies.push(e.copies[0]);
      const ids = [...new Set([...first.members, ...e.members])];
      this._applyOwners(first, ids.map((id) => this.member(id)).filter(Boolean));
    }
    return out;
  }

  _normalizeEvent(ev, entity) {
    const allDay = !!ev.start.date;
    const start = allDay ? parseYmd(ev.start.date) : new Date(ev.start.dateTime);
    const end = allDay ? parseYmd(ev.end.date) : new Date(ev.end.dateTime);
    const raw = ev.summary || "(No title)";
    const info = this.infoCal(entity);
    if (info) {
      // Info-only: no owner, its own icon and muted color, never striped or filtered out.
      return {
        entity, allDay, start, end, raw, summary: raw, description: ev.description || "", location: ev.location || "",
        uid: ev.uid, recurrence_id: ev.recurrence_id, rrule: ev.rrule,
        info: true, members: [], member: null, color: info.color || INFO_COLORS[0], avatar: info.icon || "📌", stripes: "",
      };
    }
    const byPrefix = this.prefixOwner(raw);
    const owners = byPrefix ? byPrefix.members : this.calendarOwners(entity);
    return this._applyOwners({
      entity, allDay, start, end, raw, summary: byPrefix ? byPrefix.rest : raw, description: ev.description || "",
      location: ev.location || "", uid: ev.uid, recurrence_id: ev.recurrence_id, rrule: ev.rrule,
    }, owners);
  }

  eventsOn(day) {
    const ds = startOfDay(day), de = addDays(ds, 1);
    return this.visibleEvents().filter((e) => e.start < de && e.end > ds)
      .sort((a, b) => (b.allDay - a.allDay) || (a.start - b.start));
  }
  visibleEvents() {
    let evs = this.events;
    if (this.ui.tab === "home" && this.settings.info_on_today === false) evs = evs.filter((e) => !e.info);
    if (!this.ui.filter) return evs;
    return evs.filter((e) => e.info || (e.members || []).includes(this.ui.filter));
  }

  // "Z- Soccer" -> {member: Sam, rest: "Soccer"} when Sam has prefix "Z".
  // A prefix matches only when followed by a separator (-, :, –, space), so "Z" never matches "Zoo trip".
  // Longest member prefix at position i of the title, or null.
  _prefixAt(t, i) {
    const lower = t.toLowerCase();
    let best = null;
    for (const m of this.members) {
      for (let p of m.prefixes || []) {
        p = p.trim().toLowerCase();
        if (!p || !lower.startsWith(p, i) || (best && p.length <= best.len)) continue;
        const next = t.charAt(i + p.length);
        // must be followed by a separator, a joiner (& / + ,), or the end
        if (!/[-:–—]$/.test(p) && next && !/[\s\-:–—&\/+,]/.test(next)) continue;
        best = { member: m, len: p.length };
      }
    }
    return best;
  }
  // "Z- Soccer" -> Sam; "Z&K- Soccer" / "Z/K: Soccer" / "Z + K - Soccer" -> Sam and Leo.
  // A prefix matches only when followed by a separator, so "Z" never matches "Zoo trip".
  prefixOwner(title) {
    const t = title.trim();
    const members = [];
    let i = 0;
    for (;;) {
      const hit = this._prefixAt(t, i);
      if (!hit) break;
      if (!members.includes(hit.member)) members.push(hit.member);
      i += hit.len;
      const joiner = /^\s*[&\/+,]\s*/.exec(t.slice(i));
      if (!joiner) break;
      i += joiner[0].length;
    }
    if (!members.length) return null;
    // Title must continue with a separator/space after the last prefix (or the prefix ended with one).
    const rest = t.slice(i).replace(/^[\s\-:–—]+/, "").trim();
    return { member: members[0], members, rest: rest || t };
  }

  async _loadForecast() {
    const w = this.settings.weather_entity;
    if (!w || !this._hass.states[w]) return;
    try {
      const res = await this._hass.callWS({
        type: "call_service", domain: "weather", service: "get_forecasts",
        service_data: { type: "daily" }, target: { entity_id: w }, return_response: true,
      });
      const list = res?.response?.[w]?.forecast || [];
      this.forecast = {};
      for (const f of list) this.forecast[ymd(new Date(f.datetime))] = f;
      if (this.ui.tab === "calendar" || this.ui.tab === "home") this.render();
    } catch (e) { console.warn("Skylight: forecast unavailable", e); }
  }

  // ---------- actions ----------
  async _action(action, el) {
    const d = el.dataset;
    const D = this.data;
    switch (action) {
      // navigation
      case "tab": if (d.tab === "settings") this._loadCalInfo(); this.ui.tab = d.tab; this._resetScroll = true; this.render(); if (d.tab === "calendar" || d.tab === "home") this._loadEvents(); break;
      case "view": this.ui.view = d.view; this.render(); this._loadEvents(); break;
      case "filter": this.ui.filter = this.ui.filter === d.member ? null : d.member || null; this.render(); break;
      case "today": this.ui.anchor = startOfDay(new Date()); this.render(); this._loadEvents(); break;
      case "prev": case "next": {
        const dir = action === "next" ? 1 : -1;
        const a = this.ui.anchor;
        if (this.ui.tab === "meals") { this.ui.anchor = addDays(a, dir * 7); this.render(); break; }
        this.ui.anchor = this.ui.view === "month" ? new Date(a.getFullYear(), a.getMonth() + dir, 1)
          : addDays(a, dir * (this.ui.view === "agenda" ? 14 : viewDays(this.ui.view) || 7));
        this.render(); this._loadEvents(); break;
      }
      case "goto-day": this.ui.anchor = parseYmd(d.date); this.ui.view = "day"; this.ui.tab = "calendar"; this.render(); this._loadEvents(); break;
      case "close": this.closeDialog(); break;

      // calendar events
      case "new-event": this.openEventDialog(null, d.date, d.hour !== undefined ? Number(d.hour) : undefined); break;
      case "home-days": this.homeDays = Number(d.days); this.render(); this._loadEvents(); break;
      case "open-event": this.openEventDialog(this.visibleEvents()[Number(d.idx)]); break;
      case "save-event": await this.saveEvent(); break;
      case "delete-event": await this.deleteEvent(); break;
      case "scope": this._resolveScope(d.scope === "cancel" ? null : d.scope); break;
      case "pick-place": {
        const input = this.shadowRoot.getElementById("ev-loc");
        if (input) input.value = d.value;
        this._clearSugg(); break;
      }
      case "places-save": {
        const key = this.shadowRoot.getElementById("places-key").value.trim();
        if (!key) return;
        await this._ws({ type: "skylight/places/configure", google_key: key });
        this._toast("Google Places key saved"); break;
      }
      case "places-clear": await this._ws({ type: "skylight/places/configure", google_key: "" }); this._toast("Using free OpenStreetMap lookup"); break;
      case "who": {
        const w = this.ui.dialog.who;
        w.has(d.member) ? w.delete(d.member) : w.add(d.member);
        this.renderDialog(); break;
      }
      case "event-allday": this.shadowRoot.querySelectorAll(".timefield").forEach((x) => { x.hidden = el.checked; }); break;

      // members
      case "new-member": this.openMemberDialog(); break;
      case "edit-member": this.openMemberDialog(this.member(d.member)); break;
      case "pick-color": this.ui.dialog.color = d.color; this.renderDialog(); break;
      case "pick-avatar": this.ui.dialog.avatar = d.avatar; this.renderDialog(); break;
      case "pick-tone": this.ui.dialog.tone = d.tone; this.ui.dialog.avatar = withTone(baseOf(this.ui.dialog.avatar), d.tone); this.renderDialog(); break;
      case "save-member": await this.saveMember(); break;
      case "delete-member": {
        const m = this.ui.dialog.member;
        if (!confirm(`Remove ${m.name}? Their chores are removed too; calendars are kept.`)) return;
        await this._set("chores", D.chores.filter((c) => c.member_id !== m.id));
        await this._set("members", D.members.filter((x) => x.id !== m.id));
        this.closeDialog(); break;
      }
      case "member-up": case "member-down": {
        const arr = [...D.members]; const i = arr.findIndex((m) => m.id === d.member);
        const j = i + (action === "member-up" ? -1 : 1);
        if (j < 0 || j >= arr.length) return;
        [arr[i], arr[j]] = [arr[j], arr[i]];
        await this._set("members", arr); break;
      }
      case "family-cal": {
        const set = new Set(D.family_calendars || []);
        el.checked ? set.add(d.entity) : set.delete(d.entity);
        await this._set("family_calendars", [...set]); this._eventsKey = ""; break;
      }
      case "create-calendar": {
        const input = this.shadowRoot.getElementById("newcal");
        const name = input.value.trim();
        if (!name) return;
        el.disabled = true;
        try {
          await this._ws({ type: "skylight/calendar/create", name });
          input.value = "";
          this._toast(`Calendar "${name}" created — assign it to a member or the family below.`);
          setTimeout(() => this.render(), 1500); // wait for the entity to appear
        } finally { el.disabled = false; }
        break;
      }
      case "setting": {
        let v = el.type === "checkbox" ? el.checked : el.value;
        if (el.type === "number" || d.num) v = Number(v);
        if (v === "") v = null;
        await this._set("settings", { [d.key]: v });
        if (d.key === "weather_entity") setTimeout(() => this._loadForecast(), 300);
        if (d.key === "week_start") { this._eventsKey = ""; }
        break;
      }

      // chores
      case "toggle-chore": {
        const chore = D.chores.find((c) => c.id === d.chore);
        const day = d.date ? parseYmd(d.date) : this.ui.choreDay;
        const wasDone = chore && choreDone(chore, day);
        el.classList.add("pop");
        const rect = el.getBoundingClientRect(); // capture before the re-render replaces el
        await this._ws({ type: "skylight/chore/toggle", chore_id: d.chore, date: ymd(day) });
        if (!wasDone) this._celebrate(rect);
        break;
      }
      case "chore-day": this.ui.choreDay = addDays(this.ui.choreDay, Number(d.dir)); if (d.dir === "0") this.ui.choreDay = startOfDay(new Date()); this.render(); break;
      case "new-chore": this.openChoreDialog(null, d.member); break;
      case "edit-chore": this.openChoreDialog(D.chores.find((c) => c.id === d.chore)); break;
      case "chore-repeat": this.ui.dialog.repeat = el.value; this._syncChoreDialog(); break;
      case "save-chore": await this.saveChore(); break;
      case "delete-chore": await this._set("chores", D.chores.filter((c) => c.id !== this.ui.dialog.chore.id)); this.closeDialog(); break;

      // stars & rewards
      case "stars": await this._ws({ type: "skylight/stars/adjust", member_id: d.member, delta: Number(d.delta) }); break;
      case "new-reward": this.openRewardDialog(); break;
      case "edit-reward": this.openRewardDialog(D.rewards.find((r) => r.id === d.reward)); break;
      case "save-reward": await this.saveReward(); break;
      case "delete-reward": await this._set("rewards", D.rewards.filter((r) => r.id !== this.ui.dialog.reward.id)); this.closeDialog(); break;
      case "redeem": {
        const r = D.rewards.find((x) => x.id === d.reward); const m = this.member(d.member);
        if (!confirm(`${m.name} spends ${r.cost} ⭐ on "${r.title}"?`)) return;
        const res = await this._ws({ type: "skylight/reward/redeem", reward_id: d.reward, member_id: d.member });
        if (res.redeemed) this._celebrate(el.getBoundingClientRect(), "🎉"); else this._toast("Not enough stars yet!");
        break;
      }

      // meals
      case "edit-meal": this.mealieOn ? this.openMealieDialog(d.date, d.slot) : this.openMealDialog(d.date, d.slot); break;
      case "mealie-search": await this._mealieSearch(); break;
      case "mealie-add": await this._mealieSet({ recipe_id: d.recipe }); break;
      case "mealie-random": await this._mealieSet({ random: true }); break;
      case "mealie-note": {
        const t = this.shadowRoot.getElementById("mealie-note").value.trim();
        if (!t) { this._toast("Type a note first"); return; }
        await this._mealieSet({ note_title: t }); break;
      }
      case "mealie-remove": {
        if (!confirm("Remove this meal from the plan?")) return;
        await this._ws({ type: "skylight/mealie/remove", mealplan_id: Number(d.meal) });
        await this._reloadMealie(); if (this.ui.dialog?.type === "mealie") this.renderDialog(); break;
      }
      case "mealie-import": {
        const url = this.shadowRoot.getElementById("mealie-url").value.trim();
        if (!url) return;
        el.disabled = true;
        try {
          const r = await this._ws({ type: "skylight/mealie/import", url });
          this._toast(`Imported "${r?.name || "recipe"}"`);
          if (r?.id && this.ui.dialog?.type === "mealie") await this._mealieSet({ recipe_id: r.id });
        } finally { el.disabled = false; }
        break;
      }
      case "view-recipe": await this.openRecipe(d.recipe); break;
      case "recipe-to-list": {
        const ent = this.shadowRoot.getElementById("recipe-list").value;
        const items = [...this.shadowRoot.querySelectorAll(".ing-check:checked")].map((i) => i.value);
        if (!ent || !items.length) return;
        for (const item of items) await this._hass.callService("todo", "add_item", { item }, { entity_id: ent });
        this._toast(`Added ${items.length} item${items.length > 1 ? "s" : ""} to ${this.entityName(ent)}`);
        break;
      }
      case "mealie-entry": await this._set("settings", { mealie_entry: el.value }); await this._loadMealieInfo(); break;
      case "linked-todo": {
        const set = new Set(D.linked_todos || []);
        el.checked ? set.add(d.entity) : set.delete(d.entity);
        await this._set("linked_todos", [...set]); break;
      }
      case "save-meal": {
        const { date, slot } = this.ui.dialog;
        const text = this.shadowRoot.getElementById("mealtext").value.trim();
        const cutoff = ymd(addDays(new Date(), -45));
        const meals = Object.fromEntries(Object.entries(D.meals || {}).filter(([k]) => k >= cutoff));
        meals[date] = { ...(meals[date] || {}), [slot]: text };
        await this._set("meals", meals); this.closeDialog(); break;
      }

      // lists
      case "pick-list": this.ui.list = d.list; this.render(); break;
      case "add-item": if (this._isTodo()) { await this._todoAction("add"); break; } {
        const input = this.shadowRoot.getElementById("newitem");
        const text = input.value.trim(); if (!text) return;
        await this._updateList(this.ui.list, (l) => { l.items = [...l.items, { id: uid(), text, done: false }]; });
        this.shadowRoot.getElementById("newitem")?.focus(); break;
      }
      case "toggle-item": if (this._isTodo()) { await this._todoAction("toggle", d.item); break; } await this._updateList(this.ui.list, (l) => { l.items = l.items.map((i) => i.id === d.item ? { ...i, done: !i.done } : i); }); break;
      case "delete-item": if (this._isTodo()) { await this._todoAction("delete", d.item); break; } await this._updateList(this.ui.list, (l) => { l.items = l.items.filter((i) => i.id !== d.item); }); break;
      case "clear-done": if (this._isTodo()) { await this._todoAction("clear"); break; } await this._updateList(this.ui.list, (l) => { l.items = l.items.filter((i) => !i.done); }); break;
      case "new-list": this.openListDialog(); break;
      case "edit-list": this.openListDialog(D.lists.find((l) => l.id === d.list)); break;
      case "save-list": await this.saveList(); break;
      case "delete-list": {
        const l = this.ui.dialog.list;
        if (!confirm(`Delete the list "${l.name}"?`)) return;
        await this._set("lists", D.lists.filter((x) => x.id !== l.id)); this.ui.list = null; this.closeDialog(); break;
      }

      // photos
      case "upload-photos": await this.uploadPhotos(el); break;
      case "delete-photo": if (confirm("Delete this photo?")) await this._ws({ type: "skylight/photo/delete", name: d.name }); break;
      case "start-saver": await this.startSaver(); break;
      case "subscribe-calendar": {
        const name = this.shadowRoot.getElementById("feed-name").value.trim();
        const url = this.shadowRoot.getElementById("feed-url").value.trim();
        if (!name || !url) { this._toast("Enter a name and the calendar link"); return; }
        el.disabled = true;
        try {
          await this._ws({ type: "skylight/calendar/subscribe", name, url });
          this._toast(`Subscribed to "${name}". Tick it below as a family or meal calendar.`);
          setTimeout(() => this.render(), 1500);
        } finally { el.disabled = false; }
        break;
      }
      case "info-cal": {
        let list = [...(D.info_calendars || [])];
        if (el.checked) {
          const name = this.entityName(d.entity).toLowerCase();
          const icon = /birthday/.test(name) ? "🎂" : /holiday/.test(name) ? "🎉" : /school/.test(name) ? "🏫" : "📌";
          list.push({ entity: d.entity, icon, color: INFO_COLORS[list.length % INFO_COLORS.length] });
        } else list = list.filter((c) => c.entity !== d.entity);
        this._eventsKey = "";
        await this._set("info_calendars", list); break;
      }
      case "info-style": {
        const list = (D.info_calendars || []).map((c) => (c.entity === d.entity ? { ...c, [d.field]: d.value } : c));
        this._eventsKey = "";
        await this._set("info_calendars", list); break;
      }
      case "meal-cal": {
        const set = new Set(D.meal_calendars || []);
        el.checked ? set.add(d.entity) : set.delete(d.entity);
        this._mealKey = "";
        await this._set("meal_calendars", [...set]); break;
      }
      case "immich-load": {
        const url = this.shadowRoot.getElementById("im-url").value.trim();
        const key = this.shadowRoot.getElementById("im-key").value.trim();
        this.ui.immichDraft = { url, key };
        el.disabled = true;
        try {
          this.ui.immichAlbums = await this._ws({ type: "skylight/immich/albums", url, ...(key ? { api_key: key } : {}) });
          this.render();
        } finally { el.disabled = false; }
        break;
      }
      case "immich-save": {
        const url = this.shadowRoot.getElementById("im-url").value.trim();
        const key = this.shadowRoot.getElementById("im-key").value.trim();
        const albums = [...this.shadowRoot.querySelectorAll(".im-album:checked")].map((i) => i.value);
        const favorites = this.shadowRoot.getElementById("im-fav").checked;
        await this._ws({ type: "skylight/immich/configure", url, albums, favorites, ...(key ? { api_key: key } : {}) });
        this.ui.immichDraft = null;
        this._toast("Immich photos saved");
        break;
      }
      case "stop-saver": this.stopSaver(); break;
      default: console.warn("Skylight: unknown action", action);
    }
  }

  async _updateList(id, fn) {
    const lists = this.data.lists.map((l) => (l.id === id ? { ...l, items: [...l.items] } : l));
    const list = lists.find((l) => l.id === id);
    if (!list) return;
    fn(list);
    await this._set("lists", lists);
  }

  _celebrate(r, emoji = "⭐") {
    for (let i = 0; i < 8; i++) {
      const s = document.createElement("div");
      s.className = "burst"; s.textContent = emoji;
      s.style.left = `${r.left + r.width / 2}px`; s.style.top = `${r.top + r.height / 2}px`;
      s.style.setProperty("--dx", `${Math.cos((i / 8) * 6.28) * 90}px`);
      s.style.setProperty("--dy", `${Math.sin((i / 8) * 6.28) * 90}px`);
      this.shadowRoot.appendChild(s);
      setTimeout(() => s.remove(), 900);
    }
  }

  // ---------- dialogs ----------
  closeDialog() { this.ui.dialog = null; this.$dialog.innerHTML = ""; }
  renderDialog() {
    const dlg = this.ui.dialog;
    if (!dlg) { this.$dialog.innerHTML = ""; return; }
    // keep typed values across re-renders of the same dialog
    const saved = {};
    this.$dialog.querySelectorAll("input[id],textarea[id],select[id]").forEach((i) => { saved[i.id] = i.type === "checkbox" ? i.checked : i.value; });
    this.$dialog.innerHTML = `<div class="backdrop" data-action="close"><div class="dialog">${dlg.html()}</div></div>`;
    for (const [id, v] of Object.entries(saved)) {
      const i = this.shadowRoot.getElementById(id);
      if (!i || i.dataset.fresh) continue;
      if (i.type === "checkbox") i.checked = v; else i.value = v;
    }
    this.$dialog.querySelector("[autofocus]")?.focus();
  }
  _openDialog(dlg) { this.ui.dialog = dlg; this.$dialog.innerHTML = ""; this.renderDialog(); }

  openEventDialog(ev, date, hour) {
    const writable = this.shownCalendars();
    const dateStr = ev ? ymd(ev.start) : date || ymd(this.ui.anchor);
    const now = new Date();
    const h0 = hour ?? Math.min(now.getHours() + 1, 22);
    const startT = ev && !ev.allDay ? `${pad(ev.start.getHours())}:${pad(ev.start.getMinutes())}` : `${pad(h0)}:00`;
    const endT = ev && !ev.allDay ? `${pad(ev.end.getHours())}:${pad(ev.end.getMinutes())}` : `${pad(Math.min(h0 + 1, 23))}:${h0 >= 23 ? "59" : "00"}`;
    const endDate = ev ? ymd(ev.allDay ? addDays(ev.end, -1) : ev.end) : dateStr;
    const defaultCal = ev?.entity || (this.ui.filter && this.member(this.ui.filter)?.calendars?.[0]) || (this.data.family_calendars || [])[0] || writable[0];
    const calLabel = (e) => { const o = this.calendarOwner(e); return `${o ? o.avatar + " " + o.name + " – " : "🏠 "}${this.calName(e)}`; };
    // Current "All day" state (survives the dialog re-rendering when people are picked).
    const allDayNow = () => this.shadowRoot.getElementById("ev-allday")?.checked ?? !!ev?.allDay;
    const dlg = {
      type: "event", event: ev,
      who: new Set(ev ? (ev.members || []) : this.ui.filter && this.targetCalendar(this.member(this.ui.filter)) ? [this.ui.filter] : []),
      html: () => `
        <h2>${ev ? "Edit event" : "New event"}</h2>
        ${!writable.length ? `<p class="hint">No calendars yet. Add one in Settings first.</p>` : ""}
        <label>Title<input id="ev-title" value="${esc(ev?.raw ?? ev?.summary)}" autofocus placeholder="Soccer practice"></label>
        <div class="label">Who</div>
        <div class="whopick">${this.members.map((m) => {
          const can = !!this.targetCalendar(m);
          return `<button class="whochip ${dlg.who.has(m.id) ? "on" : ""}" style="--c:${m.color}" ${can ? `data-action="who" data-member="${m.id}"` : `disabled title="${esc(m.name)} has no calendar yet"`}>
            <span class="av" style="background:${m.color}">${m.avatar}</span>${esc(m.name)}</button>`;
        }).join("")}</div>
        ${this.members.some((m) => !this.targetCalendar(m)) ? `<p class="hint">Grayed-out people have no calendar yet. Give them one in Settings → Family members, or use their title prefix.</p>` : ""}
        <label class="calpick" ${dlg.who.size ? "hidden" : ""}>Calendar <small class="hint">(when no one is selected)</small><select id="ev-cal">${writable.map((e) => `<option value="${e}" ${e === defaultCal ? "selected" : ""}>${esc(calLabel(e))}</option>`).join("")}</select></label>
        <p class="hint whohint" ${dlg.who.size ? "" : "hidden"}>Saved to each person's calendar${dlg.who.size > 1 ? " and shown once, in everyone's colors" : ""}.</p>
        <label class="check"><input type="checkbox" id="ev-allday" data-change="event-allday" ${ev?.allDay ? "checked" : ""}> All day</label>
        <div class="row">
          <label>Starts<input type="date" id="ev-date" value="${dateStr}"></label>
          <label class="timefield" ${allDayNow() ? "hidden" : ""}>&nbsp;<input type="time" id="ev-start" value="${startT}"></label>
        </div>
        <div class="row">
          <label>Ends<input type="date" id="ev-enddate" value="${endDate}"></label>
          <label class="timefield" ${allDayNow() ? "hidden" : ""}>&nbsp;<input type="time" id="ev-end" value="${endT}"></label>
        </div>
        ${ev ? "" : `<label>Repeats<select id="ev-repeat">
          <option value="">Never</option><option value="FREQ=DAILY">Every day</option>
          <option value="FREQ=WEEKLY">Every week</option><option value="FREQ=MONTHLY">Every month</option>
          <option value="FREQ=YEARLY">Every year</option></select></label>`}
        ${this._isRecurring(ev) ? `<p class="hint">🔁 Repeating event (${esc(this._rruleText(ev.rrule))}). When you save or delete, you'll choose which events to change.</p>` : ""}
        <label class="locfield">Location<input id="ev-loc" value="${esc(ev?.location)}" autocomplete="off" placeholder="Type a place or business name">
          <div id="loc-sugg" class="sugg" hidden></div></label>
        <label>Notes<textarea id="ev-desc" rows="2">${esc(ev?.description)}</textarea></label>
        <div class="actions">
          ${ev ? `<button class="danger" data-action="delete-event">Delete</button>` : ""}
          <span class="spacer"></span>
          <button data-action="close">Cancel</button>
          <button class="primary" data-action="save-event" ${writable.length ? "" : "disabled"}>Save</button>
        </div>`,
    };
    this._openDialog(dlg);
  }

  // ---------- location lookup ----------
  _locSearch(text) {
    clearTimeout(this._locTimer);
    const q = text.trim();
    if (q.length < 3) { this._clearSugg(); return; }
    this._locTimer = setTimeout(async () => {
      const seq = (this._locSeq = (this._locSeq || 0) + 1);
      let res;
      try { res = await this._hass.callWS({ type: "skylight/places/search", query: q }); }
      catch (e) { this._showSugg([], e.message); return; }
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
  targetCalendar(m) {
    if (!m) return null;
    return (m.calendars || []).find((e) => this._hass.states[e] && !this.infoCal(e) &&
      this.calInfo?.[e]?.integration !== "remote_calendar") || null;
  }

  _isRecurring(ev) { return !!(ev && (ev.rrule || ev.recurrence_id)); }
  _rruleText(rr) {
    const f = /FREQ=(\w+)/.exec(rr || "")?.[1];
    return { DAILY: "every day", WEEKLY: "every week", MONTHLY: "every month", YEARLY: "every year" }[f] || "custom";
  }

  _readEventForm() {
    const $ = (id) => this.shadowRoot.getElementById(id);
    const allDay = $("ev-allday").checked;
    const date = $("ev-date").value;
    let endDate = $("ev-enddate").value || date;
    if (endDate < date) endDate = date;
    const fields = { summary: $("ev-title").value.trim() || "(No title)" };
    if ($("ev-desc").value.trim()) fields.description = $("ev-desc").value.trim();
    if ($("ev-loc").value.trim()) fields.location = $("ev-loc").value.trim();
    let start, end;
    if (allDay) {
      start = parseYmd(date); end = addDays(parseYmd(endDate), 1);
    } else {
      const [sh, sm] = $("ev-start").value.split(":").map(Number);
      const [eh, em] = $("ev-end").value.split(":").map(Number);
      start = parseYmd(date); start.setHours(sh, sm);
      end = parseYmd(endDate); end.setHours(eh, em);
      if (end <= start) end = new Date(start.getTime() + 3600000);
    }
    return { entity: $("ev-cal").value, fields, allDay, start, end, rrule: $("ev-repeat")?.value || "" };
  }

  // Build a calendar/event payload, optionally shifted by whole days.
  _eventPayload(form, { shiftDays = 0, rrule = form.rrule } = {}) {
    const s = addDays(form.start, shiftDays), e = addDays(form.end, shiftDays);
    const event = { ...form.fields };
    if (form.allDay) { event.dtstart = ymd(s); event.dtend = ymd(e); }
    else { event.dtstart = localIso(s); event.dtend = localIso(e); }
    if (rrule) event.rrule = rrule;
    return event;
  }

  // Ask "this / this and following / all" for a repeating event. Resolves to the scope or null.
  _askScope(verb) {
    return new Promise((resolve) => {
      this._scopeResolver = resolve;
      const layer = document.createElement("div");
      layer.id = "scope-layer";
      layer.innerHTML = `<div class="backdrop" data-action="scope" data-scope="cancel"><div class="dialog small">
        <h2>${verb === "delete" ? "Delete" : "Save"} repeating event</h2>
        <div class="scopes">
          <button data-action="scope" data-scope="this">This event</button>
          <button data-action="scope" data-scope="future">This and following events</button>
          <button data-action="scope" data-scope="all">All events</button>
        </div>
        <div class="actions"><span class="spacer"></span><button data-action="scope" data-scope="cancel">Cancel</button></div>
      </div></div>`;
      this.$dialog.appendChild(layer);
    });
  }
  _resolveScope(scope) {
    this.shadowRoot.getElementById("scope-layer")?.remove();
    const r = this._scopeResolver; this._scopeResolver = null;
    if (r) r(scope);
  }

  // Start of the series containing `ev` (earliest occurrence with the same uid).
  async _seriesStart(ev) {
    const from = addDays(ev.start, -3 * 366), to = addDays(ev.start, 1);
    const evs = await this._hass.callApi("GET", `calendars/${ev.entity}?start=${encodeURIComponent(from.toISOString())}&end=${encodeURIComponent(to.toISOString())}`);
    const starts = evs.filter((x) => x.uid === ev.uid)
      .map((x) => (x.start.date ? parseYmd(x.start.date) : new Date(x.start.dateTime)));
    return starts.length ? new Date(Math.min(...starts)) : ev.start;
  }

  // Which calendars an event should be on, given the selected people (keeps existing copies where possible).
  _planCopies(ev, who, fallbackEntity) {
    const copies = ev?.copies || [];
    if (!who.size) {
      // No people chosen: one copy on the chosen calendar.
      const keep = copies.find((c) => c.entity === fallbackEntity) || null;
      return { keep: keep ? [keep] : [], create: keep ? [] : [fallbackEntity], remove: copies.filter((c) => c !== keep), moveFrom: keep ? null : copies[0] || null };
    }
    const keep = [], create = new Set();
    for (const id of who) {
      const m = this.member(id);
      const have = copies.find((c) => (m.calendars || []).includes(c.entity));
      if (have) { if (!keep.includes(have)) keep.push(have); continue; }
      const t = this.targetCalendar(m);
      if (t && !copies.some((c) => c.entity === t)) create.add(t);
      else if (t) keep.push(copies.find((c) => c.entity === t));
    }
    const remove = copies.filter((c) => !keep.includes(c));
    return { keep, create: [...create], remove, moveFrom: null };
  }

  async saveEvent() {
    const form = this._readEventForm();
    const ev = this.ui.dialog.event;
    const who = this.ui.dialog.who || new Set();
    const plan = this._planCopies(ev, who, form.entity);
    if (!ev) {
      for (const entity of plan.create) await this._ws({ type: "calendar/event/create", entity_id: entity, event: this._eventPayload(form) });
    } else if (this._isRecurring(ev)) {
      const scope = await this._askScope("save");
      if (!scope) return;
      for (const c of plan.keep) await this._updateCopy(c, ev, form, scope);
      for (const entity of plan.create) {
        // New person on a repeating event: "this" adds just this occurrence; otherwise the series from here.
        const rrule = scope === "this" ? "" : ev.rrule;
        await this._ws({ type: "calendar/event/create", entity_id: entity, event: this._eventPayload(form, { rrule }) });
      }
      for (const c of plan.remove) await this._deleteCopy(c, scope);
    } else {
      for (const c of plan.keep) await this._ws({ type: "calendar/event/update", entity_id: c.entity, uid: c.uid, event: this._eventPayload(form, { rrule: "" }) });
      for (const entity of plan.create) await this._ws({ type: "calendar/event/create", entity_id: entity, event: this._eventPayload(form) });
      for (const c of plan.remove) await this._ws({ type: "calendar/event/delete", entity_id: c.entity, uid: c.uid });
    }
    this.closeDialog(); this._eventsKey = ""; this._mealKey = ""; this._loadEvents();
  }

  async _updateCopy(c, ev, form, scope) {
    const base = { type: "calendar/event/update", entity_id: c.entity, uid: c.uid };
    if (scope === "this") {
      await this._ws({ ...base, recurrence_id: c.recurrence_id, event: this._eventPayload(form, { rrule: "" }) });
    } else if (scope === "future") {
      await this._ws({ ...base, recurrence_id: c.recurrence_id, recurrence_range: "THISANDFUTURE", event: this._eventPayload(form, { rrule: c.rrule || ev.rrule }) });
    } else {
      // Keep the series' original first date; apply any day move relative to it.
      const first = await this._seriesStart({ ...ev, entity: c.entity, uid: c.uid });
      const shiftDays = Math.round((startOfDay(first) - startOfDay(ev.start)) / 86400000);
      await this._ws({ ...base, event: this._eventPayload(form, { shiftDays, rrule: c.rrule || ev.rrule }) });
    }
  }

  async _deleteCopy(c, scope) {
    const msg = { type: "calendar/event/delete", entity_id: c.entity, uid: c.uid };
    if (scope === "this") msg.recurrence_id = c.recurrence_id;
    if (scope === "future") { msg.recurrence_id = c.recurrence_id; msg.recurrence_range = "THISANDFUTURE"; }
    await this._ws(msg);
  }

  async deleteEvent() {
    const ev = this.ui.dialog.event;
    const copies = ev.copies || [{ entity: ev.entity, uid: ev.uid, recurrence_id: ev.recurrence_id, rrule: ev.rrule }];
    let scope = null;
    if (this._isRecurring(ev)) {
      scope = await this._askScope("delete");
      if (!scope) return;
    } else if (!confirm(`Delete "${ev.summary}"${copies.length > 1 ? ` from ${copies.length} calendars` : ""}?`)) return;
    for (const c of copies) await this._deleteCopy(c, scope);
    this.closeDialog(); this._eventsKey = ""; this._loadEvents();
  }

  openMemberDialog(m) {
    const used = new Set(this.members.map((x) => x.color));
    const dlg = {
      type: "member", member: m,
      color: m?.color || PALETTE.find((c) => !used.has(c)) || PALETTE[0],
      avatar: m?.avatar || AVATARS[this.members.length % AVATARS.length],
      tone: m?.avatar ? toneOf(m.avatar) : "",
      html: () => {
        const cals = this.allCalendars();
        const mine = new Set(m?.calendars || []);
        return `
        <h2>${m ? "Edit" : "Add"} family member</h2>
        <div class="avatar-preview" style="background:${dlg.color}">${dlg.avatar}</div>
        <label>Name<input id="m-name" value="${esc(m?.name)}" autofocus placeholder="Name"></label>
        <label>Event title prefixes <small class="hint">(optional, comma-separated)</small>
          <input id="m-prefix" value="${esc((m?.prefixes || []).join(", "))}" placeholder="e.g. Z, Sam"></label>
        <p class="hint" style="margin-top:-4px">Events whose title starts with one of these, followed by "-", ":" or a space (like “Z- Soccer”), show in this person's color on any calendar.</p>
        <div class="label">Color</div>
        <div class="swatches">${PALETTE.map((c) => `<button class="swatch ${c === dlg.color ? "sel" : ""}" style="background:${c}" data-action="pick-color" data-color="${c}"></button>`).join("")}</div>
        <div class="label">Avatar</div>
        <div class="tones">Skin tone: ${SKIN_TONES.map(([t, name]) => `<button class="tone ${t === dlg.tone ? "sel" : ""}" title="${name}" data-action="pick-tone" data-tone="${t}">👋${t}</button>`).join("")}</div>
        <div class="swatches">${AVATARS.map((a0) => { const a = withTone(a0, dlg.tone); return `<button class="emoji ${a === dlg.avatar ? "sel" : ""}" data-action="pick-avatar" data-avatar="${a}">${a}</button>`; }).join("")}</div>
        <div class="label">Calendars</div>
        <div class="checklist">${cals.length ? cals.map((e) => `<label class="check"><input type="checkbox" class="m-cal" id="mc-${e}" value="${e}" ${mine.has(e) ? "checked" : ""}> ${esc(this.calName(e))}</label>`).join("") : `<p class="hint">No calendars found. Create one in Settings → Calendars.</p>`}</div>
        <div class="actions">
          ${m ? `<button class="danger" data-action="delete-member">Remove</button>` : ""}
          <span class="spacer"></span>
          <button data-action="close">Cancel</button>
          <button class="primary" data-action="save-member">Save</button>
        </div>`;
      },
    };
    this._openDialog(dlg);
  }

  async saveMember() {
    const dlg = this.ui.dialog;
    const name = this.shadowRoot.getElementById("m-name").value.trim();
    if (!name) { this._toast("Please enter a name"); return; }
    const calendars = [...this.shadowRoot.querySelectorAll(".m-cal:checked")].map((i) => i.value);
    const prefixes = this.shadowRoot.getElementById("m-prefix").value.split(",").map((x) => x.trim()).filter(Boolean);
    const rec = { id: dlg.member?.id || uid(), name, color: dlg.color, avatar: dlg.avatar, calendars, prefixes };
    const members = dlg.member ? this.members.map((x) => (x.id === rec.id ? rec : x)) : [...this.members, rec];
    await this._set("members", members);
    this._eventsKey = ""; this._mealKey = ""; this.closeDialog();
  }

  openChoreDialog(c, memberId) {
    const dlg = {
      type: "chore", chore: c, repeat: c?.repeat || "daily",
      html: () => `
        <h2>${c ? "Edit" : "New"} chore</h2>
        ${!this.members.length ? `<p class="hint">Add family members in Settings first.</p>` : ""}
        <div class="row">
          <label style="flex:0 0 80px">Icon<input id="c-icon" value="${esc(c?.icon || "✅")}" maxlength="4"></label>
          <label>Chore<input id="c-title" value="${esc(c?.title)}" autofocus placeholder="Make bed"></label>
        </div>
        <label>Who<select id="c-member">${this.members.map((m) => `<option value="${m.id}" ${m.id === (c?.member_id || memberId) ? "selected" : ""}>${m.avatar} ${esc(m.name)}</option>`).join("")}</select></label>
        <label>Stars earned<input type="number" id="c-stars" min="0" max="20" value="${c?.stars ?? 1}"></label>
        <label>Repeats<select id="c-repeat" data-change="chore-repeat">
          <option value="daily" ${dlg.repeat === "daily" ? "selected" : ""}>Every day</option>
          <option value="days" ${dlg.repeat === "days" ? "selected" : ""}>On certain days</option>
          <option value="weekly" ${dlg.repeat === "weekly" ? "selected" : ""}>Once a week (any day)</option>
          <option value="once" ${dlg.repeat === "once" ? "selected" : ""}>Just once</option></select></label>
        <div class="daypick" ${dlg.repeat === "days" ? "" : "hidden"}>${WEEKDAYS.map((w, i) => `<label class="daychip"><input type="checkbox" class="c-day" id="cd-${i}" value="${i}" ${(c?.days || [0, 1, 2, 3, 4]).includes(i) ? "checked" : ""}><span>${w}</span></label>`).join("")}</div>
        <div class="actions">
          ${c ? `<button class="danger" data-action="delete-chore">Delete</button>` : ""}
          <span class="spacer"></span>
          <button data-action="close">Cancel</button>
          <button class="primary" data-action="save-chore" ${this.members.length ? "" : "disabled"}>Save</button>
        </div>`,
    };
    this._openDialog(dlg);
  }
  _syncChoreDialog() {
    const dp = this.shadowRoot.querySelector(".daypick");
    if (dp) dp.hidden = this.ui.dialog.repeat !== "days";
  }
  async saveChore() {
    const $ = (id) => this.shadowRoot.getElementById(id);
    const c = this.ui.dialog.chore;
    const title = $("c-title").value.trim();
    if (!title) { this._toast("Please name the chore"); return; }
    const rec = {
      ...(c || { id: uid(), completions: [] }),
      title, icon: $("c-icon").value.trim() || "✅", member_id: $("c-member").value,
      stars: Math.max(0, Number($("c-stars").value) || 0), repeat: $("c-repeat").value,
      days: [...this.shadowRoot.querySelectorAll(".c-day:checked")].map((i) => Number(i.value)),
    };
    const chores = c ? this.data.chores.map((x) => (x.id === c.id ? rec : x)) : [...this.data.chores, rec];
    await this._set("chores", chores); this.closeDialog();
  }

  openRewardDialog(r) {
    this._openDialog({
      type: "reward", reward: r,
      html: () => `
        <h2>${r ? "Edit" : "New"} reward</h2>
        <div class="row">
          <label style="flex:0 0 80px">Icon<input id="r-icon" value="${esc(r?.icon || "🎁")}" maxlength="4"></label>
          <label>Reward<input id="r-title" value="${esc(r?.title)}" autofocus placeholder="Movie night pick"></label>
        </div>
        <label>Cost (stars)<input type="number" id="r-cost" min="1" value="${r?.cost ?? 20}"></label>
        <label>For<select id="r-member"><option value="">Everyone</option>${this.members.map((m) => `<option value="${m.id}" ${m.id === r?.member_id ? "selected" : ""}>${m.avatar} ${esc(m.name)}</option>`).join("")}</select></label>
        <div class="actions">
          ${r ? `<button class="danger" data-action="delete-reward">Delete</button>` : ""}
          <span class="spacer"></span>
          <button data-action="close">Cancel</button>
          <button class="primary" data-action="save-reward">Save</button>
        </div>`,
    });
  }
  async saveReward() {
    const $ = (id) => this.shadowRoot.getElementById(id);
    const r = this.ui.dialog.reward;
    const title = $("r-title").value.trim();
    if (!title) { this._toast("Please name the reward"); return; }
    const rec = { ...(r || { id: uid() }), title, icon: $("r-icon").value.trim() || "🎁", cost: Math.max(1, Number($("r-cost").value) || 1), member_id: $("r-member").value || null };
    const rewards = r ? this.data.rewards.map((x) => (x.id === r.id ? rec : x)) : [...this.data.rewards, rec];
    await this._set("rewards", rewards); this.closeDialog();
  }

  // ---------- Mealie ----------
  async _reloadMealie() { this._mealieKey = ""; await this._loadMealie(); }
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

  // ---------- linked HA to-do lists ----------
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
    return (this.data.linked_todos || []).filter((e) => this._hass.states[e]).map((e, i) => {
      this._subscribeTodo(e);
      return {
        id: `todo:${e}`, linked: true, name: this.entityName(e), color: PALETTE[(i * 5 + 3) % PALETTE.length],
        items: (this.todoItems[e] || []).map((t) => ({ id: t.uid, text: t.summary, done: t.status === "completed" })),
      };
    });
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

  openListDialog(l) {
    const dlg = {
      type: "list", list: l, color: l?.color || PALETTE[(this.data.lists.length * 3) % PALETTE.length],
      html: () => `
        <h2>${l ? "Edit" : "New"} list</h2>
        <label>Name<input id="l-name" value="${esc(l?.name)}" autofocus placeholder="Packing list"></label>
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
    const rec = { ...(dlg.list || { id: uid(), items: [] }), name, color: dlg.color };
    const lists = dlg.list ? this.data.lists.map((x) => (x.id === rec.id ? rec : x)) : [...this.data.lists, rec];
    await this._set("lists", lists); this.ui.list = rec.id; this.closeDialog(); this.render();
  }

  async uploadPhotos(el) {
    const input = this.shadowRoot.getElementById("photo-input");
    const files = [...(input?.files || [])];
    if (!files.length) { input?.click(); return; }
    el.disabled = true;
    let ok = 0;
    for (const f of files) {
      const fd = new FormData(); fd.append("file", f, f.name);
      try {
        const res = this._hass.fetchWithAuth
          ? await this._hass.fetchWithAuth("/api/skylight/photo", { method: "POST", body: fd })
          : await fetch("/api/skylight/photo", { method: "POST", body: fd, headers: { Authorization: `Bearer ${this._hass.auth.data.access_token}` } });
        if (!res.ok) throw new Error((await res.json()).message || res.statusText);
        ok++;
      } catch (e) { this._toast(`${f.name}: ${e.message}`); }
    }
    input.value = ""; el.disabled = false;
    if (ok) this._toast(`Uploaded ${ok} photo${ok > 1 ? "s" : ""}`);
  }

  // ---------- screensaver ----------
  // Month grid fills the remaining space so all six weeks are visible.
  _fitMonth() {
    const m = this.$app?.querySelector(".month");
    if (!m || window.innerWidth <= 900) return;
    const content = this.$app.querySelector(".content");
    const bottom = content.getBoundingClientRect().bottom - parseFloat(getComputedStyle(content).paddingBottom || 0);
    m.style.height = `${Math.max(420, Math.floor(bottom - m.getBoundingClientRect().top - content.scrollTop - 2))}px`;
    m.style.minHeight = "0";
  }

  // Size the grid to the space left on screen so the day window (6am-9pm) fits exactly.
  _fitGrid() {
    const tg = this.$app?.querySelector(".tg");
    if (!tg) return;
    const narrow = window.innerWidth <= 900;
    if (!narrow) {
      // Fill exactly the space left inside Skylight's scroll area (not the whole browser window).
      const content = this.$app.querySelector(".content");
      const cs = getComputedStyle(content);
      const bottom = content.getBoundingClientRect().bottom - parseFloat(cs.paddingBottom || 0);
      const top = tg.getBoundingClientRect().top + content.scrollTop;
      tg.style.height = `${Math.max(360, Math.floor(bottom - top - 2))}px`;
    } else tg.style.height = `${Math.max(420, window.innerHeight * 0.75)}px`;
    // Chores column on the Today screen matches the calendar height and scrolls by itself.
    const side = this.$app.querySelector(".hside");
    if (side) side.style.maxHeight = narrow ? "" : tg.style.height;
    const scroll = tg.querySelector(".tg-scroll");
    const [a, b] = this._tgWindow || [7, 20];
    this._tgH = Math.max(24, scroll.clientHeight / (b - a));
    tg.style.setProperty("--h", `${this._tgH}px`);
  }
  // Default position: always the day window (7am-8pm), whatever the time.
  _scrollGridHome(grid = this.$app?.querySelector(".tg-scroll")) {
    if (!grid) return;
    const [a] = this._tgWindow || [7, 20];
    this._tgScroll = a; // hours
    grid.scrollTop = a * (this._tgH || 40);
  }

  _checkIdle() {
    // On a wall display, drift back to "now" after 3 minutes without touches.
    if (!this.ui.dialog && Date.now() - this._lastActivity > 180000 && Date.now() - (this._lastSnap || 0) > 180000) {
      this._lastSnap = Date.now();
      this._scrollGridHome();
    }
    const mins = Number(this.settings.screensaver_minutes || 0);
    if (!mins || this.ui.saver || this.ui.dialog || !this._hasPhotoSource()) return;
    if (Date.now() - this._lastActivity > mins * 60000) this.startSaver();
  }
  _hasPhotoSource() {
    const im = this.data?.immich || {};
    return !!(this.data?.photos?.length || (im.url && im.has_key && (im.albums?.length || im.favorites)));
  }
  async _photoUrls() {
    // Signed Immich URLs expire after 24h; refresh the list hourly.
    if (this._urlCache && Date.now() - this._urlCache.at < 3600000 && this._urlCache.n === (this.data.photos || []).length) return this._urlCache.urls;
    const res = await this._hass.callWS({ type: "skylight/photos/urls" });
    if (res.error) console.warn("Skylight: Immich", res.error);
    this._urlCache = { at: Date.now(), urls: res.urls, n: (this.data.photos || []).length, error: res.error };
    return res.urls;
  }
  async startSaver() {
    if (this.ui.saver) return;
    this.ui.saver = true; // guard against double start while loading
    let photos = [];
    try { photos = await this._photoUrls(); } catch (e) { console.warn(e); }
    if (!photos.length) {
      this.ui.saver = false;
      this._toast(this._urlCache?.error || "Add photos in the Photos tab first");
      return;
    }
    this._slideOrder = [...photos].sort(() => Math.random() - 0.5);
    this._slideIdx = 0;
    this.$saver.innerHTML = `<div class="saver" data-action="stop-saver">
      <img class="bg" id="sv-bg"><img id="sv-a" class="show"><img id="sv-b">
      <div class="saver-clock"><div id="sv-time"></div><div id="sv-date"></div></div></div>`;
    this._nextSlide(); this._tickClock();
    clearInterval(this._slideTimer);
    this._slideTimer = setInterval(() => this._nextSlide(), Math.max(5, Number(this.settings.photo_seconds || 15)) * 1000);
  }
  stopSaver() {
    this.ui.saver = false; this.$saver.innerHTML = ""; clearInterval(this._slideTimer); this._lastActivity = Date.now();
  }
  _nextSlide() {
    const a = this.shadowRoot.getElementById("sv-a"), b = this.shadowRoot.getElementById("sv-b"), bg = this.shadowRoot.getElementById("sv-bg");
    if (!a) return;
    const [front, back] = a.classList.contains("show") ? [a, b] : [b, a];
    const src = this._slideOrder[this._slideIdx++ % this._slideOrder.length];
    back.onload = () => { back.classList.add("show"); front.classList.remove("show"); bg.src = src; };
    back.src = src;
  }

  _tickClock() {
    const now = new Date();
    const t = this.fmtTime(now);
    const dt = now.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
    this.shadowRoot.querySelectorAll(".tg-now").forEach((l) => { l.style.top = `calc(var(--h) * ${(now.getHours() + now.getMinutes() / 60).toFixed(3)})`; });
    for (const [id, v] of [["clock", t], ["date", dt], ["sv-time", t], ["sv-date", dt]]) {
      const el = this.shadowRoot.getElementById(id); if (el) el.textContent = v;
    }
    // roll over "today" at midnight
    if (this._lastDay && this._lastDay !== ymd(now)) { this.ui.choreDay = startOfDay(now); this._eventsKey = ""; this.render(); this._loadEvents(); this._loadForecast(); }
    this._lastDay = ymd(now);
  }

  // ---------- rendering ----------
  render() {
    if (!this.$app || !this.data) return;
    const scroll = this._resetScroll ? 0 : this.$app.querySelector(".content")?.scrollTop || 0;
    this._resetScroll = false;
    const focusId = this.shadowRoot.activeElement?.id;
    const tg = this.$app.querySelector(".tg-scroll");
    if (tg && this._tgH) this._tgScroll = tg.scrollTop / this._tgH; // hours
    const prevKey = this._tgKey;
    const tab = this.ui.tab;
    const body = {
      home: () => this.renderHome(), calendar: () => this.renderCalendar(), chores: () => this.renderChores(), rewards: () => this.renderRewards(),
      meals: () => this.renderMeals(), lists: () => this.renderLists(), photos: () => this.renderPhotos(),
      settings: () => this.renderSettings(),
    }[tab]();
    this.$app.innerHTML = `
      <nav class="rail">
        <div class="logo">☀︎</div>
        ${TABS.map(([id, label, icon]) => `<button class="tab ${tab === id ? "active" : ""}" data-action="tab" data-tab="${id}"><ha-icon icon="${icon}"></ha-icon><span>${label}</span></button>`).join("")}
      </nav>
      <main>
        ${this.renderHeader()}
        <div class="content">${body}</div>
      </main>`;
    const c = this.$app.querySelector(".content"); if (c) c.scrollTop = scroll;
    this._fitMonth();
    if (this.$app.querySelector(".month")) requestAnimationFrame(() => this._fitMonth());
    const grid = this.$app.querySelector(".tg-scroll");
    if (grid) {
      this._fitGrid();
      requestAnimationFrame(() => this._onResize?.()); // settle once layout above the grid is final
      // Re-fit if anything above the grid changes size after this render (fonts, chips, weather).
      if (this._ro) {
        this._ro.disconnect();
        for (const n of [this.$app, this.$app.querySelector("header"), this.$app.querySelector(".content > .toolbar")]) if (n) this._ro.observe(n);
      }
      // Same days as before: keep where the user scrolled. New days: jump to "now" (or morning).
      if (this._tgKeyNext !== prevKey || this._tgScroll === undefined) this._scrollGridHome(grid);
      else grid.scrollTop = this._tgScroll * this._tgH;
      this._tgKey = this._tgKeyNext;
    }
    if (focusId === "newitem" || focusId === "newcal") this.shadowRoot.getElementById(focusId)?.focus();
    this._tickClock();
  }

  renderHeader() {
    const w = this.settings.weather_entity && this._hass.states[this.settings.weather_entity];
    const weather = w ? `<div class="weather">${WEATHER_ICONS[w.state] || "🌡️"}<b>${Math.round(Number(w.attributes.temperature))}°</b></div>` : "";
    const showChips = ["calendar", "home"].includes(this.ui.tab);
    return `<header>
      <div class="when"><div id="clock" class="clock"></div><div id="date" class="date"></div></div>
      ${showChips ? `<div class="chips members">${this.members.map((m) => `
        <button class="mchip ${this.ui.filter === m.id ? "on" : this.ui.filter ? "dim" : ""}" style="--c:${m.color}" data-action="filter" data-member="${m.id}">
          <span class="av" style="background:${m.color}">${m.avatar}</span>${esc(m.name)}</button>`).join("")}
        ${this.members.length ? "" : `<button class="chip" data-action="tab" data-tab="settings">+ Add your family in Settings</button>`}
      </div>` : "<div></div>"}
      ${weather}
    </header>`;
  }

  renderCalendar() {
    const v = this.ui.view, a = this.ui.anchor;
    let title;
    // Short titles so the toolbar never wraps; year only when it isn't this year.
    const thisYear = new Date().getFullYear();
    const yr = (d) => (d.getFullYear() !== thisYear ? `, ${d.getFullYear()}` : "");
    if (v === "month") title = a.toLocaleDateString([], { month: "long", year: "numeric" });
    else if (v === "day") title = `${a.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}${yr(a)}`;
    else {
      const [s, e0] = this._range(), e = addDays(e0, -1);
      const sm = s.toLocaleDateString([], { month: "short" }), em = e.toLocaleDateString([], { month: "short" });
      title = sm === em && s.getFullYear() === e.getFullYear()
        ? `${sm} ${s.getDate()} – ${e.getDate()}${yr(e)}`
        : `${sm} ${s.getDate()}${s.getFullYear() !== e.getFullYear() ? yr(s) : ""} – ${em} ${e.getDate()}${yr(e)}`;
    }
    const noCals = !this.shownCalendars().length;
    const toolbar = `<div class="toolbar caltool">
      <div class="nav"><button class="icon" data-action="prev">‹</button><button data-action="today">Today</button><button class="icon" data-action="next">›</button></div>
      <h1>${title}</h1>
      <div class="seg">${CAL_VIEWS.map(([x, label]) => `<button class="${v === x ? "on" : ""}" data-action="view" data-view="${x}">${label}</button>`).join("")}</div>
      <button class="primary fab" data-action="new-event">+ Event</button>
    </div>`;
    if (noCals) return toolbar + `<div class="empty"><h2>No calendars connected yet</h2><p>Open <b>Settings</b> to add family members and create or link calendars.</p><button class="primary" data-action="tab" data-tab="settings">Go to Settings</button></div>`;
    const body = v === "month" ? this.renderMonth()
      : v === "agenda" ? this.renderSchedule()
      : this.renderTimeGrid([...Array(viewDays(v) || 7)].map((_, i) => addDays(a, i)), { labels: (d) => this.dayLabel(d, viewDays(v)) });
    return toolbar + body;
  }

  evIndex(ev) { return this.visibleEvents().indexOf(ev); }
  evPill(ev, day, compact) {
    const time = ev.allDay ? "" : `<span class="t">${this.fmtTime(ev.start)}</span>`;
    const multi = ev.allDay && (ev.end - ev.start) > 86400000;
    const cont = day && ev.start < startOfDay(day);
    return `<button class="ev ${ev.allDay ? "allday" : ""} ${compact ? "compact" : ""} ${ev.stripes ? "multi" : ""} ${ev.info ? "info" : ""}" style="--c:${ev.color};${ev.stripes}" data-action="open-event" data-idx="${this.evIndex(ev)}">
      ${compact && !ev.info ? "" : `<span class="av">${ev.avatar}</span>`}<span class="s">${cont ? "↳ " : ""}${esc(ev.summary)}</span>${multi || compact ? "" : time}${compact && !ev.allDay ? `<span class="t">${this.fmtTime(ev.start)}</span>` : ""}</button>`;
  }
  dayHead(d) {
    const f = this.forecast[ymd(d)];
    const wx = f ? `<span class="wx">${WEATHER_ICONS[f.condition] || ""} ${Math.round(f.temperature)}°</span>` : "";
    return `<div class="dh ${sameDay(d, new Date()) ? "today" : ""}" data-action="goto-day" data-date="${ymd(d)}">
      <span class="dn">${d.toLocaleDateString([], { weekday: "short" })}</span><span class="dd">${d.getDate()}</span>${wx}</div>`;
  }

  // "Today" / "Tomorrow" / weekday, shared by the Today screen and the Calendar tab.
  dayLabel(d, n) {
    const diff = Math.round((startOfDay(d) - startOfDay(new Date())) / 86400000);
    if (diff === 0) return "Today";
    if (diff === 1 && n <= 3) return "Tomorrow";
    return d.toLocaleDateString([], { weekday: n >= 5 ? "short" : "long" });
  }

  renderWeek() {
    const [st] = this._range();
    return this.renderTimeGrid([...Array(7)].map((_, i) => addDays(st, i)));
  }

  renderMonth() {
    const [s] = this._range();
    const month = this.ui.anchor.getMonth();
    const heads = [...Array(7)].map((_, i) => addDays(s, i).toLocaleDateString([], { weekday: "short" }));
    const cells = [...Array(42)].map((_, i) => {
      const d = addDays(s, i);
      const evs = this.eventsOn(d);
      return `<div class="cell ${d.getMonth() !== month ? "other" : ""} ${sameDay(d, new Date()) ? "today" : ""}" >
        <div class="cn" data-action="goto-day" data-date="${ymd(d)}">${d.getDate()}</div>
        ${evs.slice(0, evs.length > 3 ? 2 : 3).map((e) => this.evPill(e, d, true)).join("")}
        ${evs.length > 3 ? `<button class="more" data-action="goto-day" data-date="${ymd(d)}">+${evs.length - 2} more</button>` : ""}
        <button class="celladd" data-action="new-event" data-date="${ymd(d)}"></button>
      </div>`;
    }).join("");
    return `<div class="month"><div class="mh">${heads.map((h) => `<div>${h}</div>`).join("")}</div><div class="mg">${cells}</div></div>`;
  }

  renderDay() { return this.renderTimeGrid([this.ui.anchor]); }

  // Google/Outlook-style time grid: all-day row on top, hourly blocks below.
  renderTimeGrid(days, { labels } = {}) {
    const DAY_START = 7, DAY_END = 20; // window that fits on screen without scrolling (7am-8pm)
    const at = (hours) => `calc(var(--h) * ${hours.toFixed(3)})`;
    const isAllDay = (e, d) => e.allDay || (e.start <= startOfDay(d) && e.end >= addDays(startOfDay(d), 1));
    const now = new Date();
    const head = days.map((d, i) => {
      const f = this.forecast[ymd(d)];
      const name = labels ? labels(d, i) : d.toLocaleDateString([], { weekday: "short" });
      return `<div class="tg-dh ${sameDay(d, now) ? "today" : ""}" data-action="goto-day" data-date="${ymd(d)}">
        <span class="dn">${name}</span><span class="dd">${d.getDate()}</span>
        ${f ? `<span class="wx">${WEATHER_ICONS[f.condition] || ""} ${Math.round(f.temperature)}°</span>` : ""}</div>`;
    }).join("");
    const allDayCells = days.map((d) => this.eventsOn(d).filter((e) => isAllDay(e, d)));
    const hasAllDay = allDayCells.some((c) => c.length);
    const cols = days.map((d) => {
      const ds = startOfDay(d), de = addDays(ds, 1);
      const timed = this.eventsOn(d).filter((e) => !isAllDay(e, d)).map((e) => {
        const s = Math.max(e.start, ds), en = Math.min(e.end, de);
        return { e, s, en: Math.max(en, s + 20 * 60000) };
      }).sort((x, y) => x.s - y.s || y.en - x.en);
      // Lay overlapping events side by side (lanes within each overlapping cluster).
      let cluster = [], clusterEnd = 0;
      const flush = () => {
        const lanes = [];
        for (const it of cluster) {
          let lane = lanes.findIndex((end) => end <= it.s);
          if (lane < 0) { lane = lanes.length; lanes.push(0); }
          lanes[lane] = it.en; it.lane = lane;
        }
        for (const it of cluster) {
          it.lanes = lanes.length;
          // Stretch right across lanes that are free during this event (like Google Calendar).
          it.span = 1;
          while (it.lane + it.span < it.lanes &&
            !cluster.some((o) => o.lane === it.lane + it.span && o.s < it.en && o.en > it.s)) it.span++;
        }
        cluster = [];
      };
      for (const it of timed) {
        if (cluster.length && it.s >= clusterEnd) flush();
        cluster.push(it); clusterEnd = Math.max(clusterEnd, it.en);
      }
      flush();
      const blocks = timed.map(({ e, s, en, lane, lanes, span }) => {
        const startH = (s - ds) / 3600000, dur = (en - s) / 3600000;
        const w = 100 / lanes;
        const short = dur < 0.8;
        return `<button class="tg-ev ${short ? "short" : dur >= 1.5 ? "tall" : ""} ${e.stripes ? "multi" : ""} ${e.info ? "info" : ""}" style="--c:${e.color};${e.stripes}top:${at(startH)};height:max(20px, calc(var(--h) * ${dur.toFixed(3)} - 2px));left:calc(${lane * w}% + 2px);width:calc(${w * span}% - 4px)" data-action="open-event" data-idx="${this.evIndex(e)}">
          <b>${esc(e.summary)}</b><span>${e.avatar} ${this.fmtTime(e.start)}${short ? "" : ` – ${this.fmtTime(e.end)}`}</span>${dur >= 1.5 && e.location ? `<span>📍 ${esc(e.location)}</span>` : ""}</button>`;
      }).join("");
      const slots = [...Array(24)].map((_, hr) => `<div class="tg-slot" style="top:${at(hr)};height:var(--h)" data-action="new-event" data-date="${ymd(d)}" data-hour="${hr}"></div>`).join("");
      const nowLine = sameDay(d, now) ? `<div class="tg-now" style="top:${at(now.getHours() + now.getMinutes() / 60)}"></div>` : "";
      return `<div class="tg-col ${sameDay(d, now) ? "today" : ""}">${slots}${blocks}${nowLine}</div>`;
    }).join("");
    const hours = [...Array(24)].map((_, hr) => `<div class="tg-hr" style="top:${at(hr)}">${hr ? new Date(2000, 0, 1, hr).toLocaleTimeString([], { hour: "numeric", hour12: !this.settings.clock_24h }) : ""}</div>`).join("");
    // Initial scroll: an hour before the earliest event, but no later than 7am.
    this._tgWindow = [DAY_START, DAY_END];
    this._tgKeyNext = `${this.ui.tab}|${days.map(ymd).join(",")}`;
    return `<div class="tg" style="--n:${days.length};--h:${this._tgH || 40}px">
      <div class="tg-row tg-head"><div class="tg-gutter"></div>${head}</div>
      ${hasAllDay ? `<div class="tg-row tg-allday"><div class="tg-gutter">all-day</div>${allDayCells.map((c, i) => `<div class="tg-adcell">${c.map((e) => this.evPill(e, days[i], true)).join("")}</div>`).join("")}</div>` : ""}
      <div class="tg-scroll"><div class="tg-body" style="height:calc(var(--h) * 24)">
        <div class="tg-hours">${hours}</div><div class="tg-cols">${cols}</div>
      </div></div></div>`;
  }

  renderSchedule() {
    const [s] = this._range();
    const days = [...Array(14)].map((_, i) => addDays(s, i)).filter((d) => this.eventsOn(d).length);
    if (!days.length) return `<div class="empty"><h2>Nothing scheduled 🎉</h2></div>`;
    return `<div class="schedule">${days.map((d) => `
      <div class="sday">${this.dayHead(d)}
        <div class="slist">${this.eventsOn(d).map((e) => `
          <button class="srow ${e.stripes ? "multi" : ""}" style="--c:${e.color};${e.stripes}" data-action="open-event" data-idx="${this.evIndex(e)}">
            <span class="st">${e.allDay ? "All day" : `${this.fmtTime(e.start)}<br><small>${this.fmtTime(e.end)}</small>`}</span>
            <span class="bar"></span><span class="av">${e.avatar}</span>
            <span class="sm"><b>${esc(e.summary)}</b>${e.location ? `<small>📍 ${esc(e.location)}</small>` : ""}</span>
          </button>`).join("")}</div></div>`).join("")}</div>`;
  }

  renderHome() {
    const today = startOfDay(new Date());
    const n = this.homeDays;
    const days = [...Array(n)].map((_, i) => addDays(today, i));
    const noCals = !this.shownCalendars().length;
    const label = (d) => this.dayLabel(d, n);
    const picker = `<div class="seg daypick">${[1, 3, 5, 7].map((k) => `<button class="${k === n ? "on" : ""}" data-action="home-days" data-days="${k}">${k} day${k > 1 ? "s" : ""}</button>`).join("")}</div>`;
    const cal = noCals
      ? `<div class="empty"><h2>No calendars yet</h2><button class="primary" data-action="tab" data-tab="settings">Set up in Settings</button></div>`
      : this.renderTimeGrid(days, { labels: label });
    const members = this.ui.filter ? this.members.filter((m) => m.id === this.ui.filter) : this.members;
    const chores = members.map((m) => {
      const list = this.data.chores.filter((c) => c.member_id === m.id && choreDue(c, today));
      const done = list.filter((c) => choreDone(c, today)).length;
      return `<div class="hchores" style="--c:${m.color}">
        <div class="hhead"><span class="av" style="background:${m.color}">${m.avatar}</span><b>${esc(m.name)}</b>
          <span class="hint">${done}/${list.length} · ⭐ ${this.data.stars?.[m.id] || 0}</span></div>
        ${list.map((c) => { const dn = choreDone(c, today); return `<div class="chore ${dn ? "done" : ""}">
          <button class="ctoggle" data-action="toggle-chore" data-chore="${c.id}" data-date="${ymd(today)}">
            <span class="ci">${esc(c.icon || "✅")}</span><span class="ct">${esc(c.title)}</span><span class="box">${dn ? "✓" : ""}</span></button></div>`; }).join("")
          || `<p class="hint">No chores today</p>`}
        ${list.length && done === list.length ? `<div class="alldone">All done! 🎉</div>` : ""}
      </div>`;
    }).join("");
    const meals = this.mealieOn ? this.mealieMeals.filter((m) => m.date === ymd(today)) : [];
    return `<div class="toolbar hometool">${picker}<button class="primary fab" data-action="new-event">+ Event</button></div>
      <div class="home ${n >= 5 ? "wide" : ""}">
      <section class="hcal">${cal}</section>
      <aside class="hside">
        ${meals.length ? `<div class="hmeals">🍽️ ${meals.map((m) => `<b>${esc(this.mealieName(m))}</b>`).join(" · ")}</div>` : ""}
        ${chores || `<div class="empty"><p>Add your family in Settings to see chores here.</p></div>`}
      </aside></div>`;
  }

  renderChores() {
    const day = this.ui.choreDay;
    const isToday = sameDay(day, new Date());
    if (!this.members.length) return `<div class="empty"><h2>No family members yet</h2><button class="primary" data-action="tab" data-tab="settings">Add family in Settings</button></div>`;
    const cols = this.members.map((m) => {
      const chores = this.data.chores.filter((c) => c.member_id === m.id && choreDue(c, day));
      const done = chores.filter((c) => choreDone(c, day)).length;
      const pct = chores.length ? done / chores.length : 0;
      return `<div class="ccol" style="--c:${m.color}">
        <div class="chead">
          <div class="ring" style="--p:${pct * 360}deg"><span class="av" style="background:${m.color}">${m.avatar}</span></div>
          <div><div class="cname">${esc(m.name)}</div><div class="cstars">⭐ ${this.data.stars?.[m.id] || 0} · ${done}/${chores.length}</div></div>
        </div>
        <div class="clist">${chores.map((c) => {
          const dn = choreDone(c, day);
          return `<div class="chore ${dn ? "done" : ""}">
            <button class="ctoggle" data-action="toggle-chore" data-chore="${c.id}">
              <span class="ci">${esc(c.icon || "✅")}</span><span class="ct">${esc(c.title)}</span>
              <span class="cs">${c.stars ? `+${c.stars}⭐` : ""}</span><span class="box">${dn ? "✓" : ""}</span></button>
            <button class="cedit" data-action="edit-chore" data-chore="${c.id}">⋯</button></div>`;
        }).join("") || `<p class="hint center">${pct === 0 && !chores.length ? "No chores" : ""}</p>`}
        ${chores.length && done === chores.length ? `<div class="alldone">All done! 🎉</div>` : ""}
        </div>
        <button class="add wide" data-action="new-chore" data-member="${m.id}">+ Add chore</button>
      </div>`;
    }).join("");
    return `<div class="toolbar"><div class="nav">
        <button class="icon" data-action="chore-day" data-dir="-1">‹</button>
        <button data-action="chore-day" data-dir="0">Today</button>
        <button class="icon" data-action="chore-day" data-dir="1">›</button>
        <h1>${isToday ? "Today" : day.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" })}</h1></div></div>
      <div class="chores">${cols}</div>`;
  }

  renderRewards() {
    if (!this.members.length) return `<div class="empty"><h2>No family members yet</h2><button class="primary" data-action="tab" data-tab="settings">Add family in Settings</button></div>`;
    const rewards = this.data.rewards || [];
    return `<div class="toolbar"><div class="nav"><h1>Rewards</h1></div><button class="primary" data-action="new-reward">+ Reward</button></div>
      <div class="rewards">${this.members.map((m) => {
        const stars = this.data.stars?.[m.id] || 0;
        const mine = rewards.filter((r) => !r.member_id || r.member_id === m.id);
        return `<div class="rcard" style="--c:${m.color}">
          <div class="rhead"><span class="av big" style="background:${m.color}">${m.avatar}</span>
            <div class="rname">${esc(m.name)}</div>
            <div class="rstars"><button class="icon sm" data-action="stars" data-member="${m.id}" data-delta="-1">−</button>
              <span>⭐ ${stars}</span><button class="icon sm" data-action="stars" data-member="${m.id}" data-delta="1">+</button></div></div>
          ${mine.map((r) => {
            const pct = Math.min(100, (stars / r.cost) * 100);
            return `<div class="reward">
              <span class="ri">${esc(r.icon)}</span>
              <div class="rb"><div class="rt" data-action="edit-reward" data-reward="${r.id}">${esc(r.title)}</div>
                <div class="prog"><div style="width:${pct}%"></div></div><small>${Math.min(stars, r.cost)} / ${r.cost} ⭐</small></div>
              <button class="${stars >= r.cost ? "primary" : ""}" ${stars >= r.cost ? "" : "disabled"} data-action="redeem" data-reward="${r.id}" data-member="${m.id}">Redeem</button>
            </div>`;
          }).join("") || `<p class="hint">No rewards yet — add one!</p>`}
        </div>`;
      }).join("")}</div>`;
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
    this._loadMealEvents();
    this._loadMealie();
    const [s] = [this.weekStart(this.ui.anchor)];
    const days = [...Array(7)].map((_, i) => addDays(s, i));
    return `<div class="toolbar"><div class="nav"><button class="icon" data-action="prev">‹</button><button data-action="today">This week</button><button class="icon" data-action="next">›</button>
      <h1>Meals · ${s.toLocaleDateString([], { month: "short", day: "numeric" })}</h1></div>
      ${this.mealieOn ? `<span class="hint">🍲 Synced with Mealie</span>` : ""}</div>
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

  renderLists() {
    const lists = [...(this.data.lists || []), ...this.linkedLists()];
    if (!this.ui.list || !lists.find((l) => l.id === this.ui.list)) this.ui.list = lists[0]?.id || null;
    const cur = lists.find((l) => l.id === this.ui.list);
    return `<div class="lists">
      <aside>${lists.map((l) => `<button class="lname ${l.id === this.ui.list ? "on" : ""}" style="--c:${l.color}" data-action="pick-list" data-list="${l.id}">
        <span class="dot"></span>${l.linked ? "🔗 " : ""}${esc(l.name)}<span class="count">${l.items.filter((i) => !i.done).length}</span></button>`).join("")}
        <button class="add wide" data-action="new-list">+ New list</button></aside>
      <section>${cur ? `
        <div class="toolbar"><div class="nav"><h1 style="color:${cur.color}">${esc(cur.name)}</h1></div>
          <div><button data-action="clear-done">Clear completed</button> ${cur.linked ? "" : `<button data-action="edit-list" data-list="${cur.id}">Edit</button>`}</div></div>
        <div class="additem"><input id="newitem" data-fresh="1" placeholder="Add an item…" data-enter="add-item"><button class="primary" data-action="add-item">Add</button></div>
        <div class="items">${[...cur.items.filter((i) => !i.done), ...cur.items.filter((i) => i.done)].map((i) => `
          <div class="item ${i.done ? "done" : ""}" style="--c:${cur.color}">
            <button class="box" data-action="toggle-item" data-item="${i.id}">${i.done ? "✓" : ""}</button>
            <span data-action="toggle-item" data-item="${i.id}">${esc(i.text)}</span>
            <button class="x" data-action="delete-item" data-item="${i.id}">✕</button></div>`).join("") || `<p class="hint">Empty list</p>`}
        </div>` : `<div class="empty"><h2>No lists</h2></div>`}</section></div>`;
  }

  renderPhotos() {
    const photos = this.data.photos || [];
    return `<div class="toolbar"><div class="nav"><h1>Photos</h1></div>
      <div><input type="file" id="photo-input" accept="image/*" multiple hidden data-change="upload-photos">
        <button data-action="upload-photos">⬆ Upload</button>
        <button class="primary" data-action="start-saver" ${this._hasPhotoSource() ? "" : "disabled"}>▶ Slideshow</button></div></div>
      ${this.data.immich?.url && this.data.immich?.has_key ? `<p class="hint">📷 Also showing ${[
        this.data.immich.albums?.length ? `${this.data.immich.albums.length} Immich album${this.data.immich.albums.length > 1 ? "s" : ""}` : "",
        this.data.immich.favorites ? "Immich favorites" : "",
      ].filter(Boolean).join(" + ") || "no Immich albums yet"}. Change in Settings → Photos from Immich.</p>` : ""}
      ${photos.length ? `<div class="pgrid">${photos.map((p) => `<div class="ph"><img loading="lazy" src="/skylight_photos/${esc(p)}"><button class="x" data-action="delete-photo" data-name="${esc(p)}">✕</button></div>`).join("")}</div>`
        : this._hasPhotoSource() ? "" : `<div class="empty"><h2>No photos yet</h2><p>Upload photos from this tablet or your phone (open the Skylight panel in the Home Assistant app). They play as a screensaver when nobody is using the display. Or connect Immich in Settings.</p></div>`}`;
  }

  renderMealieSettings() {
    const m = this.mealie || { entries: [] };
    const todos = Object.keys(this._hass.states).filter((e) => e.startsWith("todo.")).sort();
    const linked = new Set(this.data.linked_todos || []);
    return `<section class="card">
      <h2>Mealie</h2>
      ${m.entries.length ? `
        <p class="hint">✅ Connected. The Meals tab reads and writes your Mealie meal plan: tap a meal slot to search recipes, pick a random one, or add a note.</p>
        ${m.entries.length > 1 ? `<label class="inline">Mealie server <select data-change="mealie-entry">${m.entries.map((e) => `<option value="${e.entry_id}" ${e.entry_id === m.selected ? "selected" : ""}>${esc(e.title)}</option>`).join("")}</select></label>` : ""}`
        : `<p class="hint">Not connected. An admin adds it once: Home Assistant → Settings → Devices &amp; Services → Add Integration → <b>Mealie</b> (needs your Mealie URL and an API token from Mealie → User profile → API Tokens). Then reload this page.</p>`}
      <div class="label">Shopping &amp; to-do lists to show in the Lists tab</div>
      <div class="checklist">${todos.map((e) => `<label class="check"><input type="checkbox" data-change="linked-todo" data-entity="${e}" ${linked.has(e) ? "checked" : ""}> ${esc(this.entityName(e))}</label>`).join("") || `<p class="hint">No to-do lists in Home Assistant.</p>`}</div>
    </section>`;
  }

  renderImmichSettings() {
    const im = this.data.immich || {};
    const draft = this.ui.immichDraft || {};
    if (!this.ui.immichAlbums && im.url && im.has_key && !this._immichTried) {
      this._immichTried = true;
      this._hass.callWS({ type: "skylight/immich/albums" })
        .then((a) => { this.ui.immichAlbums = a; if (this.ui.tab === "settings") this.render(); })
        .catch((e) => { this.ui.immichError = e.message; if (this.ui.tab === "settings") this.render(); });
    }
    const albums = this.ui.immichAlbums || [];
    const chosen = new Set(im.albums || []);
    return `<section class="card">
      <h2>Photos from Immich</h2>
      <label>Immich server URL<input id="im-url" value="${esc(draft.url ?? im.url ?? "")}" placeholder="http://192.168.1.20:2283"></label>
      <label>API key<input id="im-key" type="password" autocomplete="off" value="${esc(draft.key ?? "")}" placeholder="${im.has_key ? "•••••• saved (leave blank to keep)" : "Immich → Account Settings → API Keys"}"></label>
      <div class="actions" style="margin-top:4px"><button data-action="immich-load">Load albums</button></div>
      ${this.ui.immichError && !albums.length ? `<p class="hint">⚠️ ${esc(this.ui.immichError)}</p>` : ""}
      ${albums.length ? `<div class="label">Albums to show</div><div class="checklist">${albums.map((a) => `<label class="check"><input type="checkbox" class="im-album" value="${esc(a.id)}" ${chosen.has(a.id) ? "checked" : ""}> ${esc(a.name)} <small class="hint">${a.count} items</small></label>`).join("")}</div>` : ""}
      <label class="check"><input type="checkbox" id="im-fav" ${im.favorites ? "checked" : ""}> Include my Immich favorites</label>
      <div class="actions"><span class="spacer"></span><button class="primary" data-action="immich-save">Save Immich settings</button></div>
    </section>`;
  }

  renderSettings() {
    const s = this.settings;
    const cals = this.allCalendars();
    const weathers = Object.keys(this._hass.states).filter((e) => e.startsWith("weather.")).sort();
    const fam = new Set(this.data.family_calendars || []);
    return `<div class="settings">
      <section class="card">
        <div class="toolbar"><h2>Family members</h2><button class="primary" data-action="new-member">+ Add member</button></div>
        ${this.members.map((m, i) => `<div class="mrow2">
          <span class="av big" style="background:${m.color}">${m.avatar}</span>
          <div class="grow"><b>${esc(m.name)}</b><small>${[...(m.prefixes || []).map((p) => `“${esc(p)}…”`), ...(m.calendars || []).map((c) => esc(this.calName(c)))].join(", ") || "No calendars"}</small></div>
          <button class="icon sm" data-action="member-up" data-member="${m.id}" ${i === 0 ? "disabled" : ""}>↑</button>
          <button class="icon sm" data-action="member-down" data-member="${m.id}" ${i === this.members.length - 1 ? "disabled" : ""}>↓</button>
          <button data-action="edit-member" data-member="${m.id}">Edit</button></div>`).join("") || `<p class="hint">Add everyone in your household. Each person gets a color used across the calendar, chores and rewards.</p>`}
      </section>

      <section class="card">
        <h2>Calendars</h2>
        <p class="hint">Create a new calendar stored in Home Assistant:</p>
        <div class="additem"><input id="newcal" data-fresh="1" placeholder="e.g. Soccer, School, Family" data-enter="create-calendar"><button class="primary" data-action="create-calendar">Create calendar</button></div>
        <p class="hint">Subscribe to a calendar link (iCal / webcal: school, sports team, Plan to Eat…):</p>
        <div class="additem"><input id="feed-name" data-fresh="1" placeholder="Name"><input id="feed-url" data-fresh="1" placeholder="https://… or webcal://…" style="flex:2"><button class="primary" data-action="subscribe-calendar">Subscribe</button></div>
        <p class="hint">To show Google, iCloud (CalDAV) or Outlook calendars, an admin adds that integration once in Home Assistant (Settings → Devices &amp; Services → Add Integration). They then appear below and in each member's calendar list.</p>
        <div class="label">Shared family calendars (shown in the family color)</div>
        <div class="checklist">${cals.map((e) => {
          const o = this.calendarOwner(e);
          return `<label class="check"><input type="checkbox" data-change="family-cal" data-entity="${e}" ${fam.has(e) ? "checked" : ""}> ${esc(this.calName(e))} ${o ? `<small class="tag" style="background:${o.color}">${o.avatar} ${esc(o.name)}</small>` : ""}</label>`;
        }).join("") || `<p class="hint">No calendars in Home Assistant yet.</p>`}</div>
        <label class="inline">Family color <input type="color" value="${s.family_color}" data-change="setting" data-key="family_color"></label>
      </section>

      <section class="card">
        <h2>Info calendars</h2>
        <p class="hint">Birthdays, holidays and other "good to know" calendars. They show with their own icon in a light outline style, don't belong to anyone, and stay visible when you filter by a person.</p>
        <div class="checklist">${cals.map((e) => {
          const ic = this.infoCal(e);
          return `<div class="inforow"><label class="check"><input type="checkbox" data-change="info-cal" data-entity="${e}" ${ic ? "checked" : ""}> ${esc(this.calName(e))}</label>
            ${ic ? `<div class="infostyle">
              ${INFO_ICONS.map((i) => `<button class="emoji mini ${i === ic.icon ? "sel" : ""}" data-action="info-style" data-entity="${e}" data-field="icon" data-value="${i}">${i}</button>`).join("")}
              <span class="sep"></span>
              ${INFO_COLORS.map((c) => `<button class="swatch mini ${c === ic.color ? "sel" : ""}" style="background:${c}" data-action="info-style" data-entity="${e}" data-field="color" data-value="${c}"></button>`).join("")}
            </div>` : ""}</div>`;
        }).join("") || `<p class="hint">No calendars yet.</p>`}</div>
        <label class="inline">Show info calendars on the Today screen <input type="checkbox" ${s.info_on_today !== false ? "checked" : ""} data-change="setting" data-key="info_on_today"></label>
      </section>

      <section class="card">
        <h2>Meal plan sync</h2>
        <p class="hint">Meals from these calendars fill the Meals tab, sorted into breakfast / lunch / dinner / snack by the calendar name, the meal name, or the time of day.
          <b>Plan to Eat:</b> copy your planner's iCal link from Plan to Eat's planner settings and subscribe to it in Calendars above.
          <b>Mealie:</b> add the Mealie integration in Home Assistant; its meal calendars appear here.</p>
        <div class="checklist">${cals.map((e) => `<label class="check"><input type="checkbox" data-change="meal-cal" data-entity="${e}" ${(this.data.meal_calendars || []).includes(e) ? "checked" : ""}> ${esc(this.calName(e))}</label>`).join("") || `<p class="hint">No calendars yet.</p>`}</div>
      </section>

      ${this.renderMealieSettings()}

      ${this.renderImmichSettings()}

      <section class="card">
        <h2>Address lookup</h2>
        <p class="hint">${this.data.places?.has_google_key
          ? "✅ Using <b>Google Places</b> to find addresses when you type a location."
          : "Using the free <b>OpenStreetMap</b> lookup. For better results with local businesses, add a Google Places API key (Google Cloud Console → enable “Places API (New)” → create an API key; Google bills per search beyond its free allowance)."}</p>
        <div class="additem"><input id="places-key" type="password" autocomplete="off" data-fresh="1" placeholder="${this.data.places?.has_google_key ? "•••••• saved" : "Google Places API key (optional)"}">
          <button class="primary" data-action="places-save">Save key</button>
          ${this.data.places?.has_google_key ? `<button data-action="places-clear">Remove</button>` : ""}</div>
      </section>

      <section class="card">
        <h2>Display</h2>
        <label class="inline">Weather <select data-change="setting" data-key="weather_entity"><option value="">None</option>${weathers.map((w) => `<option value="${w}" ${w === s.weather_entity ? "selected" : ""}>${esc(this.entityName(w))}</option>`).join("")}</select></label>
        <label class="inline">Week starts on <select data-change="setting" data-key="week_start" data-num="1"><option value="0" ${Number(s.week_start) === 0 ? "selected" : ""}>Sunday</option><option value="1" ${Number(s.week_start) === 1 ? "selected" : ""}>Monday</option></select></label>
        <label class="inline">Default calendar view <select data-change="setting" data-key="default_view">${CAL_VIEWS.map(([v, label]) => `<option value="${v}" ${v === (LEGACY_VIEWS[s.default_view] || s.default_view || "7day") ? "selected" : ""}>${label}</option>`).join("")}</select></label>
        <label class="inline">24-hour clock <input type="checkbox" ${s.clock_24h ? "checked" : ""} data-change="setting" data-key="clock_24h"></label>
        <label class="inline">Photo screensaver after (minutes, 0 = off) <input type="number" min="0" max="240" value="${s.screensaver_minutes}" data-change="setting" data-key="screensaver_minutes"></label>
        <label class="inline">Seconds per photo <input type="number" min="5" max="600" value="${s.photo_seconds}" data-change="setting" data-key="photo_seconds"></label>
      </section>
      <p class="hint center">Skylight v${PANEL_VERSION}</p>
    </div>`;
  }
}

const STYLES = `
:host { display:block; height:100%; --bg:#f7f4ef; --card:#fff; --ink:#2d2a26; --muted:#8a8378; --line:rgba(0,0,0,.07);
  --accent:#4a7dff; --radius:18px; font-family: Nunito, "Segoe UI", Roboto, system-ui, sans-serif; color:var(--ink); }
@media (prefers-color-scheme: dark) { :host { --bg:#1b1a18; --card:#282724; --ink:#f1ede6; --muted:#a59f94; --line:rgba(255,255,255,.08); } }
* { box-sizing:border-box; }
[hidden] { display:none !important; }
button { font:inherit; color:inherit; border:0; background:var(--card); border-radius:12px; padding:8px 14px; cursor:pointer; box-shadow:0 1px 2px rgba(0,0,0,.06); }
button:disabled { opacity:.45; cursor:default; }
button.primary { background:var(--accent); color:#fff; font-weight:700; }
button.danger { background:#ffe3e3; color:#c0392b; }
button.icon { width:40px; height:40px; padding:0; font-size:22px; border-radius:50%; }
button.icon.sm { width:32px; height:32px; font-size:18px; }
input, select, textarea { font:inherit; color:var(--ink); background:var(--bg); border:1px solid var(--line); border-radius:12px; padding:10px 12px; width:100%; }
.app { display:flex; height:100vh; background:var(--bg); overflow:hidden; }
.rail { width:92px; flex:none; display:flex; flex-direction:column; align-items:center; gap:6px; padding:14px 6px; background:var(--card); border-right:1px solid var(--line); overflow-y:auto; }
.logo { font-size:30px; color:#ff9f43; margin-bottom:8px; }
.tab { width:78px; display:flex; flex-direction:column; align-items:center; gap:4px; padding:10px 4px; background:none; box-shadow:none; font-size:12px; color:var(--muted); }
.tab.active { background:var(--bg); color:var(--accent); font-weight:700; }
.tab ha-icon { --mdc-icon-size:28px; }
main { flex:1; display:flex; flex-direction:column; min-width:0; }
header { display:flex; align-items:center; gap:16px; padding:14px 22px 6px; }
.when { min-width:190px; }
.clock { font-size:44px; font-weight:800; line-height:1; letter-spacing:-1px; }
.date { color:var(--muted); font-weight:600; margin-top:2px; }
.members { flex:1; display:flex; flex-wrap:wrap; gap:8px; justify-content:center; }
.mchip { display:flex; align-items:center; gap:8px; padding:4px 14px 4px 4px; border-radius:999px; font-weight:700; border:2px solid transparent; }
.mchip.on { border-color:var(--c); }
.mchip.dim { opacity:.45; }
.av { display:inline-grid; place-items:center; width:32px; height:32px; border-radius:50%; font-size:18px; flex:none; }
.av.big { width:48px; height:48px; font-size:26px; }
.weather { font-size:30px; display:flex; align-items:center; gap:6px; }
.weather b { font-size:32px; }
.content { flex:1; overflow-y:auto; padding:6px 22px 22px; }
.toolbar { display:flex; align-items:center; justify-content:space-between; gap:12px; margin:6px 0 12px; flex-wrap:wrap; }
.toolbar h1 { font-size:24px; margin:0 0 0 8px; }
.toolbar h2 { margin:0; }
/* Calendar toolbar: always one row; the title shrinks instead of pushing buttons down */
.caltool { flex-wrap:nowrap; }
.caltool .nav { flex:none; }
.caltool .nav button { flex:none; }
.caltool h1 { flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; min-width:0; }
.caltool .seg, .caltool .fab { flex:none; }
/* Narrower screens: two fixed rows (same in every view, so nothing jumps) */
@media (max-width: 1100px) {
  .caltool { display:grid; grid-template-columns:auto minmax(0,1fr) auto; grid-template-areas:"nav title fab" "seg seg seg"; row-gap:10px; }
  .caltool .nav { grid-area:nav; } .caltool h1 { grid-area:title; } .caltool .fab { grid-area:fab; }
  .caltool .seg { grid-area:seg; justify-self:start; max-width:100%; overflow-x:auto; }
}
.nav { display:flex; align-items:center; gap:8px; }
.seg { display:flex; background:var(--card); border-radius:14px; padding:4px; gap:2px; box-shadow:0 1px 2px rgba(0,0,0,.06); }
.seg button { box-shadow:none; background:none; }
.seg button.on { background:var(--accent); color:#fff; font-weight:700; }
.empty { text-align:center; padding:60px 20px; color:var(--muted); }
.empty h2 { color:var(--ink); }
.hint { color:var(--muted); font-size:14px; }
.center { text-align:center; }
/* week */
.week { display:grid; grid-template-columns:repeat(7, minmax(0,1fr)); gap:10px; min-height:calc(100vh - 190px); }
.col { background:var(--card); border-radius:var(--radius); padding:10px 8px; display:flex; flex-direction:column; gap:6px; box-shadow:0 2px 10px rgba(60,50,30,.06); }
.col.today { outline:3px solid var(--accent); }
.dh { display:flex; align-items:baseline; gap:6px; padding:0 4px 6px; border-bottom:1px solid var(--line); cursor:pointer; flex-wrap:wrap; }
.dh .dn { color:var(--muted); font-weight:700; text-transform:uppercase; font-size:13px; }
.dh .dd { font-size:26px; font-weight:800; }
.dh.today .dd { color:var(--accent); }
.dh .wx { margin-left:auto; font-size:13px; color:var(--muted); }
.evs { display:flex; flex-direction:column; gap:6px; flex:1; }
.ev { display:flex; align-items:center; gap:6px; text-align:left; padding:6px 8px; border-radius:12px; background:color-mix(in srgb, var(--c) 18%, var(--card)); border-left:5px solid var(--c); box-shadow:none; font-size:14px; width:100%; }
.ev.allday { background:var(--c); color:#fff; font-weight:700; border-left:0; }
.ev .av { width:22px; height:22px; font-size:13px; background:none; }
.ev { flex-wrap:wrap; }
.ev .s { flex:1; min-width:0; overflow-wrap:anywhere; font-weight:600; line-height:1.2; }
.ev .t { font-size:12px; opacity:.75; white-space:nowrap; flex-basis:100%; padding-left:28px; }
.ev.compact { flex-wrap:nowrap; }
.ev.compact .s { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.ev.compact .t { flex-basis:auto; padding-left:0; }
.ev.compact { padding:2px 6px; font-size:12px; border-left-width:4px; border-radius:6px; }
.add { background:none; box-shadow:none; color:var(--muted); font-size:22px; padding:4px; }
.add.wide { width:100%; border:2px dashed var(--line); font-size:15px; }
/* month */
.month { display:flex; flex-direction:column; height:calc(100vh - 190px); min-height:520px; }
.mh { display:grid; grid-template-columns:repeat(7,1fr); text-align:center; color:var(--muted); font-weight:700; font-size:13px; text-transform:uppercase; padding-bottom:6px; }
.mg { flex:1; min-height:0; display:grid; grid-template-columns:repeat(7,minmax(0,1fr)); grid-template-rows:repeat(6,minmax(0,1fr)); gap:6px; }
.cell { position:relative; background:var(--card); border-radius:12px; padding:4px 5px; display:flex; flex-direction:column; gap:3px; overflow:hidden; }
.cell.other { opacity:.45; }
.cell.today { outline:3px solid var(--accent); }
.cn { font-weight:800; cursor:pointer; position:relative; z-index:1; width:fit-content; }
.cell .ev, .cell .more { position:relative; z-index:1; }
.more { background:none; box-shadow:none; font-size:12px; color:var(--muted); padding:0 4px; text-align:left; }
.celladd { position:absolute; inset:0; background:none; box-shadow:none; z-index:0; border-radius:0; }
/* time grid */
.tg { display:flex; flex-direction:column; background:var(--card); border-radius:var(--radius); overflow:hidden; box-shadow:0 2px 10px rgba(60,50,30,.06); }
.tg-row { display:grid; grid-template-columns:56px repeat(var(--n), minmax(0,1fr)); border-bottom:1px solid var(--line); }
.tg-gutter { font-size:11px; color:var(--muted); text-align:right; padding:6px 6px 0 0; }
.tg-dh { display:flex; align-items:baseline; gap:6px; flex-wrap:wrap; padding:8px 8px 6px; cursor:pointer; border-left:1px solid var(--line); }
.tg-dh .dn { color:var(--muted); font-weight:700; text-transform:uppercase; font-size:13px; }
.tg-dh .dd { font-size:24px; font-weight:800; }
.tg-dh.today .dd { color:#fff; background:var(--accent); border-radius:999px; min-width:36px; text-align:center; padding:0 6px; }
.tg-dh .wx { margin-left:auto; font-size:12px; color:var(--muted); }
.tg-adcell { display:flex; flex-direction:column; gap:3px; padding:4px; border-left:1px solid var(--line); min-width:0; max-height:96px; overflow-y:auto; }
.tg-scroll { overflow-y:auto; flex:1; min-height:0; }
.tg-body { position:relative; display:grid; grid-template-columns:56px 1fr; }
.tg-hours { position:relative; }
.tg-hr { position:absolute; right:6px; transform:translateY(2px); font-size:11px; color:var(--muted); white-space:nowrap; }
.tg-cols { position:relative; display:grid; grid-template-columns:repeat(var(--n), minmax(0,1fr)); background:repeating-linear-gradient(to bottom, var(--line) 0 1px, transparent 1px var(--h)); }
.tg-col { position:relative; border-left:1px solid var(--line); }
.tg-col.today { background:color-mix(in srgb, var(--accent) 5%, transparent); }
.tg-slot { position:absolute; left:0; right:0; cursor:pointer; }
.tg-slot:active { background:color-mix(in srgb, var(--accent) 12%, transparent); }
.tg-ev { position:absolute; z-index:1; display:flex; flex-direction:column; align-items:flex-start; gap:1px; padding:3px 6px; text-align:left; overflow:hidden;
  background:color-mix(in srgb, var(--c) 24%, var(--card)); border-left:4px solid var(--c); border-radius:8px; box-shadow:0 1px 2px rgba(0,0,0,.08); font-size:13px; line-height:1.2; }
.tg-ev b { font-weight:700; overflow:hidden; display:-webkit-box; -webkit-line-clamp:1; -webkit-box-orient:vertical; }
.tg-ev.tall b { -webkit-line-clamp:3; }
.tg-ev span { font-size:11px; opacity:.8; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:100%; }
.tg-ev.short { flex-direction:row; align-items:center; gap:6px; }
.tg-ev.short b { -webkit-line-clamp:1; white-space:nowrap; text-overflow:ellipsis; flex:0 1 auto; }
.tg-now { position:absolute; left:0; right:0; border-top:2px solid #ff4757; z-index:2; pointer-events:none; }
.tg-now::before { content:""; position:absolute; left:-5px; top:-6px; width:10px; height:10px; border-radius:50%; background:#ff4757; }
.hometool { margin-top:0; }
.home.wide { grid-template-columns:minmax(0,3fr) minmax(230px,1fr); }
/* day (legacy) */
.alldays { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:10px; }
.alldays .ev { width:auto; }
.timeline { position:relative; background:var(--card); border-radius:var(--radius); margin-left:0; }
.hr { position:absolute; left:0; right:0; height:64px; border-top:1px solid var(--line); cursor:pointer; }
.hr span { position:absolute; left:10px; top:4px; font-size:12px; color:var(--muted); }
.block { position:absolute; left:90px; right:14px; display:flex; flex-direction:column; align-items:flex-start; gap:2px; text-align:left; background:color-mix(in srgb, var(--c) 22%, var(--card)); border-left:6px solid var(--c); border-radius:12px; overflow:hidden; font-size:14px; }
.block span { font-size:13px; opacity:.8; }
.now { position:absolute; left:80px; right:0; border-top:2px solid #ff4757; z-index:2; }
/* schedule */
.schedule { display:flex; flex-direction:column; gap:14px; }
.sday { background:var(--card); border-radius:var(--radius); padding:10px 14px; }
.slist { display:flex; flex-direction:column; gap:4px; padding-top:6px; }
.srow { display:flex; align-items:center; gap:12px; background:none; box-shadow:none; text-align:left; padding:8px 4px; }
.srow .st { width:80px; font-weight:700; font-size:14px; }
.ev.info, .tg-ev.info { background:var(--card); border:1.5px solid var(--c); border-left-width:1.5px; color:var(--ink); font-weight:600; }
.ev.info.allday { background:color-mix(in srgb, var(--c) 12%, var(--card)); color:var(--ink); }
.ev.info .av { font-size:13px; }
.inforow { padding:4px 0; border-bottom:1px solid var(--line); }
.infostyle { display:flex; flex-wrap:wrap; align-items:center; gap:4px; padding:2px 0 6px 32px; }
.emoji.mini { font-size:16px; padding:2px 5px; }
.swatch.mini { width:22px; height:22px; border-width:2px; }
.infostyle .sep { width:10px; }
.whopick { display:flex; flex-wrap:wrap; gap:6px; }
.whochip { display:flex; align-items:center; gap:6px; padding:3px 12px 3px 3px; border-radius:999px; font-weight:700; border:2px solid transparent; background:var(--bg); box-shadow:none; }
.whochip.on { border-color:var(--c); background:color-mix(in srgb, var(--c) 18%, var(--card)); }
.whochip .av { width:28px; height:28px; font-size:16px; }
.whochip:disabled { opacity:.4; }
.locfield { position:relative; }
.sugg { position:absolute; left:0; right:0; top:100%; z-index:5; background:var(--card); border:1px solid var(--line); border-radius:12px; box-shadow:0 8px 24px rgba(0,0,0,.15); overflow:hidden; font-weight:400; }
.sugg button { display:flex; flex-direction:column; align-items:flex-start; width:100%; text-align:left; border-radius:0; box-shadow:none; background:none; padding:9px 12px; border-bottom:1px solid var(--line); }
.sugg button:hover, .sugg button:active { background:var(--bg); }
.sugg small { color:var(--muted); font-size:12px; }
.sugg .hint { padding:8px 12px; }
.sugg .attrib { font-size:10px; color:var(--muted); padding:4px 12px; text-align:right; }
.srow .bar { width:5px; align-self:stretch; background:var(--c); border-radius:4px; }
/* Events shared by several people: diagonal stripes in each person's color (like Skylight) */
.ev.multi, .tg-ev.multi { background:var(--stripes-soft); }
.ev.multi.allday { background:var(--stripes-solid); text-shadow:0 1px 2px rgba(0,0,0,.55); }
.ev.multi .s, .tg-ev.multi b { text-shadow:0 0 3px var(--card), 0 0 6px var(--card); }
.ev.multi.allday .s { text-shadow:0 1px 2px rgba(0,0,0,.6); }
.srow.multi .bar { background:var(--bar); }
.srow .sm { display:flex; flex-direction:column; }
/* chores */
.chores { display:grid; grid-template-columns:repeat(auto-fit, minmax(230px, 1fr)); gap:14px; align-items:start; }
.ccol { background:var(--card); border-radius:var(--radius); padding:14px; border-top:6px solid var(--c); display:flex; flex-direction:column; gap:10px; }
.chead { display:flex; align-items:center; gap:12px; }
.ring { width:60px; height:60px; border-radius:50%; display:grid; place-items:center; background:conic-gradient(var(--c) var(--p), var(--line) 0); }
.ring .av { width:50px; height:50px; font-size:28px; border:3px solid var(--card); }
.cname { font-size:20px; font-weight:800; }
.cstars { color:var(--muted); font-weight:700; }
.clist { display:flex; flex-direction:column; gap:8px; }
.chore { display:flex; gap:4px; }
.ctoggle { flex:1; display:flex; align-items:center; gap:10px; text-align:left; padding:12px; border-radius:14px; background:var(--bg); box-shadow:none; transition:transform .15s; }
.ctoggle.pop { transform:scale(.96); }
.ci { font-size:22px; }
.ct { flex:1; font-weight:700; }
.cs { font-size:12px; color:var(--muted); }
.box { width:28px; height:28px; border-radius:50%; border:3px solid var(--c, var(--accent)); display:grid; place-items:center; color:#fff; font-weight:900; flex:none; background:none; padding:0; box-shadow:none; }
.chore.done .box { background:var(--c); }
.chore.done .ct { text-decoration:line-through; opacity:.55; }
.cedit { background:none; box-shadow:none; color:var(--muted); padding:4px 8px; }
.alldone { text-align:center; font-weight:800; color:var(--c); padding:6px; }
.burst { position:fixed; pointer-events:none; font-size:26px; z-index:1000; animation:burst .9s ease-out forwards; }
@keyframes burst { to { transform:translate(var(--dx),var(--dy)) scale(.4); opacity:0; } }
/* rewards */
.rewards { display:grid; grid-template-columns:repeat(auto-fit, minmax(280px,1fr)); gap:14px; align-items:start; }
.rcard { background:var(--card); border-radius:var(--radius); padding:14px; border-top:6px solid var(--c); display:flex; flex-direction:column; gap:10px; }
.rhead { display:flex; align-items:center; gap:10px; }
.rname { flex:1; font-size:20px; font-weight:800; }
.rstars { display:flex; align-items:center; gap:6px; font-weight:800; font-size:18px; }
.reward { display:flex; align-items:center; gap:10px; background:var(--bg); padding:10px; border-radius:14px; }
.ri { font-size:28px; }
.rb { flex:1; min-width:0; }
.rt { font-weight:700; cursor:pointer; }
.prog { height:8px; border-radius:6px; background:var(--line); overflow:hidden; margin:4px 0 2px; }
.prog div { height:100%; background:var(--c); border-radius:6px; }
/* meals */
.meals { display:flex; flex-direction:column; gap:8px; }
.mrow { display:grid; grid-template-columns:110px repeat(7, minmax(0,1fr)); gap:8px; }
.mrow.head div { text-align:center; color:var(--muted); font-weight:700; }
.mrow.head .today { color:var(--accent); }
.slot { display:flex; flex-direction:column; align-items:center; justify-content:center; font-size:26px; }
.slot span { font-size:13px; font-weight:700; color:var(--muted); }
.meal { min-height:84px; border-radius:14px; font-weight:700; font-size:15px; padding:8px; }
.meal.today { outline:2px solid var(--accent); }
.meal.emptymeal { color:var(--muted); font-size:22px; background:color-mix(in srgb, var(--card) 60%, transparent); }
/* lists */
.lists { display:flex; gap:16px; min-height:calc(100vh - 150px); }
.lists aside { width:230px; display:flex; flex-direction:column; gap:6px; }
.lname { display:flex; align-items:center; gap:10px; text-align:left; padding:12px; font-weight:700; }
.lname.on { outline:3px solid var(--c); }
.lname .dot { width:14px; height:14px; border-radius:50%; background:var(--c); }
.lname .count { margin-left:auto; color:var(--muted); }
.lists section { flex:1; background:var(--card); border-radius:var(--radius); padding:14px 18px; }
.additem { display:flex; gap:8px; margin-bottom:12px; }
.additem button { white-space:nowrap; }
.items { display:flex; flex-direction:column; }
.item { display:flex; align-items:center; gap:12px; padding:10px 4px; border-bottom:1px solid var(--line); font-size:18px; }
.item span { flex:1; cursor:pointer; }
.item.done span { text-decoration:line-through; opacity:.5; }
.item.done .box { background:var(--c); }
.x { background:none; box-shadow:none; color:var(--muted); }
/* photos */
.pgrid { display:grid; grid-template-columns:repeat(auto-fill, minmax(180px,1fr)); gap:10px; }
.ph { position:relative; aspect-ratio:1; border-radius:14px; overflow:hidden; background:var(--card); }
.ph img { width:100%; height:100%; object-fit:cover; }
.ph .x { position:absolute; top:6px; right:6px; background:rgba(0,0,0,.5); color:#fff; border-radius:50%; width:32px; height:32px; padding:0; }
.saver { position:fixed; inset:0; background:#000; z-index:900; cursor:none; }
.saver img { position:absolute; inset:0; width:100%; height:100%; object-fit:contain; opacity:0; transition:opacity 1.5s; }
.saver img.bg { object-fit:cover; filter:blur(30px) brightness(.45); transform:scale(1.1); opacity:1; }
.saver img.show { opacity:1; }
.saver-clock { position:absolute; left:36px; bottom:28px; color:#fff; text-shadow:0 2px 12px rgba(0,0,0,.6); }
#sv-time { font-size:72px; font-weight:800; }
#sv-date { font-size:24px; font-weight:600; }
/* settings */
.settings { display:flex; flex-direction:column; gap:16px; max-width:900px; }
.card { background:var(--card); border-radius:var(--radius); padding:16px 20px; }
.card h2 { margin:0 0 10px; }
.mrow2 { display:flex; align-items:center; gap:12px; padding:8px 0; border-bottom:1px solid var(--line); }
.grow { flex:1; display:flex; flex-direction:column; }
.grow small { color:var(--muted); }
.tag { color:#fff; border-radius:999px; padding:1px 8px; font-size:12px; }
label { display:flex; flex-direction:column; gap:4px; font-weight:700; font-size:14px; margin:8px 0; flex:1; }
label.inline { flex-direction:row; align-items:center; justify-content:space-between; gap:12px; }
label.inline select, label.inline input:not([type=checkbox]) { width:auto; min-width:160px; }
label.check { flex-direction:row; align-items:center; gap:10px; font-weight:600; margin:4px 0; }
label.check input { width:22px; height:22px; }
.label { font-weight:700; font-size:14px; margin:12px 0 6px; }
.checklist { display:flex; flex-direction:column; max-height:260px; overflow-y:auto; }
/* dialogs */
.backdrop { position:fixed; inset:0; background:rgba(20,15,5,.45); display:grid; place-items:center; z-index:500; padding:16px; }
.dialog { background:var(--card); border-radius:24px; padding:22px 24px; width:min(560px, 100%); max-height:92vh; overflow-y:auto; box-shadow:0 20px 60px rgba(0,0,0,.3); }
.dialog h2 { margin:0 0 8px; }
.row { display:flex; gap:10px; }
.actions { display:flex; gap:8px; margin-top:16px; }
.spacer { flex:1; }
.swatches { display:flex; flex-wrap:wrap; gap:8px; }
.swatch { width:38px; height:38px; border-radius:50%; padding:0; border:3px solid transparent; }
.swatch.sel { border-color:var(--ink); }
.tones { display:flex; align-items:center; gap:6px; margin-bottom:8px; font-size:13px; font-weight:700; color:var(--muted); }
.tone { font-size:22px; padding:2px 6px; background:var(--bg); box-shadow:none; }
.tone.sel { outline:3px solid var(--accent); }
.emoji { font-size:24px; padding:4px 8px; background:var(--bg); box-shadow:none; }
.swatches:has(.emoji) { max-height:190px; overflow-y:auto; }
.home { display:grid; grid-template-columns:minmax(0,2fr) minmax(260px,1fr); gap:14px; }

.three { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px; height:100%; }
.three .dn { font-size:15px; }
.hside { display:flex; flex-direction:column; gap:12px; overflow-y:auto; }
.hchores { background:var(--card); border-radius:var(--radius); padding:12px; border-left:6px solid var(--c); display:flex; flex-direction:column; gap:6px; }
.hhead { display:flex; align-items:center; gap:8px; }
.hhead .hint { margin-left:auto; font-weight:700; }
.hchores .ctoggle { padding:8px 10px; }
.hmeals { background:var(--card); border-radius:var(--radius); padding:12px 14px; }
@media (max-width: 900px) { .home, .home.wide, .three { grid-template-columns:1fr; } .tg-dh .wx { display:none; } }
.emoji.sel { outline:3px solid var(--accent); }
.avatar-preview { width:80px; height:80px; border-radius:50%; display:grid; place-items:center; font-size:44px; margin:4px auto 0; }
.chips { display:flex; flex-wrap:wrap; gap:6px; }
.chip { border-radius:999px; background:var(--bg); padding:6px 12px; }
.daypick { display:flex; gap:6px; flex-wrap:wrap; }
.daychip { flex:0; margin:0; }
.daychip input { display:none; }
.daychip span { display:block; padding:8px 12px; border-radius:999px; background:var(--bg); font-weight:700; cursor:pointer; }
.daychip input:checked + span { background:var(--accent); color:#fff; }
.dialog.small { width:min(420px,100%); }
.scopes { display:flex; flex-direction:column; gap:8px; margin-top:8px; }
.scopes button { padding:14px; font-weight:700; text-align:left; background:var(--bg); }
.meal { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:4px; }
.meal .synced { background:color-mix(in srgb, var(--accent) 14%, transparent); border-radius:8px; padding:2px 6px; font-size:13px; }
.syncedrow { background:var(--bg); border-radius:12px; padding:8px 12px; margin:6px 0; }
.meal { position:relative; overflow:hidden; }
.meal > span { position:relative; z-index:1; }
.meal .mbg { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; z-index:0; }
.meal.withimg::after { content:""; position:absolute; inset:0; background:linear-gradient(rgba(0,0,0,0),rgba(0,0,0,.6)); z-index:0; }
.meal.withimg { color:#fff; justify-content:flex-end; text-shadow:0 1px 4px rgba(0,0,0,.6); }
.mname { font-weight:800; }
.mplan { display:flex; align-items:center; gap:12px; background:var(--bg); border-radius:14px; padding:8px; margin:6px 0; }
.mplan img, .mplan .noimg { width:56px; height:56px; border-radius:10px; object-fit:cover; display:grid; place-items:center; font-size:26px; }
.mplan .grow { cursor:pointer; }
.rgrid { display:grid; grid-template-columns:repeat(auto-fill,minmax(120px,1fr)); gap:8px; max-height:300px; overflow-y:auto; margin:8px 0; }
.rcardmini { display:flex; flex-direction:column; padding:0; overflow:hidden; text-align:left; background:var(--bg); }
.rcardmini img { width:100%; aspect-ratio:4/3; object-fit:cover; background:var(--line); }
.rcardmini span { padding:6px 8px; font-weight:700; font-size:13px; }
details summary { cursor:pointer; font-weight:700; margin:8px 0; color:var(--muted); }
.hero { width:calc(100% + 48px); margin:-22px -24px 10px; height:220px; object-fit:cover; border-radius:24px 24px 0 0; }
.steps li { margin-bottom:8px; line-height:1.4; }
.ings { max-height:none; }
.toast { position:fixed; bottom:24px; left:50%; transform:translateX(-50%); background:#2d2a26; color:#fff; padding:12px 20px; border-radius:14px; z-index:1000; max-width:90vw; }
@media (max-width: 900px) {
  .app { flex-direction:column-reverse; }
  .rail { width:100%; flex-direction:row; justify-content:space-around; padding:4px; border-right:0; border-top:1px solid var(--line); overflow-x:auto; }
  .logo { display:none; }
  .tab { width:auto; flex:1; font-size:10px; padding:6px 2px; }
  header { flex-wrap:wrap; padding:10px 14px 4px; }
  .clock { font-size:32px; }
  .content { padding:6px 12px 16px; }
  .week { grid-template-columns:1fr; min-height:0; }
  .mrow { grid-template-columns:70px repeat(7, minmax(90px,1fr)); overflow-x:auto; }
  .meals { overflow-x:auto; }
  .lists { flex-direction:column; }
  .lists aside { width:100%; }
}
`;

if (!customElements.get("skylight-panel")) customElements.define("skylight-panel", SkylightPanel);
window.customCards = window.customCards || [];
if (!window.customCards.find((c) => c.type === "skylight-panel")) {
  window.customCards.push({ type: "skylight-panel", name: "Skylight Family Display", description: "Full Skylight-style family calendar, chores, meals, lists and photos." });
}
