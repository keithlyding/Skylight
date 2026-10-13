/* Skylight panel: photos and screensaver (methods mixed into SkylightPanel). */

import { parseYmd, esc } from "./helpers.js?v=1.49.3";

export class PhotosView {

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

  _checkIdle() {
    // On a wall display, drift back to "now" after 3 minutes without touches.
    if (this.cook) return; // cooking: keep the recipe on screen
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
    const items = res.items || res.urls.map((url) => ({ url })); // server not restarted yet: no captions
    this._urlCache = { at: Date.now(), urls: items, n: (this.data.photos || []).length, error: res.error };
    return items;
  }
  async startSaver() {
    if (this.ui.saver) return;
    this.relock();
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
      <div class="saver-clock"><div id="sv-time"></div><div id="sv-date"></div></div>
      <div class="saver-cap" id="sv-cap"></div></div>`;
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
    const item = this._slideOrder[this._slideIdx++ % this._slideOrder.length];
    const src = item.url;
    back.onload = () => {
      back.classList.add("show"); front.classList.remove("show"); bg.src = src;
      const cap = this.shadowRoot.getElementById("sv-cap");
      if (cap) cap.innerHTML = this.settings.photo_captions === false ? "" : this._photoCaption(item);
    };
    back.src = src;
  }

  // "June 14, 2024 · Estes Park, Colorado" (either part may be missing).
  _photoCaption(item) {
    const parts = [];
    if (item.taken && /^\d{4}-\d{2}-\d{2}$/.test(item.taken)) {
      const d = parseYmd(item.taken);
      parts.push(`<span>📅 ${esc(d.toLocaleDateString([], { month: "long", day: "numeric", year: "numeric" }))}</span>`);
    }
    if (item.place) parts.push(`<span>📍 ${esc(item.place)}</span>`);
    // People Immich recognized and named (Setup > Photos from Immich > show people's names)
    if (this.settings.photo_people !== false && item.people?.length) { // names come from Immich face recognition
      const names = item.people.length > 4 ? `${item.people.slice(0, 4).join(", ")} +${item.people.length - 4}` : item.people.join(", ");
      parts.push(`<span>👥 ${esc(names)}</span>`);
    }
    return parts.join("");
  }

  renderPhotos() {
    const photos = this.data.photos || [];
    // Uploaded photos need login: use the signed URLs the server hands out.
    const signed = {};
    for (const i of this._urlCache?.urls || []) if (i.name) signed[i.name] = i.url;
    const stale = !this._urlCache || Date.now() - this._urlCache.at > 3600000; // signed links last 24 h; refresh hourly
    if ((stale || photos.some((p) => !signed[p])) && photos.length && !this._photoUrlsLoading && Date.now() - (this._photoUrlsTried || 0) > 60000) {
      this._photoUrlsLoading = true; this._photoUrlsTried = Date.now(); // at most one try a minute (no loop if it fails)
      this._urlCache = null;
      this._photoUrls().catch(() => {}).finally(() => { this._photoUrlsLoading = false; if (this.ui.tab === "settings") this.render(); });
    }
    const uploads = this.settings.allow_uploads !== false;
    return `<div class="toolbar"><div class="nav"><h2>Photos</h2></div>
      <div>${uploads ? `<input type="file" id="photo-input" accept="image/*" multiple hidden data-change="upload-photos">
        <button data-action="upload-photos">⬆ Upload</button>` : ""}
        <button class="primary" data-action="start-saver" ${this._hasPhotoSource() ? "" : "disabled"}>▶ Slideshow</button></div></div>
      ${this.data.immich?.url && this.data.immich?.has_key ? `<p class="hint">📷 Also showing ${[
        this.data.immich.albums?.length ? `${this.data.immich.albums.length} Immich album${this.data.immich.albums.length > 1 ? "s" : ""}` : "",
        this.data.immich.favorites ? "Immich favorites" : "",
      ].filter(Boolean).join(" + ") || "no Immich albums yet"}. Change under Photos from Immich below.</p>` : ""}
      ${photos.length ? `<div class="pgrid">${photos.map((p) => `<div class="ph">${signed[p] ? `<img loading="lazy" src="${esc(signed[p])}">` : ""}<button class="x" data-action="delete-photo" data-name="${esc(p)}">✕</button></div>`).join("")}</div>`
        : this._hasPhotoSource() ? "" : `<p class="hint">No photos yet. ${uploads ? "Upload photos from this tablet or your phone (open the " + this.appName + " panel in the Home Assistant app)." : "Photo uploads are turned off (Display → Allow photo uploads)."} They play as a screensaver when nobody is using the display. Or connect Immich below.</p>`}`;
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
}
