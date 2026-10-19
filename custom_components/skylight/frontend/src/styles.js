/* Skylight panel: all CSS. */

export const STYLES = `
.pmeals { display:flex; flex-direction:column; gap:10px; }
.pmday { background:var(--card); border-radius:16px; padding:10px 12px; box-shadow:0 1px 4px rgba(0,0,0,.06); }
.pmday.today { outline:3px solid var(--accent); }
.pmday h3 { margin:2px 0 6px; font-size:17px; } .pmday h3 small { color:var(--muted); font-weight:600; }
.pmslot { display:flex; align-items:center; gap:10px; width:100%; text-align:left; padding:6px 4px; background:none; box-shadow:none; border-top:1px solid var(--line); border-radius:0; }
.pmicon { width:40px; height:40px; flex:none; display:grid; place-items:center; font-size:24px; }
.pmicon img { width:40px; height:40px; border-radius:10px; object-fit:cover; }
.pmtext { display:flex; flex-direction:column; min-width:0; } .pmtext small { color:var(--muted); font-weight:700; font-size:12px; }
.pmtext b { font-size:15px; } .pmslot.pmempty .add { color:var(--muted); font-weight:600; }
/* ---- layout frame ---- */
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
/* The visible screen height (dvh follows iOS's changing visible area). Not "100%": Home Assistant's
   panel container has no fixed height, and sizing to it made the calendar resize itself in a loop. */
.app { display:flex; height:100vh; height:100dvh; background:var(--bg); overflow:hidden; }
.rail { width:calc(clamp(92px, 10vh, 140px) + env(safe-area-inset-left)); flex:none; display:flex; flex-direction:column; align-items:center; gap:6px;
  padding:max(14px, env(safe-area-inset-top)) 6px max(14px, env(safe-area-inset-bottom)) calc(6px + env(safe-area-inset-left)); background:var(--card); border-right:1px solid var(--line); overflow-y:auto; }
.logo { font-size:30px; color:#ff9f43; margin-bottom:8px; }
.tab { width:80px; display:flex; flex-direction:column; align-items:center; gap:4px; padding:14px 4px; background:none; box-shadow:none; font-size:13px; color:var(--muted); }
.tab.active { background:var(--bg); color:var(--accent); font-weight:700; }
.tab ha-icon { --mdc-icon-size:32px; }
main { flex:1; display:flex; flex-direction:column; min-width:0; }
header { display:flex; align-items:center; gap:16px; padding:max(14px, env(safe-area-inset-top)) max(22px, env(safe-area-inset-right)) 6px 22px; }
.when { min-width:190px; }
.clock { font-size:44px; font-weight:800; line-height:1; letter-spacing:-1px; }
.date { color:var(--muted); font-weight:600; margin-top:2px; }
.members { flex:1; display:flex; flex-wrap:wrap; gap:8px; justify-content:center; }
.mchip { display:flex; align-items:center; gap:8px; padding:4px 14px 4px 4px; border-radius:999px; font-weight:700; border:2px solid transparent; }
.mchip.on { border-color:var(--c); }
.swatches.colorgrid { display:grid; grid-template-columns:repeat(12, minmax(0, 1fr)); gap:5px; max-width:480px; }
.swatches.colorgrid .swatch { width:100%; height:auto; aspect-ratio:1; border-radius:50%; padding:0; }
.customcolor { display:flex; flex-wrap:wrap; align-items:center; gap:8px; margin-top:8px; }
.customcolor .wheel { flex-direction:row; align-items:center; gap:6px; margin:0; flex:0 0 auto; font-weight:700; cursor:pointer; }
.customcolor .wheel input { width:44px; height:36px; padding:0; border:0; background:none; cursor:pointer; }
.customcolor #m-hex { width:110px; font-family:monospace; }
.customcolor .preview { padding:6px 12px; border-radius:10px; font-weight:800; }
.mchip.dim { opacity:.45; }
.av { display:inline-grid; place-items:center; width:32px; height:32px; border-radius:50%; font-size:18px; flex:none; }
.av.big { width:48px; height:48px; font-size:26px; }
.weather { font-size:30px; display:flex; align-items:center; gap:6px; }
.weather b { font-size:32px; }
.content { flex:1; overflow-y:auto; padding:6px max(22px, env(safe-area-inset-right)) max(22px, env(safe-area-inset-bottom)) 22px; }
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
  .caltool { display:grid; grid-template-columns:auto minmax(0,1fr) auto auto; grid-template-areas:"nav title search fab" "seg seg seg seg"; column-gap:8px; row-gap:10px; }
  .caltool .nav { grid-area:nav; } .caltool h1 { grid-area:title; } .caltool .fab { grid-area:fab; }
  .caltool .seg { grid-area:seg; justify-self:start; max-width:100%; overflow-x:auto; }
}
.nav { display:flex; align-items:center; gap:8px; }
.jump { position:relative; display:inline-flex; }
.jumpdate { position:absolute; left:0; top:100%; width:1px; height:1px; opacity:0; border:0; padding:0; margin:0; pointer-events:none; }
.seg { display:flex; background:var(--card); border-radius:14px; padding:4px; gap:2px; box-shadow:0 1px 2px rgba(0,0,0,.06); }
.seg button { box-shadow:none; background:none; }
.seg button.on { background:var(--accent); color:#fff; font-weight:700; }
.empty { text-align:center; padding:60px 20px; color:var(--muted); }
.empty h2 { color:var(--ink); }
.hint { color:var(--muted); font-size:14px; }
.center { text-align:center; }
/* week */
.week { display:grid; grid-template-columns:repeat(7, minmax(0,1fr)); gap:10px; min-height:calc(100vh - 190px); }
.dh { display:flex; align-items:baseline; gap:6px; padding:0 4px 6px; border-bottom:1px solid var(--line); cursor:pointer; flex-wrap:wrap; }
.dh .dn { color:var(--muted); font-weight:700; text-transform:uppercase; font-size:13px; }
.dh .dd { font-size:26px; font-weight:800; }
.dh.today .dd { color:var(--accent); }
.dh .wx { margin-left:auto; font-size:13px; color:var(--muted); }
.evs { display:flex; flex-direction:column; gap:6px; flex:1; }
.ev { display:flex; align-items:center; gap:6px; text-align:left; padding:6px 8px; border-radius:12px; background:color-mix(in srgb, var(--c) 18%, var(--card)); border-left:5px solid var(--c); box-shadow:none; font-size:14px; width:100%; }
.ev.allday { background:var(--c); color:var(--on, #fff); font-weight:700; border-left:0; }
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
.tg-adgrid { grid-column:2 / -1; display:grid; grid-auto-rows:auto; row-gap:3px; padding:4px 0; max-height:104px; overflow-y:auto; position:relative; }
.tg-adbg { border-left:1px solid var(--line); margin:-4px 0; }
.tg-adbar { min-width:0; padding:0 4px; z-index:1; display:flex; }
.tg-adbar .ev { flex:1; min-width:0; }
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
/* Set by _fitEvents when two lines don't fit: title and time on one line, the title keeps priority. */
.tg-ev.oneline { flex-direction:row; align-items:center; gap:6px; padding-top:1px; padding-bottom:1px; }
.tg-ev.oneline b { display:block; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; flex:0 1 auto; min-width:2em; }
.tg-ev.oneline span { flex:0 1000 auto; min-width:0; }
.tg-ev.oneline span ~ span { display:none; }
.tg-ev.tiny { font-size:11px; } .tg-ev.tiny span { display:none; }
.tg-now { position:absolute; left:0; right:0; border-top:2px solid #ff4757; z-index:2; pointer-events:none; }
.tg-now::before { content:""; position:absolute; left:-5px; top:-6px; width:10px; height:10px; border-radius:50%; background:#ff4757; }
.hometool { margin-top:0; }
/* Fewer calendar days = a wider side column, so every kid's chores fit without scrolling. */
.home.d7 { grid-template-columns:minmax(0,3fr) minmax(230px,1fr); }
.home.d5 { grid-template-columns:minmax(0,1.4fr) minmax(260px,1fr); }
.home.d3 { grid-template-columns:minmax(0,1.05fr) minmax(260px,1fr); }
.home.d1, .home.agenda { grid-template-columns:minmax(0,1fr) minmax(260px,1.25fr); }
/* day (legacy) */
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
.sugg button.keep { background:var(--bg); }
.sugg .hint { padding:8px 12px; }
.sugg .attrib { font-size:10px; color:var(--muted); padding:4px 12px; text-align:right; }
.emojisearch { margin:0 0 8px; }
.iconitems { display:flex; flex-wrap:wrap; gap:4px; }
.icongrid .emojisearch { width:100%; }
#avatar-grid { max-height:190px; overflow-y:auto; }
.iconpick { position:relative; }
.iconbtn { font-size:30px; line-height:1; padding:6px 10px; background:var(--bg); box-shadow:none; border:1px solid var(--line); display:flex; align-items:center; gap:4px; }
.iconbtn small { font-size:12px; color:var(--muted); }
.icongrid { position:absolute; z-index:6; top:100%; left:0; width:min(470px, 80vw); max-height:260px; overflow-y:auto; display:flex; flex-wrap:wrap; gap:4px; padding:8px;
  background:var(--card); border:1px solid var(--line); border-radius:14px; box-shadow:0 10px 30px rgba(0,0,0,.18); }
.srow .bar { width:5px; align-self:stretch; background:var(--c); border-radius:4px; }
/* Events shared by several people: diagonal stripes in each person's color (like Skylight) */
.ev.multi, .tg-ev.multi { background:var(--stripes-soft); }
.ev.multi.allday { background:var(--stripes-solid); text-shadow:0 1px 2px rgba(0,0,0,.55); }
.ev.multi .s, .tg-ev.multi b { text-shadow:0 0 3px var(--card), 0 0 6px var(--card); }
.ev.multi.allday .s { text-shadow:0 1px 2px rgba(0,0,0,.6); }
.srow.multi .bar { background:var(--bar); }
.srow .sm { display:flex; flex-direction:column; flex:1; min-width:0; }
/* Finished events are dimmed in every view; the one happening now is outlined. */
.ev.past, .tg-ev.past, .srow.past { opacity:.45; }
.tg-ev.evon { outline:2px solid var(--c); outline-offset:-1px; box-shadow:0 0 0 3px color-mix(in srgb, var(--c) 25%, transparent); z-index:2; }
.srow.evon { background:color-mix(in srgb, var(--c) 10%, transparent); border-radius:12px; }
.evsoon { color:var(--accent); font-weight:700; }
.evnow { display:flex; align-items:center; gap:8px; font-weight:700; color:var(--ink); }
.evprog { flex:0 1 160px; height:6px; border-radius:6px; background:color-mix(in srgb, var(--c) 20%, var(--line)); overflow:hidden; }
.evprog i { display:block; height:100%; background:var(--c); border-radius:6px; }
/* chores */
.chores { display:grid; grid-template-columns:repeat(auto-fit, minmax(230px, 1fr)); gap:14px; align-items:start; }
.ccol { background:var(--card); border-radius:var(--radius); padding:14px; border-top:6px solid var(--c); display:flex; flex-direction:column; gap:10px; }
.chead { display:flex; align-items:center; gap:12px; }
.ring { width:60px; height:60px; border-radius:50%; display:grid; place-items:center; background:conic-gradient(var(--c) var(--p), var(--line) 0); }
.ring .av { width:50px; height:50px; font-size:28px; border:3px solid var(--card); }
.cname { font-size:20px; font-weight:800; }
.cstars { color:var(--muted); font-weight:700; }
.since { color:var(--danger, #c0392b); font-weight:600; font-size:.8em; white-space:nowrap; }
.monthpick { display:grid; grid-template-columns:repeat(7, 1fr); gap:4px; }
.monthpick .daychip span { min-width:0; padding:6px 0; text-align:center; }
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
/* progress */
.progress { display:flex; flex-direction:column; gap:12px; }
.homelog { margin-top:16px; border-left:6px solid var(--c); }
.hlrow { padding:10px 0; border-top:1px solid var(--line); }
.hlhead { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
.hlhead .ci { font-size:22px; }
.hltitle { display:flex; flex-direction:column; flex:1; min-width:0; } .hltitle small { color:var(--muted); }
.hlbad { color:var(--danger, #c0392b); font-weight:700; } .hlwarn { color:#e67e22; font-weight:700; }
.hllast { margin:4px 0 0 32px; }
.hlhist { margin:4px 0 0 32px; } .hlhist summary { cursor:pointer; color:var(--muted); } .hlhist ul { margin:6px 0 0; padding-left:18px; color:var(--muted); }
.prow { display:flex; align-items:center; gap:16px; background:var(--card); border-radius:var(--radius); padding:14px 18px; border-left:6px solid var(--c); box-shadow:0 2px 10px rgba(60,50,30,.06); }
.pwho { display:flex; align-items:center; gap:10px; min-width:150px; font-size:18px; }
.pbars { flex:1; display:grid; grid-template-columns:repeat(4, minmax(0,1fr)); gap:14px; }
.pbar { display:flex; flex-direction:column; align-items:center; gap:2px; }
.pcol { width:100%; max-width:70px; height:70px; background:var(--line); border-radius:10px; display:flex; align-items:flex-end; overflow:hidden; }
.pcol i { width:100%; background:var(--c); border-radius:10px 10px 0 0; }
.pbar small { color:var(--muted); font-size:12px; }
@media (max-width: 600px) { .prow { flex-direction:column; align-items:stretch; } .pbars { gap:8px; } }
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
.lname.arr { background:var(--card); border-radius:var(--radius); }
.lmove { margin-left:auto; display:flex; gap:4px; } .lmove button { padding:6px 10px; min-height:0; }
.lopen { margin-top:10px; } .subtle { background:none; box-shadow:none; color:var(--muted); }
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
.saver-cap { position:absolute; right:32px; bottom:30px; max-width:45%; display:flex; flex-direction:column; align-items:flex-end; gap:2px; color:#fff; font-size:18px; font-weight:600; text-align:right; text-shadow:0 2px 10px rgba(0,0,0,.7); opacity:.9; }
.saver-cap:empty { display:none; }
.saver-clock { position:absolute; left:36px; bottom:28px; color:#fff; text-shadow:0 2px 12px rgba(0,0,0,.6); }
#sv-time { font-size:72px; font-weight:800; }
#sv-date { font-size:24px; font-weight:600; }
.saver-verse { position:absolute; top:28px; left:50%; transform:translateX(-50%); width:min(72%, 980px); text-align:center; color:#fff; text-shadow:0 2px 12px rgba(0,0,0,.8); }
.saver-verse:empty { display:none; }
.saver-verse p { margin:0 0 4px; font-size:26px; font-style:italic; line-height:1.3; } .saver-verse p.long { font-size:21px; }
.saver-verse small { font-size:17px; font-weight:600; opacity:.9; }
/* Phones: a smaller clock at the top, so the photo's date and place have the bottom to themselves. */
@media (max-width: 600px) {
  .saver-clock { top:calc(16px + env(safe-area-inset-top)); bottom:auto; left:20px; }
  #sv-time { font-size:44px; } #sv-date { font-size:16px; }
  .saver-cap { left:20px; right:20px; max-width:none; bottom:calc(16px + env(safe-area-inset-bottom)); font-size:15px; }
  .saver-verse { top:calc(92px + env(safe-area-inset-top)); width:calc(100% - 40px); }
  .saver-verse p { font-size:18px; } .saver-verse p.long { font-size:15px; } .saver-verse small { font-size:14px; }
}
@media (max-height: 500px) and (orientation: landscape) {
  .saver-clock { left:calc(20px + env(safe-area-inset-left)); bottom:16px; }
  #sv-time { font-size:40px; } #sv-date { font-size:15px; }
  .saver-cap { right:calc(20px + env(safe-area-inset-right)); bottom:16px; max-width:50%; font-size:14px; }
  .saver-verse { top:10px; width:70%; } .saver-verse p { font-size:17px; } .saver-verse p.long { font-size:14px; } .saver-verse small { font-size:13px; }
}
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
label.check { flex-direction:row; align-items:center; gap:10px; font-weight:600; margin:4px 0; flex:0 0 auto; width:fit-content; max-width:100%; } /* only the box and its text are tappable, not the whole row */
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

.hside { overflow-y:auto; container-type:inline-size; }
.hbody, .hinfo { display:flex; flex-direction:column; gap:10px; min-width:0; }
.hchorecol { min-width:0; }
/* A wide side column (agenda, 1-, 3- and 5-day views) puts the chores beside the other cards instead of under them. */
@container (min-width: 440px) {
  .hbody:has(.hchorecol) { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); align-items:start; align-content:start; }
}
/* Cards flow into as many ~250px columns as fit (1 on a tablet, 2+ on wide screens). */
.hcols { column-width:225px; column-gap:10px; }
.board { background:var(--card); border-radius:16px; padding:10px 12px; box-shadow:0 1px 4px rgba(0,0,0,.08); }
.board .uhead { display:flex; align-items:center; justify-content:space-between; gap:8px; }
.board .uhead .hint { margin-right:auto; font-weight:500; text-transform:none; letter-spacing:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.board.empty .uhead { white-space:nowrap; } .board.empty .boardadd { flex:none; }
.boardadd { padding:6px 14px; min-height:40px; }
.notes { display:grid; grid-template-columns:repeat(auto-fill, minmax(150px, 1fr)); gap:8px; margin-top:6px; }
.note { position:relative; background:var(--nc); color:#2b2b2b; border-radius:6px; padding:10px 36px 8px 10px; box-shadow:0 2px 5px rgba(0,0,0,.15); transform:rotate(-.6deg); }
.note:nth-child(even) { transform:rotate(.7deg); }
.note p { margin:0 0 6px; white-space:pre-wrap; overflow-wrap:anywhere; font-weight:600; }
.note small { color:#555; display:flex; align-items:center; gap:4px; }
.notex { position:absolute; top:0; right:0; background:none; box-shadow:none; border:0; color:#666; padding:8px 10px; min-height:40px; min-width:40px; }
.seg.wrap { flex-wrap:wrap; }
.swatches { display:flex; gap:8px; } .swatch { width:34px; height:34px; border-radius:50%; border:2px solid transparent; padding:0; min-height:0; }
.swatch.on { border-color:var(--ink, #222); }
.wwhere { width:fit-content; margin:0 auto 10px; }
.rangewrap { display:flex; align-items:center; gap:10px; } .rangewrap input[type=range] { width:200px; min-width:120px; }
.verse { background:var(--card); border-left:6px solid #8e6cc9; border-radius:var(--radius); padding:10px 14px; box-shadow:0 1px 4px rgba(0,0,0,.08); }
.verse p { margin:0 0 4px; font-style:italic; line-height:1.35; font-size:1.05em; } .verse.long p { font-size:.95em; }
.verse small { color:var(--muted); } .verse .vtr { opacity:.75; }
.leavenote { display:flex; align-items:center; gap:10px; width:100%; text-align:left; background:var(--card); border:0; border-left:6px solid #2e7dd7; border-radius:var(--radius); padding:10px 12px; color:var(--text); font:inherit; cursor:pointer; }
.leavenote .lvicon { font-size:1.6em; } .leavenote .lvtxt { display:flex; flex-direction:column; min-width:0; }
.leavenote small { color:var(--muted); } .leavenote b { font-size:1.15em; }
.leavenote.go { border-left-color:#e53935; } .leavenote.go b, .evleave.go { color:#e53935; font-weight:700; }
.evleave { display:block; }
.mlbnote { display:flex; align-items:center; gap:10px; width:100%; text-align:left; background:var(--card); border:0; border-left:6px solid #a71930; border-radius:var(--radius); padding:10px 12px; color:var(--text); font:inherit; cursor:pointer; }
.mlbnote .mlbball { font-size:1.6em; }
.mlbnote .mlbtxt { display:flex; flex-direction:column; flex:1; min-width:0; }
.mlbnote small { color:var(--muted); }
.mlbnote b { font-size:1.15em; }
.mlbnote.soon b, .mlbnote.live b, .mlblive { color:#a71930; }
.mlbnote.live small::after { content:" ●"; color:#e53935; }
.mlbnote .mlbgo { font-size:1.6em; color:var(--muted); }
.mlbbtn { font-size:20px; padding:6px 10px; line-height:1; }
.mlbnote.big { cursor:default; margin-bottom:10px; }
.mlbtitle { margin:0 auto; }
.mlbpage { display:grid; grid-template-columns:repeat(auto-fit, minmax(300px, 1fr)); gap:12px; padding:4px 2px 16px; align-content:start; }
.mlbpage > .mlbnote, .mlbpage > p { grid-column:1 / -1; }
.mlbcard { background:var(--card); border-radius:var(--radius); padding:10px 12px; }
.mlbcard h3 { margin:0 0 8px; }
.mlbtab { width:100%; border-collapse:collapse; }
.mlbtab th, .mlbtab td { padding:5px 4px; text-align:left; border-bottom:1px solid var(--line, rgba(127,127,127,.2)); }
.mlbtab th:not(:first-child), .mlbtab td:not(:first-child) { text-align:right; }
.mlbtab tr.me td { font-weight:700; color:#a71930; }
.mlbtab tr.cut td { border-bottom:3px dashed #a71930; }
.mlbroot { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:8px; }
.mlbfor { font-weight:700; }
.mlbnote2 { margin:0 0 8px; font-weight:600; }
.hchores { background:var(--card); border-radius:var(--radius); padding:10px 12px; border-left:6px solid var(--c); display:flex; flex-direction:column; gap:5px;
  break-inside:avoid; margin-bottom:10px; }
.hchores .chore .ctoggle { padding:6px 10px; font-size:15px; border-radius:12px; }
.hchores .ci { font-size:19px; }
.hchores .box { width:24px; height:24px; }
.hadd { padding:6px 10px; font-size:14px; border-radius:10px; background:var(--bg); }
.hlist .hint { font-size:12px; }
.hagenda { overflow-y:auto; }
.hagenda .schedule { gap:10px; }
/* weather tab */
.wxtab { display:flex; flex-direction:column; gap:14px; max-width:1200px; margin:0 auto; width:100%; }
.wnow { display:flex; align-items:center; gap:22px; background:var(--card); border-radius:var(--radius); padding:18px 22px; flex-wrap:wrap; }
.wbig { font-size:84px; line-height:1; }
.wtemp { font-size:64px; font-weight:800; line-height:1; }
.wcond { font-size:20px; font-weight:700; margin-top:4px; }
.wstats { flex:1; display:grid; grid-template-columns:repeat(auto-fill, minmax(120px, 1fr)); gap:10px; min-width:260px; }
.wstat { background:var(--bg); border-radius:12px; padding:8px 12px; display:flex; flex-direction:column; }
.wstat small { color:var(--muted); font-weight:700; font-size:12px; }
.wstat b { font-size:18px; }
.wcard { background:var(--card); border-radius:var(--radius); padding:14px 18px; }
.wcard h3 { margin:0 0 8px; }
.whourly { overflow-x:auto; padding-bottom:6px; }
.wlegend { font-weight:600; color:var(--muted); font-size:12px; margin-left:8px; } .wlegend i { display:inline-block; width:18px; height:0; border-top:2px solid var(--accent); vertical-align:middle; margin:0 4px 0 8px; } .wlegend .wl-feels { border-top:2px dashed var(--muted); }
.whourly svg { display:block; margin-left:104px; }
.whourly .whrow { margin-left:104px; }
.wtable { border-collapse:collapse; margin-top:10px; font-size:13px; table-layout:fixed; }
.wtable th { position:sticky; left:0; z-index:1; width:104px; min-width:104px; text-align:left; background:var(--card); color:var(--muted); font-weight:700; font-size:12px; padding:5px 6px 5px 0; }
.wtable td { width:44px; min-width:44px; text-align:center; padding:5px 0; border-top:1px solid var(--line); font-variant-numeric:tabular-nums; }
.wtable tr:nth-child(even) td { background:color-mix(in srgb, var(--bg) 60%, transparent); }
.wradar { width:100%; height:440px; border:0; border-radius:12px; background:var(--bg); }
.wlab { font-size:12px; font-weight:700; fill:var(--ink); }
.wpt:hover circle { r:5; }
.whrow { display:flex; }
.wh { width:44px; flex:none; display:flex; flex-direction:column; align-items:center; gap:2px; font-size:13px; }
.wh span { font-size:18px; }
.wh small { color:var(--muted); font-size:11px; }
.rain { color:#2f6fb3; font-weight:700; font-size:12px; }
.wdaily { display:flex; flex-direction:column; }
.wsun { display:block; font-size:11px; color:var(--muted); font-weight:600; white-space:nowrap; }
.wday { display:grid; grid-template-columns:130px 36px 48px 40px 1fr 40px; align-items:center; gap:10px; padding:8px 0; border-bottom:1px solid var(--line); font-size:16px; }
.wday:last-child { border-bottom:0; }
.wdn { font-weight:700; } .wdi { font-size:22px; } .wlo { color:var(--muted); text-align:right; } .whi { font-weight:800; }
.wrange { position:relative; height:8px; background:var(--bg); border-radius:4px; }
.wrange i { position:absolute; top:0; bottom:0; border-radius:4px; background:linear-gradient(90deg, #6fa8dc, #f6b26b); }
.mealsview { margin-left:auto; }
.rbrowse { display:flex; flex-direction:column; gap:12px; }
.rbar { display:flex; gap:8px; flex-wrap:wrap; } .rbar input { flex:1 1 260px; min-width:0; font-size:17px; } .rbar select { flex:none; width:auto; }
.rcats { flex-wrap:wrap; }
.rbgrid { display:grid; grid-template-columns:repeat(auto-fill,minmax(180px,1fr)); gap:12px; }
.rbcard { position:relative; cursor:pointer; }
.holdable { -webkit-touch-callout:none; user-select:none; -webkit-user-select:none; }
.holdable img { pointer-events:none; }
.holdable::after { content:""; position:absolute; left:0; bottom:0; height:5px; width:0; background:#c62828; opacity:0; }
.holdable.holding::after { opacity:1; animation:holdbar 5s linear forwards; }
@keyframes holdbar { to { width:100%; } }
.rbdel { position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); z-index:2; padding:10px 16px; border-radius:999px; background:#c62828; color:#fff; font-weight:800; font-size:16px; white-space:nowrap; box-shadow:0 2px 10px rgba(0,0,0,.35); }
.ckimg { position:relative; width:64px; height:64px; border-radius:12px; overflow:visible; flex:none; display:grid; place-items:center; font-size:30px; background:var(--chip, rgba(127,127,127,.12)); }
.ckimg img { position:absolute; inset:0; width:100% !important; height:100% !important; border-radius:12px; object-fit:cover; }
.ckimg .rbdel { left:0; top:calc(100% + 8px); transform:none; font-size:15px; padding:8px 12px; }
.rbcard { display:flex; flex-direction:column; align-items:stretch; text-align:left; gap:4px; padding:0 0 10px; overflow:hidden; border-radius:16px; background:var(--card); }
.rbcard b, .rbcard small { padding:0 12px; } .rbcard b { font-size:16px; line-height:1.25; } .rbcard small { color:var(--muted); }
.rbimg { position:relative; aspect-ratio:4/3; background:var(--chip, rgba(127,127,127,.12)); display:grid; place-items:center; font-size:34px; }
.rbimg img { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; }
.tonight { display:flex; gap:12px; align-items:center; padding:10px; border-radius:16px; background:var(--card); box-shadow:0 1px 4px rgba(0,0,0,.08); margin-bottom:10px; }
.tonight.tap { cursor:pointer; }
.tonight img, .tnoimg { width:84px; height:84px; border-radius:12px; object-fit:cover; flex:none; display:grid; place-items:center; font-size:36px; background:var(--chip, rgba(127,127,127,.12)); }
.tonight small { display:block; color:var(--muted); font-weight:700; } .tonight b { display:block; font-size:18px; line-height:1.25; }
.cookbtn { display:inline-block; margin-top:4px; font-weight:800; color:var(--accent); }
.tonight .tothers { font-weight:600; margin-top:4px; }
.cook { position:fixed; inset:0; z-index:400; background:var(--bg); color:var(--ink); display:flex; flex-direction:column; }
.cktop { display:flex; align-items:center; gap:12px; padding:12px 20px; border-bottom:1px solid var(--line); flex-wrap:wrap; }
.cktop img { width:64px; height:64px; border-radius:12px; object-fit:cover; }
.cktitle h2 { margin:0; font-size:26px; } .cktitle small { color:var(--muted); font-size:15px; }
.cktop .spacer { flex:1; }
.cktop button { font-size:16px; padding:10px 14px; }
.ckserv { display:flex; align-items:center; gap:8px; } .ckserv span { font-size:17px; min-width:96px; text-align:center; }
.ckserv button:not(.reset) { width:44px; height:44px; font-size:22px; padding:0; border-radius:50%; }
.ckbody { flex:1; min-height:0; display:grid; grid-template-columns:minmax(260px,2fr) 3fr; }
.ckings, .cksteps { overflow-y:auto; padding:12px 20px 20px; }
.ckings { border-right:1px solid var(--line); }
.ckings h3, .cksteps h3 { margin:6px 0 10px; } .ckings h3 small, .cksteps h3 small { color:var(--muted); font-weight:600; }
.ckings h4, .cksteps h4 { margin:14px 0 6px; color:var(--muted); text-transform:uppercase; font-size:13px; letter-spacing:.04em; }
.ckii { display:flex; gap:12px; align-items:flex-start; width:100%; text-align:left; padding:10px 8px; font-size:19px; line-height:1.35; background:none; box-shadow:none; border-radius:10px; }
.ckii .box { flex:none; width:26px; height:26px; border-radius:8px; border:2px solid var(--line); display:grid; place-items:center; font-size:16px; margin-top:1px; }
.ckii.got { color:var(--muted); text-decoration:line-through; } .ckii.got .box { background:var(--accent); border-color:var(--accent); color:#fff; }
.cknote { font-size:16px; }
.ckstep { display:flex; gap:14px; width:100%; text-align:left; align-items:flex-start; padding:14px; margin-bottom:8px; border-radius:14px; background:var(--card); box-shadow:none; font-size:19px; opacity:.75; }
.ckstep p { margin:0; line-height:1.45; white-space:pre-line; }
.ckstep .num { flex:none; width:34px; height:34px; border-radius:50%; display:grid; place-items:center; font-weight:800; background:var(--chip, rgba(127,127,127,.15)); }
.ckstep.on { opacity:1; font-size:24px; outline:3px solid var(--accent); } .ckstep.on .num { background:var(--accent); color:#fff; }
.ckstep.past { opacity:.5; }
.cknav { display:flex; align-items:center; gap:12px; padding:12px 20px; border-top:1px solid var(--line); }
.cknav span { flex:1; text-align:center; color:var(--muted); font-weight:700; }
.cknav button { font-size:20px; padding:14px 28px; min-width:140px; }
.ckqr { position:absolute; inset:0; background:rgba(0,0,0,.5); display:grid; place-items:center; padding:16px; }
.ckqrcard { background:#fff; color:#222; border-radius:20px; padding:20px; width:min(380px,100%); text-align:center; }
.qrbox svg { width:260px; height:260px; max-width:100%; } .qrurl { word-break:break-all; color:#666; }
@media (max-width: 800px) {
  .ckbody { grid-template-columns:1fr; overflow-y:auto; } .ckings, .cksteps { overflow:visible; } .ckings { border-right:0; border-bottom:1px solid var(--line); }
  .cktitle h2 { font-size:21px; } .cknav button { min-width:0; padding:12px 18px; }
}
/* Night dim overlay: only in the page while dimming is on (an always-present, invisible full-screen
   layer is a needless graphics layer on phones; see v1.44.1). */
#dim { position:fixed; inset:0; background:#000; pointer-events:none; z-index:950; display:none; }
#dim.on { display:block; }
.season { margin-left:6px; font-size:20px; }
.upcoming { background:var(--card); border-radius:16px; padding:10px 12px; box-shadow:0 1px 4px rgba(0,0,0,.08); margin-bottom:10px; }
.uhead { font-size:13px; font-weight:800; text-transform:uppercase; letter-spacing:.03em; color:var(--muted); margin-bottom:4px; }
.urow { display:flex; align-items:center; gap:10px; padding:6px 4px; border-left:4px solid var(--c); padding-left:10px; margin:4px 0; border-radius:4px; }
.urow .uemoji { font-size:24px; }
.urow .utext { display:flex; flex-direction:column; } .urow small { color:var(--muted); font-weight:700; }
.urow.today { background:color-mix(in srgb, var(--c) 22%, var(--card)); border-radius:12px; animation:uglow 2.4s ease-in-out infinite; }
.urow.today small { color:var(--ink); }
@keyframes uglow { 50% { box-shadow:0 0 0 4px color-mix(in srgb, var(--c) 35%, transparent); } }
@media (prefers-reduced-motion: reduce) { .urow.today { animation:none; } }
.datefields label { flex:1 1 90px; }
.dragh { flex:none; width:44px; height:44px; display:grid; place-items:center; font-size:26px; line-height:1; color:var(--muted);
  cursor:grab; touch-action:none; user-select:none; -webkit-user-select:none; border-radius:10px; }
.dragh:active { cursor:grabbing; background:var(--chip, rgba(127,127,127,.12)); }
.dragh.off { visibility:hidden; }
.item.dragging { position:relative; z-index:3; background:var(--card); box-shadow:0 8px 24px rgba(0,0,0,.18); border-radius:12px; transition:none; }
.item.shifting { transition:transform .18s ease; }
.rolepick { width:fit-content; }
.rolewarn { background:#fff4e0; color:#6b4300; border-radius:12px; padding:10px 12px; margin:8px 0; font-weight:600; }
.rolewarn .row { margin-top:8px; align-items:center; }
.rolebadge { display:inline-block; font-size:12px; font-weight:700; color:var(--muted); background:var(--bg); border-radius:999px; padding:2px 8px; margin-left:4px; }
.lgroup { display:flex; align-items:center; gap:6px; margin:12px 4px 4px; font-size:13px; font-weight:800; text-transform:uppercase; letter-spacing:.03em; color:var(--oc, var(--muted)); }
.lgroup:first-child { margin-top:0; }
.lgroup .av.sm { width:22px; height:22px; font-size:13px; }
.ownerpick { width:auto; }
.connbar { margin:4px 22px 0; padding:8px 14px; border-radius:12px; background:#5f6368; color:#fff; font-size:15px; }
@media (max-width: 600px) { .connbar { margin:4px 12px 0; font-size:13px; } }
.pinbanner { display:flex; align-items:center; gap:10px; flex-wrap:wrap; padding:12px 16px; border-radius:16px; background:#fff4e0; color:#6b4300; margin-bottom:12px; }
.pinbanner .primary { margin-left:auto; }
.lockmark { font-style:normal; font-size:.9em; }
.pinpad { display:flex; flex-direction:column; align-items:center; text-align:center; }
.pinpad h2 { margin:4px 0; }
.pindots { display:flex; gap:12px; margin:14px 0 4px; min-height:22px; }
.pindots i { width:18px; height:18px; border-radius:50%; border:2px solid var(--muted); }
.pindots i.on { background:var(--ink); border-color:var(--ink); }
.pinerr { color:#c62828; font-weight:700; min-height:1.3em; margin:4px 0 8px; }
.pinkeys { display:grid; grid-template-columns:repeat(3, 96px); gap:14px; }
.pinkeys button { height:84px; font-size:34px; font-weight:700; border-radius:22px; }
.pinkeys .pinside { font-size:24px; }
.pinpad .actions { width:100%; }
@media (max-width: 600px) { .pinkeys { grid-template-columns:repeat(3, 76px); gap:10px; } .pinkeys button { height:68px; font-size:28px; } }
.hints { display:flex; flex-direction:column; gap:6px; margin-bottom:10px; }
.hintrow { display:flex; align-items:flex-start; gap:10px; padding:8px 12px; border-radius:12px; background:var(--chip, rgba(127,127,127,.1)); }
.hintrow span { font-size:20px; line-height:1.2; flex:none; }
.hintrow p { margin:0; font-size:15px; font-weight:600; line-height:1.35; }
.hintrow.h-now { background:#e3f0fb; color:#0d3c61; }
.hintrow.h-alert { background:#fdecea; color:#7f1d1d; }
.radarbtn { display:flex; align-items:center; justify-content:center; font-size:18px; width:100%; height:110px; }
.diaglog { width:100%; font-family:monospace; font-size:11px; white-space:pre; }
.remrow { display:flex; flex-wrap:wrap; align-items:center; gap:8px 12px; padding:8px 0; border-top:1px solid var(--line); }
.remrow > b { flex:1 1 160px; } .remrow select { width:auto; }
.remcard .aphead { background:var(--accent); color:#fff; }
.alertpop { position:fixed; inset:0; z-index:60; background:rgba(0,0,0,.55); display:flex; align-items:center; justify-content:center; padding:16px; }
.apcard { width:min(640px,100%); max-height:90vh; overflow:auto; background:var(--card); color:var(--ink); border-radius:20px; box-shadow:0 12px 40px rgba(0,0,0,.4); border:4px solid var(--ac); }
.aphead { display:flex; gap:14px; align-items:center; padding:18px 20px; font-size:24px; }
.aphead small { display:block; font-size:15px; opacity:.9; }
.apicon { font-size:40px; animation:appulse 1.2s ease-in-out infinite; }
@keyframes appulse { 50% { transform:scale(1.15); } }
@media (prefers-reduced-motion: reduce) { .apicon { animation:none; } }
.apbody { padding:6px 20px; font-size:17px; }
.apbtns { display:flex; justify-content:flex-end; gap:10px; padding:12px 20px 18px; }
.apbtns button { font-size:17px; padding:12px 20px; }
.rsline { margin:0 0 8px; font-weight:700; font-size:17px; }
.rsbars { display:flex; gap:6px; align-items:flex-end; }
.rsb { flex:1; display:flex; flex-direction:column; align-items:center; gap:4px; justify-content:flex-end; height:84px; }
.rsb i { width:100%; max-width:40px; background:#6fa8dc; border-radius:6px 6px 2px 2px; }
.rsb small { font-size:11px; color:var(--muted); white-space:nowrap; }
.seg.layers { flex-wrap:wrap; margin-bottom:8px; }
.aqi { display:flex; gap:12px; align-items:center; margin-bottom:8px; }
.aqibadge { width:64px; height:64px; border-radius:16px; display:flex; flex-direction:column; align-items:center; justify-content:center; flex:none; }
.aqibadge b { font-size:24px; line-height:1; } .aqibadge small { font-size:11px; }
.aqbars { display:flex; gap:2px; align-items:flex-end; height:38px; }
.aqbars i { flex:1; border-radius:3px 3px 0 0; }
.pollen { display:grid; grid-template-columns:repeat(auto-fill,minmax(180px,1fr)); gap:8px; margin-top:10px; }
.pol { display:grid; grid-template-columns:auto 1fr; column-gap:8px; align-items:center; }
.pol span { grid-row:span 3; font-size:24px; }
.pdots { display:flex; gap:3px; font-style:normal; } .pdots em { width:14px; height:8px; border-radius:4px; }
.pol small { color:var(--muted); }
.cmp { display:grid; grid-template-columns:repeat(auto-fill,minmax(150px,1fr)); gap:10px; }
.cmpc { display:flex; flex-direction:column; padding:10px 12px; border-radius:12px; background:var(--chip, rgba(127,127,127,.1)); }
.cmpc small:first-child { color:var(--muted); } .cmpc b { font-size:20px; }
.cmpc .up { color:#c62828; font-weight:700; } .cmpc .down { color:#1565c0; font-weight:700; } .cmpc .same { color:var(--muted); }
.moonnow { display:flex; gap:14px; align-items:center; } .mbig { font-size:54px; line-height:1; }
.mnext { display:grid; grid-template-columns:repeat(auto-fill,minmax(140px,1fr)); gap:8px; margin:12px 0; }
.mnext div { display:flex; flex-direction:column; align-items:center; padding:8px; border-radius:12px; background:var(--chip, rgba(127,127,127,.1)); }
.mnext span { font-size:28px; } .mnext small { color:var(--muted); }
.mstrip { display:flex; gap:4px; overflow-x:auto; padding-bottom:4px; }
.mday { flex:none; width:44px; display:flex; flex-direction:column; align-items:center; font-size:22px; border-radius:10px; padding:4px 0; }
.mday small { font-size:11px; color:var(--muted); } .mday.on { background:var(--chip, rgba(127,127,127,.15)); }
.alertbar { display:flex; align-items:center; gap:8px; margin:4px 22px 0; padding:8px 14px; border-radius:12px; font-size:15px; text-align:left; box-shadow:0 2px 8px rgba(0,0,0,.15); }
.alertbar span { margin-left:auto; font-weight:700; opacity:.9; }
.alertcard { background:var(--card); border-radius:var(--radius); overflow:hidden; border:2px solid var(--ac); }
.alertcard .ahead { display:flex; align-items:center; gap:8px; padding:10px 16px; font-size:18px; }
.alertcard .ahead span { margin-left:auto; font-size:13px; font-weight:700; }
.alertcard .abody { padding:10px 16px; }
.alertcard .abody p { margin:4px 0; }
.apre { white-space:pre-wrap; line-height:1.4; }
.noalerts { margin:0; color:var(--muted); font-weight:700; }
.wday.tap { cursor:pointer; }
.wdetail { background:var(--bg); border-radius:12px; padding:6px 14px; margin:2px 0 8px; font-size:15px; line-height:1.4; }
.wdetail p { margin:6px 0; }
@keyframes swl { from { transform:translateX(40px); opacity:.4; } to { transform:none; opacity:1; } }
@keyframes swr { from { transform:translateX(-40px); opacity:.4; } to { transform:none; opacity:1; } }
.content.swipe-l { animation:swl .22s ease-out; }
.content.swipe-r { animation:swr .22s ease-out; }
.content { touch-action:pan-y; overscroll-behavior:contain; } /* scrolling to the end doesn't drag the whole page */
/* The header and the tab bar don't scroll up/down: a vertical drag there must not drag the page (iPhone bounce). */
header, .rail { touch-action:pan-x; overscroll-behavior:contain; }
.repeat { background:var(--bg); border-radius:14px; padding:4px 12px 8px; margin:8px 0; }
.rpdays { margin:6px 0; }
.rpsum { margin:6px 0 2px; font-weight:700; color:var(--ink); }
.tpick { position:relative; display:block; }
.tpick.touch { display:flex; gap:6px; align-items:stretch; flex-wrap:wrap; }
.tpick.touch .tinput { flex:1; min-width:0; cursor:pointer; }
.tpick.touch .ttype { flex:none; padding:0 12px; font-size:18px; }
.tlist { position:absolute; z-index:7; left:0; right:0; top:100%; max-height:216px; overflow-y:auto; background:var(--card);
  border:1px solid var(--line); border-radius:12px; box-shadow:0 10px 28px rgba(0,0,0,.18); display:flex; flex-direction:column; }
.tlist button { flex:none; height:36px; text-align:left; padding:0 14px; border-radius:0; box-shadow:none; background:none; font-weight:600; }
.tlist button.on { background:color-mix(in srgb, var(--accent) 18%, var(--card)); color:var(--accent); }
.tlist button:hover { background:var(--bg); }
.sresults { max-height:55vh; overflow-y:auto; display:flex; flex-direction:column; }
.sresults .srow { width:100%; }
.sresults .st { width:110px; }
.searchbtn { flex:none; }
@media (max-width: 1100px) { .caltool .searchbtn { grid-area:search; } }
.nochores { margin:0; color:var(--muted); font-size:14px; display:flex; flex-wrap:wrap; align-items:center; gap:4px; padding:0 4px; }
.av.sm { width:22px; height:22px; font-size:13px; }
.hhead { display:flex; align-items:center; gap:8px; }
.hhead .hint { margin-left:auto; font-weight:700; }

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
button.busy { opacity:.55; cursor:progress; }
.toast { position:fixed; bottom:24px; left:50%; transform:translateX(-50%); background:#2d2a26; color:#fff; padding:12px 20px; border-radius:14px; z-index:1000; max-width:90vw; }
@media (max-width: 900px) {
  .app { flex-direction:column-reverse; }
  main { min-height:0; } /* let .content scroll instead of pushing the header off the top */
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

/* ---------- phone (e.g. the Home Assistant app on a phone); tablets are unaffected ---------- */
@media (max-width: 600px) {
  .app { height:var(--app-h, 100dvh); }
  .rail { width:100%; }
  header { padding:max(8px, env(safe-area-inset-top)) 12px 2px; }
  .content { padding-bottom:14px; }
  /* Bottom bar: clear of the home indicator / rounded corners. --safe-bottom is a fallback for the
     Home Assistant iPhone app, where iOS can report the safe area as 0 (see _safeAreaFallback). */
  /* iOS reserves ~34px for the home-indicator line; the icons only need about half of it to stay clear. */
  .rail { padding:4px 2px max(6px, calc(max(env(safe-area-inset-bottom), var(--safe-bottom, 0px)) - 16px)); gap:0; justify-content:stretch; }
  .tab { flex:1 1 0; min-width:0; padding:6px 0; gap:2px; font-size:11.5px; border-radius:10px; }
  .tab span { max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .tab ha-icon { --mdc-icon-size:26px; }
  .tab { position:relative; }
  /* Nothing scrolls sideways on a phone except strips made for it (e.g. the 24-hour forecast). */
  .content { overflow-x:hidden; }
  .row { flex-wrap:wrap; }
  label.inline { flex-wrap:wrap; }
  label.inline select, label.inline input:not([type=checkbox]) { min-width:0; max-width:100%; }
  label.inline input[type=number] { width:76px; }
  .wday { grid-template-columns:minmax(0,1fr) 28px 38px 34px minmax(24px,56px) 34px; gap:6px; font-size:15px; }
  .rsbars { gap:3px; }
  .rsb { min-width:0; }
  .rsb small { font-size:9px; }
  .rsb:nth-child(even) small { visibility:hidden; }
  .tab .lockmark { position:absolute; top:1px; left:calc(50% + 6px); font-size:10px; font-style:normal; }
  header { padding:max(8px, env(safe-area-inset-top)) 12px 2px; gap:6px; }
  .when { display:none; } /* the phone shows the time already: give the space to the calendar */
  header .members { order:0; flex:1 1 0; min-width:0; flex-wrap:nowrap; overflow-x:auto; justify-content:flex-start; padding-bottom:2px; }
  header .mchip { flex:none; padding:4px 10px 4px 4px; font-size:14px; }
  header .mchip .av { width:26px; height:26px; font-size:15px; }
  header .weather { font-size:20px; margin-left:auto; flex:none; } header .weather b { font-size:22px; }
  .alertbar { margin:4px 12px 0; padding:6px 10px; font-size:13px; }
  .content { padding:6px 10px 14px; }
  .toolbar h1 { font-size:20px; }
  .caltool { grid-template-columns:auto 1fr auto; grid-template-areas:"nav search fab" "title title title" "seg seg seg"; row-gap:8px; }
  .caltool .searchbtn { grid-area:search; justify-self:end; }
  .caltool h1 { font-size:19px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .caltool .nav button { padding:8px 10px; }
  .caltool .seg { justify-self:stretch; }
  .caltool .seg button, .daypick button { padding:8px 9px; font-size:14px; }
  .hometool { flex-wrap:wrap; gap:8px; }
  .home { gap:12px; }
  .hside { position:static; max-height:none; overflow:visible; }
  .tonight img, .tnoimg { width:64px; height:64px; }
  .hintrow p { font-size:14px; }
  .mealsview button { padding:8px 10px; font-size:14px; }
  .rbgrid { grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; }
  .rbar select { flex:1 1 40%; }
  .backdrop { padding:0; place-items:end center; }
  .dialog { width:100%; max-width:100%; max-height:92vh; border-radius:20px 20px 0 0; padding-bottom:calc(16px + env(safe-area-inset-bottom)); }
  .cktop { padding:10px 12px; gap:8px; } .ckserv span { min-width:74px; }
  .cknav { padding:8px 12px calc(8px + env(safe-area-inset-bottom)); }
  .apcard .aphead { font-size:20px; } .apbody { font-size:15px; }
}

/* ---------- phone on its side (short landscape screens) ---------- */
@media (max-height: 500px) and (orientation: landscape) {
  .rail { touch-action:pan-y; } /* side menu: may need to scroll up/down */
  .app { height:var(--app-h, 100dvh); }
  .app { flex-direction:row; }
  main { min-height:0; }
  .rail { flex-direction:column; justify-content:flex-start; border-top:0; border-right:1px solid var(--line); overflow-y:auto; overflow-x:hidden; }
  .rail .tab { flex:none; }
  .rail { width:calc(76px + env(safe-area-inset-left)); gap:2px; padding-top:max(6px, env(safe-area-inset-top)); padding-bottom:max(6px, env(safe-area-inset-bottom)); }
  .logo { display:none; }
  .tab { width:68px; padding:5px 2px; gap:2px; font-size:10.5px; }
  .tab ha-icon { --mdc-icon-size:24px; }
  header { padding:max(4px, env(safe-area-inset-top)) max(12px, env(safe-area-inset-right)) 2px 12px; gap:8px; flex-wrap:nowrap; }
  .when { display:none; }
  header .members { flex-wrap:nowrap; overflow-x:auto; justify-content:flex-start; }
  header .mchip { flex:none; padding:2px 8px 2px 2px; font-size:13px; }
  header .mchip .av { width:22px; height:22px; font-size:13px; }
  header .weather { font-size:18px; } header .weather b { font-size:20px; }
  .alertbar, .connbar { margin:2px 12px 0; padding:4px 10px; font-size:13px; }
  .content { padding:4px max(12px, env(safe-area-inset-right)) max(10px, env(safe-area-inset-bottom)) 12px; }
  .toolbar h1 { font-size:18px; }
  .home, .home.wide { grid-template-columns:1fr; }
  .dialog { max-height:96vh; padding:14px 16px; }
}

/* ---------- nav buttons fill the side menu / bottom bar and scale with the space (every device) ----------
   Each button is a size container; the icon and label use its size (cqh/cqw/cqi), within limits. */
.rail .tab { flex:1 1 0; min-height:0; max-height:150px; width:100%; justify-content:center; padding:4px 2px; container-type:size;
  --tab-icon:clamp(32px, min(36cqh, 46cqw), 56px); --tab-label:clamp(12px, min(12cqh, 17cqw), 18px); }
.rail .tab ha-icon { font-size:var(--tab-icon); --mdc-icon-size:1em; }
.rail .tab span { font-size:var(--tab-label); max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
@media (max-width: 900px) {
  /* bottom bar: buttons share the width; height follows the icon and label */
  .rail .tab { flex:1 1 0; width:auto; min-width:0; max-height:none; padding:6px 0; container-type:inline-size;
    --tab-icon:clamp(26px, 48cqi, 40px); --tab-label:clamp(11.5px, 20cqi, 15px); }
}
@media (max-height: 500px) and (orientation: landscape) {
  /* phone on its side: back to a side menu */
  .rail .tab { flex:1 1 0; width:100%; max-height:120px; padding:2px; container-type:size;
    --tab-icon:clamp(24px, min(50cqh, 42cqw), 36px); --tab-label:clamp(10.5px, min(20cqh, 16cqw), 13px); }
}
`;
