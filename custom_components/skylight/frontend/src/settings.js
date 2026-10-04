/* Skylight panel: settings, family members, birthdays, theme and PIN (methods mixed into SkylightPanel). */

import { DEFAULT_APP_NAME, PANEL_VERSION, MEMBER_COLORS, textOn, PALETTE, AVATARS, SKIN_TONES, withTone, toneOf, INFO_ICONS, INFO_COLORS, CAL_VIEWS, LEGACY_VIEWS, pad, choreOwnersOf, ROLE_LABEL, uid, THEMES, seasonFor, MONTHS, OCCASION_EMOJI, isLeap, esc, ALERT_TYPE_LABELS, ALERT_TYPES, REMINDERS } from "./helpers.js?v=1.42.1";

export class SettingsView {

  openMemberDialog(m) {
    const used = new Set(this.members.map((x) => x.color));
    const dlg = {
      type: "member", member: m, role: ["kid", "home", "adult"].includes(m?.role) ? m.role : m ? "adult" : "kid",
      today: m?.today || (m?.role === "adult" ? "none" : "chores"), todayList: m?.today_list || "",
      color: m?.color || PALETTE.find((c) => !used.has(c)) || PALETTE[0],
      avatar: m?.avatar || AVATARS[this.members.length % AVATARS.length],
      tone: m?.avatar ? toneOf(m.avatar) : "",
      html: () => {
        const cals = this.allCalendars();
        const mine = new Set(m?.calendars || []);
        return `
        <h2>${m ? "Edit" : "Add"} family member</h2>
        <div class="avatar-preview" style="background:${dlg.color}">${dlg.avatar}</div>
        <label>Name<input id="m-name" value="${esc(m?.name)}" data-autofocus placeholder="Name"></label>
        <div class="label">Birthday <small class="hint">(optional; year optional too)</small></div>
        ${this._dateFields("m-bday", m?.birthday)}
        <div class="label">This person is</div>
        <div class="seg rolepick">${["adult", "kid", "home"].map((r) => `<button class="${dlg.role === r ? "on" : ""}" data-action="member-role" data-role="${r}">${ROLE_LABEL[r]}</button>`).join("")}</div>
        <p class="hint" style="margin-top:4px">Kids get chores and show on the Chores and Progress tabs. Adults can own lists (like a honey-do list). <b>Household</b> is for a non-person profile like “Maintenance”: it gets chores (furnace filters, smoke detectors…) but isn't counted on Progress.</p>
        ${(() => {
          const theirs = m ? (this.data.chores || []).filter((c) => c.member_id === m.id) : [];
          const kids = choreOwnersOf(this.members).filter((k) => k.id !== m?.id);
          if (dlg.role !== "adult" || !theirs.length) return "";
          return `<div class="rolewarn">⚠️ ${esc(m.name)} has ${theirs.length} chore${theirs.length > 1 ? "s" : ""}. They're kept but hidden while ${esc(m.name)} is an adult.
            ${kids.length ? `<div class="row"><select id="m-movechores">${kids.map((k) => `<option value="${k.id}">${k.avatar} ${esc(k.name)}</option>`).join("")}</select><button data-action="move-chores">Move chores here</button></div>` : ""}</div>`;
        })()}
        <label>Event title prefixes <small class="hint">(optional, comma-separated)</small>
          <input id="m-prefix" value="${esc((m?.prefixes || []).join(", "))}" placeholder="e.g. S, Sam"></label>
        <p class="hint" style="margin-top:-4px">Events whose title starts with one of these, followed by "-", ":" or a space (like “Z- Soccer”), show in this person's color on any calendar.</p>
        <div class="label">Color</div>
        <div class="swatches colorgrid">${MEMBER_COLORS.map((c) => `<button class="swatch ${c === dlg.color ? "sel" : ""}" style="background:${c}" title="${c}" data-action="pick-color" data-color="${c}"></button>`).join("")}</div>
        <div class="customcolor">
          <label class="wheel" title="Color wheel"><input type="color" id="m-wheel" data-fresh="1" value="${dlg.color}" data-change="color-wheel"><span>🎨 Color wheel</span></label>
          <input id="m-hex" data-fresh="1" value="${dlg.color}" maxlength="7" placeholder="#3a7bd5" data-change="color-hex" data-enter="color-hex" autocomplete="off">
          <span class="preview" style="background:${dlg.color};color:${textOn(dlg.color)}">Aa</span>
        </div>
        <div class="label">Avatar</div>
        <div class="tones">Skin tone: ${SKIN_TONES.map(([t, name]) => `<button class="tone ${t === dlg.tone ? "sel" : ""}" title="${name}" data-action="pick-tone" data-tone="${t}">👋${t}</button>`).join("")}</div>
        <input class="emojisearch" id="avatar-q" data-fresh="1" autocomplete="off" placeholder="🔍 Search all emoji (bear, guitar, dad…)" data-emoji-search="avatar">
        <div class="swatches" id="avatar-grid">${this._emojiButtons(AVATARS.map((a0) => withTone(a0, dlg.tone)), "avatar")}</div>
        <label>New events for ${esc(m?.name || "this person")} go to
          <select id="m-default">
            <option value="">Automatic (their own calendar)</option>
            ${this.allCalendars().filter((e) => !this.infoCal(e)).map((e) => `<option value="${e}" ${e === m?.default_calendar ? "selected" : ""}>${esc(this.calName(e))}</option>`).join("")}
          </select></label>
        <p class="hint" style="margin-top:-4px">Used when you pick this person in an event's “Who”. Shared calendars (like Home Maintenance) can stay ticked for several people without new events landing on them.</p>
        <div class="label">Today screen shows</div>
        <div class="row">
          <label><select id="m-today" data-change="member-today">
            ${dlg.role !== "adult" ? `<option value="chores" ${dlg.today === "chores" ? "selected" : ""}>✅ Chores</option>` : ""}
            <option value="list" ${dlg.today === "list" ? "selected" : ""}>📝 A list (to-do / honey-do)</option>
            <option value="none" ${dlg.today === "none" ? "selected" : ""}>Nothing</option></select></label>
          <label ${dlg.today === "list" ? "" : "hidden"}><select id="m-todaylist">
            ${this.allLists().map((l) => `<option value="${esc(l.id)}" ${l.id === dlg.todayList ? "selected" : ""}>${l.linked ? "🔗 " : ""}${esc(l.name)}</option>`).join("")}
            <option value="__new__" ${!dlg.todayList ? "selected" : ""}>＋ New list for ${esc(m?.name || "this person")}</option></select></label>
        </div>
        <div class="label">Calendars</div>
        <div class="checklist">${cals.length ? cals.map((e) => `<label class="check"><input type="checkbox" class="m-cal" id="mc-${e}" value="${e}" ${mine.has(e) ? "checked" : ""}> ${esc(this.calName(e))}</label>`).join("") : `<p class="hint">No calendars found. Create one in Setup → Calendars.</p>`}</div>
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
    const bday = this._readDate("m-bday");
    if (bday.error) { this._toast(`Birthday: ${bday.error}`); return; }
    const calendars = [...this.shadowRoot.querySelectorAll(".m-cal:checked")].map((i) => i.value);
    const defaultCal = this.shadowRoot.getElementById("m-default")?.value || "";
    if (defaultCal && !calendars.includes(defaultCal)) calendars.push(defaultCal); // their default is one of theirs
    const prefixes = this.shadowRoot.getElementById("m-prefix").value.split(",").map((x) => x.trim()).filter(Boolean);
    let today = this.shadowRoot.getElementById("m-today").value;
    if (dlg.role === "adult" && today === "chores") today = "none";
    let todayList = this.shadowRoot.getElementById("m-todaylist")?.value || "";
    let newList = null;
    if (today === "list" && (todayList === "__new__" || !todayList)) {
      // Create a personal list, e.g. "Alex's To-Do" (owned by them if they're an adult)
      newList = { id: uid(), name: `${name}'s To-Do`, color: dlg.color, items: [] };
      todayList = newList.id;
    }
    const rec = { id: dlg.member?.id || uid(), name, color: dlg.color, avatar: dlg.avatar, calendars, prefixes, role: dlg.role,
      today, today_list: today === "list" ? todayList : "", default_calendar: defaultCal, ...(bday.none ? {} : { birthday: bday }) };
    const members = dlg.member ? this.members.map((x) => (x.id === rec.id ? rec : x)) : [...this.members, rec];
    await this._set("members", members); // members first, so the server knows the new owner is an adult
    if (newList) await this._ws({ type: "skylight/list/save", list_id: newList.id, name: newList.name, color: newList.color, owner: dlg.role === "adult" ? rec.id : null });
    this._eventsKey = ""; this._mealKey = ""; this.closeDialog();
  }

  // ---------- Setup: theme, dark mode, night dimming ----------
  renderLookCard() {
    const s = this.settings, mine = this._screenScheme() || "follow";
    const bright = Object.keys(this._hass.states).filter((e) => /^(number|light|input_number)\./.test(e) && (e.startsWith("light.") || /bright/i.test(e) || /bright/i.test(this.entityName(e)))).sort();
    const showTimes = s.night_by !== "sun";
    return `<section class="card">
      <h2>Look &amp; night mode</h2>
      <label class="inline">Theme <select data-change="setting" data-key="theme">${Object.entries(THEMES).map(([k, t]) => `<option value="${k}" ${(s.theme || "warm") === k ? "selected" : ""}>${t.label}</option>`).join("")}</select></label>
      <label class="inline">Seasonal accents ${s.seasonal ? seasonFor(new Date()).emoji : ""} <input type="checkbox" ${s.seasonal ? "checked" : ""} data-change="setting" data-key="seasonal"></label>
      <p class="hint">Changes the accent color and adds a small emoji by the clock for spring, summer, July 4th, fall, Halloween, Thanksgiving week, Christmas and winter.</p>
      <label class="inline">This screen <select data-change="screen-scheme">${[["follow", "Follow this device's light/dark"], ["light", "Always light"], ["dark", "Always dark"], ["night", "Dark at night"]].map(([v, l]) => `<option value="${v}" ${mine === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>
      <p class="hint">Light or dark is chosen on each screen and saved on that device, so every phone and the wall display can differ. "Follow this device" uses the phone's or tablet's own Dark Mode.</p>
      <label class="inline">Night is <select data-change="setting" data-key="night_by">${[["schedule", "Between set times"], ["sun", "Sunset to sunrise"]].map(([v, l]) => `<option value="${v}" ${(s.night_by || "schedule") === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>
      <p class="hint">For everyone: screens set to "Dark at night" and night dimming use this.</p>
      ${showTimes ? `<div class="row"><label class="inline">Night starts <input type="time" value="${esc(s.night_start || "21:00")}" data-change="setting" data-key="night_start"></label>
        <label class="inline">ends <input type="time" value="${esc(s.night_end || "06:30")}" data-change="setting" data-key="night_end"></label></div>` : ""}
      <label class="inline">Dim the screen at night <input type="checkbox" ${s.night_dim ? "checked" : ""} data-change="setting" data-key="night_dim"></label>
      ${s.night_dim ? `
        <label class="inline">Screen brightness entity <select data-change="setting" data-key="brightness_entity"><option value="">None (dim with an overlay)</option>${bright.map((e) => `<option value="${e}" ${e === s.brightness_entity ? "selected" : ""}>${esc(this.entityName(e))}</option>`).join("")}</select></label>
        <div class="row"><label class="inline">Day brightness % <input type="number" min="1" max="100" value="${Number(s.day_brightness ?? 80)}" data-change="setting" data-key="day_brightness" data-num="1"></label>
          <label class="inline">Night brightness % <input type="number" min="1" max="100" value="${Number(s.night_brightness ?? 20)}" data-change="setting" data-key="night_brightness" data-num="1"></label></div>
        <p class="hint">${s.brightness_entity
          ? "Home Assistant sets this entity to the day or night level when night starts and ends (a manual change stays until the next switch). With Fully Kiosk Browser, use its integration's “Screen brightness” entity."
          : "No brightness entity: ${this.appName} darkens the picture with an overlay. That dims pixels, not the backlight, so the screen still glows a little. For real dimming, add the Fully Kiosk Browser integration in Home Assistant and pick its “Screen brightness” entity here."}
          Night hours ${mode === "sun" ? "follow sunset and sunrise" : "use the times above"}; the photo screensaver is dimmed too.</p>` : ""}
    </section>`;
  }

  // ---------- Setup: birthdays & anniversaries ----------
  _dateFields(prefix, v) {
    return `<div class="row datefields">
      <label>Month<select id="${prefix}-month"><option value="">—</option>${MONTHS.map((n, i) => `<option value="${i + 1}" ${v?.month === i + 1 ? "selected" : ""}>${n}</option>`).join("")}</select></label>
      <label>Day<input id="${prefix}-day" type="number" min="1" max="31" inputmode="numeric" value="${v?.day ?? ""}"></label>
      <label>Year <small class="hint">(optional)</small><input id="${prefix}-year" type="number" min="1900" max="2200" inputmode="numeric" value="${v?.year ?? ""}" placeholder="e.g. 1988"></label></div>`;
  }
  _readDate(prefix) {
    const $ = (id) => this.shadowRoot.getElementById(`${prefix}-${id}`);
    const month = Number($("month")?.value), day = Number($("day")?.value), year = Number($("year")?.value);
    if (!month && !day) return { none: true };
    const max = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
    if (!month || !day || day < 1 || day > max) return { error: "Pick a month and a day that exists in it" };
    if (year && month === 2 && day === 29 && !isLeap(year)) return { error: `${year} wasn't a leap year` };
    return { month, day, ...(year ? { year } : {}) };
  }
  renderOccasionsCard() {
    const list = [...(this.data.occasions || [])].sort((a, b) => a.month - b.month || a.day - b.day);
    const bdays = this.members.filter((m) => m.birthday);
    return `<section class="card">
      <div class="toolbar"><h2>Birthdays &amp; anniversaries</h2><button class="primary" data-action="new-occasion">+ Add</button></div>
      <p class="hint">Family members' birthdays are set in each person's editor${bdays.length ? ` (${bdays.map((m) => esc(m.name)).join(", ")})` : ""}. Add grandparents' birthdays, anniversaries and other yearly dates here. They show on the Today screen and the calendar.</p>
      ${list.map((o) => `<div class="mrow2"><span class="av big" style="background:var(--bg)">${esc(o.emoji || OCCASION_EMOJI[o.type] || "📅")}</span>
        <div class="grow"><b>${esc(o.title)}</b><small>${MONTHS[o.month - 1]} ${o.day}${o.year ? `, ${o.year}` : ""}</small></div>
        <button data-action="edit-occasion" data-id="${esc(o.id)}">Edit</button></div>`).join("") || `<p class="hint">Nothing added yet.</p>`}
      <div class="row">
        <span class="label" style="margin:0">Upcoming card on Today:</span>
        <label class="inline">show up to <input type="number" min="1" max="10" value="${Number(this.settings.upcoming_count ?? 3)}" data-change="setting" data-key="upcoming_count" data-num="1"> dates</label>
        <label class="inline">up to <input type="number" min="1" max="366" value="${Number(this.settings.upcoming_days ?? 60)}" data-change="setting" data-key="upcoming_days" data-num="1"> days ahead</label></div>
    </section>`;
  }
  openOccasionDialog(o) {
    const dlg = {
      type: "occasion", occasion: o, kind: o?.type || "birthday",
      html: () => `
        <h2>${o ? "Edit" : "Add"} ${dlg.kind === "anniversary" ? "anniversary" : dlg.kind === "birthday" ? "birthday" : "date"}</h2>
        <div class="seg"><button class="${dlg.kind === "birthday" ? "on" : ""}" data-action="occ-kind" data-kind="birthday">🎂 Birthday</button><button class="${dlg.kind === "anniversary" ? "on" : ""}" data-action="occ-kind" data-kind="anniversary">💍 Anniversary</button><button class="${dlg.kind === "other" ? "on" : ""}" data-action="occ-kind" data-kind="other">📅 Other</button></div>
        <label>Title<input id="o-title" value="${esc(o?.title || "")}" placeholder="${dlg.kind === "anniversary" ? "Mom & Dad's anniversary" : dlg.kind === "birthday" ? "Grandma's birthday" : "Adoption day"}" data-autofocus></label>
        ${this._dateFields("o", o)}
        <p class="hint" style="margin-top:-4px">With a year, ${this.appName} shows the age or number of years.</p>
        <label>Emoji <small class="hint">(optional)</small><input id="o-emoji" value="${esc(o?.emoji || "")}" maxlength="8" placeholder="${OCCASION_EMOJI[dlg.kind]}"></label>
        <div class="label">Whose ${dlg.kind === "birthday" ? "family is it (color)" : "is it"} <small class="hint">(optional)</small></div>
        <div class="checklist">${this.members.map((m) => `<label class="check"><input type="checkbox" class="o-mem" value="${m.id}" ${(o?.members || []).includes(m.id) ? "checked" : ""}> ${m.avatar} ${esc(m.name)}</label>`).join("")}</div>
        <div class="actions">
          ${o ? `<button class="danger" data-action="delete-occasion">Delete</button>` : ""}
          <span class="spacer"></span><button data-action="close">Cancel</button><button class="primary" data-action="save-occasion">Save</button></div>`,
    };
    this._openDialog(dlg);
  }
  async saveOccasion() {
    const dlg = this.ui.dialog;
    const title = this.shadowRoot.getElementById("o-title").value.trim();
    if (!title) { this._toast("Please add a title"); return; }
    const when = this._readDate("o");
    if (when.none || when.error) { this._toast(when.error || "Pick a month and day"); return; }
    const emoji = this.shadowRoot.getElementById("o-emoji").value.trim();
    const members = [...this.shadowRoot.querySelectorAll(".o-mem:checked")].map((i) => i.value);
    const rec = { id: dlg.occasion?.id || uid(), title, type: dlg.kind, ...when, ...(members.length ? { members } : {}), ...(emoji ? { emoji } : {}) };
    const list = dlg.occasion ? (this.data.occasions || []).map((x) => (x.id === rec.id ? rec : x)) : [...(this.data.occasions || []), rec];
    await this._set("occasions", list); this.closeDialog();
  }
  // PIN pad dialog. check(pin) returns an error message to stay open, or null to finish.
  // Resolves with the entered PIN, or null if cancelled. Any dialog underneath is restored afterwards.
  promptPin({ title, sub = "", check = null }) {
    return new Promise((resolve) => {
      const prev = this.ui.dialog;
      const finish = (val) => {
        if (this.ui.dialog !== dlg) return;
        this.ui.dialog = prev || null;
        prev ? this.renderDialog() : this.closeDialog();
        resolve(val);
      };
      const dlg = {
        type: "pin", entry: "", error: "", busy: false, finish,
        submit: async () => {
          if (dlg.entry.length < 4 || dlg.busy) { dlg.error = dlg.entry.length < 4 ? "At least 4 digits" : ""; this.renderDialog(); return; }
          if (!check) { finish(dlg.entry); return; }
          dlg.busy = true; this.renderDialog();
          const err = await check(dlg.entry);
          dlg.busy = false;
          if (err) { dlg.error = err; dlg.entry = ""; this.renderDialog(); } else finish(dlg.entry);
        },
        html: () => `<div class="pinpad">
          <h2>🔒 ${esc(title)}</h2>${sub ? `<p class="hint">${esc(sub)}</p>` : ""}
          <div class="pindots" aria-label="${dlg.entry.length} digits entered">${[...Array(Math.max(4, dlg.entry.length))].map((_, i) => `<i class="${i < dlg.entry.length ? "on" : ""}"></i>`).join("")}</div>
          <p class="pinerr" role="alert">${esc(dlg.error)}</p>
          <div class="pinkeys">${["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((k) => `<button data-action="pin-key" data-k="${k}">${k}</button>`).join("")}
            <button class="pinside" data-action="pin-back" aria-label="Delete">⌫</button><button data-action="pin-key" data-k="0">0</button>
            <button class="primary pinside" data-action="pin-ok" ${dlg.busy ? "disabled" : ""}>${dlg.busy ? "…" : "OK"}</button></div>
          <div class="actions"><span class="spacer"></span><button data-action="pin-cancel">Cancel</button></div></div>`,
      };
      this._openDialog(dlg);
    });
  }
  // Ask for the PIN and unlock this screen. Resolves true when unlocked.
  requestUnlock() {
    if (this.unlocked) return Promise.resolve(true);
    if (this._unlocking) return this._unlocking;
    this._unlocking = this.promptPin({
      title: "Enter setup PIN", sub: "Setup is locked so it can't be changed by accident.",
      check: async (pin) => {
        try {
          const r = await this._hass.callWS({ type: "skylight/unlock", pin });
          this._unlockUntil = Date.now() + (r.seconds_left || 300) * 1000;
          return null;
        } catch (e) { return e.message || "Wrong PIN"; }
      },
    }).then((pin) => { this._unlocking = null; this.render(); return pin !== null; });
    return this._unlocking;
  }
  relock() {
    if (!this.pinSet || !this._unlockUntil) return;
    this._unlockUntil = 0;
    this._hass.callWS({ type: "skylight/lock" }).catch(() => {});
  }
  async pinSetup() {
    const first = await this.promptPin({ title: "Choose a setup PIN", sub: "4 to 8 digits. Needed to change Setup, family members and chores." });
    if (first === null) return;
    const second = await this.promptPin({ title: "Enter the PIN again", check: async (p) => (p === first ? null : "Those didn't match. Try again.") });
    if (second === null) return;
    try {
      const r = await this._ws({ type: "skylight/pin/set", pin: first });
      this._unlockUntil = Date.now() + (r.seconds_left || 300) * 1000;
      this._toast("Setup PIN set");
    } catch (e) { /* toast shown */ }
    this.render();
  }
  async pinChange() {
    const current = await this.promptPin({ title: "Current PIN" });
    if (current === null) return;
    const first = await this.promptPin({ title: "New PIN", sub: "4 to 8 digits" });
    if (first === null) return;
    const second = await this.promptPin({ title: "Enter the new PIN again", check: async (p) => (p === first ? null : "Those didn't match. Try again.") });
    if (second === null) return;
    try {
      const r = await this._ws({ type: "skylight/pin/set", pin: first, current });
      this._unlockUntil = Date.now() + (r.seconds_left || 300) * 1000;
      this._toast("Setup PIN changed");
    } catch (e) { /* toast shown */ }
    this.render();
  }
  async pinRemove() {
    const current = await this.promptPin({ title: "Current PIN", sub: "Removing the PIN leaves Setup open to everyone." });
    if (current === null) return;
    try { await this._ws({ type: "skylight/pin/clear", current }); this._unlockUntil = 0; this._toast("Setup PIN removed"); }
    catch (e) { /* toast shown */ }
    this.render();
  }
  renderPinCard() {
    const s = this.settings;
    return `<section class="card" id="pin-card">
      <h2>Setup PIN</h2>
      ${this.pinSet ? `
        <p class="hint">${this.unlocked ? "🔓 Unlocked on this screen. It locks again when you leave Setup, when the photo screensaver starts, or after the time below." : "🔒 Locked. Changes ask for the PIN."}</p>
        <div class="row">${this.unlocked ? `<button data-action="pin-lock">🔒 Lock now</button>` : `<button class="primary" data-action="pin-unlock">🔓 Unlock</button>`}
          <button data-action="pin-change">Change PIN</button><button data-action="pin-remove">Remove PIN</button></div>
        <label class="inline">Stay unlocked for (minutes) <input type="number" min="1" max="60" value="${Number(s.unlock_minutes) || 5}" data-change="setting" data-key="unlock_minutes"></label>
        <p class="hint">Forgot it? A Home Assistant admin can remove it: Settings → Devices &amp; Services → ${this.appName} → Configure.</p>`
      : `<p class="hint">No PIN set: anyone using this display can change Setup, family members and chores.</p>
        <button class="primary" data-action="pin-setup">Set a setup PIN</button>`}
    </section>`;
  }

  renderSettings() {
    const s = this.settings;
    const cals = this.allCalendars();
    const weathers = Object.keys(this._hass.states).filter((e) => e.startsWith("weather.")).sort();
    const fam = new Set(this.data.family_calendars || []);
    return `<div class="settings">
      ${this.pinSet ? "" : `<div class="pinbanner">🔒 <b>Set a setup PIN</b> so kids can use the display without changing its setup. <button class="primary" data-action="pin-setup">Set PIN</button></div>`}
      ${this.settings.roles_review ? `<div class="pinbanner">🧒 <b>Check each person's Adult/Kid setting.</b> People with chores were set to Kid, everyone else to Adult. <button class="primary" data-action="roles-reviewed">Looks right</button></div>` : ""}
      ${this.renderPinCard()}
      <section class="card">
        <div class="toolbar"><h2>Family members</h2><button class="primary" data-action="new-member">+ Add member</button></div>
        ${this.members.map((m, i) => `<div class="mrow2">
          <span class="av big" style="background:${m.color}">${m.avatar}</span>
          <div class="grow"><b>${esc(m.name)} <span class="rolebadge">${ROLE_LABEL[m.role] || ROLE_LABEL.adult}</span></b><small>${[...(m.prefixes || []).map((p) => `“${esc(p)}…”`), ...(m.calendars || []).map((c) => esc(this.calName(c)))].join(", ") || "No calendars"}</small></div>
          <button class="icon sm" data-action="member-up" data-member="${m.id}" ${i === 0 ? "disabled" : ""}>↑</button>
          <button class="icon sm" data-action="member-down" data-member="${m.id}" ${i === this.members.length - 1 ? "disabled" : ""}>↓</button>
          <button data-action="edit-member" data-member="${m.id}">Edit</button></div>`).join("") || `<p class="hint">Add everyone in your household. Each person gets a color used across the calendar and chores.</p>`}
      </section>

      ${this.renderOccasionsCard()}
      <section class="card">
        <h2>Backup</h2>
        <p class="hint">Saves family members, chores and their history, lists, meals, birthdays and settings to a file. API keys and the setup PIN aren't included. Restoring replaces what's here now; the current data is kept on the Home Assistant server first (<code>.storage/skylight.data.before_import</code>).</p>
        <div class="row"><button data-action="backup-export">⬇ Download backup</button>
          <input type="file" id="backup-file" accept=".json,application/json" hidden data-change="backup-import">
          <button data-action="backup-pick">⬆ Restore from file…</button></div>
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

      <section class="card photosec">${this.renderPhotos()}</section>

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

      ${this.renderRemindersCard()}

      ${this.renderLookCard()}

      <section class="card">
        <h2>Display</h2>
        <label class="inline">Name <input type="text" maxlength="40" value="${this.appName}" placeholder="${DEFAULT_APP_NAME}" data-change="setting" data-key="app_name"></label>
        <p class="hint">Shown in the Home Assistant sidebar and on the to-do lists in Home Assistant. Leave empty for "${DEFAULT_APP_NAME}".</p>
        <label class="inline">Weather <select data-change="setting" data-key="weather_entity"><option value="">None</option>${weathers.map((w) => `<option value="${w}" ${w === s.weather_entity ? "selected" : ""}>${esc(this.entityName(w))}</option>`).join("")}</select></label>
        <label class="inline">Weather alerts (US National Weather Service) <input type="checkbox" ${s.weather_alerts !== false ? "checked" : ""} data-change="setting" data-key="weather_alerts"></label>
        <label class="inline">Pop up new alerts on this screen <select data-change="setting" data-key="alert_popup">
          ${[["severe", "Severe & extreme (warnings)"], ["extreme", "Extreme only"], ["all", "All alerts, including advisories"], ["off", "Off (banner only)"]].map(([v, l]) => `<option value="${v}" ${(s.alert_popup || "severe") === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>
        ${s.weather_alerts !== false ? `<p class="hint" style="margin-bottom:4px">Alert types to pop up and show in the banner (the Weather tab always lists every alert):</p>
        <div class="daypick alerttypes">${[...ALERT_TYPES.map(([k]) => k), "other"].map((k) => `<label class="daychip"><input type="checkbox" data-change="alert-type" data-type="${k}" ${(s.alert_hide || []).includes(k) ? "" : "checked"}><span>${ALERT_TYPE_LABELS[k]}</span></label>`).join("")}</div>` : ""}
        <label class="inline">Chime with alert pop-ups <input type="checkbox" ${s.alert_sound !== false ? "checked" : ""} data-change="setting" data-key="alert_sound"></label>
        <label class="inline">Rain-soon, air quality, comparisons (Open-Meteo, free) <input type="checkbox" ${s.weather_extra !== false ? "checked" : ""} data-change="setting" data-key="weather_extra"></label>
        <label class="inline">Weather tips on the Today screen <input type="checkbox" ${s.weather_hints !== false ? "checked" : ""} data-change="setting" data-key="weather_hints"></label>
        <p class="hint">Pollen in the US uses the Google Pollen API with the Google key from Location lookup (enable “Pollen API” in Google Cloud). Without it, pollen is shown only in Europe.</p>
        <label class="inline">Weather radar map <select data-change="setting" data-key="weather_radar">
          ${[["windy", "Windy (default)"], ["rainviewer", "RainViewer"], ["off", "Off"]].map(([v, l]) => `<option value="${v}" ${(s.weather_radar || "windy") === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>
        <div class="label">Extra weather sensors (air quality, pollen, UV, solar radiation…)</div>
        <div class="checklist">${Object.keys(this._hass.states).filter((e) => e.startsWith("sensor.") && (/aqi|air_quality|pollen|uv|pm2|pm10|ozone|lightning|rain|precip|smoke|solar|radiation|irradiance|visibility|illuminance/.test(e) ||
            ["aqi", "pm25", "pm10", "ozone", "precipitation", "precipitation_intensity", "irradiance", "illuminance", "distance"].includes(this._hass.states[e].attributes.device_class))).sort()
          .map((e) => `<label class="check"><input type="checkbox" data-change="wx-sensor" data-entity="${e}" ${(s.weather_sensors || []).includes(e) ? "checked" : ""}> ${esc(this.entityName(e))}</label>`).join("")
          || `<p class="hint">No air quality / pollen / UV sensors found in Home Assistant.</p>`}</div>
        <label class="inline">Week starts on <select data-change="setting" data-key="week_start" data-num="1"><option value="0" ${Number(s.week_start) === 0 ? "selected" : ""}>Sunday</option><option value="1" ${Number(s.week_start) === 1 ? "selected" : ""}>Monday</option></select></label>
        <label class="inline">Default calendar view <select data-change="setting" data-key="default_view">${CAL_VIEWS.map(([v, label]) => `<option value="${v}" ${v === (LEGACY_VIEWS[s.default_view] || s.default_view || "7day") ? "selected" : ""}>${label}</option>`).join("")}</select></label>
        <label class="inline">24-hour clock <input type="checkbox" ${s.clock_24h ? "checked" : ""} data-change="setting" data-key="clock_24h"></label>
        <label class="inline">Photo screensaver after (minutes, 0 = off) <input type="number" min="0" max="240" value="${s.screensaver_minutes}" data-change="setting" data-key="screensaver_minutes"></label>
        <label class="inline">Seconds per photo <input type="number" min="5" max="600" value="${s.photo_seconds}" data-change="setting" data-key="photo_seconds"></label>
        <label class="inline">Hide Home Assistant's sidebar for non-admin users <input type="checkbox" ${s.hide_ha_sidebar !== false ? "checked" : ""} data-change="setting" data-key="hide_ha_sidebar"></label>
        <p class="hint">On screens logged in as a non-admin Home Assistant user (like the kitchen tablet), Home Assistant's own menu and header are hidden so ${this.appName} fills the screen. Admin accounts always keep them. This isn't a lock: what an account can do is still set by its Home Assistant permissions.</p>
        <label class="inline">Allow photo uploads <input type="checkbox" ${s.allow_uploads !== false ? "checked" : ""} data-change="setting" data-key="allow_uploads"></label>
        <label class="inline">Show date &amp; place on photos <input type="checkbox" ${s.photo_captions !== false ? "checked" : ""} data-change="setting" data-key="photo_captions"></label>
      </section>
      <p class="hint center">${this.appName} v${PANEL_VERSION}</p>
    </div>`;
  }

  // ---------- reminders: which phones and screens get them ----------
  _screenReminders() {
    try { const v = JSON.parse(localStorage.getItem("skylight.reminderScreen") || "null"); if (v) return v; } catch (e) { /* none saved */ }
    return { mode: this.isPhone ? "off" : "all", members: [] }; // the wall display shows them; phones get push notifications
  }
  _remindersPicker(cfg, action, extra) {
    const mode = cfg.mode || "off";
    return `<select data-change="${action}" ${extra}>${[["off", "Off"], ["all", "All events"], ["members", "Only events for…"]].map(([v, l]) => `<option value="${v}" ${mode === v ? "selected" : ""}>${l}</option>`).join("")}</select>
      ${mode === "members" ? `<div class="daypick">${this.members.map((m) => `<label class="daychip"><input type="checkbox" data-change="${action}" ${extra} data-member="${m.id}" ${(cfg.members || []).includes(m.id) ? "checked" : ""}><span>${m.avatar} ${esc(m.name)}</span></label>`).join("")}</div>` : ""}`;
  }
  renderRemindersCard() {
    const phones = Object.keys(this._hass.services?.notify || {}).filter((s) => s.startsWith("mobile_app_")).sort();
    const nice = (s) => s.replace(/^mobile_app_/, "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    const cfgs = this.settings.reminder_phones || {};
    return `<section class="card reminders">
      <h2>⏰ Reminders</h2>
      <p class="hint">Set a reminder on any event in the event editor. Home Assistant sends it to the phones below (even with the app closed) and shows it on screens that have reminders turned on.</p>
      <label class="inline">Default for new events <select data-change="setting" data-key="default_reminder">${REMINDERS.map(([v, l]) => `<option value="${v}" ${(this.settings.default_reminder || "") === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>
      <h3>Phones</h3>
      ${phones.length ? phones.map((s) => `<div class="remrow"><b>📱 ${esc(nice(s))}</b>${this._remindersPicker(cfgs[s] || {}, "reminder-phone", `data-service="${s}"`)}</div>`).join("")
        : `<p class="hint">No phones found. Install the Home Assistant app on a phone and log in; it appears here as notify.mobile_app_….</p>`}
      <h3>This screen</h3>
      <div class="remrow"><b>🖥️ Pop up reminders here</b>${this._remindersPicker(this._screenReminders(), "reminder-screen", "")}</div>
      <p class="hint">Each screen chooses for itself (saved on this device).</p>
    </section>`;
  }
  // A reminder going off: show it if this screen wants it.
  _onReminder(r) {
    const cfg = this._screenReminders();
    if (cfg.mode === "off") return;
    if (cfg.mode === "members" && !(r.members || []).some((m) => (cfg.members || []).includes(m))) return;
    this.ui.reminderPop = [...(this.ui.reminderPop || []), r];
    if (this.ui.saver) this.stopSaver();
    this._lastActivity = Date.now();
    if (this.settings.alert_sound !== false) this._chime();
    this.render();
  }
  renderReminderPop() {
    const r = (this.ui.reminderPop || [])[0];
    if (!r) return "";
    return `<div class="alertpop" role="alertdialog" aria-label="Reminder">
      <div class="apcard remcard"><div class="aphead"><span class="apicon">⏰</span><div><b>${esc(r.summary)}</b><small>${esc(r.message || "")}</small></div></div>
        ${this.ui.reminderPop.length > 1 ? `<div class="apbody"><p class="hint">+ ${this.ui.reminderPop.length - 1} more</p></div>` : ""}
        <div class="apbtns"><button class="primary" data-action="reminder-dismiss">OK</button></div></div></div>`;
  }

}
