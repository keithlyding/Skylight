/* Skylight panel: verse of the day (methods mixed into SkylightPanel).

   One verse a day, the same on every screen, on the Today screen and under the photo screensaver's
   clock. Home Assistant picks the reference (the family's own and a built-in list), fetches the text
   in the chosen translation and remembers it for the day (verses.py). */

import { ymd, esc } from "./helpers.js?v=1.57.8";

export const VERSE_TRANSLATIONS = [["esv", "ESV (English Standard Version, needs a free key)"], ["net", "NET Bible (no key)"], ["web", "World English Bible (no key)"], ["kjv", "King James Version (no key)"]];
const RETRY = 10 * 60000; // offline text showing, or the request failed: ask again this often

export class VerseView {
  get verseOn() { return this.settings.verse_today !== false || this.settings.verse_saver !== false; }

  // Called from the clock tick: once a day, more often only while the built-in offline text is showing.
  _verseMaybe() {
    if (!this.verseOn || this._verseBusy) return;
    if (this.verse?.date === ymd(new Date()) && !this.verse.offline) return;
    if (Date.now() - (this._verseAt || 0) < RETRY) return;
    this._loadVerse();
  }

  async _loadVerse() {
    this._verseBusy = true; this._verseAt = Date.now();
    try {
      const r = await this._hass.callWS({ type: "skylight/verse/today" });
      const changed = JSON.stringify(r || null) !== JSON.stringify(this.verse || null);
      this.verse = r || null;
      if (changed) this._verseChanged();
    } catch (e) { /* offline: keep what we had */ } finally { this._verseBusy = false; }
  }

  _verseChanged() {
    const sv = this.shadowRoot.getElementById("sv-verse");
    if (sv) sv.innerHTML = this.renderSaverVerse(true);
    if (this.ui.tab === "home" && !this.ui.dialog && !this.ui.saver) this.render();
  }

  // Setup changed the translation or the family's verses: fetch again.
  _verseReset() { this.verse = null; this._verseAt = 0; setTimeout(() => this._loadVerse(), 300); }

  renderVerseNote() {
    const v = this.verse;
    if (this.settings.verse_today === false || !v?.text) return "";
    return `<div class="verse ${v.text.length > 260 ? "long" : ""}" title="${esc(v.name || "")}"><p>${esc(v.text)}</p>
      <small>📖 ${esc(v.reference)} <span class="vtr">${esc(v.translation)}</span></small></div>`;
  }

  renderSaverVerse(inner = false) {
    const v = this.settings.verse_saver === false ? null : this.verse;
    const body = v?.text ? `<p class="${v.text.length > 260 ? "long" : ""}">${esc(v.text)}</p><small>${esc(v.reference)} (${esc(v.translation)})</small>` : "";
    return inner ? body : `<div class="saver-verse" id="sv-verse">${body}</div>`;
  }

  renderVerseSettings() {
    const s = this.settings, hasKey = !!this.data.bible?.has_esv_key;
    const code = VERSE_TRANSLATIONS.some(([c]) => c === s.verse_translation) ? s.verse_translation : "esv";
    const fam = Array.isArray(s.family_verses) ? s.family_verses : [];
    return `<section class="card">
      <h2>📖 Bible verse</h2>
      <p class="hint">A verse each day, the same on every screen${this.verse?.text ? `: today it's <b>${esc(this.verse.reference)}</b> (${esc(this.verse.translation)})${this.verse.offline ? ` — <b>built-in text</b>, because the ${esc(this.verse.translation === "KJV" ? "online" : this.verse.translation)} text couldn't be fetched${this.verse.error ? `: ${esc(this.verse.error)}` : ""}` : ""}` : ""}.</p>
      <div class="row">
        <label class="inline"><input type="checkbox" data-change="setting" data-key="verse_today" ${s.verse_today !== false ? "checked" : ""}> On the Today screen</label>
        <label class="inline"><input type="checkbox" data-change="setting" data-key="verse_saver" ${s.verse_saver !== false ? "checked" : ""}> On the photo screensaver</label></div>
      <label class="inline">Translation <select data-change="setting" data-key="verse_translation">${VERSE_TRANSLATIONS.map(([v, l]) => `<option value="${v}" ${code === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>
      <p class="hint">${hasKey ? "✅ ESV key saved." : "The ESV needs a key from Crossway (free for personal use): sign up at <b>api.esv.org</b>, create an application, and paste its key here. Until then the NET Bible is shown."} NASB, NIV and CSB aren't offered: their publishers only license them through paid services.</p>
      <div class="additem"><input id="esv-key" type="password" autocomplete="off" data-fresh="1" placeholder="${hasKey ? "•••••• saved" : "ESV API key"}">
        <button class="primary" data-action="esv-save">Save key</button>
        ${hasKey ? `<button data-action="esv-clear">Remove</button>` : ""}</div>
      <label>Our family's verses <small class="hint">(one reference per line, like <i>Psalm 23:1-3</i> or <i>1 John 4:19</i>)</small>
        <textarea id="family-verses" rows="3" data-change="family-verses" placeholder="Joshua 24:15&#10;Philippians 4:13">${esc(fam.join("\n"))}</textarea></label>
      <label class="inline"><input type="checkbox" data-change="setting" data-key="verse_only_family" ${s.verse_only_family ? "checked" : ""}> Only our verses</label>
      <p class="hint">Your verses take every other day, alternating with a built-in list of well-known verses, or every day with "Only our verses".</p>
    </section>`;
  }
}
