/* Skylight panel: "leave by" times (methods mixed into SkylightPanel).

   For today's events that have a location and start within the next few hours, Home Assistant asks
   Waze for the drive time from home (travel.py). The Today screen shows a "Leave by 3:25 PM" note for
   the next one (turning into "Leave now" when it's time) and the agenda adds it to each event. */

import { startOfDay, esc } from "./helpers.js?v=1.61.1";

const AHEAD = 4 * 3600000; // look this far ahead
const EVERY = 5 * 60000; // ask again this often (Home Assistant caches each place 10 min)

export class TravelView {
  _leaveCandidates(now = new Date()) {
    return this.eventsOn(startOfDay(now))
      .filter((e) => !e.allDay && !e.info && e.location && e.start > now && e.start - now < AHEAD)
      .sort((a, b) => a.start - b.start);
  }

  _travelMaybe() {
    if (this.settings.leave_by === false || this._travelBusy || this.travel?.available === false && Date.now() - this._travelAt < 30 * 60000) return;
    const places = [...new Set(this._leaveCandidates().map((e) => e.location.trim()))].slice(0, 6);
    const key = places.join("|");
    if (!places.length || (key === this._travelKey && Date.now() - this._travelAt < EVERY)) return;
    this._travelKey = key;
    this._loadTravel(places);
  }

  async _loadTravel(places) {
    this._travelBusy = true; this._travelAt = Date.now();
    try {
      const r = await this._hass.callWS({ type: "skylight/travel/times", places });
      const before = JSON.stringify(this.travel || null);
      this.travel = { available: r.available, minutes: { ...(this.travel?.minutes || {}), ...r.minutes } };
      if (JSON.stringify(this.travel) !== before && (this.ui.tab === "home" || this.ui.tab === "calendar") && !this.ui.dialog) this.render();
    } catch (e) { /* offline: keep what we had */ } finally { this._travelBusy = false; }
  }

  // {leave: Date, minutes, now: true when it's time to go} or null.
  leaveInfo(ev, now = new Date()) {
    if (this.settings.leave_by === false || ev.allDay || !ev.location || ev.start <= now) return null;
    const m = this.travel?.minutes?.[ev.location.trim()];
    if (m === undefined || m === null) return null;
    const leave = new Date(ev.start.getTime() - (m + Number(this.settings.leave_buffer ?? 5)) * 60000);
    return { leave, minutes: m, now: now >= leave };
  }

  _driveText(m) { return m < 60 ? `${m} min drive` : `${Math.floor(m / 60)} h ${m % 60 ? `${m % 60} min ` : ""}drive`; }

  renderLeaveNote() {
    const now = new Date();
    for (const e of this._leaveCandidates(now)) {
      const l = this.leaveInfo(e, now);
      if (!l) continue;
      return `<button class="leavenote ${l.now ? "go" : ""}" data-action="open-event" data-idx="${this.evIndex(e)}"><span class="lvicon">🚗</span>
        <span class="lvtxt"><small>${esc(e.summary)} · starts ${this.fmtTime(e.start)} · ${this._driveText(l.minutes)}</small>
        <b>${l.now ? "Leave now" : `Leave by ${this.fmtTime(l.leave)}`}</b></span></button>`;
    }
    return "";
  }

  // Small line for agenda rows.
  leaveLine(ev) {
    const l = this.leaveInfo(ev);
    return l ? `<small class="evleave ${l.now ? "go" : ""}">🚗 ${l.now ? "Leave now" : `Leave by ${this.fmtTime(l.leave)}`} · ${this._driveText(l.minutes)}</small>` : "";
  }
}
