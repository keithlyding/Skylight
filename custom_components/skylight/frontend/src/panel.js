/* Skylight panel: the <skylight-panel> element: lifecycle, data, actions, layout. Each tab's code lives in its own file. */

import { DEFAULT_APP_NAME, PANEL_VERSION, normHex, withTone, baseOf, INFO_COLORS, LEGACY_VIEWS, viewDays, TABS, WEATHER_ICONS, pad, ymd, parseYmd, addDays, startOfDay, THEMES, THEME_CSS, seasonFor, isNightAt, esc } from "./helpers.js?v=1.49.3";
import { STYLES } from "./styles.js?v=1.49.3";
import { diag, diagStart, diagPrevious, diagCurrent, diagText } from "./diag.js?v=1.49.3";
import { CalendarView } from "./calendar.js?v=1.49.3";
import { WeatherView } from "./weather.js?v=1.49.3";
import { HomeView } from "./home.js?v=1.49.3";
import { ChoresView } from "./chores.js?v=1.49.3";
import { MealsView } from "./meals.js?v=1.49.3";
import { ListsView } from "./lists.js?v=1.49.3";
import { PhotosView } from "./photos.js?v=1.49.3";
import { SettingsView } from "./settings.js?v=1.49.3";
import { PickersView } from "./pickers.js?v=1.49.3";
import { keepAwake } from "./wake.js?v=1.49.3";
import { MlbView } from "./mlb.js?v=1.49.3";
import { TravelView } from "./travel.js?v=1.49.3";
import { NotesView } from "./notes.js?v=1.49.3";

export class SkylightPanel extends HTMLElement {
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
      list: undefined, dialog: null, saver: false, choreDay: startOfDay(new Date()),
    };
    this._eventsKey = "";
    this._shadowBuilt = false;
  }

  // ---------- HA lifecycle ----------
  set hass(hass) {
    diag("hass-update");
    const first = !this._hass;
    this._hass = hass;
    if (first) this._start();
  }
  get hass() { return this._hass; }
  set panel(_p) {}
  set narrow(n) { this._narrow = n; }
  setConfig(config) { this.config = config || {}; }
  getCardSize() { return 12; }

  connectedCallback() { diag("attached"); if (this._hass && !this._unsub) this._start(); }
  // Show a banner when Home Assistant can't be reached (after 10 s, so brief blips don't flash it),
  // and refresh everything once it's back. The data subscription itself resumes automatically.
  _watchConnection() {
    const conn = this._hass.connection;
    if (!conn?.addEventListener || this._connWatched === conn) return;
    this._connWatched = conn;
    this._onConnLost = () => {
      diag("conn-lost");
      if (this._lostAt) return;
      this._lostAt = Date.now();
      clearTimeout(this._lostTimer);
      this._lostTimer = setTimeout(() => { if (this._lostAt) this.render(); }, 10000);
    };
    this._onConnBack = () => {
      diag("conn-back");
      const was = this._lostAt;
      this._lostAt = null; clearTimeout(this._lostTimer);
      if (!was) return;
      this._eventsKey = ""; this._loadEvents(); this._loadForecast(); this._loadAlerts(true);
      if (this.ui.tab === "weather") this._loadWeatherFull(true);
      if (Date.now() - was >= 10000) this._toast("Reconnected to Home Assistant");
      this.render();
    };
    conn.addEventListener("disconnected", this._onConnLost);
    conn.addEventListener("reconnect-error", this._onConnLost);
    conn.addEventListener("ready", this._onConnBack);
    window.addEventListener("offline", this._onConnLost);
  }
  renderConnBanner() {
    if (!this._lostAt || Date.now() - this._lostAt < 10000) return "";
    const since = this.fmtTime(new Date(this._lostAt));
    return `<div class="connbar" role="status">📡 <b>Can't reach Home Assistant</b> — showing what was here at ${since}. Reconnecting…</div>`;
  }

  disconnectedCallback() {
    diag("detached");
    if (this._connWatched) {
      this._connWatched.removeEventListener?.("disconnected", this._onConnLost);
      this._connWatched.removeEventListener?.("reconnect-error", this._onConnLost);
      this._connWatched.removeEventListener?.("ready", this._onConnBack);
      window.removeEventListener("offline", this._onConnLost);
      this._connWatched = null; clearTimeout(this._lostTimer); this._lostAt = null;
    }
    if (this._unsub) { this._unsub.then((u) => u && u()).catch(() => {}); this._unsub = null; }
    if (this._remUnsub) { this._remUnsub.then((u) => u && u()).catch(() => {}); this._remUnsub = null; }
    if (this._onVisible) { document.removeEventListener("visibilitychange", this._onVisible); this._onVisible = null; }
    if (this._onAppError) { window.removeEventListener("error", this._onAppError); window.removeEventListener("unhandledrejection", this._onAppError); this._onAppError = null; }
    clearInterval(this._clockTimer); clearInterval(this._idleTimer); clearInterval(this._slideTimer);
    clearInterval(this._refreshTimer); clearInterval(this._alertTimer);
    if (this._onResize) { window.removeEventListener("resize", this._onResize); this._onResize = null; }
    if (this._ro) { this._ro.disconnect(); this._ro = null; }
    for (const u of Object.values(this._todoSubs)) u.then((f) => f && f()).catch(() => {});
    this._todoSubs = {};
  }

  _start() {
    if (!this.isConnected) return;
    diagStart(`v${PANEL_VERSION} admin=${!!this._hass.user?.is_admin} ${window.innerWidth}x${window.innerHeight} dpr=${window.devicePixelRatio} ${navigator.userAgent}`);
    diag("panel-start");
    if (!window.__lydingDiagHooks) { // page-level events, once per page load
      window.__lydingDiagHooks = true;
      for (const t of ["pagehide", "pageshow", "focus", "blur", "online", "offline"]) window.addEventListener(t, () => diag(t));
      document.addEventListener("visibilitychange", () => diag("visibility", document.visibilityState));
      window.addEventListener("resize", () => diag("resize", `${window.innerWidth}x${window.innerHeight}`));
      window.visualViewport?.addEventListener("resize", () => diag("vv-resize", `${Math.round(window.visualViewport.width)}x${Math.round(window.visualViewport.height)}`));
      window.addEventListener("error", (e) => diag("error", `${e.message} @ ${(e.filename || "").split("/").pop()}:${e.lineno}`));
      window.addEventListener("unhandledrejection", (e) => diag("rejection", e.reason?.message || e.reason));
    }
    this._buildShadow();
    this._unsub = this._hass.connection.subscribeMessage((data) => this._onData(data), { type: "skylight/subscribe" });
    this._unsub.catch((e) => this._fatal(e));
    // Reminders going off right now (each screen decides in Setup whether to show them).
    this._remUnsub = this._hass.connection.subscribeMessage((r) => this._onReminder(r), { type: "skylight/reminder/subscribe" });
    this._remUnsub.catch(() => { this._remUnsub = null; }); // older server: no reminders
    this._watchConnection();
    // Coming back to the app (iPhone: after another app or the lock screen): redraw and refresh, and clear
    // anything left over that could block taps (screensaver, stale pop-up, page scrolled out of place).
    this._onVisible = () => {
      if (document.visibilityState === "hidden") {
        this._hiddenAt = Date.now();
        this.ui.radarShown = false;
        for (const f of this.shadowRoot.querySelectorAll("iframe.wradar")) { diag("radar-unload"); f.remove(); } // free the embedded map's graphics
        return;
      }
      if (!this._hiddenAt) return;
      const away = Date.now() - this._hiddenAt; this._hiddenAt = 0;
      this._lastActivity = Date.now();
      if (this.ui.saver && this.isPhone) this.stopSaver();
      if (away > 30000) { this._eventsKey = ""; this._cvKey = null; this._loadEvents(); this._loadForecast(); }
      this._settlePage();
      this.render();
    };
    document.addEventListener("visibilitychange", this._onVisible);
    // Errors from this app's own code show briefly on screen, so a "frozen" screen can be reported.
    this._onAppError = (ev) => {
      const err = ev.reason || ev.error || ev;
      const where = String(err?.stack || ev.filename || "");
      if (!/\/skylight(-panel\.js|\/src\/)/.test(where)) return;
      const msg = String(err?.message || ev.message || err).slice(0, 140);
      if (msg === this._lastAppError) return; // once per message
      this._lastAppError = msg;
      this._toast(`⚠️ ${this.appName} error: ${msg}`);
    };
    window.addEventListener("error", this._onAppError);
    window.addEventListener("unhandledrejection", this._onAppError);
    this._clockTimer = setInterval(() => this._tickClock(), 10000);
    if (this.screenAwake) keepAwake(true, "screen"); // (the silent-video part starts at the first tap)
    this._refreshTimer = setInterval(() => { this._eventsKey = ""; this._loadEvents(); this._loadForecast(); if (this.ui.tab === "weather" || this.ui.tab === "home") this._loadWeatherFull(); this._loadWxExtra(); }, 5 * 60000);
    this._alertTimer = setInterval(() => this._loadAlerts(), 2 * 60000);
    this._lastActivity = Date.now();
    this._idleTimer = setInterval(() => this._checkIdle(), 15000);
    if (!this._onResize) {
      this._onResize = () => {
        if (this._wasPhone !== undefined && this._wasPhone !== this.isPhone) { this._eventsKey = ""; this.render(); this._loadEvents(); } // rotated / resized across the phone breakpoint
        this._wasPhone = this.isPhone;
        this._fitPhoneHeight();
        this._fitMonth();
        const g = this.$app?.querySelector(".tg-scroll");
        if (!g || !this._tgH) return;
        const hours = g.scrollTop / this._tgH;
        this._fitGrid();
        g.scrollTop = hours * this._tgH;
      };
      window.addEventListener("resize", this._onResize);
      if (window.ResizeObserver) {
        // At most once per frame, and never more than ~3 per second for long (loop brake).
        this._ro = new ResizeObserver(() => {
          if (this._roPending) return;
          this._roPending = true;
          requestAnimationFrame(() => {
            this._roPending = false;
            const now = Date.now();
            this._roTimes = (this._roTimes || []).filter((t) => now - t < 3000); this._roTimes.push(now);
            if (this._roTimes.length > 30) { this._ro?.disconnect(); console.warn("Lyding Strike: size kept changing; stopped watching it"); return; }
            this._onResize?.();
          });
        });
        this._ro.observe(this.$app);
      }
    }
  }

  _fatal(e) {
    this.$app.innerHTML = `<div class="empty"><h2>${this.appName} is not available</h2><p>${esc(e?.message || e)}</p>
      <p>Make sure the ${this.appName} integration is installed and added under Settings → Devices &amp; Services.</p></div>`;
  }

  // Non-admin users (the kitchen tablet, kids' devices) don't get Home Assistant's own sidebar and
  // header: HA's kiosk mode for this browser session, plus the "always hidden" sidebar setting as a
  // fallback on HA versions without kiosk mode. Admins are never affected. Not a security boundary:
  // Home Assistant's user permissions still decide what an account can do.
  // Non-admin screens (e.g. the kitchen tablet): ask Home Assistant to hide its own sidebar/header.
  // Asked at most once per page load (not per panel instance: Home Assistant can rebuild the panel when an
  // app resumes, and re-asking every time could make the two keep re-laying-out each other, freezing all of
  // Home Assistant on a non-admin phone), and only when Home Assistant's sidebar isn't already that way.
  _applyHaChrome() {
    const user = this._hass?.user;
    if (!user || user.is_admin) return;
    const hide = this.settings.hide_ha_sidebar !== false;
    const dock = hide ? "always_hidden" : "docked";
    const asked = (window.__lydingChrome ||= {});
    if (asked.hide === hide) return;
    asked.hide = hide;
    diag("hide-ha-sidebar", hide);
    window.dispatchEvent(new CustomEvent("hass-kiosk-mode", { detail: { enable: hide } }));
    if (this._hass.dockedSidebar !== dock) {
      this.dispatchEvent(new CustomEvent("hass-dock-sidebar", { detail: { dock }, bubbles: true, composed: true }));
    }
  }

  _onData(data) {
    const firstLoad = !this.data;
    this.data = data;
    this._dataRev = (this._dataRev || 0) + 1; // chores may have changed: ask Home Assistant again
    diag("data");
    this._applyHaChrome();
    if (firstLoad) {
      const v = data.settings.default_view || "7day";
      this.ui.view = LEGACY_VIEWS[v] || v;
    }
    if (this.ui.filter && !data.members.find((m) => m.id === this.ui.filter)) this.ui.filter = null;
    this.render();
    this._loadEvents();
    if (firstLoad) { this._loadForecast(); this._loadMealieInfo(); this._loadCalInfo(); this._loadAlerts(); this._loadWxExtra(); }
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
    // Escape hatch: open the panel with ?reset_screen=1 to clear this screen's own settings.
    if (/[?&]reset_screen=1/.test(location.search)) {
      try { for (const k of Object.keys(localStorage)) if (k.startsWith("skylight.")) localStorage.removeItem(k); } catch (e) { /* private mode */ }
    }
    this.shadowRoot.innerHTML = `<style>${STYLES}\n${THEME_CSS}</style><div id="app" class="app"><div class="empty">Loading…</div></div><div id="cook"></div><div id="dialog"></div><div id="saver"></div><div id="dim" aria-hidden="true"></div>`;
    this.$dim = this.shadowRoot.getElementById("dim");
    this._safeAreaFallback();
    // "Follow tablet" dark mode: react when the device switches.
    this._mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    this._mq?.addEventListener?.("change", () => this._applyLook());
    this.$app = this.shadowRoot.getElementById("app");
    this.$dialog = this.shadowRoot.getElementById("dialog");
    this.$saver = this.shadowRoot.getElementById("saver");
    this.$cook = this.shadowRoot.getElementById("cook");
    this.shadowRoot.addEventListener("click", (e) => this._onClick(e));
    this.shadowRoot.addEventListener("focusout", () => this._settlePage()); // keyboard closing
    window.visualViewport?.addEventListener("resize", () => this._settlePage());
    this.shadowRoot.addEventListener("focusin", (e) => { if (e.target.classList?.contains("tinput")) { this._closeTimeLists(); this._openTimeList(e.target); e.target.select(); } });
    this.shadowRoot.addEventListener("pointerdown", (e) => {
      if (!e.target.closest?.(".tpick")) this._closeTimeLists();
      if (!e.target.closest?.(".locfield")) this._clearSugg(); // tapping elsewhere keeps the typed address
    }, true);
    // Every tap on a time box opens its list (focus alone missed taps on a box that was already selected).
    this.shadowRoot.addEventListener("click", (e) => { if (e.target.classList?.contains("tinput")) { this._closeTimeLists(); this._openTimeList(e.target); } });
    // After typing a time on a touch screen, go back to "tap for the list, no keyboard".
    this.shadowRoot.addEventListener("focusout", (e) => { if (e.target.classList?.contains("tinput") && e.target.closest(".tpick.touch")) e.target.readOnly = true; });
    // Swipe left/right to go forward/back on Calendar, Chores and Meals.
    this.shadowRoot.addEventListener("pointerdown", (e) => this._swipeStart(e), { passive: true });
    this.shadowRoot.addEventListener("pointerdown", (e) => diag("tap", e.target.closest?.("[data-action]")?.dataset.action || e.target.tagName?.toLowerCase()), { passive: true, capture: true });
    // iPhone: an up/down drag that starts on the header or the tab bar would rubber-band the whole page.
    // The guard is attached to just those two (see _guardBars) so scrolling anywhere else never waits on it.
    this._barTouchStart = (e) => { const t = e.touches[0]; this._touch0 = t ? [t.clientX, t.clientY] : null; };
    this._barTouchMove = (e) => {
      const t = e.touches[0], s = this._touch0, box = e.currentTarget;
      if (!t || !s || box.scrollHeight > box.clientHeight + 1) return; // e.g. the side menu on a phone on its side can scroll
      if (Math.abs(t.clientY - s[1]) > Math.abs(t.clientX - s[0]) && e.cancelable) e.preventDefault();
    };
    this.shadowRoot.addEventListener("pointerup", (e) => this._swipeEnd(e), { passive: true });
    this.shadowRoot.addEventListener("pointerdown", (e) => this._holdStart(e), { passive: true });
    this.shadowRoot.addEventListener("pointerdown", (e) => this._dragStart(e));
    this.shadowRoot.addEventListener("pointermove", (e) => this._dragMove(e));
    this.shadowRoot.addEventListener("pointerup", (e) => this._dragEnd(e));
    this.shadowRoot.addEventListener("pointercancel", (e) => this._dragEnd(e));
    this.shadowRoot.addEventListener("pointermove", (e) => this._holdMove(e), { passive: true });
    for (const ev of ["pointerup", "pointercancel"]) {
      this.shadowRoot.addEventListener(ev, () => {
        this._holdCancel();
        if (this._holdFired) { this._holdFired = false; this._suppressClickUntil = Date.now() + 150; }
      }, { passive: true });
    }
    // No long-press image menu on the hold-to-delete pictures.
    this.shadowRoot.addEventListener("contextmenu", (e) => { if (e.target.closest?.(".holdable")) e.preventDefault(); });
    this.shadowRoot.addEventListener("pointercancel", () => { this._swipe = null; }, { passive: true });
    this.shadowRoot.addEventListener("change", (e) => this._onChange(e));
    this.shadowRoot.addEventListener("input", (e) => {
      if (e.target.id === "ev-loc") this._locSearch(e.target.value);
      if (e.target.id === "rb-q") {
        const input = e.target; // e.target is cleared once the event finishes
        clearTimeout(this._rbTimer);
        this._rbTimer = setTimeout(() => { if (this.browse && this.browse.query !== input.value) { this.browse.query = input.value; this._browse(); } }, 400);
      }
      if (e.target.id === "search-q") { clearTimeout(this._searchTimer); this._searchTimer = setTimeout(() => this._runSearch(), 200); }
      if (e.target.classList?.contains("tinput")) { // typing: jump the list to the matching time
        const t = this._parseTime(e.target.value, Number((e.target.dataset.hm || "12").split(":")[0]));
        const list = e.target.parentElement.querySelector(".tlist");
        if (t && list && !list.hidden) {
          const btn = list.children[t[0] * 4 + Math.floor(t[1] / 15)];
          if (btn) list.scrollTop = btn.offsetTop - list.offsetTop;
        }
      }
      if (e.target.dataset.emojiSearch) this._emojiSearch(e.target);
    });
    this.shadowRoot.addEventListener("keydown", (e) => {
      if (this.ui.dialog?.type === "pin") { // typing on a keyboard works on the PIN pad too
        if (/^\d$/.test(e.key)) { e.preventDefault(); this._action("pin-key", { dataset: { k: e.key } }); return; }
        if (e.key === "Backspace") { e.preventDefault(); this._action("pin-back", { dataset: {} }); return; }
        if (e.key === "Enter") { e.preventDefault(); this._action("pin-ok", { dataset: {} }); return; }
        if (e.key === "Escape") { e.preventDefault(); this._action("pin-cancel", { dataset: {} }); return; }
      }
      if (e.key === "Enter" && e.target.dataset.enter) { e.preventDefault(); this._action(e.target.dataset.enter, e.target); }
      if ((e.key === "Enter" || e.key === "Escape" || e.key === "Tab") && e.target.classList?.contains("tinput")) this._closeTimeLists();
      if ((e.key === "Escape" || e.key === "Tab" || e.key === "Enter") && e.target.id === "ev-loc") { if (e.key !== "Tab") e.preventDefault(); this._clearSugg(); }
    });
    for (const ev of ["pointerdown", "keydown", "touchstart"]) {
      this.shadowRoot.addEventListener(ev, () => { this._lastActivity = Date.now(); }, { passive: true });
    }
  }

  _swipeStart(e) {
    this._swipe = null;
    // In cook mode a sideways swipe moves between steps.
    if (this.cook?.r && !this.ui.dialog && this.$cook.contains(e.target) && e.isPrimary && !e.target.closest(".ckqr")) {
      this._swipe = { x: e.clientX, y: e.clientY, t: Date.now(), cook: true };
      return;
    }
    if (this.ui.tab === "meals" && this.ui.mealsView === "recipes") return;
    if (!["calendar", "chores", "meals"].includes(this.ui.tab) || this.ui.dialog || this.ui.saver) return;
    if (!e.isPrimary || (e.pointerType === "mouse" && e.button !== 0)) return;
    const t = e.target;
    if (!this.$app.contains(t) || !t.closest(".content") || t.closest("input, select, textarea, .seg, .whourly")) return;
    this._swipe = { x: e.clientX, y: e.clientY, t: Date.now() };
  }
  _swipeEnd(e) {
    const sw = this._swipe;
    this._swipe = null;
    if (!sw) return;
    const dx = e.clientX - sw.x, dy = e.clientY - sw.y, dt = Date.now() - sw.t;
    // A deliberate sideways flick: far enough, mostly horizontal, not a slow drag.
    if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.8 || dt > 800) return;
    const forward = dx < 0;
    this._suppressClickUntil = Date.now() + 400; // don't open the event the swipe started on
    if (sw.cook) { if (this.cook?.r) this._action(forward ? "cook-next" : "cook-prev", { dataset: {} }); return; }
    if (this.ui.tab === "chores") this._action("chore-day", { dataset: { dir: forward ? "1" : "-1" } });
    else this._action(forward ? "next" : "prev", { dataset: {} });
    const c = this.$app.querySelector(".content");
    if (c) { c.classList.remove("swipe-l", "swipe-r"); void c.offsetWidth; c.classList.add(forward ? "swipe-l" : "swipe-r"); }
  }

  _onClick(e) {
    if (this._suppressClickUntil && Date.now() < this._suppressClickUntil) { e.stopPropagation(); e.preventDefault(); return; }
    const el = e.target.closest("[data-action]");
    if (!el) return;
    if (el.classList.contains("backdrop") && e.target !== el) return;
    e.stopPropagation();
    this._run(el.dataset.action, el);
  }
  // Errors are already shown as a toast by _ws (or were a cancelled PIN prompt).
  _run(action, el) {
    // Save/delete buttons can take a few seconds (e.g. Google Calendar): gray the button out and say so,
    // and ignore more taps until it's done so nothing is saved twice.
    const busyText = action.startsWith("save-") ? "Saving…" : action === "delete-event" ? "Deleting…" : null;
    if (busyText) {
      if (this._busyAt && Date.now() - this._busyAt < 30000) return; // (expires, so a lost prompt can't block saving)
      this._busyAt = Date.now();
      el._idleHtml = el.innerHTML; el.disabled = true; el.classList.add("busy"); el.textContent = busyText;
    }
    Promise.resolve(this._action(action, el))
      .catch((err) => { if (err?.code !== "locked") console.debug("Skylight:", err); })
      .finally(() => {
        if (!busyText) return;
        this._busyAt = 0;
        if (el.isConnected) { el.disabled = false; el.classList.remove("busy"); el.innerHTML = el._idleHtml; }
      });
  }

  _onChange(e) {
    const el = e.target;
    if (el.dataset.change) this._run(el.dataset.change, el);
  }

  async _ws(msg) {
    diag("ws", msg.type);
    try { return await this._hass.callWS(msg); }
    catch (err) {
      if (err?.code === "locked") {
        // The server says this screen is locked: ask for the PIN, then try once more.
        this._unlockUntil = 0;
        if (await this.requestUnlock()) {
          try { return await this._hass.callWS(msg); }
          catch (err2) { this._toast(err2?.message || String(err2)); throw err2; }
        }
        this.render(); // undo the unsaved change on screen
        throw err;
      }
      this._toast(err?.message || String(err)); throw err;
    }
  }
  _set(key, value) { return this._ws({ type: "skylight/set", key, value }); }

  _toast(text) {
    const t = document.createElement("div");
    t.className = "toast"; t.textContent = text;
    this.shadowRoot.appendChild(t);
    setTimeout(() => t.remove(), 4000);
  }

  // Days shown on the Today screen; remembered per device (tablet vs phone).
  get homeAgenda() {
    if (this._homeAgenda === undefined) {
      // First visit on a phone: Agenda reads best on a narrow screen.
      try { const v = localStorage.getItem("skylight.homeView"); this._homeAgenda = v ? v === "agenda" : this.isPhone; } catch (e) { this._homeAgenda = false; }
    }
    return this._homeAgenda;
  }
  set homeAgenda(v) {
    this._homeAgenda = v;
    try { localStorage.setItem("skylight.homeView", v ? "agenda" : "grid"); } catch (e) { /* private mode */ }
  }
  get radarLayer() {
    if (this._radarLayer === undefined) { try { this._radarLayer = localStorage.getItem("skylight.radarLayer") || "radar"; } catch (e) { this._radarLayer = "radar"; } }
    return this._radarLayer;
  }
  set radarLayer(v) {
    this._radarLayer = v;
    try { localStorage.setItem("skylight.radarLayer", v); } catch (e) { /* private mode */ }
  }
  get homeDays() {
    if (!this._homeDays) {
      try { this._homeDays = Number(localStorage.getItem("skylight.homeDays")) || 3; } catch (e) { this._homeDays = 3; }
    }
    return this.isPhone ? Math.min(this._homeDays, 3) : this._homeDays;
  }
  // Phone-width screens (e.g. the Home Assistant app on a phone) get a compact layout.
  // The display name from Setup (default "Lyding Strike"); HTML-escaped for templates.
  get appName() { return esc((this.settings?.app_name || "").trim() || DEFAULT_APP_NAME); }
  get isPhone() { return !!window.matchMedia?.("(max-width: 600px), (max-height: 500px) and (orientation: landscape)").matches; }
  // 5- and 7-day grids don't fit on a phone: show 3 days there (the saved choice is kept for bigger screens).
  get calView() { const v = this.ui.view; return this.isPhone && (v === "5day" || v === "7day") ? "3day" : v; }
  set homeDays(n) {
    this._homeDays = n;
    try { localStorage.setItem("skylight.homeDays", String(n)); } catch (e) { /* private mode */ }
  }

  // ---------- data helpers ----------
  get members() { return this.data?.members || []; }
  get settings() { return this.data?.settings || {}; }
  member(id) { return this.members.find((m) => m.id === id); }

  // ---------- actions ----------
  async _action(action, el) {
    const d = el.dataset;
    const D = this.data;
    switch (action) {
      // navigation
      case "time-type": { // switch a time box to typing (opens the keyboard)
        const input = this.shadowRoot.getElementById(d.for);
        if (input) { input.readOnly = false; input.focus(); input.select(); }
        break;
      }
      case "note-new": this.openNoteDialog(); break;
      case "note-by": this.ui.dialog.by = this.ui.dialog.by === d.id ? null : d.id; this.renderDialog(); break;
      case "note-exp": this.ui.dialog.expires = d.v; this.renderDialog(); break;
      case "note-color": this.ui.dialog.color = d.c; this.renderDialog(); break;
      case "note-save": await this.saveNote(); break;
      case "note-delete": if (confirm("Remove this note?")) await this._ws({ type: "skylight/note/delete", note_id: d.id }); break;
      case "mlb-open": this.ui.tab = "team"; this._resetScroll = true; this.render(); this._loadMlbTeam(); this._loadMlb(); break;
      case "mlb-refresh": this._loadMlbTeam(); this._loadMlb(); break;
      case "wx-where": this._setWxWhere(d.where); break;
      case "wx-here-retry": this.wxHereErr = null; this._hereErrAt = 0; this.render(); this._loadWeatherFull(true); break;
      case "radar-show": this.ui.radarShown = true; this.render(); break;
      case "diag-send": {
        const text = diagText(diagPrevious()) + "\n\n--- this session so far ---\n" + diagText(diagCurrent());
        try { await this._hass.callWS({ type: "skylight/diag/report", text }); this._toast("Sent: Settings → System → Logs in Home Assistant"); }
        catch (e) { this._toast(`Couldn't send: ${e.message || e}`); }
        break;
      }
      case "chores-mode": this.ui.choresMode = d.mode; this._resetScroll = true; this.render(); break;
      case "tab": if (d.tab === "progress") { d.tab = "chores"; this.ui.choresMode = "progress"; } else if (d.tab === "chores") this.ui.choresMode = "day";
        if (d.tab === "photos") d.tab = "settings";
        if (d.tab === "settings") this._loadCalInfo(); if (this.ui.tab === "settings" && d.tab !== "settings") this.relock(); if (d.tab === "lists" && this.ui.tab !== "lists") { this.ui.list = undefined; this.ui.listArrange = false; } this.ui.tab = d.tab; this._resetScroll = true; this.render(); if (d.tab === "calendar" || d.tab === "home") this._loadEvents(); break;
      case "view": this.ui.view = d.view; this.render(); this._loadEvents(); break;
      case "filter": this.ui.filter = this.ui.filter === d.member ? null : d.member || null; this.render(); break;
      case "today": this.ui.anchor = startOfDay(new Date()); this.render(); this._loadEvents(); break;
      case "prev": case "next": {
        const dir = action === "next" ? 1 : -1;
        const a = this.ui.anchor;
        if (this.ui.tab === "meals") { this.ui.anchor = addDays(a, dir * 7); this.render(); break; }
        this.ui.anchor = this.calView === "month" ? new Date(a.getFullYear(), a.getMonth() + dir, 1)
          : addDays(a, dir * (this.calView === "agenda" ? 14 : viewDays(this.calView) || 7));
        this.render(); this._loadEvents(); break;
      }
      case "goto-day": this.ui.anchor = parseYmd(d.date); this.ui.view = "day"; this.ui.tab = "calendar"; this.render(); this._loadEvents(); break;
      case "close": if (this.ui.dialog?.type === "pin") this.ui.dialog.finish(null); else this.closeDialog(); break;

      // calendar events
      case "new-event": this.openEventDialog(null, d.date, d.hour !== undefined ? Number(d.hour) : undefined); break;
      case "home-days":
        if (d.days === "agenda") this.homeAgenda = true;
        else { this.homeAgenda = false; this.homeDays = Number(d.days); }
        this.render(); this._loadEvents(); break;
      case "open-event": {
        const ev = this.visibleEvents()[Number(d.idx)];
        if (ev?.occasion) { this._toast("Birthdays and anniversaries are changed in Setup → Birthdays & anniversaries"); break; }
        this.openEventDialog(ev); break;
      }
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
      case "icon-open": this.ui.dialog.iconOpen = !this.ui.dialog.iconOpen; this.renderDialog(); break;
      case "icon-pick": this.ui.dialog.icon = d.icon; this.ui.dialog.iconOpen = false; this.renderDialog(); break;
      case "backup-export": {
        const b = await this._ws({ type: "skylight/backup/export" });
        const blob = new Blob([JSON.stringify(b, null, 2)], { type: "application/json" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob); a.download = `${(this.settings?.app_name || DEFAULT_APP_NAME).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "family-display"}-backup-${ymd(new Date())}.json`;
        document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
        this._toast("Backup downloaded"); break;
      }
      case "backup-pick": this.shadowRoot.getElementById("backup-file")?.click(); break;
      case "backup-import": {
        const file = el.files?.[0]; el.value = "";
        if (!file) break;
        let backup;
        try { backup = JSON.parse(await file.text()); } catch (e) { this._toast("That file isn't a backup from this display."); break; }
        const when = backup?.created ? new Date(backup.created).toLocaleString() : "an unknown date";
        if (!confirm(`Restore the backup from ${when}?\n\nThis replaces family members, chores, lists, meals, birthdays and settings on every screen.`)) break;
        await this._ws({ type: "skylight/backup/import", backup });
        this._urlCache = null; this._eventsKey = ""; this._loadEvents();
        this._toast("Backup restored"); break;
      }
      case "new-occasion": this.openOccasionDialog(); break;
      case "edit-occasion": this.openOccasionDialog((D.occasions || []).find((o) => o.id === d.id)); break;
      case "occ-kind": this.ui.dialog.kind = d.kind; this.renderDialog(); break;
      case "save-occasion": await this.saveOccasion(); break;
      case "delete-occasion": if (confirm(`Delete "${this.ui.dialog.occasion.title}"?`)) { await this._set("occasions", (D.occasions || []).filter((o) => o.id !== this.ui.dialog.occasion.id)); this.closeDialog(); } break;
      case "member-role": this.ui.dialog.role = d.role; if (d.role === "adult" && this.ui.dialog.today === "chores") this.ui.dialog.today = "none"; this.renderDialog(); break;
      case "move-chores": {
        const m = this.ui.dialog.member, to = this.shadowRoot.getElementById("m-movechores")?.value;
        if (!m || !to) break;
        await this._set("chores", D.chores.map((c) => (c.member_id === m.id ? { ...c, member_id: to } : c)));
        this._toast("Chores moved"); this.renderDialog(); break;
      }
      case "roles-reviewed": await this._set("settings", { roles_review: false }); break;
      case "todo-owner": {
        const owners = { ...(D.todo_owners || {}) };
        if (el.value) owners[d.entity] = el.value; else delete owners[d.entity];
        await this._set("todo_owners", owners); break;
      }
      case "member-today": this.ui.dialog.today = el.value; this.renderDialog(); break;
      case "home-item": await this._listToggle(d.list, d.item); break;
      case "home-add": {
        const input = this.shadowRoot.querySelector(`input.hadd[data-list="${CSS.escape(d.list)}"]`);
        const text = input?.value.trim(); if (!text) return;
        input.value = "";
        await this._listAdd(d.list, text);
        this.shadowRoot.querySelector(`input.hadd[data-list="${CSS.escape(d.list)}"]`)?.focus();
        break;
      }
      case "wx-sensor": {
        const set = new Set(this.settings.weather_sensors || []);
        el.checked ? set.add(d.entity) : set.delete(d.entity);
        await this._set("settings", { weather_sensors: [...set] }); break;
      }
      case "retry-render":
        this.ui.dialog = null; this.ui.alertPop = null; this.ui.reminderPop = null; this.$dialog.innerHTML = "";
        this.render(); break;
      case "reload-page": location.reload(); break;
      case "screen-awake":
        try { if (el.value) localStorage.setItem("skylight.awake", "1"); else localStorage.removeItem("skylight.awake"); } catch (e) { /* private mode */ }
        keepAwake(!!el.value, "screen"); break;
      case "screen-scheme":
        try { if (el.value) localStorage.setItem("skylight.screenScheme", el.value); else localStorage.removeItem("skylight.screenScheme"); } catch (e) { /* private mode */ }
        this._applyLook(); this.render(); break;
      case "reminder-dismiss": this.ui.reminderPop = (this.ui.reminderPop || []).slice(1); this.render(); break;
      case "reminder-screen": {
        const cfg = this._screenReminders();
        if (d.member) { const s = new Set(cfg.members || []); if (el.checked) s.add(d.member); else s.delete(d.member); cfg.members = [...s]; }
        else cfg.mode = el.value;
        try { localStorage.setItem("skylight.reminderScreen", JSON.stringify(cfg)); } catch (e) { /* private mode */ }
        this.render(); break;
      }
      case "reminder-phone": {
        const phones = JSON.parse(JSON.stringify(this.settings.reminder_phones || {}));
        const cfg = phones[d.service] || { mode: "off", members: [] };
        if (d.member) { const s = new Set(cfg.members || []); if (el.checked) s.add(d.member); else s.delete(d.member); cfg.members = [...s]; }
        else cfg.mode = el.value;
        phones[d.service] = cfg;
        await this._set("settings", { reminder_phones: phones });
        break;
      }
      case "alert-dismiss": this._markAlertsSeen(this.ui.alertPop || []); this.ui.alertPop = null; this.render(); break;
      case "alert-details": this._markAlertsSeen(this.ui.alertPop || []); this.ui.alertPop = null; this.ui.tab = "weather"; this._resetScroll = true; this.render(); break;
      case "radar-layer": this.radarLayer = d.layer; this.render(); break;
      case "wx-day": this.ui.wxOpen = this.ui.wxOpen === d.day ? null : d.day; this.render(); break;
      case "rp": {
        const r = this.ui.dialog.rep, f = d.field;
        r[f] = f === "interval" || f === "count" ? Math.max(1, Number(el.value) || 1) : el.value;
        if (f === "end" && r.end === "until" && !r.until) r.until = ymd(addDays(new Date(), 90));
        this.renderDialog(); break;
      }
      case "rp-day": {
        const days = this.ui.dialog.rep.days, i = Number(d.day);
        el.checked ? days.add(i) : days.delete(i);
        if (!days.size) days.add(i); // keep at least one day
        this.renderDialog(); break;
      }
      case "time-pick": {
        this._setTime(d.for, Number(d.h), Number(d.m));
        this._closeTimeLists();
        if (d.for === "ev-start") this._shiftEnd();
        break;
      }
      case "time-norm": {
        // Typed a time: tidy it ("410p" -> "4:10 PM"); keep the old one if it isn't a time.
        const t = this._readTime(el.id);
        const wasStart = el.id === "ev-start";
        this._setTime(el.id, t[0], t[1]);
        if (wasStart) this._shiftEnd();
        break; // the list stays open: a tap on it arrives after this (blur fires first)
      }
      case "search-open": this.openSearch(); break;
      case "search-go": {
        this.closeDialog();
        this.ui.tab = "calendar"; this.ui.view = "day"; this.ui.anchor = parseYmd(d.date);
        this.render(); this._loadEvents(); break;
      }
      case "who": {
        const w = this.ui.dialog.who;
        w.has(d.member) ? w.delete(d.member) : w.add(d.member);
        this.renderDialog(); break;
      }
      case "ev-shift": this._shiftEnd(); break;
      case "event-allday": this.shadowRoot.querySelectorAll(".timefield").forEach((x) => { x.hidden = el.checked; }); break;

      // members
      case "new-member": this.openMemberDialog(); break;
      case "edit-member": this.openMemberDialog(this.member(d.member)); break;
      case "pick-color": this.ui.dialog.color = d.color; this.renderDialog(); break;
      case "color-wheel": if (el.value !== this.ui.dialog.color) { this.ui.dialog.color = el.value; this.renderDialog(); } break;
      case "color-hex": {
        const hex = normHex(el.value);
        if (hex === this.ui.dialog.color) break; // Enter already applied it; ignore the blur that follows
        if (!hex) { this._toast("Use a hex color like #3a7bd5"); return; }
        this.ui.dialog.color = hex; this.renderDialog(); break;
      }
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
      case "alert-type": {
        const hide = new Set(this.settings.alert_hide || []);
        if (el.checked) hide.delete(d.type); else hide.add(d.type);
        await this._set("settings", { alert_hide: [...hide] });
        break;
      }
      case "setting": {
        let v = el.type === "checkbox" ? el.checked : el.value;
        if (el.type === "number" || d.num) v = Number(v);
        if (v === "") v = null;
        await this._set("settings", { [d.key]: v });
        if (d.key === "weather_entity") setTimeout(() => this._loadForecast(), 300);
        if (d.key === "weather_alerts") setTimeout(() => this._loadAlerts(true), 300);
        if (d.key === "weather_extra") setTimeout(() => this._loadWxExtra(true), 300);
        if (d.key === "leave_by" || d.key === "waze_region") { this.travel = null; this._travelKey = ""; }
        if (d.key === "mlb_team") { this.mlbToday = null; this.mlbTeamData = null; this._mlbAt = 0; setTimeout(() => this._loadMlb(), 300); }
        if (d.key === "week_start") { this._eventsKey = ""; }
        break;
      }

      // chores
      case "toggle-chore": {
        const chore = D.chores.find((c) => c.id === d.chore);
        const day = d.date ? parseYmd(d.date) : this.ui.choreDay;
        const wasDone = chore && this._choreState(chore, day)?.done;
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
      case "chore-every": this._syncChoreDialog(); break;
      case "save-chore": await this.saveChore(); break;
      case "delete-chore": await this._set("chores", D.chores.filter((c) => c.id !== this.ui.dialog.chore.id)); this.closeDialog(); break;


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
      case "view-recipe": this.closeDialog(); await this.openCook(d.recipe); break;
      case "cook": await this.openCook(d.recipe); break;
      case "cook-close": this.closeCook(); break;
      case "recipe-delete": {
        if (!confirm(`Delete "${d.name}" from Mealie?\n\nThis removes the recipe for everyone and can't be undone.`)) return;
        try { await this._ws({ type: "skylight/mealie/delete_recipe", recipe: d.recipe }); }
        catch (e) { return; } // _ws already showed the error
        if (this.browse?.items) this.browse.items = this.browse.items.filter((x) => (x.slug || x.id) !== d.recipe);
        if (this.browse?.total) this.browse.total -= 1;
        this._delReveal = null;
        if (this.cook?.key === d.recipe || this.cook?.r?.slug === d.recipe) this.closeCook();
        this._todayMeals = null; await this._reloadMealie();
        this.render(); break;
      }
      case "cook-qr": await this._cookQr(); break;
      case "cook-ing": { const k = Number(d.k), g = this.cook.got; g.has(k) ? g.delete(k) : g.add(k); this.renderCook(); break; }
      case "cook-step": this.cook.step = Number(d.k); this.renderCook(); break;
      case "cook-next": case "cook-prev": {
        const n = this.cook.r.steps.length;
        this.cook.step = Math.max(0, Math.min(n - 1, this.cook.step + (action === "cook-next" ? 1 : -1)));
        this.cook.scrollStep = true; this.renderCook(); break;
      }
      case "cook-serv": {
        const c = this.cook, dd = Number(d.d);
        c.servings = dd === 0 ? c.r.servings : Math.max(1, Math.round(c.servings) + dd);
        this.renderCook(); break;
      }
      case "cook-mult": this.cook.mult = Number(d.m); this.renderCook(); break;
      case "meals-view": this.ui.mealsView = d.view; this._resetScroll = true; this.render(); break;
      case "rb-search": this.browse.query = el.value || this.shadowRoot.getElementById("rb-q")?.value || ""; await this._browse(); break;
      case "rb-cat": this.browse.category = d.cat; await this._browse(); break;
      case "rb-more": await this._browse(true); break;
      case "recipe-to-list": {
        const ent = this.shadowRoot.getElementById("recipe-list").value;
        const items = [...this.shadowRoot.querySelectorAll(".ing-check:checked")].map((i) => i.value);
        if (!ent || !items.length) return;
        for (const item of items) await this._hass.callService("todo", "add_item", { item }, { entity_id: ent });
        this._toast(`Added ${items.length} item${items.length > 1 ? "s" : ""} to ${this.entityName(ent)}`);
        break;
      }
      case "rb-sort": this.browse.sort = el.value; await this._browse(); break;
      case "rb-tag": this.browse.tag = el.value; await this._browse(); break;
      case "mealie-phone-url": await this._set("settings", { mealie_phone_url: el.value.trim() || null }); break;
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
      case "list-arrange": this.ui.listArrange = !this.ui.listArrange; this.render(); break;
      case "list-move": await this._moveList(d.list, Number(d.dir)); break;
      case "add-item": if (this._isTodo()) { await this._todoAction("add"); break; } {
        const input = this.shadowRoot.getElementById("newitem");
        const text = input.value.trim(); if (!text) return;
        input.value = "";
        await this._ws({ type: "skylight/list/item/add", list_id: this.ui.list, text });
        this.shadowRoot.getElementById("newitem")?.focus(); break;
      }
      case "item-move": { // keyboard/assistive fallback: data-dir up/down
        const open = this._openIds();
        const k = open.indexOf(d.item);
        if (k >= 0) await this._moveItem(d.item, k + (d.dir === "up" ? -1 : 1));
        break;
      }
      case "toggle-item": if (this._isTodo()) { await this._todoAction("toggle", d.item); break; } await this._listToggle(this.ui.list, d.item); break;
      case "delete-item": if (this._isTodo()) { await this._todoAction("delete", d.item); break; } await this._ws({ type: "skylight/list/item/delete", list_id: this.ui.list, item_ids: [d.item] }); break;
      case "clear-done": if (this._isTodo()) { await this._todoAction("clear"); break; } await this._ws({ type: "skylight/list/item/delete", list_id: this.ui.list, done: true }); break;
      case "new-list": this.openListDialog(); break;
      case "edit-list": this.openListDialog(D.lists.find((l) => l.id === d.list)); break;
      case "save-list": await this.saveList(); break;
      case "delete-list": {
        const l = this.ui.dialog.list;
        if (!confirm(`Delete the list "${l.name}"?`)) return;
        await this._ws({ type: "skylight/list/delete", list_id: l.id }); this.ui.list = undefined; this.closeDialog(); break;
      }

      // photos
      case "pin-key": { const g = this.ui.dialog; if (g?.type === "pin" && g.entry.length < 8) { g.entry += d.k; g.error = ""; this.renderDialog(); } break; }
      case "pin-back": { const g = this.ui.dialog; if (g?.type === "pin") { g.entry = g.entry.slice(0, -1); this.renderDialog(); } break; }
      case "pin-ok": if (this.ui.dialog?.type === "pin") await this.ui.dialog.submit(); break;
      case "pin-cancel": if (this.ui.dialog?.type === "pin") this.ui.dialog.finish(null); break;
      case "pin-unlock": await this.requestUnlock(); break;
      case "pin-lock": this.relock(); this.render(); break;
      case "pin-setup": await this.pinSetup(); break;
      case "pin-change": await this.pinChange(); break;
      case "pin-remove": await this.pinRemove(); break;
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


  _celebrate(r, emoji = "🎉") {
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
  closeDialog() { this.ui.dialog = null; this.$dialog.innerHTML = ""; this._settlePage(); }
  // iPhone: the on-screen keyboard scrolls the whole page up and often leaves it there, which cuts off
  // the top, leaves a gap under the tab bar and makes taps land in the wrong place. Put it back.
  _settlePage() {
    clearTimeout(this._settleTimer);
    this._settleTimer = setTimeout(() => {
      const typing = this.shadowRoot.activeElement?.matches?.("input, textarea, select, [contenteditable]");
      if (typing) return;
      if (window.scrollY || window.scrollX || document.scrollingElement?.scrollTop) window.scrollTo(0, 0);
      if (document.scrollingElement) document.scrollingElement.scrollTop = 0;
      this._fitPhoneHeight();
    }, 250);
  }
  renderDialog() {
    if (this._renderingDialog) return; // a blur/change fired while replacing the dialog
    this._renderingDialog = true;
    try { this._renderDialog(); } finally { this._renderingDialog = false; }
  }
  _renderDialog() {
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
    // Focus the first box only where there's a real keyboard; on touch screens wait for a tap, so the
    // on-screen keyboard doesn't pop up every time a dialog opens. (Search always focuses: you open it to type.)
    const first = this.$dialog.querySelector("[data-autofocus]");
    if (first && (first.dataset.autofocus === "always" || !window.matchMedia?.("(pointer: coarse)").matches)) first.focus();
  }
  _openDialog(dlg) { this.ui.dialog = dlg; this.$dialog.innerHTML = ""; this.renderDialog(); }

  // ---------- screensaver ----------
  // Today-screen agenda scrolls inside its own box; chores column matches its height.
  _fitAgenda() {
    const a = this.$app?.querySelector(".hagenda");
    if (!a || window.innerWidth <= 900) return;
    const content = this.$app.querySelector(".content");
    const bottom = content.getBoundingClientRect().bottom - parseFloat(getComputedStyle(content).paddingBottom || 0);
    const h = Math.max(360, Math.floor(bottom - a.getBoundingClientRect().top - content.scrollTop - 2));
    a.style.height = `${h}px`;
    const side = this.$app.querySelector(".hside");
    if (side) side.style.maxHeight = `${h}px`;
  }

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
    this._fitEvents(tg);
  }
  // Events whose text doesn't fit their box (e.g. a 1-hour event on a short screen) switch to one line,
  // "title  time", and drop the time if even that doesn't fit. Measured, so it suits every screen size.
  _fitEvents(root = this.$app) {
    // The lines inside are squeezed (not the box), so check each visible line for clipped text.
    const clipped = (ev) => [...ev.children].some((c) => c.offsetParent && c.scrollHeight > c.clientHeight + 1);
    for (const ev of root?.querySelectorAll(".tg-ev") || []) {
      ev.classList.remove("oneline", "tiny");
      if (ev.classList.contains("short") || !clipped(ev)) continue;
      ev.classList.add("oneline");
      if (clipped(ev)) ev.classList.add("tiny");
    }
  }
  // Default position: always the day window (7am-8pm), whatever the time.
  _scrollGridHome(grid = this.$app?.querySelector(".tg-scroll")) {
    if (!grid) return;
    const [a] = this._tgWindow || [7, 20];
    this._tgScroll = a; // hours
    grid.scrollTop = a * (this._tgH || 40);
  }

  // iPhones with a home indicator and rounded corners need room at the bottom. Inside the Home
  // Assistant app iOS can report that safe area as 0; then reserve it ourselves.
  _safeAreaFallback() {
    const ios = /iPhone|iPod/.test(navigator.userAgent);
    if (!ios) return;
    const probe = document.createElement("div");
    probe.style.cssText = "position:fixed;visibility:hidden;padding-bottom:env(safe-area-inset-bottom)";
    this.shadowRoot.appendChild(probe);
    const reported = parseFloat(getComputedStyle(probe).paddingBottom) || 0;
    probe.remove();
    // Home-indicator iPhones are 812pt or taller in either direction; older ones (Home button) need nothing.
    const tall = Math.max(screen.width, screen.height) >= 812;
    if (!reported && tall) this.style.setProperty("--safe-bottom", "34px"); // Apple's home-indicator inset (portrait)
    this._safeReported = reported;
    this._fitPhoneHeight();
    setTimeout(() => this._fitPhoneHeight(), 600); // again once Home Assistant has laid out the page
  }
  // On phones, size the app to the space really left below where the panel starts. 100dvh can be taller
  // than the area the Home Assistant iPhone app gives the panel, which pushed the bottom bar off screen.
  // Uses only the window size and the panel's position (never its own content), so it can't feed back on itself.
  _fitPhoneHeight() {
    if (!this.isPhone) { this.style.removeProperty("--app-h"); return; }
    // Brake: if measuring keeps changing the layout, stop adjusting instead of keeping the phone busy.
    // More than 20 fits in 2 seconds is never normal.
    const now = Date.now();
    this._fitTimes = (this._fitTimes || []).filter((t) => now - t < 2000);
    this._fitTimes.push(now);
    if (this._fitStopped || this._fitTimes.length > 20) {
      if (!this._fitStopped) { diag("fit-brake"); this._fitStopped = true; console.warn("Lyding Strike: layout kept changing; stopped re-measuring"); }
      return;
    }
    // (v1.37-1.42 also tried to reach up behind the iPhone status bar and checked it with a hit-test
    // through nested shadow roots. On iPhones that check could loop forever and freeze all of Home
    // Assistant, and the HA app keeps that strip for itself anyway, so it was removed in v1.42.1.)
    const top = Math.max(0, Math.round(this.getBoundingClientRect().top + (window.scrollY || 0)));
    const h = Math.round(window.innerHeight - top);
    if (h > 200 && this.style.getPropertyValue("--app-h") !== `${h}px`) this.style.setProperty("--app-h", `${h}px`);
  }

  // Theme, light/dark, seasonal accent and the night dim overlay. Cheap; runs on every render and clock tick.
  get screenAwake() { try { return localStorage.getItem("skylight.awake") === "1"; } catch (e) { return false; } }
  _screenScheme() {
    try { return localStorage.getItem("skylight.screenScheme") || ""; } catch (e) { return ""; }
  }
  _applyLook() {
    if (!this.data) return;
    const s = this.settings, now = new Date();
    const sun = this._hass.states["sun.sun"]?.attributes || {};
    const rise = sun.next_rising ? new Date(sun.next_rising) : null, set = sun.next_setting ? new Date(sun.next_setting) : null;
    const night = isNightAt(s, now, rise, set);
    // A screen can override the family setting for itself (e.g. a phone that follows its own Dark Mode).
    // Light/dark is per screen (saved on this device): follow the device, always light/dark, or dark at night.
    const mode = this._screenScheme() || "follow";
    const dark = mode === "dark" || (mode === "night" && night) || (mode === "follow" && !!this._mq?.matches);
    const theme = THEMES[s.theme] ? s.theme : "warm";
    if (this.dataset.theme !== theme) this.dataset.theme = theme;
    if (this.dataset.scheme !== (dark ? "dark" : "light")) this.dataset.scheme = dark ? "dark" : "light";
    const accent = s.seasonal ? seasonFor(now).accent : "";
    if (accent) this.style.setProperty("--accent", accent); else this.style.removeProperty("--accent");
    // Without a brightness entity, dim pixels with an overlay at night (also over the photo screensaver).
    const overlay = s.night_dim && !s.brightness_entity && night;
    const level = Math.min(0.85, Math.max(0, 1 - Number(s.night_brightness ?? 20) / 100));
    if (this.$dim) {
      this.$dim.classList.toggle("on", !!overlay);
      const op = overlay ? String(level) : "";
      if (this.$dim.style.opacity !== op) this.$dim.style.opacity = op;
    }
  }

  _tickClock() {
    this._applyLook();
    const now = new Date();
    const t = this.fmtTime(now);
    const dt = now.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
    this.shadowRoot.querySelectorAll(".tg-now").forEach((l) => { l.style.top = `calc(var(--h) * ${(now.getHours() + now.getMinutes() / 60).toFixed(3)})`; });
    for (const [id, v] of [["clock", t], ["date", dt], ["sv-time", t], ["sv-date", dt]]) {
      const el = this.shadowRoot.getElementById(id); if (el) el.textContent = v;
    }
    // Countdowns, progress bars and dimming of finished events move on once a minute.
    // (Remember the minute before redrawing: drawing calls this again.)
    const minute = now.getHours() * 60 + now.getMinutes();
    const turned = this._lastMinute !== undefined && minute !== this._lastMinute;
    this._lastMinute = minute;
    if (turned && !this.ui.dialog && !this.ui.saver && (this.ui.tab === "home" || this.ui.tab === "calendar" || this.ui.tab === "team")) this.render();
    this._mlbMaybe();
    this._travelMaybe();
    // roll over "today" at midnight
    if (this._lastDay && this._lastDay !== ymd(now)) { this.ui.choreDay = startOfDay(now); this._eventsKey = ""; this.render(); this._loadEvents(); this._loadForecast(); }
    this._lastDay = ymd(now);
  }

  // ---------- rendering ----------
  // Never fail silently: if drawing the screen throws, show what happened with Try again / Reload
  // (otherwise the app looks frozen while the rest of Home Assistant keeps working).
  render() {
    const t0 = performance.now();
    try {
      this._render(); this._renderError = null;
      const ms = Math.round(performance.now() - t0);
      diag("render", this.ui.tab); if (ms > 150) diag("slow-render", `${this.ui.tab} ${ms}ms`);
    } catch (e) {
      diag("render-error", e?.message || e);
      console.error("Lyding Strike: render failed", e);
      this._renderError = e;
      if (this.$app) this.$app.innerHTML = `<div class="empty"><h2>Something went wrong drawing this screen</h2>
        <p class="hint">${esc(String(e?.message || e))}</p><p class="hint">${esc(String(e?.stack || "").split("\n").slice(0, 3).join(" · "))}</p>
        <div class="row" style="justify-content:center"><button class="primary" data-action="retry-render">Try again</button><button data-action="reload-page">Reload</button></div></div>`;
    }
  }
  _render() {
    if (!this.$app || !this.data) return;
    this._ensureChoreView();
    const scroll = this._resetScroll ? 0 : this.$app.querySelector(".content")?.scrollTop || 0;
    // Areas that scroll on their own (e.g. the Today screen's right column) keep their place too,
    // so checking something off doesn't jump back to the top. A tab switch starts fresh.
    const KEEP = [".hside", ".hagenda", ".tg-adgrid", "header .members", ".checklist", ".chores", ".lists"];
    const kept = this._resetScroll ? [] : KEEP.flatMap((sel) => [...this.$app.querySelectorAll(sel)].map((el, i) => [sel, i, el.scrollTop, el.scrollLeft]))
      .filter(([, , t, l]) => t || l);
    this._resetScroll = false;
    const active = this.shadowRoot.activeElement;
    const focusId = active?.id;
    // Keep text being typed in the main screen (not dialogs) across re-renders.
    const typing = active && active.tagName === "INPUT" && active.id && this.$app.contains(active)
      ? { id: active.id, value: active.value, pos: active.selectionStart } : null;
    const tg = this.$app.querySelector(".tg-scroll");
    if (tg && this._tgH) this._tgScroll = tg.scrollTop / this._tgH; // hours
    const prevKey = this._tgKey;
    const tab = this.ui.tab;
    const body = {
      home: () => this.renderHome(), weather: () => this.renderWeather(), calendar: () => this.renderCalendar(), chores: () => this.renderChores(), progress: () => this.renderProgress(),
      meals: () => this.renderMeals(), lists: () => this.renderLists(), photos: () => this.renderPhotos(),
      settings: () => this.renderSettings(), team: () => this.renderTeam(),
    }[tab]();
    this._applyLook();
    if (this._drag) return; // don't redraw under a finger that's dragging an item
    clearTimeout(this._dropTimer);
    const itemTops = tab === "lists" ? this._snapshotItems() : null;
    this.$app.innerHTML = `
      <nav class="rail">
        <div class="logo" title="${this.appName}">⚡</div>
        ${TABS.map(([id, label, icon]) => `<button class="tab ${tab === id ? "active" : ""}" data-action="tab" data-tab="${id}"><ha-icon icon="${icon}"></ha-icon><span>${label}${id === "settings" && this.pinSet ? ` <i class="lockmark" title="${this.unlocked ? "Unlocked" : "Locked"}">${this.unlocked ? "🔓" : "🔒"}</i>` : ""}</span></button>`).join("")}
      </nav>
      <main>
        ${this.renderHeader()}
        ${this.renderConnBanner()}
        ${this.renderAlertBanner()}
        <div class="content">${body}</div>
      </main>${this.renderAlertPopup()}${this.renderReminderPop()}`;
    const c = this.$app.querySelector(".content"); if (c) c.scrollTop = scroll;
    const restore = () => { for (const [sel, i, t, l] of kept) { const el = this.$app.querySelectorAll(sel)[i]; if (el) { el.scrollTop = t; el.scrollLeft = l; } } };
    restore();
    if (kept.length) requestAnimationFrame(restore); // again once heights are fitted (e.g. the Today column)
    for (const bar of this.$app.querySelectorAll("header, .rail")) { // new elements each render: no duplicates
      bar.addEventListener("touchstart", this._barTouchStart, { passive: true });
      bar.addEventListener("touchmove", this._barTouchMove, { passive: false });
    }
    if (itemTops) this._animateItems(itemTops);
    this._fitMonth();
    if (this.$app.querySelector(".month")) requestAnimationFrame(() => this._fitMonth());
    this._fitAgenda();
    if (this.$app.querySelector(".hagenda")) requestAnimationFrame(() => this._fitAgenda());
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
    if (typing) {
      const el = this.shadowRoot.getElementById(typing.id);
      if (el) {
        el.value = typing.value; el.focus();
        try { el.setSelectionRange(typing.pos, typing.pos); } catch (e) { /* not a text input */ }
      }
    } else if (focusId === "newitem" || focusId === "newcal") this.shadowRoot.getElementById(focusId)?.focus();
    this._tickClock();
  }

  renderHeader() {
    const w = this.wxState();
    const weather = w ? `<div class="weather">${WEATHER_ICONS[w.state] || "🌡️"}<b>${Math.round(Number(w.attributes.temperature))}°</b></div>` : "";
    const showChips = ["calendar", "home"].includes(this.ui.tab);
    return `<header>
      <div class="when"><div id="clock" class="clock"></div><div id="date" class="date"></div>${this.settings.seasonal ? `<span class="season" title="Seasonal accent">${seasonFor(new Date()).emoji}</span>` : ""}</div>
      ${showChips ? `<div class="chips members">${this.members.map((m) => `
        <button class="mchip ${this.ui.filter === m.id ? "on" : this.ui.filter ? "dim" : ""}" style="--c:${m.color}" data-action="filter" data-member="${m.id}">
          <span class="av" style="background:${m.color}">${m.avatar}</span>${esc(m.name)}</button>`).join("")}
        ${this.members.length ? "" : `<button class="chip" data-action="tab" data-tab="settings">+ Add your family in Setup</button>`}
      </div>` : "<div></div>"}
      ${weather}
    </header>`;
  }
}

// Each view's methods become SkylightPanel methods (getters and setters included).
for (const View of [CalendarView, WeatherView, HomeView, ChoresView, MealsView, ListsView, PhotosView, SettingsView, PickersView, MlbView, TravelView, NotesView]) {
  for (const key of Object.getOwnPropertyNames(View.prototype)) {
    if (key === "constructor") continue;
    if (Object.prototype.hasOwnProperty.call(SkylightPanel.prototype, key)) throw new Error(`Skylight: ${key} defined twice`);
    Object.defineProperty(SkylightPanel.prototype, key, Object.getOwnPropertyDescriptor(View.prototype, key));
  }
}
