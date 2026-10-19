/* Skylight panel: weather tab, alerts and hints (methods mixed into SkylightPanel). */

import { textOn, sunTimes, moonPhase, moonInfo, WEATHER_ICONS, ymd, parseYmd, addDays, startOfDay, sameDay, esc, alertType, ALERT_TYPE_LABELS, feelsLike } from "./helpers.js?v=1.57.7";

export class WeatherView {

  async _loadAlerts(force = false) {
    if (this.settings.weather_alerts === false) { this.alerts = null; return; }
    try { this.alerts = await this._hass.callWS({ type: "skylight/weather/alerts", force }); }
    catch (e) { this.alerts = null; return; } // e.g. server not restarted after an update
    this._checkNewAlerts();
    this.render();
  }
  // Alerts of a type turned off in Setup don't pop up and aren't in the banner (the Weather tab still lists them).
  _alertShown(a) { return !(this.settings.alert_hide || []).includes(alertType(a.event)); }
  // The radar map is an embedded Windy/RainViewer page that draws with the graphics chip. It's left out
  // while the app is in the background (an embedded map like that can hang the iPhone's web view when the
  // app comes back), and on phones it loads only when asked (also saves battery and data).
  _radarAllowed() {
    if (document.visibilityState === "hidden") return false;
    return !this.isPhone || !!this.ui.radarShown;
  }
  alertColor(sev) { return { Extreme: "#7b1fa2", Severe: "#c62828", Moderate: "#ef6c00", Minor: "#f9a825" }[sev] || "#607d8b"; }
  renderAlertBanner() {
    const list = this.settings.weather_alerts === false ? [] : (this.alerts?.alerts || []).filter((a) => this._alertShown(a));
    if (!list.length || this.ui.tab === "weather") return "";
    const a = list[0], c = this.alertColor(a.severity);
    const until = a.ends ? ` until ${new Date(a.ends).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" })}` : "";
    return `<button class="alertbar" style="background:${c};color:${textOn(c)}" data-action="tab" data-tab="weather">
      ⚠️ <b>${esc(a.event)}</b>${until}${list.length > 1 ? ` · +${list.length - 1} more` : ""}<span>Details ›</span></button>`;
  }
  renderAlertCards() {
    if (this.settings.weather_alerts === false || !this.alerts) return "";
    if (!this.alerts.supported) return "";
    if (this.alerts.error) return `<p class="hint">⚠️ ${esc(this.alerts.error)}</p>`;
    const fmt = (iso) => (iso ? new Date(iso).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "");
    if (!this.alerts.alerts.length) return `<p class="noalerts">✅ No active weather alerts for your area</p>`;
    const hidden = [...new Set(this.alerts.alerts.filter((a) => !this._alertShown(a)).map((a) => ALERT_TYPE_LABELS[alertType(a.event)]))];
    return (hidden.length ? `<p class="hint">Not popped up or shown in the banner (turned off in Setup): ${hidden.map(esc).join(", ")}</p>` : "") + this.alerts.alerts.map((a) => {
      const c = this.alertColor(a.severity);
      return `<section class="alertcard" style="--ac:${c}">
        <div class="ahead" style="background:${c};color:${textOn(c)}">⚠️ <b>${esc(a.event)}</b><span>${esc(a.severity)}${a.urgency ? ` · ${esc(a.urgency)}` : ""}</span></div>
        <div class="abody">
          ${a.headline ? `<p><b>${esc(a.headline)}</b></p>` : ""}
          <p class="hint">${a.effective ? `From ${fmt(a.effective)}` : ""}${a.ends ? ` until ${fmt(a.ends)}` : ""}${a.area ? ` · ${esc(a.area)}` : ""}</p>
          <details><summary>Full details</summary>
            <p class="apre">${esc(a.description)}</p>
            ${a.instruction ? `<p class="apre"><b>What to do:</b> ${esc(a.instruction)}</p>` : ""}
            <p class="hint">${esc(a.sender)}</p></details>
        </div></section>`;
    }).join("");
  }

  // ----- kiosk alert popup: a new Severe/Extreme NWS alert takes over the screen until dismissed -----
  _seenAlerts() {
    if (!this.__seen) { try { this.__seen = JSON.parse(localStorage.getItem("skylight.seenAlerts") || "[]"); } catch (e) { this.__seen = []; } }
    return this.__seen;
  }
  _markAlertsSeen(ids) {
    this.__seen = [...new Set([...this._seenAlerts(), ...ids])].slice(-60);
    try { localStorage.setItem("skylight.seenAlerts", JSON.stringify(this.__seen)); } catch (e) { /* private mode */ }
  }
  _popupLevels() {
    const p = this.settings.alert_popup || "severe";
    return p === "off" ? [] : p === "all" ? ["Extreme", "Severe", "Moderate", "Minor", "Unknown"] : p === "extreme" ? ["Extreme"] : ["Extreme", "Severe"];
  }
  _checkNewAlerts() {
    const list = (this.alerts?.alerts || []).filter((a) => this._popupLevels().includes(a.severity) && this._alertShown(a));
    const seen = this._seenAlerts();
    const fresh = list.filter((a) => a.id && !seen.includes(a.id));
    if (!fresh.length) return;
    this.ui.alertPop = fresh.map((a) => a.id);
    if (this.ui.saver) this.stopSaver();
    this._lastActivity = Date.now();
    if (this.settings.alert_sound !== false) this._chime();
  }
  _chime() {
    // A short two-tone chime. Browsers may block sound until the screen has been touched once;
    // in Fully Kiosk enable "Autoplay audio" (Web content settings).
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      const ctx = this._ac || (this._ac = new AC());
      ctx.resume?.();
      [[880, 0], [660, 0.35], [880, 0.7], [660, 1.05]].forEach(([f, t]) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.frequency.value = f; o.connect(g); g.connect(ctx.destination);
        const at = ctx.currentTime + t;
        g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(0.35, at + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.3);
        o.start(at); o.stop(at + 0.32);
      });
    } catch (e) { /* no audio */ }
  }
  renderAlertPopup() {
    const ids = this.ui.alertPop;
    if (!ids || !ids.length) return "";
    const list = (this.alerts?.alerts || []).filter((a) => ids.includes(a.id));
    if (!list.length) { this.ui.alertPop = null; return ""; }
    const a = list[0], c = this.alertColor(a.severity);
    const fmt = (iso) => (iso ? new Date(iso).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" }) : "");
    return `<div class="alertpop" role="alertdialog" aria-label="${esc(a.event)}">
      <div class="apcard" style="--ac:${c}">
        <div class="aphead" style="background:${c};color:${textOn(c)}"><span class="apicon">⚠️</span><div><b>${esc(a.event)}</b>
          <small>${esc(a.severity)}${a.ends ? ` · until ${fmt(a.ends)}` : ""}</small></div></div>
        <div class="apbody">
          ${a.headline ? `<p><b>${esc(a.headline)}</b></p>` : ""}
          ${a.instruction ? `<p class="apre">${esc(a.instruction)}</p>` : `<p class="apre">${esc((a.description || "").slice(0, 600))}</p>`}
          ${list.length > 1 ? `<p class="hint">+ ${list.length - 1} more alert${list.length > 2 ? "s" : ""}</p>` : ""}
        </div>
        <div class="apbtns"><button data-action="alert-details">Details</button><button class="primary" data-action="alert-dismiss">OK, got it</button></div>
      </div></div>`;
  }

  // ----- where this screen's weather is for: home (Home Assistant's weather entity) or "📍 Here" -----
  get wxWhere() {
    try { return localStorage.getItem("skylight.weatherWhere") === "here" ? "here" : "home"; } catch (e) { return "home"; }
  }
  // Current conditions, shaped like a Home Assistant weather entity ({state, attributes}), or null.
  wxState() {
    if (this.wxWhere === "here") return this.wxHere?.state ? { state: this.wxHere.state, attributes: this.wxHere.attributes } : null;
    return (this.settings.weather_entity && this._hass.states[this.settings.weather_entity]) || null;
  }
  _wxSourceOk() { return this.wxWhere === "here" || !!(this.settings.weather_entity && this._hass.states[this.settings.weather_entity]); }

  // Ask the device where it is (rounded to ~1 km on the server), then get the weather there.
  // A failure is not retried on its own for 5 minutes (only by "Try again"): otherwise drawing the
  // screen would ask again, fail again and redraw, forever (a browser that refuses location fails instantly).
  async _loadHere(force = false) {
    if (!force && this.wxHere && Date.now() - this.wxHere.at < 10 * 60000) return this.wxHere;
    if (!force && this.wxHereErr && Date.now() - (this._hereErrAt || 0) < 5 * 60000) return this.wxHere || null;
    if (this._hereLoading) return this._hereLoading;
    this._hereLoading = (async () => {
      // 1) The browser's own location. 2) If that's refused or unavailable (the Home Assistant iPhone
      // app doesn't pass it on to pages, and plain http never gets it): where the Home Assistant app
      // last reported this person's phone to be (their person entity).
      let coords = null, why = null;
      try { coords = { ...(await this._browserLocation()), source: "browser" }; }
      catch (e) { why = e; }
      try {
        if (!coords) coords = this._personLocation();
        if (!coords) {
          throw new Error(why?.code === 1
            ? "This browser or app won't share its location, and Home Assistant doesn't know where your phone is. Turn on location for the Home Assistant app (Settings → Privacy & Security → Location Services → Home Assistant → Always or While Using), and make sure your phone is linked to you under Settings → People in Home Assistant."
            : `${why?.message || "Couldn't find this screen's location."} Home Assistant doesn't know where your phone is either (Settings → People: link your phone to you).`);
        }
        const r = await this._hass.callWS({ type: "skylight/weather/here", lat: coords.lat, lon: coords.lon });
        if (r.error) throw new Error(r.error);
        this.wxHere = { ...r, source: coords.source, at: Date.now() }; this.wxHereErr = null;
      } catch (e) {
        this._hereErrAt = Date.now();
        this.wxHereErr = e?.message || "Couldn't find this screen's location.";
      } finally { this._hereLoading = null; }
      return this.wxHere;
    })();
    return this._hereLoading;
  }
  _browserLocation() {
    return new Promise((ok, fail) => {
      if (!navigator.geolocation) { fail(new Error("This screen can't share its location.")); return; }
      if (window.isSecureContext === false) { fail(new Error("Location needs a secure (https) connection to Home Assistant.")); return; }
      // Some app web views never answer at all: give up after 8 s and use the phone's reported location.
      const t = setTimeout(() => fail({ code: 3, message: "Location took too long." }), 9000);
      navigator.geolocation.getCurrentPosition(
        (p) => { clearTimeout(t); ok({ lat: p.coords.latitude, lon: p.coords.longitude }); },
        (e) => { clearTimeout(t); fail(e); },
        { timeout: 8000, maximumAge: 10 * 60000 });
    });
  }
  // The signed-in person's last location reported by the Home Assistant app (person entity), if any.
  _personLocation() {
    const userId = this._hass.user?.id;
    if (!userId) return null;
    const hit = Object.entries(this._hass.states || {}).find(([id, st]) => id.startsWith("person.") && st?.attributes?.user_id === userId);
    const a = hit?.[1]?.attributes;
    if (!a || typeof a.latitude !== "number" || typeof a.longitude !== "number") return null;
    return { lat: a.latitude, lon: a.longitude, source: "person", name: a.friendly_name || hit[0] };
  }
  _setWxWhere(where) {
    try { if (where === "here") localStorage.setItem("skylight.weatherWhere", "here"); else localStorage.removeItem("skylight.weatherWhere"); } catch (e) { /* private mode */ }
    this.wx = null; this.wxx = null; this.forecast = {};
    this.render();
    this._loadWeatherFull(true); this._loadForecast(); this._loadWxExtra(true);
  }

  // "Feels like" for one hourly entry or the current conditions: the source's own apparent temperature,
  // else worked out from temperature, humidity and wind (feelsLike in helpers.js).
  _feels(h, units) {
    const n = (v) => (v === undefined || v === null || v === "" || Number.isNaN(Number(v)) ? null : Number(v));
    if (n(h?.apparent_temperature) !== null) return n(h.apparent_temperature);
    const u = units || this.wxState()?.attributes || {};
    return feelsLike(h?.temperature, h?.humidity, h?.wind_speed, u.temperature_unit || "°F", u.wind_speed_unit || "mph");
  }

  // ----- extra weather data (Open-Meteo rain-by-15-min, comparisons, air quality, pollen) -----
  async _loadWxExtra(force = false) {
    if (this.settings.weather_extra === false) { this.wxx = null; return; }
    if (!force && this.wxx && Date.now() - this.wxx.at < 10 * 60000) return;
    if (this._wxxLoading) return;
    this._wxxLoading = true;
    const here = this.wxWhere === "here" ? await this._loadHere() : null;
    if (this.wxWhere === "here" && !here) { this._wxxLoading = false; return; }
    try { this.wxx = { at: Date.now(), ...(await this._hass.callWS({ type: "skylight/weather/extra", force, ...(here ? { lat: here.lat, lon: here.lon } : {}) })) }; }
    catch (e) { this.wxx = null; } // e.g. server not restarted after an update
    finally { this._wxxLoading = false; }
    if (this.ui.tab === "weather" || this.ui.tab === "home") this.render();
  }
  _isMetric() {
    const w = this.wxState();
    return !((w?.attributes?.temperature_unit || this._hass.config?.unit_system?.temperature || "°F").includes("F"));
  }
  // Rain in the next 2 hours from 15-minute data. Returns {text, bars} or null.
  _rainSoon() {
    const m = this.wxx?.forecast?.minutely;
    const off = this.wxx?.forecast?.utc_offset;
    if (!m || !m.length || off === undefined || off === null) return null;
    // Open-Meteo times are local to the location without an offset: convert with utc_offset_seconds.
    const at = (t) => new Date(Date.parse(t + "Z") - off * 1000);
    const now = Date.now();
    const slots = m.map((s) => ({ t: at(s.time), p: Number(s.precip) || 0 })).filter((s) => s.t.getTime() + 15 * 60000 > now);
    if (!slots.length) return null;
    const wet = (s) => s.p >= (this._isMetric() ? 0.1 : 0.004);
    const bars = slots.slice(0, 8);
    let text = null;
    if (wet(slots[0])) {
      const stop = slots.findIndex((s) => !wet(s));
      text = stop === -1 ? "Rain now, continuing for the next 2 hours" : `Rain now, ending around ${this.fmtTime(slots[stop].t)}`;
    } else {
      const start = slots.findIndex(wet);
      if (start !== -1) {
        const mins = Math.max(0, Math.round((slots[start].t - now) / 60000));
        text = mins <= 60 ? `Rain starting in about ${Math.max(5, Math.round(mins / 5) * 5)} min` : `Rain likely around ${this.fmtTime(slots[start].t)}`;
      }
    }
    return { text, bars };
  }

  // Plain-language tips for today from the forecast, air quality, pollen and today's events.
  _weatherHints() {
    const out = [];
    const metric = this._isMetric();
    const F = (f) => (metric ? (f - 32) * 5 / 9 : f); // thresholds are written in °F
    const mph = (v) => (metric ? v * 1.609 : v);
    const now = new Date(), end = new Date(now); end.setHours(21, 0, 0, 0);
    const hours = (this.wx?.hourly || []).map((h) => ({ ...h, t: new Date(h.datetime) })).filter((h) => h.t > new Date(now - 3600000));
    const today = hours.filter((h) => h.t <= end);
    const n = (v) => (v === undefined || v === null || v === "" ? null : Number(v));
    const alerts = (this.alerts?.alerts || []).filter((a) => this._alertShown(a));
    if (alerts.length) out.push({ icon: "⚠️", text: `${esc(alerts[0].event)} in effect`, level: "h-alert" });
    // Always a short summary of the day, so the card never goes blank on an ordinary day.
    const summary = this._daySummary(now);
    if (summary) out.push(summary);
    const soon = this._rainSoon();
    if (soon?.text) out.push({ icon: "🌧️", text: soon.text, level: "h-now" });
    // Outdoor events today
    const OUTDOOR = /soccer|baseball|softball|football|practice|game|tournament|park|zoo|pool|swim|picnic|hike|camp|parade|field|bbq|cookout|golf|tennis|run\b|race|fair|festival|playground|beach|lake|garden|yard|walk|bike|recess|outdoor/i;
    const evs = (this.events || []).filter((e) => !e.allDay && !e.info && sameDay(e.start, now) && e.end > now && OUTDOOR.test(`${e.summary} ${e.location}`));
    for (const e of evs.slice(0, 3)) {
      const h = hours.reduce((best, x) => (!best || Math.abs(x.t - e.start) < Math.abs(best.t - e.start) ? x : best), null);
      if (!h || Math.abs(h.t - e.start) > 2 * 3600000) continue;
      const when = `${esc(e.summary)} (${this.fmtTime(e.start)})`;
      const p = n(h.precipitation_probability), feel = this._feels(h) ?? n(h.temperature);
      if (p !== null && p >= 40) out.push({ icon: "☔", text: `${p}% chance of rain for ${when}. Bring an umbrella` });
      else if (feel !== null && feel >= F(90)) out.push({ icon: "💧", text: `Hot for ${when}, feels like ${Math.round(feel)}°. Bring water` });
      else if (feel !== null && feel <= F(45)) out.push({ icon: "🧤", text: `Chilly for ${when}, ${Math.round(feel)}°. Dress warm` });
    }
    // Umbrella for the day
    const wetHours = today.filter((h) => n(h.precipitation_probability) >= 40);
    if (wetHours.length && !soon?.text && !out.some((o) => o.icon === "☔")) {
      const peak = wetHours.reduce((a, b) => (n(b.precipitation_probability) > n(a.precipitation_probability) ? b : a));
      out.push({ icon: "☂️", text: `${Math.round(n(peak.precipitation_probability))}% chance of rain around ${this.fmtTime(peak.t)}. Take an umbrella` });
    }
    // Jacket for the morning / school run
    const morning = hours.filter((h) => h.t.getHours() >= 7 && h.t.getHours() <= 9 && sameDay(h.t, now));
    const coldAM = morning.length ? Math.min(...morning.map((h) => this._feels(h) ?? n(h.temperature))) : null;
    if (coldAM !== null && coldAM <= F(50)) out.push({ icon: "🧥", text: `Jacket weather this morning, ${Math.round(coldAM)}°` });
    // Heat
    const feels = today.map((h) => this._feels(h) ?? n(h.temperature)).filter((v) => v !== null);
    const maxFeel = feels.length ? Math.max(...feels) : null;
    if (maxFeel !== null && maxFeel >= F(95)) out.push({ icon: "🥵", text: `Very hot, feels like ${Math.round(maxFeel)}°. Limit time outside and drink water` });
    else if (maxFeel !== null && maxFeel >= F(88)) out.push({ icon: "☀️", text: `Hot afternoon, feels like ${Math.round(maxFeel)}°. Drink water` });
    // Freeze / frost tonight (until 9 AM tomorrow)
    const tmr = new Date(now); tmr.setDate(tmr.getDate() + 1); tmr.setHours(9, 0, 0, 0);
    const night = hours.filter((h) => h.t > now && h.t <= tmr && (h.t.getHours() >= 18 || h.t.getHours() <= 9));
    const lowNight = night.length ? Math.min(...night.map((h) => n(h.temperature)).filter((v) => v !== null)) : null;
    if (lowNight !== null && lowNight <= F(32)) out.push({ icon: "❄️", text: `Freeze tonight (${Math.round(lowNight)}°). Cover plants and bring pets in` });
    else if (lowNight !== null && lowNight <= F(36)) out.push({ icon: "🌱", text: `Frost possible tonight (${Math.round(lowNight)}°). Cover tender plants` });
    // Wind
    const gusts = today.map((h) => n(h.wind_gust_speed) ?? n(h.wind_speed)).filter((v) => v !== null);
    const maxGust = gusts.length ? Math.max(...gusts) : null;
    if (maxGust !== null && maxGust >= mph(30)) out.push({ icon: "💨", text: `Gusty, up to ${Math.round(maxGust)} ${metric ? "km/h" : "mph"}. Secure trash cans and patio items` });
    // UV
    const uvs = today.map((h) => n(h.uv_index)).filter((v) => v !== null);
    const uv = uvs.length ? Math.max(...uvs) : n(this.wxState()?.attributes?.uv_index);
    if (uv !== null && uv >= 7) out.push({ icon: "🧴", text: `High UV (${Math.round(uv)}) midday. Wear sunscreen` });
    // Air quality and pollen
    const aqi = n(this.wxx?.air?.aqi);
    if (aqi !== null && aqi > 150) out.push({ icon: "😷", text: `Unhealthy air (AQI ${aqi}). Keep outdoor play short` });
    else if (aqi !== null && aqi > 100) out.push({ icon: "😷", text: `Air quality is poor for sensitive groups (AQI ${aqi})` });
    const high = this._pollenToday().filter((p) => p.level >= 4);
    if (high.length) out.push({ icon: "🤧", text: `${esc(high.map((p) => p.name).join(" & "))} pollen ${high.some((p) => p.level >= 5) ? "very high" : "high"} today` });
    // Big change from yesterday
    const days = this.wxx?.forecast?.days || [];
    const yi = days.findIndex((d) => d.date === ymd(now)) - 1;
    const y = days[yi], td = days[yi + 1];
    if (y && td && n(y.high) !== null && n(td.high) !== null) {
      const diff = Math.round(n(td.high) - n(y.high));
      if (Math.abs(diff) >= (metric ? 6 : 10)) out.push({ icon: diff > 0 ? "📈" : "📉", text: `${Math.abs(diff)}° ${diff > 0 ? "warmer" : "colder"} than yesterday` });
    }
    // A nice day
    if (!out.length && today.length >= 4) {
      const ok = today.every((h) => (n(h.precipitation_probability) ?? 0) < 20) && maxFeel !== null && maxFeel >= F(60) && maxFeel <= F(85) && (maxGust === null || maxGust < mph(20));
      if (ok) out.push({ icon: "🌿", text: "Nice day. Good for yard work or the park" });
    }
    return out;
  }
  // "⛅ Partly cloudy today, high 64° · low 41°" from the daily forecast (or the hourly one).
  _daySummary(now) {
    const LABEL = { "clear-night": "Clear", cloudy: "Cloudy", fog: "Foggy", hail: "Hail", lightning: "Thunderstorms", "lightning-rainy": "Storms",
      partlycloudy: "Partly cloudy", pouring: "Heavy rain", rainy: "Rain", snowy: "Snow", "snowy-rainy": "Wintry mix", sunny: "Sunny", windy: "Windy",
      "windy-variant": "Windy and cloudy", exceptional: "Unusual weather" };
    const f = this.forecast?.[ymd(now)];
    const hours = (this.wx?.hourly || []).filter((h) => sameDay(new Date(h.datetime), now));
    const temps = hours.map((h) => Number(h.temperature)).filter((v) => !Number.isNaN(v));
    const high = f?.temperature ?? (temps.length ? Math.max(...temps) : null);
    const low = f?.templow ?? (temps.length ? Math.min(...temps) : null);
    const cond = f?.condition || hours.find((h) => new Date(h.datetime).getHours() >= 12)?.condition || this.wxState()?.state;
    if (high === null && !cond) return null;
    // Evening (from 5 PM, or when only the night period is left): tonight's low and tomorrow instead.
    if (now.getHours() >= 17 || f?.is_daytime === false) {
      const tm = this.forecast?.[ymd(addDays(now, 1))];
      const lowTonight = f?.templow ?? (f?.is_daytime === false ? f?.temperature : null) ?? tm?.templow;
      const night = { sunny: "clear-night", partlycloudy: "partlycloudy" }[cond] || cond;
      const label = { "clear-night": "Clear", sunny: "Clear" }[night] || LABEL[night] || "Weather";
      let text = `${label} tonight${lowTonight !== null && lowTonight !== undefined ? `, low ${Math.round(lowTonight)}°` : ""}`;
      if (tm) text += ` · Tomorrow ${WEATHER_ICONS[tm.condition] || ""} ${(LABEL[tm.condition] || "").toLowerCase()}${tm.temperature !== undefined ? `, high ${Math.round(tm.temperature)}°` : ""}`;
      return { icon: night === "clear-night" || night === "sunny" ? "🌙" : WEATHER_ICONS[night] || "🌙", text: text.replace(/\s+/g, " ").trim(), level: "h-day" };
    }
    const parts = [`${LABEL[cond] || "Weather"} today`];
    if (high !== null && high !== undefined) parts.push(`high ${Math.round(high)}°${low !== null && low !== undefined && f?.templow !== undefined ? ` · low ${Math.round(low)}°` : ""}`);
    return { icon: WEATHER_ICONS[cond] || "🌤️", text: parts.join(", "), level: "h-day" };
  }
  // Pollen for today as [{name, level, category}] on Google's 0-5 scale (0 none … 4 high, 5 very high),
  // from Google (US) or Open-Meteo (Europe).
  _pollenToday() {
    const g = this.wxx?.pollen?.[0];
    if (g) return g.types.filter((t) => t.value !== null && t.value !== undefined).map((t) => ({ name: t.name, level: Number(t.value), category: t.category || "", in_season: t.in_season }));
    const eu = this.wxx?.air?.eu_pollen || [];
    // Open-Meteo reports grains/m³; rough bands: <10 low, <50 moderate, <200 high, else very high.
    const lvl = (v) => (v < 1 ? 0 : v < 10 ? 2 : v < 50 ? 3 : v < 200 ? 4 : 5);
    return eu.map((p) => ({ name: p.code[0].toUpperCase() + p.code.slice(1), level: lvl(Number(p.value)), category: ["None", "Very low", "Low", "Moderate", "High", "Very high"][lvl(Number(p.value))] }));
  }
  renderHints(limit) {
    const hints = this._weatherHints();
    if (!hints.length) return "";
    const shown = limit ? hints.slice(0, limit) : hints;
    return `<div class="hints">${shown.map((h) => `<div class="hintrow ${h.level || ""}"><span>${h.icon}</span><p>${h.text}</p></div>`).join("")}</div>`;
  }

  // Daily + hourly forecasts for the Weather tab (refreshed every 15 minutes while viewed).
  async _loadWeatherFull(force = false) {
    if (this.wxWhere === "here") {
      if (!force && this.wx && Date.now() - this.wx.at < 10 * 60000) return;
      if (this._wxLoading) return;
      this._wxLoading = true;
      const errBefore = this.wxHereErr;
      const h = await this._loadHere(force);
      this._wxLoading = false;
      const fresh = h && (!this.wx || this.wx.at !== h.at);
      if (h) { this.wx = { at: h.at, daily: h.daily, hourly: h.hourly, hourlyMissing: false, periods: {} }; this._fillForecast(h.daily); }
      // Redraw only when something new arrived (new weather, or a new error to show).
      if ((fresh || this.wxHereErr !== errBefore) && ["weather", "home", "calendar"].includes(this.ui.tab)) setTimeout(() => this.render(), 0);
      return;
    }
    const w = this.settings.weather_entity;
    if (!w || !this._hass.states[w]) return;
    if (!force && this.wx && Date.now() - this.wx.at < 15 * 60000) return;
    if (this._wxLoading) return;
    this._wxLoading = true;
    const get = (type) => this._forecastType(w, type);
    const [daily0, hourly, twice] = await Promise.all([get("daily"), get("hourly"), get("twice_daily")]);
    // Some providers (e.g. US NWS) only offer day/night periods: build days from them.
    let daily = daily0 && daily0.length ? daily0 : null;
    const periods = {};
    for (const t of twice || []) {
      const key = ymd(new Date(t.datetime));
      (periods[key] = periods[key] || {})[t.is_daytime === false ? "night" : "day"] = t;
    }
    if (!daily && twice && twice.length) {
      daily = Object.entries(periods).map(([key, p]) => {
        const main = p.day || p.night;
        const probs = [p.day, p.night].filter(Boolean).map((x) => x.precipitation_probability).filter((v) => v !== undefined && v !== null);
        return {
          datetime: parseYmd(key).toISOString(), condition: main.condition,
          temperature: (p.day || p.night).temperature, templow: p.night ? p.night.temperature : null,
          precipitation_probability: probs.length ? Math.max(...probs) : null,
        };
      });
    }
    this._wxLoading = false;
    this.wx = { at: Date.now(), daily: daily || [], hourly: hourly || [], hourlyMissing: hourly === null, periods };
    if (this.ui.tab === "weather" || this.ui.tab === "home") this.render();
  }

  _fillForecast(daily) {
    const forecast = {};
    for (const f of daily || []) forecast[ymd(new Date(f.datetime))] = f;
    this.forecast = forecast;
  }

  // One forecast type (daily / hourly / twice_daily) from a weather entity, or null if it doesn't offer
  // it. A "doesn't support" answer is remembered, so the Home Assistant log isn't told again every refresh.
  async _forecastType(entity, type) {
    const key = `${entity}|${type}`;
    this._noForecast = this._noForecast || new Set();
    if (this._noForecast.has(key)) return null;
    try {
      const res = await this._hass.callWS({ type: "call_service", domain: "weather", service: "get_forecasts",
        service_data: { type }, target: { entity_id: entity }, return_response: true });
      return res?.response?.[entity]?.forecast || [];
    } catch (e) {
      if (/does not support/i.test(e?.message || "")) this._noForecast.add(key);
      return null;
    }
  }

  async _loadForecast() {
    if (this.wxWhere === "here") {
      const h = await this._loadHere();
      if (h) { this._fillForecast(h.daily); if (this.ui.tab === "calendar" || this.ui.tab === "home") this.render(); }
      return;
    }
    const w = this.settings.weather_entity;
    if (!w || !this._hass.states[w]) return;
    const get = (type) => this._forecastType(w, type);
    // Day headers show each day's condition and high. Sources like the US NWS have no daily
    // forecast, only day/night periods: use the daytime period (or the night one if that's all).
    let list = await get("daily");
    const forecast = {};
    if (list && list.length) {
      for (const f of list) forecast[ymd(new Date(f.datetime))] = f;
    } else {
      for (const f of (await get("twice_daily")) || []) {
        const key = ymd(new Date(f.datetime));
        if (!forecast[key] || (f.is_daytime !== false && forecast[key].is_daytime === false)) forecast[key] = f;
      }
    }
    if (!Object.keys(forecast).length) { console.warn("Skylight: no daily or day/night forecast from", w); return; }
    this.forecast = forecast;
    if (this.ui.tab === "calendar" || this.ui.tab === "home") this.render();
  }

  renderWhereToggle() {
    const here = this.wxWhere === "here";
    return `<div class="seg wwhere"><button class="${here ? "" : "on"}" data-action="wx-where" data-where="home">🏠 Home</button><button class="${here ? "on" : ""}" data-action="wx-where" data-where="here">📍 Here</button></div>`;
  }

  renderWeather() {
    const w = this.wxState();
    if (!w) {
      this._loadWeatherFull();
      if (this.wxWhere === "here") return `${this.renderWhereToggle()}<div class="empty">${this.wxHereErr
        ? `<h2>Can't show the weather here</h2><p>${esc(this.wxHereErr)}</p><button class="primary" data-action="wx-here-retry">Try again</button>`
        : `<h2>Finding where you are…</h2><p class="hint">Allow location if your phone asks.</p>`}</div>`;
      return `${this.renderWhereToggle()}<div class="empty"><h2>No weather source</h2><p>Choose one in Setup → Display → Weather, or tap 📍 Here.</p><button class="primary" data-action="tab" data-tab="settings">Go to Setup</button></div>`;
    }
    this._loadWeatherFull();
    const a = w.attributes, tu = a.temperature_unit || "°", wu = a.wind_speed_unit || "", pu = a.precipitation_unit || "";
    const round = (v) => (v === undefined || v === null ? null : Math.round(Number(v)));
    const cond = (c) => (c || "").replace(/-/g, " ").replace(/\b\w/g, (x) => x.toUpperCase()).replace("Partlycloudy", "Partly cloudy");
    const compass = (b) => (b === undefined || b === null ? "" : ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(((Number(b) % 360) + 360) % 360 / 45) % 8]);
    const sun = this._hass.states["sun.sun"]?.attributes || {};
    const tfmt = (iso) => (iso ? this.fmtTime(new Date(iso)) : "–");
    const stat = (label, value) => (value === null || value === undefined || value === "" ? "" : `<div class="wstat"><small>${label}</small><b>${value}</b></div>`);
    const today = this.wx?.daily?.[0];
    const current = `<section class="wnow">
      <div class="wbig">${WEATHER_ICONS[w.state] || "🌡️"}</div>
      <div class="wmain"><div class="wtemp">${round(a.temperature)}${tu}</div>
        <div class="wcond">${cond(w.state)}${today ? ` · H ${round(today.temperature)}°${today.templow !== undefined && today.templow !== null ? ` L ${round(today.templow)}°` : ""}` : ""}</div>
        ${(() => { const f = this._feels(a, a); return f === null ? "" : `<div class="hint">Feels like ${round(f)}${tu}</div>`; })()}</div>
      <div class="wstats">
        ${stat("Humidity", a.humidity !== undefined ? `${round(a.humidity)}%` : null)}
        ${stat("Wind gust", a.wind_gust_speed !== undefined && a.wind_gust_speed !== null ? `${round(a.wind_gust_speed)} ${wu}` : null)}
        ${stat("Visibility", a.visibility !== undefined && a.visibility !== null ? `${Number(a.visibility).toFixed(a.visibility < 10 ? 1 : 0)} ${a.visibility_unit || ""}` : null)}
        ${stat("Wind", a.wind_speed !== undefined ? `${round(a.wind_speed)} ${wu} ${compass(a.wind_bearing)}` : null)}
        ${stat("UV index", a.uv_index)}
        ${stat("Dew point", a.dew_point !== undefined ? `${round(a.dew_point)}${tu}` : null)}
        ${stat("Pressure", a.pressure !== undefined ? `${round(a.pressure)} ${a.pressure_unit || ""}` : null)}
        ${stat("Clouds", a.cloud_coverage !== undefined ? `${round(a.cloud_coverage)}%` : null)}
        ${stat("Sunrise", sun.next_rising ? tfmt(sun.next_rising) : null)}
        ${stat("Sunset", sun.next_setting ? tfmt(sun.next_setting) : null)}
        ${stat("Moon", moonPhase(new Date()))}
      </div></section>`;
    if (!this.wx) return current + `<p class="hint center">Loading forecast…</p>`;
    // ----- hourly: one temperature line (single series, no legend), labels only at high/low -----
    const hours = this.wx.hourly.filter((h) => new Date(h.datetime) >= new Date(Date.now() - 3600000)).slice(0, 24);
    let hourly = "";
    if (hours.length > 1) {
      const W = 44 * hours.length, H = 120, top = 26, bottom = 30;
      const temps = hours.map((h) => Number(h.temperature));
      const feels = hours.map((h) => this._feels(h, a));
      const showFeels = feels.every((v) => v !== null) && feels.some((v, i) => Math.abs(v - temps[i]) >= 1);
      const all = showFeels ? [...temps, ...feels] : temps;
      const lo = Math.min(...all), hi = Math.max(...all), span = Math.max(1, hi - lo);
      const x = (i) => 22 + i * 44, y = (t) => top + (1 - (t - lo) / span) * (H - top - bottom);
      const pts = temps.map((t, i) => `${x(i)},${y(t).toFixed(1)}`).join(" ");
      const iHi = temps.indexOf(hi), iLo = temps.indexOf(lo);
      const precip = (h) => (h.precipitation_probability !== undefined && h.precipitation_probability !== null
        ? (h.precipitation_probability >= 20 ? `${Math.round(h.precipitation_probability)}%` : "")
        : h.precipitation ? `${Number(h.precipitation).toFixed(1)}${pu}` : "");
      hourly = `<section class="wcard"><h3>Next ${hours.length} hours${showFeels ? ` <small class="wlegend"><i class="wl-temp"></i> temperature <i class="wl-feels"></i> feels like</small>` : ""}</h3><div class="whourly">
        <svg width="${W}" height="${H}" role="img" aria-label="Hourly temperature">
          ${showFeels ? `<polyline class="wfeels" points="${feels.map((t, i) => `${x(i)},${y(t).toFixed(1)}`).join(" ")}" fill="none" stroke="var(--muted)" stroke-width="2" stroke-dasharray="5 4" stroke-linejoin="round" stroke-linecap="round"/>` : ""}
          <polyline points="${pts}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
          ${temps.map((t, i) => `<g class="wpt"><circle cx="${x(i)}" cy="${y(t).toFixed(1)}" r="${i === iHi || i === iLo ? 4 : 2.5}" fill="var(--accent)" stroke="var(--card)" stroke-width="2"/>
            <title>${this.fmtTime(new Date(hours[i].datetime))}: ${Math.round(t)}${tu}${showFeels ? `, feels like ${Math.round(feels[i])}${tu}` : ""}${precip(hours[i]) ? `, precip ${precip(hours[i])}` : ""}</title>
            <rect x="${x(i) - 22}" y="0" width="44" height="${H}" fill="transparent"/></g>`).join("")}
          ${[iHi, iLo].filter((v, k, arr) => arr.indexOf(v) === k).map((i) => `<text x="${x(i)}" y="${(y(temps[i]) + (i === iHi ? -9 : 17)).toFixed(1)}" text-anchor="middle" class="wlab">${Math.round(temps[i])}°</text>`).join("")}
        </svg>
        ${hours.some((h) => Number(h.precipitation) > 0 || Number(h.precipitation_probability) >= 20) ? (() => {
          // Bars show rain amount when provided, otherwise chance of rain (scaled to 100%).
          const useProb = !hours.some((h) => Number(h.precipitation) > 0);
          const amt = hours.map((h) => (useProb ? (Number(h.precipitation_probability) >= 20 ? Number(h.precipitation_probability) : 0) : Number(h.precipitation) || 0));
          const maxA = useProb ? 100 : Math.max(...amt);
          return `<svg width="${W}" height="36" role="img" aria-label="Hourly precipitation">${amt.map((v, i) => v > 0
            ? `<rect x="${x(i) - 8}" y="${(34 - (v / maxA) * 30).toFixed(1)}" width="16" height="${((v / maxA) * 30).toFixed(1)}" rx="4" fill="#6fa8dc"><title>${this.fmtTime(new Date(hours[i].datetime))}: ${useProb ? `${Math.round(v)}% chance of rain` : `${v.toFixed(1)} ${pu}`}</title></rect>` : "").join("")}
            <line x1="0" x2="${W}" y1="34.5" y2="34.5" stroke="var(--line)"/></svg>`;
        })() : ""}
        <div class="whrow" style="width:${W}px">${hours.map((h, i) => `<div class="wh" title="${this.fmtTime(new Date(h.datetime))}">
          <span>${WEATHER_ICONS[h.condition] || ""}</span><b>${Math.round(Number(h.temperature))}°</b>
          <small class="rain">${precip(h) || "&nbsp;"}</small>
          <small>${new Date(h.datetime).toLocaleTimeString([], { hour: "numeric", hour12: !this.settings.clock_24h })}</small></div>`).join("")}</div>
        ${this._hourlyTable(hours, { tu, wu, pu, pressureUnit: a.pressure_unit || "", compass })}
      </div></section>`;
    } else if (this.wx.hourlyMissing) {
      hourly = `<p class="hint">This weather source doesn't provide an hourly forecast.</p>`;
    }
    // ----- daily: range bars on a shared scale -----
    const days = this.wx.daily.slice(0, 8);
    let daily = "";
    if (days.length) {
      const all = days.flatMap((d) => [Number(d.templow ?? d.temperature), Number(d.temperature)]);
      const mn = Math.min(...all), mx = Math.max(...all), sp = Math.max(1, mx - mn);
      daily = `<section class="wcard"><h3>${days.length}-day forecast${Object.keys(this.wx.periods || {}).length ? ` <small class="hint">tap a day for details</small>` : ""}</h3><div class="wdaily">${days.map((d, i) => {
        const date = new Date(d.datetime), lo = Number(d.templow ?? d.temperature), hi = Number(d.temperature);
        const rain = d.precipitation_probability !== undefined && d.precipitation_probability !== null ? `${Math.round(d.precipitation_probability)}%`
          : d.precipitation ? `${Number(d.precipitation).toFixed(1)}${pu}` : "";
        const key = ymd(date), p = this.wx.periods?.[key] || {};
        const detail = [["Day", p.day], ["Night", p.night]].filter(([, x]) => x && (x.detailed_description || x.short_description));
        const open = this.ui.wxOpen === key;
        return `<div class="wday ${detail.length ? "tap" : ""}" ${detail.length ? `data-action="wx-day" data-day="${key}"` : ""}>
          <span class="wdn">${i === 0 ? "Today" : date.toLocaleDateString([], { weekday: "short" })}${(() => {
            const lat = this._hass.config?.latitude, lon = this._hass.config?.longitude;
            if (lat === undefined || lon === undefined) return "";
            const st = sunTimes(parseYmd(ymd(date)), lat, lon);
            return st.rise && st.set ? `<small class="wsun">☀ ${this.fmtTime(st.rise)} · ☾ ${this.fmtTime(st.set)}</small>` : "";
          })()}</span>
          <span class="wdi">${WEATHER_ICONS[d.condition] || ""}</span>
          <span class="rain">${rain}</span>
          <span class="wlo">${Math.round(lo)}°</span>
          <span class="wrange"><i style="left:${((lo - mn) / sp) * 100}%;right:${100 - ((hi - mn) / sp) * 100}%"></i></span>
          <span class="whi">${Math.round(hi)}°</span></div>
          ${open ? `<div class="wdetail">${detail.map(([label, x]) => `<p><b>${label}${x.temperature !== undefined ? ` · ${Math.round(x.temperature)}°` : ""}:</b> ${esc(x.detailed_description || x.short_description)}</p>`).join("")}</div>` : ""}`;
      }).join("")}</div></section>`;
    }
    // Rounded to ~1 km: the radar map is loaded from Windy/RainViewer and doesn't need more.
    const r2 = (v) => (v === undefined || v === null ? undefined : Math.round(v * 100) / 100);
    const at = this.wxWhere === "here" && this.wxHere ? { latitude: this.wxHere.lat, longitude: this.wxHere.lon } : this._hass.config;
    const lat = r2(at?.latitude), lon = r2(at?.longitude);
    const radarSrc = this.settings.weather_radar === "off" || lat === undefined ? null
      : this.settings.weather_radar === "rainviewer"
        ? `https://www.rainviewer.com/map.html?loc=${lat},${lon},7&oFa=0&oC=1&oU=0&oCS=1&oF=0&oAP=1&c=3&o=83&lm=1&layer=radar&sm=1&sn=1`
        : `https://embed.windy.com/embed2.html?lat=${lat}&lon=${lon}&detailLat=${lat}&detailLon=${lon}&zoom=7&level=surface&overlay=${encodeURIComponent(this.radarLayer)}&product=${["radar", "satellite"].includes(this.radarLayer) ? this.radarLayer : "ecmwf"}&menu=&message=true&marker=true&calendar=now&type=map&location=coordinates&metricWind=${a.wind_speed_unit === "mph" ? "mph" : "km%2Fh"}&metricTemp=${tu.includes("F") ? "%C2%B0F" : "%C2%B0C"}`;
    const layers = [["radar", "Radar"], ["rain", "Rain forecast"], ["thunder", "Storms"], ["wind", "Wind"], ["gust", "Gusts"], ["temp", "Temperature"], ["clouds", "Clouds"], ["satellite", "Satellite"]];
    const layerPick = this.settings.weather_radar === "rainviewer" ? "" : `<div class="seg layers">${layers.map(([v, l]) => `<button class="${this.radarLayer === v ? "on" : ""}" data-action="radar-layer" data-layer="${v}">${l}</button>`).join("")}</div>`;
    const radar = radarSrc ? `<section class="wcard"><h3>Radar &amp; maps</h3>${layerPick}
      ${this._radarAllowed() ? `<iframe class="wradar" src="${radarSrc}" loading="lazy" referrerpolicy="no-referrer" title="Weather radar"></iframe>`
        : `<button class="wradar radarbtn" data-action="radar-show">📡 Show radar map</button>`}</section>` : "";
    const extraIds = (this.settings.weather_sensors || []).filter((e) => this._hass.states[e]);
    const extras = extraIds.length ? `<section class="wcard"><h3>Air &amp; more</h3><div class="wstats">${extraIds.map((e) => {
      const st = this._hass.states[e];
      return stat(esc(st.attributes.friendly_name || e), `${esc(st.state)}${st.attributes.unit_of_measurement ? ` ${esc(st.attributes.unit_of_measurement)}` : ""}`);
    }).join("")}</div></section>` : "";
    return `<div class="wxtab">${this.renderWhereToggle()}${this.wxWhere === "here" ? "" : this.renderAlertCards()}${this._wxHintsCard()}${this._rainSoonCard()}${current}${hourly}${radar}${this._airCard()}${extras}${daily}${this._compareCard(tu, pu)}${this._moonCard()}
      <p class="hint center">Source: ${this.wxWhere === "here" ? `Open-Meteo · 📍 ${esc(this.wxHere?.place || "this screen's location")}${this.wxHere?.source === "person" ? " (your phone's location in Home Assistant)" : ""}` : esc(this.entityName(this.settings.weather_entity))} · updated ${this.fmtTime(new Date(this.wx.at))}</p></div>`;
  }

  _wxHintsCard() {
    if (this.settings.weather_hints === false) return "";
    const h = this.renderHints();
    return h ? `<section class="wcard"><h3>Today's tips</h3>${h}</section>` : "";
  }
  _rainSoonCard() {
    const r = this._rainSoon();
    if (!r || !r.bars.length) return "";
    const metric = this._isMetric();
    const max = Math.max(metric ? 2 : 0.08, ...r.bars.map((b) => b.p));
    return `<section class="wcard rainsoon"><h3>🌧️ Next 2 hours</h3>
      <p class="rsline">${r.text || "No rain expected in the next 2 hours"}</p>
      <div class="rsbars">${r.bars.map((b) => `<div class="rsb"><i style="height:${Math.max(b.p > 0 ? 6 : 2, (b.p / max) * 60)}px" title="${b.p.toFixed(metric ? 1 : 2)} ${metric ? "mm" : "in"}"></i><small>${this.fmtTime(b.t)}</small></div>`).join("")}</div></section>`;
  }
  _airCard() {
    const air = this.wxx?.air;
    const pollen = this._pollenToday();
    if ((!air || air.aqi === null || air.aqi === undefined) && !pollen.length) return "";
    const band = (v) => (v <= 50 ? ["Good", "#43a047"] : v <= 100 ? ["Moderate", "#f9a825"] : v <= 150 ? ["Unhealthy for sensitive groups", "#ef6c00"]
      : v <= 200 ? ["Unhealthy", "#c62828"] : v <= 300 ? ["Very unhealthy", "#7b1fa2"] : ["Hazardous", "#6d1b1b"]);
    let aq = "";
    if (air && air.aqi !== null && air.aqi !== undefined) {
      const [label, c] = band(air.aqi);
      const hrs = (air.hourly || []).map((x) => ({ t: new Date(x.time), v: x.aqi })).filter((x) => x.t > new Date(Date.now() - 3600000)).slice(0, 24);
      const mx = Math.max(100, ...hrs.map((x) => x.v));
      aq = `<div class="aqi"><div class="aqibadge" style="background:${c};color:${textOn(c)}"><b>${Math.round(air.aqi)}</b><small>AQI</small></div>
        <div><b>${label}</b><div class="hint">${[air.pm2_5 != null ? `PM2.5 ${Math.round(air.pm2_5)} µg/m³` : "", air.ozone != null ? `Ozone ${Math.round(air.ozone)} µg/m³` : ""].filter(Boolean).join(" · ")}</div></div></div>
        ${hrs.length > 3 ? `<div class="aqbars" title="Air quality, next 24 hours">${hrs.map((x) => `<i style="height:${Math.max(3, (x.v / mx) * 36)}px;background:${band(x.v)[1]}" title="${this.fmtTime(x.t)}: AQI ${Math.round(x.v)}"></i>`).join("")}</div><div class="hint">Next 24 hours</div>` : ""}`;
    }
    const pc = ["#9e9e9e", "#43a047", "#9ccc65", "#f9a825", "#ef6c00", "#c62828"];
    const pol = pollen.length ? `<div class="pollen">${pollen.map((p) => `<div class="pol"><span>${/tree|birch|alder|olive/i.test(p.name) ? "🌳" : /grass/i.test(p.name) ? "🌾" : "🌿"}</span>
        <b>${esc(p.name)}</b><i class="pdots">${[1, 2, 3, 4, 5].map((k) => `<em style="background:${k <= p.level ? pc[Math.min(5, p.level)] : "var(--line)"}"></em>`).join("")}</i><small>${esc(p.category || "")}${p.in_season === false ? " · out of season" : ""}</small></div>`).join("")}</div>`
      : `<p class="hint">Pollen: add a Google key in Setup → Location lookup and enable the Pollen API to see US pollen.</p>`;
    return `<section class="wcard"><h3>Air quality &amp; pollen</h3>${aq}${pol}</section>`;
  }
  _compareCard(tu, pu) {
    const days = this.wxx?.forecast?.days || [];
    const ti = days.findIndex((d) => d.date === ymd(new Date()));
    if (ti < 1) return "";
    const td = days[ti], y = days[ti - 1], ly = this.wxx.last_year;
    const r = (v) => (v === null || v === undefined ? "–" : `${Math.round(v)}°`);
    const diff = (a, b) => { if (a == null || b == null) return ""; const x = Math.round(a - b); return x === 0 ? `<small class="same">same</small>` : `<small class="${x > 0 ? "up" : "down"}">${x > 0 ? "▲" : "▼"} ${Math.abs(x)}°</small>`; };
    const past = days.slice(0, ti);
    const sum = (arr) => arr.reduce((a, d) => a + (Number(d.precip) || 0), 0);
    const metric = this._isMetric(), unit = metric ? "mm" : "in", fx = (v) => v.toFixed(metric ? 0 : 2);
    const wk = sum(past.slice(-7)), mo = sum(past.slice(-30));
    const lastRain = [...past].reverse().find((d) => Number(d.precip) >= (metric ? 1 : 0.04));
    const since = lastRain ? Math.round((parseYmd(td.date) - parseYmd(lastRain.date)) / 86400000) : null;
    return `<section class="wcard"><h3>Compared with…</h3><div class="cmp">
      <div class="cmpc"><small>Today</small><b>${r(td.high)} / ${r(td.low)}</b></div>
      <div class="cmpc"><small>Yesterday</small><b>${r(y.high)} / ${r(y.low)}</b>${diff(td.high, y.high)}</div>
      ${ly ? `<div class="cmpc"><small>This day last year</small><b>${r(ly.high)} / ${r(ly.low)}</b>${diff(td.high, ly.high)}</div>` : ""}
      <div class="cmpc"><small>Rain, last 7 days</small><b>${fx(wk)} ${unit}</b></div>
      <div class="cmpc"><small>Rain, last 30 days</small><b>${fx(mo)} ${unit}</b></div>
      <div class="cmpc"><small>Last rainy day</small><b>${since === null ? "30+ days ago" : since <= 1 ? (since === 0 ? "Today" : "Yesterday") : `${since} days ago`}</b></div>
    </div><p class="hint">▲▼ compare today's high. Past data: Open-Meteo.</p></section>`;
  }
  _moonCard() {
    const now = new Date(), m = moonInfo(now);
    const strip = [...Array(30)].map((_, i) => {
      const d = addDays(startOfDay(now), i); d.setHours(21);
      const ph = moonPhase(d).split(" ")[0];
      return `<div class="mday ${i === 0 ? "on" : ""}"><span>${ph}</span><small>${i === 0 ? "Today" : d.getDate() === 1 || i === 1 || d.getDay() === 0 ? d.toLocaleDateString([], { month: "short", day: "numeric" }) : d.getDate()}</small></div>`;
    }).join("");
    return `<section class="wcard"><h3>Moon</h3>
      <div class="moonnow"><span class="mbig">${moonPhase(now).split(" ")[0]}</span><div><b>${moonPhase(now).split(" ").slice(1).join(" ")}</b>
        <div class="hint">${m.illum}% lit · ${m.waxing ? "waxing" : "waning"} · day ${Math.floor(m.age) + 1} of 29.5</div></div></div>
      <div class="mnext">${m.next.map((x) => `<div><span>${x.icon}</span><b>${x.name}</b><small>${x.date.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}</small></div>`).join("")}</div>
      <div class="mstrip">${strip}</div>
      <p class="hint">Phase dates are from the average lunar cycle and can be off by up to a day.</p></section>`;
  }

  // One row per metric the weather service provides, aligned under the hourly chart.
  _hourlyTable(hours, { tu, wu, pu, pressureUnit, compass }) {
    const num = (v) => (v === undefined || v === null || v === "" || Number.isNaN(Number(v)) ? null : Number(v));
    const deg = (v) => (num(v) === null ? null : `${Math.round(num(v))}°`);
    const rows = [
      ["Feels like", (h) => deg(this._feels(h, { temperature_unit: tu, wind_speed_unit: wu }))],
      ["Rain chance", (h) => (num(h.precipitation_probability) === null ? null : `${Math.round(num(h.precipitation_probability))}%`)],
      [`Rain (${pu || "amt"})`, (h) => (num(h.precipitation) === null ? null : num(h.precipitation).toFixed(pu === "in" ? 2 : 1))],
      [`Wind (${wu})`, (h) => (num(h.wind_speed) === null ? null : `${Math.round(num(h.wind_speed))} ${compass(h.wind_bearing)}`)],
      [`Gust (${wu})`, (h) => (num(h.wind_gust_speed) === null ? null : `${Math.round(num(h.wind_gust_speed))}`)],
      [`Pressure${pressureUnit ? ` (${pressureUnit})` : ""}`, (h) => (num(h.pressure) === null ? null : num(h.pressure).toFixed(/hg/i.test(pressureUnit) ? 2 : 0))],
      ["Clouds", (h) => (num(h.cloud_coverage) === null ? null : `${Math.round(num(h.cloud_coverage))}%`)],
      ["Humidity", (h) => (num(h.humidity) === null ? null : `${Math.round(num(h.humidity))}%`)],
      ["Dew point", (h) => deg(h.dew_point)],
      ["UV index", (h) => (num(h.uv_index) === null ? null : `${Math.round(num(h.uv_index) * 10) / 10}`)],
    ].filter(([, get]) => hours.some((h) => get(h) !== null));
    if (!rows.length) return "";
    void tu;
    return `<table class="wtable" style="width:${44 * hours.length + 104}px">${rows.map(([label, get]) =>
      `<tr><th>${esc(label)}</th>${hours.map((h) => `<td>${get(h) ?? "–"}</td>`).join("")}</tr>`).join("")}</table>`;
  }
}
