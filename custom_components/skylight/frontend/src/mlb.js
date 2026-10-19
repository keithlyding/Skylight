/* Skylight panel: favorite baseball team (methods mixed into SkylightPanel).

   Today screen: a note on game days (time, a minute-by-minute countdown in the last hour, the live
   score, then the final). Tapping it opens the team page: schedule, division, wild-card race and who
   to root for in today's other games. Home Assistant fetches and works everything out (mlb.py). */

import { esc } from "./helpers.js?v=1.57.8";

// id: [abbreviation, short name] (names only; the server has the rest)
export const MLB_TEAMS = {
  108: ["LAA", "Angels"], 109: ["ARI", "D-backs"], 110: ["BAL", "Orioles"], 111: ["BOS", "Red Sox"], 112: ["CHC", "Cubs"],
  113: ["CIN", "Reds"], 114: ["CLE", "Guardians"], 115: ["COL", "Rockies"], 116: ["DET", "Tigers"], 117: ["HOU", "Astros"],
  118: ["KC", "Royals"], 119: ["LAD", "Dodgers"], 120: ["WSH", "Nationals"], 121: ["NYM", "Mets"], 133: ["ATH", "Athletics"],
  134: ["PIT", "Pirates"], 135: ["SD", "Padres"], 136: ["SEA", "Mariners"], 137: ["SF", "Giants"], 138: ["STL", "Cardinals"],
  139: ["TB", "Rays"], 140: ["TEX", "Rangers"], 141: ["TOR", "Blue Jays"], 142: ["MIN", "Twins"], 143: ["PHI", "Phillies"],
  144: ["ATL", "Braves"], 145: ["CWS", "White Sox"], 146: ["MIA", "Marlins"], 147: ["NYY", "Yankees"], 158: ["MIL", "Brewers"],
};
export const mlbName = (id) => (MLB_TEAMS[id] || ["", `Team ${id}`])[1];
const abbr = (id) => (MLB_TEAMS[id] || [String(id)])[0];
const HOUR = 3600000;

// Minutes until first pitch (null if not a scheduled game).
export const mlbMinsTo = (g, now = Date.now()) => (g && g.state === "Preview" && g.start ? Math.ceil((Date.parse(g.start) - now) / 60000) : null);

export class MlbView {
  get mlbTeam() {
    const t = this.settings.mlb_team === undefined ? 109 : this.settings.mlb_team;
    return t && MLB_TEAMS[Number(t)] ? Number(t) : null;
  }

  // Called from the clock tick: every 5 minutes, every minute in the last hour and while playing.
  _mlbMaybe() {
    if (!this.mlbTeam || this._mlbBusy) return;
    const g = this.mlbToday?.game;
    const m = mlbMinsTo(g);
    const fast = g && (g.state === "Live" || (m !== null && m <= 60));
    const every = fast ? 60000 : 5 * 60000;
    if (this._mlbAt && Date.now() - this._mlbAt < every && this.mlbToday?.team === this.mlbTeam) return;
    this._loadMlb();
  }

  async _loadMlb() {
    this._mlbBusy = true; this._mlbAt = Date.now();
    try {
      const r = await this._hass.callWS({ type: "skylight/mlb/today" });
      const before = JSON.stringify(this.mlbToday || null);
      this.mlbToday = r;
      if (JSON.stringify(r) !== before && (this.ui.tab === "home" || this.ui.tab === "team") && !this.ui.dialog) this.render();
    } catch (e) { /* offline: keep what we had */ } finally { this._mlbBusy = false; }
  }

  async _loadMlbTeam() {
    this.ui.mlbLoading = true;
    try { this.mlbTeamData = await this._hass.callWS({ type: "skylight/mlb/team" }); }
    catch (e) { this.mlbTeamData = { error: String(e?.message || e) }; }
    this.ui.mlbLoading = false;
    if (this.ui.tab === "team") this.render();
  }

  _mlbVs(g, team) {
    const home = g.home === team;
    return `${home ? "vs" : "@"} ${esc(mlbName(home ? g.away : g.home))}`;
  }

  _mlbScore(g) {
    return `${abbr(g.away)} ${g.away_score ?? 0} – ${abbr(g.home)} ${g.home_score ?? 0}`;
  }

  // What the Today note (and the team page header) says about one game.
  mlbLine(g, team, now = Date.now()) {
    const vs = this._mlbVs(g, team);
    if (g.state === "Live") {
      const where = g.inning ? ` · ${esc(g.half || "")} ${esc(g.inning)}`.replace(/ +/g, " ") : "";
      return { cls: "live", head: `${vs} · LIVE`, main: this._mlbScore(g) + where };
    }
    if (g.state === "Final") {
      const mine = g.home === team ? g.home_score : g.away_score, theirs = g.home === team ? g.away_score : g.home_score;
      const wl = mine === undefined || mine === null ? "" : mine > theirs ? " · Win! 🎉" : mine < theirs ? " · Loss" : "";
      const special = g.detail && !/^(Final|Game Over|Completed Early)/.test(g.detail) ? ` (${esc(g.detail)})` : "";
      return { cls: "final", head: `${vs} · Final${special}`, main: this._mlbScore(g) + wl };
    }
    const t = this.fmtTime(new Date(g.start));
    const m = mlbMinsTo(g, now);
    if (g.detail && /Postponed|Suspended|Cancelled|Delayed/.test(g.detail)) return { cls: "", head: vs, main: esc(g.detail) };
    if (m !== null && m <= 60) {
      return { cls: "soon", head: `${vs} · ${t}`, main: m > 0 ? `First pitch in ${m} min` : "First pitch any minute" };
    }
    return { cls: "", head: vs, main: `Today at ${t}` };
  }

  renderMlbNote() {
    const team = this.mlbTeam, g = this.mlbToday?.team === team ? this.mlbToday.game : null;
    if (!team || !this.mlbToday || this.mlbToday.team !== team) return "";
    if (!g) return ""; // no game today: just the small ⚾ button in the toolbar (renderMlbButton)
    const l = this.mlbLine(g, team);
    return `<button class="mlbnote ${l.cls}" data-action="mlb-open"><span class="mlbball">⚾</span>
      <span class="mlbtxt"><small>${esc(mlbName(team))} ${l.head}</small><b>${l.main}</b></span><span class="mlbgo">›</span></button>`;
  }

  // Small ⚾ button by "+ Event" on days without a game, so the team page is always one tap away.
  renderMlbButton() {
    const team = this.mlbTeam;
    if (!team || (this.mlbToday?.team === team && this.mlbToday.game)) return "";
    return `<button class="mlbbtn" data-action="mlb-open" title="${esc(mlbName(team))}: standings & schedule" aria-label="${esc(mlbName(team))} standings and schedule">⚾</button>`;
  }

  renderTeam() {
    const team = this.mlbTeam;
    const back = `<div class="toolbar"><button data-action="tab" data-tab="home">‹ Back</button><h2 class="mlbtitle">⚾ ${team ? esc(mlbName(team)) : "Baseball"}</h2>
      <button data-action="mlb-refresh">↻ Refresh</button></div>`;
    if (!team) return `${back}<div class="empty"><p>No favorite team. Pick one in Setup → Birthdays &amp; anniversaries.</p></div>`;
    const d = this.mlbTeamData;
    if (!d) return `${back}<div class="empty"><p>Loading…</p></div>`;
    if (d.error) return `${back}<div class="empty"><p>Couldn't load baseball info: ${esc(d.error)}</p></div>`;
    const errs = Object.keys(d.errors || {});
    const g = this.mlbToday?.team === team ? this.mlbToday.game : null;
    const today = g ? (() => { const l = this.mlbLine(g, team); return `<div class="mlbnote big ${l.cls}"><span class="mlbball">⚾</span><span class="mlbtxt"><small>Today ${l.head}</small><b>${l.main}</b></span></div>`; })() : "";
    const row = (r, extra = "") => `<tr class="${r.id === team ? "me" : ""} ${extra}"><td>${esc(r.name)}</td><td>${r.w}</td><td>${r.l}</td><td>${r.gb === 0 ? "–" : (r.gb > 0 ? "" : "+") + Math.abs(r.gb).toFixed(1).replace(/\.0$/, "")}</td></tr>`;
    const table = (title, rows, cutAfter) => `<div class="mlbcard"><h3>${esc(title)}</h3>${rows.length ? `<table class="mlbtab">
      <tr><th>Team</th><th>W</th><th>L</th><th>GB</th></tr>
      ${rows.map((r, i) => row(r, cutAfter && i === cutAfter - 1 ? "cut" : "")).join("")}</table>` : `<p class="hint">No standings yet.</p>`}
      ${cutAfter ? `<p class="hint">Top ${cutAfter} get the wild cards (line). GB = games behind the last spot; + = ahead of it.</p>` : ""}</div>`;
    const sched = (d.schedule || []).map((s) => {
      const dt = new Date(s.start);
      const res = s.state === "Final" ? `<b>${this._mlbScore(s)}</b>` : s.state === "Live" ? `<b class="mlblive">LIVE ${this._mlbScore(s)}</b>` : esc(this.fmtTime(dt));
      return `<tr><td>${esc(dt.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" }))}</td><td>${this._mlbVs(s, team)}</td><td>${res}</td></tr>`;
    }).join("");
    const root = (d.rooting || []).map((r) => `<li><span class="mlbfor">Root for ${esc(mlbName(r.root_for))}</span> ${this._mlbVs(r, r.root_for)}
      <span class="hint">· ${r.state === "Live" ? `LIVE ${this._mlbScore(r)}` : r.state === "Final" ? `Final ${this._mlbScore(r)}` : esc(this.fmtTime(new Date(r.start)))}</span>
      <div class="hint">Against ${esc(mlbName(r.root_against))}: ${esc(r.reason)}</div></li>`).join("");
    return `${back}<div class="mlbpage">
      ${today}
      ${errs.length ? `<p class="hint">Some info couldn't be loaded (${esc(errs.join(", "))}); showing what we have.</p>` : ""}
      <div class="mlbcard"><h3>Who to root for today</h3>${d.rooting_note ? `<p class="mlbnote2">${esc(d.rooting_note)}</p>` : ""}${root ? `<ul class="mlbroot">${root}</ul>`
        : `<p class="hint">${d.phase && d.phase !== "regular" ? "No games today that matter for us." : `No games today involving teams in the race with the ${esc(mlbName(team))}.`}</p>`}</div>
      ${table(d.division?.name || "Division", d.division?.rows || [])}
      ${table(d.wildcard?.name || "Wild card", d.wildcard?.rows || [], d.wildcard?.spots || 3)}
      <div class="mlbcard"><h3>Coming up</h3>${sched ? `<table class="mlbtab">${sched}</table>` : `<p class="hint">No games in the next 3 weeks.</p>`}</div>
    </div>`;
  }
}
