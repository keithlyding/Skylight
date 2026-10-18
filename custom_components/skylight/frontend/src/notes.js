/* Skylight panel: family message board and event countdowns (methods mixed into SkylightPanel).

   Notes: sticky notes on the Today screen. Anyone can post or remove one (no setup PIN); each can
   disappear after today, tomorrow or a week, or stay. Countdowns: "Show countdown" in the event
   editor adds the event to the Upcoming card ("⏳ Disney trip · 23 days"). Stored by notes.py. */

import { startOfDay, pad, uid, esc } from "./helpers.js?v=1.57.2";

export const NOTE_COLORS = ["#fff3a8", "#ffd1dc", "#c8f0d0", "#cfe3ff", "#ffe0b8", "#e6d6ff"];
const EXPIRY = [["today", "Today"], ["tomorrow", "Tomorrow"], ["week", "A week"], ["never", "Until removed"]];

export class NotesView {
  // ---------- message board ----------
  liveNotes(now = new Date()) {
    return (this.data.notes || []).filter((n) => !n.expires || new Date(n.expires) > now);
  }

  renderBoard() {
    const notes = this.liveNotes();
    return `<div class="board"><div class="uhead">📌 Messages<button class="boardadd" data-action="note-new">＋ Note</button></div>
      ${notes.length ? `<div class="notes">${notes.slice().reverse().map((n) => {
        const m = n.by ? this.members.find((x) => x.id === n.by) : null;
        return `<div class="note" style="--nc:${esc(n.color || NOTE_COLORS[0])}">
          <p>${esc(n.text)}</p>
          <small>${m ? `<span class="av sm" style="background:${m.color}">${m.avatar}</span>${esc(m.name)} · ` : ""}${this._noteAge(n)}</small>
          <button class="notex" data-action="note-delete" data-id="${esc(n.id)}" aria-label="Remove note">✕</button></div>`;
      }).join("")}</div>` : `<p class="hint">No messages. Tap ＋ Note to leave one for the family.</p>`}</div>`;
  }

  _noteAge(n) {
    const c = new Date(n.created), now = new Date();
    const days = Math.round((startOfDay(now) - startOfDay(c)) / 864e5);
    return days === 0 ? this.fmtTime(c) : days === 1 ? "yesterday" : c.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
  }

  openNoteDialog() {
    const dlg = {
      type: "note", color: NOTE_COLORS[0], expires: "week", by: null,
      html: () => `
        <h2>📌 New note</h2>
        <label>Message<textarea id="note-text" rows="3" maxlength="300" placeholder="Soccer moved to 5:00! · Love you all ❤️" data-autofocus></textarea></label>
        <div class="label">From <small class="hint">(optional)</small></div>
        <div class="seg wrap">${this.members.map((m) => `<button class="${dlg.by === m.id ? "on" : ""}" data-action="note-by" data-id="${m.id}">${m.avatar} ${esc(m.name)}</button>`).join("")}</div>
        <div class="label">Show it</div>
        <div class="seg">${EXPIRY.map(([v, l]) => `<button class="${dlg.expires === v ? "on" : ""}" data-action="note-exp" data-v="${v}">${l}</button>`).join("")}</div>
        <div class="label">Color</div>
        <div class="swatches">${NOTE_COLORS.map((c) => `<button class="swatch ${dlg.color === c ? "on" : ""}" style="background:${c}" data-action="note-color" data-c="${c}" aria-label="Color"></button>`).join("")}</div>
        <div class="actions"><span class="spacer"></span><button data-action="close">Cancel</button><button class="primary" data-action="note-save">Post</button></div>`,
    };
    this._openDialog(dlg);
  }

  async saveNote() {
    const dlg = this.ui.dialog;
    const text = this.shadowRoot.getElementById("note-text")?.value.trim();
    if (!text) { this._toast("Write something first"); return; }
    await this._ws({ type: "skylight/note/add", text, expires: dlg.expires, color: dlg.color, by: dlg.by });
    this.closeDialog();
  }

  // ---------- countdowns ----------
  _cdKey(c) { return c.uid || `${c.summary}|${c.start}`; }
  // The countdown stored for an event in the editor, if any.
  _countdownOf(ev) {
    const uids = new Set((ev.copies || [ev]).map((c) => c.uid).filter(Boolean));
    return Object.values(this.data.countdowns || {}).find((c) => (c.uid && uids.has(c.uid))
      || (c.summary === (ev.raw ?? ev.summary) && +this._cdStart(c) === +ev.start)) || null;
  }
  _cdStart(c) { return c.all_day ? startOfDay(new Date(`${c.start.slice(0, 10)}T00:00:00`)) : new Date(c.start); }

  // Upcoming-card rows: [{title, emoji, days, text}], soonest first. Follows the event if it moved.
  countdownRows(now = new Date()) {
    const evs = this.visibleEvents ? this.visibleEvents() : [];
    return Object.values(this.data.countdowns || {}).map((c) => {
      const live = c.uid && evs.find((e) => (e.copies || [e]).some((x) => x.uid === c.uid));
      const start = live ? live.start : this._cdStart(c);
      const days = Math.round((startOfDay(start) - startOfDay(now)) / 864e5);
      return { c, start, days, title: live ? live.summary : c.summary };
    }).filter((r) => r.days >= 0 && !(r.days === 0 && !r.c.all_day && r.start < now))
      .sort((a, b) => a.start - b.start)
      .map((r) => ({ ...r, text: r.days === 0 ? (r.c.all_day ? "Today! 🎉" : `Today at ${this.fmtTime(r.start)} 🎉`)
        : r.days === 1 ? "Tomorrow!" : `${r.days} days · ${r.start.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}` }));
  }

  renderCountdownRows() {
    return this.countdownRows().map((r) => `<div class="urow cd ${r.days === 0 ? "today" : ""}" style="--c:var(--accent, #4a7dff)"><span class="uemoji">${esc(r.c.emoji || "⏳")}</span>
      <span class="utext"><b>${esc(r.title)}</b><small>${esc(r.text)}</small></span></div>`).join("");
  }

  async _saveCountdown(ev, form, payload) {
    const want = !!this.shadowRoot.getElementById("ev-countdown")?.checked;
    const old = ev ? this._countdownOf(ev) : null;
    if (!want && !old) return;
    const keepUid = old?.uid && ev && (ev.copies || [ev]).some((c) => c.uid === old.uid && this._canUpdate(c.entity)) ? old.uid : null;
    const d = form.start;
    const start = form.allDay ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` : d.toISOString();
    const countdown = want ? { summary: payload.summary, start, all_day: !!form.allDay, ...(keepUid ? { uid: keepUid } : {}) } : null;
    try { await this._ws({ type: "skylight/countdown/set", key: old ? this._cdKey(old) : "", countdown }); }
    catch (e) { this._toast(`Saved, but the countdown wasn't: ${e.message || e}`); }
  }
}
