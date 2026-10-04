/* Skylight panel: calendar views, events and event search (methods mixed into SkylightPanel). */

import { textOn, INFO_COLORS, CAL_VIEWS, viewDays, WEATHER_ICONS, pad, ymd, parseYmd, addDays, startOfDay, sameDay, localIso, uid, occasionDay, allOccasions, esc } from "./helpers.js?v=1.38.1";

export class CalendarView {
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
    ev.on = textOn(ev.color);
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
    if (this.ui.tab === "home") { const t = startOfDay(new Date()); return [t, addDays(t, this.homeAgenda ? 14 : this.homeDays)]; }
    const a = this.ui.anchor;
    switch (this.calView) {
      case "month": {
        const first = new Date(a.getFullYear(), a.getMonth(), 1);
        const start = this.weekStart(first);
        return [start, addDays(start, 42)];
      }
      case "agenda": return [a, addDays(a, 14)];
      default: return [a, addDays(a, viewDays(this.calView) || 7)];
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
  // Birthdays/anniversaries as all-day markers for the dates on screen. Memoized so the same
  // objects come back (event buttons are found again by identity).
  occasionEvents() {
    const [from, to] = this._range();
    const key = `${ymd(from)}|${ymd(to)}`;
    if (this._occCache?.data === this.data && this._occCache.key === key) return this._occCache.evs;
    const evs = [];
    for (const o of allOccasions(this.members, this.data.occasions, this.settings.family_color || "#ff9f43")) {
      for (let y = from.getFullYear(); y <= to.getFullYear(); y++) {
        const d = occasionDay(o, y);
        if (d < startOfDay(from) || d >= to) continue;
        const years = o.year ? y - o.year : null;
        if (years !== null && years < 0) continue;
        evs.push({ occasion: true, info: true, allDay: true, start: d, end: addDays(d, 1), members: [], member: null,
          summary: `${o.title}${years === null ? "" : o.type === "birthday" ? ` (${years})` : ` (${years} yr${years === 1 ? "" : "s"})`}`,
          raw: o.title, avatar: o.emoji, color: o.color, on: textOn(o.color), stripes: "", description: "", location: "", entity: null });
      }
    }
    this._occCache = { data: this.data, key, evs };
    return evs;
  }
  visibleEvents() {
    let evs = this.events;
    const occ = this.occasionEvents();
    if (occ.length) {
      if (this._occMerged?.events !== this.events || this._occMerged.occ !== occ) {
        this._occMerged = { events: this.events, occ, all: [...occ, ...this.events].sort((a, b) => a.start - b.start) };
      }
      evs = this._occMerged.all;
    }
    if (this.ui.tab === "home" && this.settings.info_on_today === false) evs = evs.filter((e) => !e.info || e.occasion);
    if (!this.ui.filter) return evs;
    return evs.filter((e) => e.info || (e.members || []).includes(this.ui.filter));
  }

  // "S- Soccer" -> {member: Sam, rest: "Soccer"} when Sam has prefix "S".
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
  // "S- Soccer" -> Sam; "S&L- Soccer" / "S/L: Soccer" / "S + L - Soccer" -> Sam and Leo.
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
      rep: { freq: "", interval: 1, days: new Set([parseYmd(dateStr).getDay()]), end: "never", until: "", count: 10 },
      who: new Set(ev ? (ev.members || []) : this.ui.filter && this.targetCalendar(this.member(this.ui.filter)) ? [this.ui.filter] : []),
      html: () => `
        <h2>${ev ? "Edit event" : "New event"}</h2>
        ${!writable.length ? `<p class="hint">No calendars yet. Add one in Setup first.</p>` : ""}
        <label>Title<input id="ev-title" value="${esc(ev?.raw ?? ev?.summary)}" autofocus placeholder="Soccer practice"></label>
        <div class="label">Who</div>
        <div class="whopick">${this.members.map((m) => {
          const can = !!this.targetCalendar(m);
          return `<button class="whochip ${dlg.who.has(m.id) ? "on" : ""}" style="--c:${m.color}" ${can ? `data-action="who" data-member="${m.id}"` : `disabled title="${esc(m.name)} has no calendar yet"`}>
            <span class="av" style="background:${m.color}">${m.avatar}</span>${esc(m.name)}</button>`;
        }).join("")}</div>
        ${this.members.some((m) => !this.targetCalendar(m)) ? `<p class="hint">Grayed-out people have no calendar yet. Give them one in Setup → Family members, or use their title prefix.</p>` : ""}
        <label class="calpick" ${dlg.who.size ? "hidden" : ""}>Calendar <small class="hint">(when no one is selected)</small><select id="ev-cal">${writable.map((e) => `<option value="${e}" ${e === defaultCal ? "selected" : ""}>${esc(calLabel(e))}</option>`).join("")}</select></label>
        <p class="hint whohint" ${dlg.who.size ? "" : "hidden"}>📍 Will be saved to: <b>${[...new Set([...dlg.who].map((id) => this.targetCalendar(this.member(id))).filter(Boolean))].map((e) => esc(this.calName(e))).join(", ")}</b>${dlg.who.size > 1 ? " — shown once, in everyone's colors" : ""}.</p>
        <label class="check"><input type="checkbox" id="ev-allday" data-change="event-allday" ${ev?.allDay ? "checked" : ""}> All day</label>
        <div class="row">
          <label>Starts<input type="date" id="ev-date" value="${dateStr}" data-change="ev-shift"></label>
          <label class="timefield" ${allDayNow() ? "hidden" : ""}>&nbsp;${this.timeInput("ev-start", startT)}</label>
        </div>
        <div class="row">
          <label>Ends<input type="date" id="ev-enddate" value="${endDate}"></label>
          <label class="timefield" ${allDayNow() ? "hidden" : ""}>&nbsp;${this.timeInput("ev-end", endT)}</label>
        </div>
        ${ev ? "" : this.renderRepeatBuilder(dlg)}
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
    dlg.prevStart = this._formTimes().start;
  }
  // Plain-English description of an RRULE, e.g. "every 2 weeks on Tue, Thu, until Dec 18".
  _rruleText(rr) {
    const get = (k) => new RegExp(`${k}=([^;]+)`).exec(rr || "")?.[1];
    const f = get("FREQ"), n = Number(get("INTERVAL") || 1);
    const unit = { DAILY: "day", WEEKLY: "week", MONTHLY: "month", YEARLY: "year" }[f];
    if (!unit) return "custom";
    let text = n > 1 ? `every ${n} ${unit}s` : `every ${unit}`;
    const byday = get("BYDAY");
    if (byday) {
      const names = { SU: "Sun", MO: "Mon", TU: "Tue", WE: "Wed", TH: "Thu", FR: "Fri", SA: "Sat" };
      text += ` on ${byday.split(",").map((d) => names[d] || d).join(", ")}`;
    }
    const until = get("UNTIL"), count = get("COUNT");
    if (until) {
      const m = /^(\d{4})(\d{2})(\d{2})/.exec(until);
      if (m) text += `, until ${new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}`;
    } else if (count) text += `, ${count} times`;
    return text;
  }

  // ---------- repeat builder (new events) ----------
  renderRepeatBuilder(dlg) {
    const r = dlg.rep;
    const DAYS = [["SU", "Sun"], ["MO", "Mon"], ["TU", "Tue"], ["WE", "Wed"], ["TH", "Thu"], ["FR", "Fri"], ["SA", "Sat"]];
    const unit = { DAILY: "day", WEEKLY: "week", MONTHLY: "month", YEARLY: "year" }[r.freq];
    const rr = this._buildRrule(r);
    return `<div class="repeat">
      <div class="row">
        <label>Repeats<select id="rp-freq" data-change="rp" data-field="freq">
          ${[["", "Never"], ["DAILY", "Daily"], ["WEEKLY", "Weekly"], ["MONTHLY", "Monthly"], ["YEARLY", "Yearly"]].map(([v, l]) => `<option value="${v}" ${r.freq === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>
        ${r.freq ? `<label>Every<select id="rp-int" data-change="rp" data-field="interval">
          ${[1, 2, 3, 4].map((k) => `<option value="${k}" ${r.interval === k ? "selected" : ""}>${k === 1 ? unit : `${k} ${unit}s`}</option>`).join("")}</select></label>` : ""}
      </div>
      ${r.freq === "WEEKLY" ? `<div class="daypick rpdays">${DAYS.map(([code, name], i) => `<label class="daychip"><input type="checkbox" data-change="rp-day" data-day="${i}" ${r.days.has(i) ? "checked" : ""}><span>${name}</span></label>`).join("")}</div>` : ""}
      ${r.freq ? `<div class="row">
        <label>Ends<select id="rp-end" data-change="rp" data-field="end">
          <option value="never" ${r.end === "never" ? "selected" : ""}>Never</option>
          <option value="until" ${r.end === "until" ? "selected" : ""}>On a date</option>
          <option value="count" ${r.end === "count" ? "selected" : ""}>After a number of times</option></select></label>
        ${r.end === "until" ? `<label>Last date<input type="date" id="rp-until" data-change="rp" data-field="until" value="${r.until}"></label>` : ""}
        ${r.end === "count" ? `<label>Times<input type="number" id="rp-count" min="1" max="365" data-change="rp" data-field="count" value="${r.count}"></label>` : ""}
      </div>
      <p class="hint rpsum">🔁 ${esc(this._rruleText(rr).replace(/^./, (c) => c.toUpperCase()))}</p>` : ""}
    </div>`;
  }
  // RRULE from the builder state (RFC 5545), e.g. FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,TH;UNTIL=20261218
  _buildRrule(r, allDay = true) {
    if (!r.freq) return "";
    const parts = [`FREQ=${r.freq}`];
    if (r.interval > 1) parts.push(`INTERVAL=${r.interval}`);
    if (r.freq === "WEEKLY" && r.days.size) {
      parts.push(`BYDAY=${[...r.days].sort().map((i) => ["SU", "MO", "TU", "WE", "TH", "FR", "SA"][i]).join(",")}`);
    }
    if (r.end === "until" && r.until) {
      if (allDay) parts.push(`UNTIL=${r.until.replace(/-/g, "")}`);
      // Timed events: end of that local day. (Home Assistant rejects the UTC "...Z" form here.)
      else parts.push(`UNTIL=${r.until.replace(/-/g, "")}T235959`);
    } else if (r.end === "count" && r.count > 0) parts.push(`COUNT=${r.count}`);
    return parts.join(";");
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
      const [sh, sm] = this._readTime("ev-start") || [9, 0];
      const [eh, em] = this._readTime("ev-end") || [sh + 1, sm];
      start = parseYmd(date); start.setHours(sh, sm);
      end = parseYmd(endDate); end.setHours(eh, em);
      if (end <= start) end = new Date(start.getTime() + 3600000);
    }
    const r = this.ui.dialog?.rep;
    let rrule = "";
    if (r && r.freq && !this.ui.dialog.event) {
      rrule = this._buildRrule(r, allDay);
      // Weekly on chosen days: start on the first chosen day so the first event matches the pattern.
      if (r.freq === "WEEKLY" && r.days.size && !r.days.has(start.getDay())) {
        let shift = 1;
        while (!r.days.has((start.getDay() + shift) % 7)) shift++;
        start = addDays(start, shift); end = addDays(end, shift);
      }
    }
    return { entity: $("ev-cal").value, fields, allDay, start, end, rrule };
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
  _askScope(verb, { seriesOk = true } = {}) {
    return new Promise((resolve) => {
      this._scopeResolver = resolve;
      const layer = document.createElement("div");
      layer.id = "scope-layer";
      layer.innerHTML = `<div class="backdrop" data-action="scope" data-scope="cancel"><div class="dialog small">
        <h2>${verb === "delete" ? "Delete" : "Save"} repeating event</h2>
        <div class="scopes">
          <button data-action="scope" data-scope="this">This event</button>
          <button data-action="scope" data-scope="future" ${seriesOk ? "" : "disabled"}>This and following events</button>
          <button data-action="scope" data-scope="all" ${seriesOk ? "" : "disabled"}>All events</button>
        </div>
        ${seriesOk ? "" : `<p class="hint">This calendar (e.g. Google) doesn't let ${this.appName} edit the whole series. Change the series in Google Calendar, or edit just this event here.</p>`}
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
    // Only delete a copy that sits on the calendar of someone who was un-selected (and no one still selected).
    // Anything else (e.g. an event assigned by title prefix on a parent's calendar) is kept and updated.
    const dropped = new Set((ev?.members || []).filter((id) => !who.has(id)));
    const remove = copies.filter((c) => {
      if (keep.includes(c)) return false;
      const owners = this.calendarOwners(c.entity);
      return owners.some((m) => dropped.has(m.id)) && !owners.some((m) => who.has(m.id));
    });
    for (const c of copies) if (!keep.includes(c) && !remove.includes(c)) keep.push(c);
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
      // Series edits on calendars without update support need the repeat rule to recreate the series.
      const seriesOk = plan.keep.every((c) => this._canUpdate(c.entity) || c.rrule || ev.rrule);
      const scope = await this._askScope("save", { seriesOk });
      if (!scope) return;
      for (const c of plan.keep) await this._updateCopy(c, ev, form, scope);
      for (const entity of plan.create) {
        // New person on a repeating event: "this" adds just this occurrence; otherwise the series from here.
        const rrule = scope === "this" ? "" : ev.rrule;
        await this._ws({ type: "calendar/event/create", entity_id: entity, event: this._eventPayload(form, { rrule }) });
      }
      for (const c of plan.remove) await this._deleteCopy(c, scope);
    } else {
      for (const c of plan.keep) {
        if (this._canUpdate(c.entity)) await this._ws({ type: "calendar/event/update", entity_id: c.entity, uid: c.uid, event: this._eventPayload(form, { rrule: "" }) });
        else { // e.g. Google Calendar in Home Assistant: no edit support, so replace the event
          await this._ws({ type: "calendar/event/create", entity_id: c.entity, event: this._eventPayload(form, { rrule: "" }) });
          await this._ws({ type: "calendar/event/delete", entity_id: c.entity, uid: c.uid });
        }
      }
      for (const entity of plan.create) await this._ws({ type: "calendar/event/create", entity_id: entity, event: this._eventPayload(form) });
      for (const c of plan.remove) await this._ws({ type: "calendar/event/delete", entity_id: c.entity, uid: c.uid });
    }
    this.closeDialog(); this._eventsKey = ""; this._mealKey = ""; this._loadEvents();
  }

  // CalendarEntityFeature.UPDATE_EVENT = 4 (create = 1, delete = 2).
  _canUpdate(entity) { return ((this._hass.states[entity]?.attributes?.supported_features || 0) & 4) !== 0; }

  async _updateCopy(c, ev, form, scope) {
    if (!this._canUpdate(c.entity)) return this._replaceCopy(c, ev, form, scope);
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

  // Edit a repeating event on a calendar that can't update: create the new version, then delete the old part.
  async _replaceCopy(c, ev, form, scope) {
    const rrule = c.rrule || ev.rrule;
    if (scope !== "this" && !rrule) {
      this._toast("This calendar can't edit repeating events here. Change it in Google Calendar instead.");
      throw new Error("no rrule");
    }
    let created;
    if (scope === "this") created = this._eventPayload(form, { rrule: "" });
    else if (scope === "future") created = this._eventPayload(form, { rrule });
    else {
      const first = await this._seriesStart({ ...ev, entity: c.entity, uid: c.uid });
      const shiftDays = Math.round((startOfDay(first) - startOfDay(ev.start)) / 86400000);
      created = this._eventPayload(form, { shiftDays, rrule });
    }
    await this._ws({ type: "calendar/event/create", entity_id: c.entity, event: created });
    await this._deleteCopy(c, scope === "all" ? null : scope);
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

  renderCalendar() {
    const v = this.calView, a = this.ui.anchor;
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
      <div class="seg">${CAL_VIEWS.filter(([x]) => !this.isPhone || (x !== "5day" && x !== "7day")).map(([x, label]) => `<button class="${v === x ? "on" : ""}" data-action="view" data-view="${x}">${label}</button>`).join("")}</div>
      <button class="icon searchbtn" data-action="search-open" title="Search events">🔍</button>
      <button class="primary fab" data-action="new-event">+ Event</button>
    </div>`;
    if (noCals) return toolbar + `<div class="empty"><h2>No calendars connected yet</h2><p>Open <b>Setup</b> to add family members and create or link calendars.</p><button class="primary" data-action="tab" data-tab="settings">Go to Setup</button></div>`;
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
    return `<button class="ev ${ev.allDay ? "allday" : ""} ${compact ? "compact" : ""} ${ev.stripes ? "multi" : ""} ${ev.info ? "info" : ""}" style="--c:${ev.color};--on:${ev.on || "#fff"};${ev.stripes}" data-action="open-event" data-idx="${this.evIndex(ev)}">
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

  // ---------- event search ----------
  openSearch() {
    this._openDialog({
      type: "search",
      html: () => `<h2>🔍 Search events</h2>
        <input id="search-q" autocomplete="off" autofocus placeholder="Title, place or notes (e.g. dentist, soccer, Grandma)">
        <p class="hint">Searches ${this._searchRangeText()} on every calendar shown in ${this.appName}.</p>
        <div id="search-results" class="sresults"></div>
        <div class="actions"><span class="spacer"></span><button data-action="close">Close</button></div>`,
    });
    this._loadSearchEvents();
  }
  _searchRange() { const t = startOfDay(new Date()); return [addDays(t, -180), addDays(t, 366)]; }
  _searchRangeText() { const [a, b] = this._searchRange(); return `${a.toLocaleDateString([], { month: "short", year: "numeric" })} – ${b.toLocaleDateString([], { month: "short", year: "numeric" })}`; }
  async _loadSearchEvents() {
    if (this._searchCache && Date.now() - this._searchCache.at < 5 * 60000) return this._searchCache.events;
    const [start, end] = this._searchRange();
    const box = this.shadowRoot.getElementById("search-results");
    if (box) box.innerHTML = `<p class="hint">Loading events…</p>`;
    const lists = await Promise.all(this.shownCalendars().map(async (entity) => {
      try {
        const evs = await this._hass.callApi("GET", `calendars/${entity}?start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}`);
        return evs.map((ev) => this._normalizeEvent(ev, entity));
      } catch (e) { return []; }
    }));
    const events = this._mergeShared(lists.flat()).sort((a, b) => a.start - b.start);
    this._searchCache = { at: Date.now(), events };
    this._runSearch();
    return events;
  }
  _runSearch() {
    const box = this.shadowRoot.getElementById("search-results");
    const input = this.shadowRoot.getElementById("search-q");
    if (!box || !input || !this._searchCache) return;
    const words = input.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) { box.innerHTML = ""; return; }
    const hits = this._searchCache.events.filter((e) => {
      const text = `${e.raw} ${e.location} ${e.description} ${(e.members || []).map((id) => this.member(id)?.name || "").join(" ")}`.toLowerCase();
      return words.every((w) => text.includes(w));
    });
    const today = startOfDay(new Date());
    // Upcoming first (soonest first), then past (most recent first).
    const upcoming = hits.filter((e) => e.end > today), past = hits.filter((e) => e.end <= today).reverse();
    const row = (e) => `<button class="srow ${e.stripes ? "multi" : ""}" style="--c:${e.color};${e.stripes}" data-action="search-go" data-date="${ymd(e.start)}">
        <span class="st">${e.start.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}<br><small>${e.allDay ? "All day" : this.fmtTime(e.start)}</small></span>
        <span class="bar"></span><span class="av">${e.avatar}</span>
        <span class="sm"><b>${esc(e.summary)}</b>${e.location ? `<small>📍 ${esc(e.location)}</small>` : ""}</span></button>`;
    box.innerHTML = !hits.length ? `<p class="hint">No events match “${esc(input.value.trim())}”.</p>`
      : `${upcoming.length ? `<div class="label">Upcoming (${upcoming.length})</div>${upcoming.slice(0, 50).map(row).join("")}` : ""}
         ${past.length ? `<div class="label">Past (${past.length})</div>${past.slice(0, 30).map(row).join("")}` : ""}`;
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
}
