/* Skylight Family Display - full-screen panel (also usable as a Lovelace card:
 *   type: custom:skylight-panel
 * ). Plain web component, no build step. */

const PANEL_VERSION = "1.33.3";
// Profile colors: each column is a color family, rows go light -> dark.
const MEMBER_COLORS = [
  // light
  "#ffb3b3", "#ffc9a3", "#ffe89a", "#b9f0c9", "#a8e6dc", "#b3ecff", "#b8cbff", "#d9c2ff", "#ffc2ee", "#d7c3b8", "#c7d2d9", "#e0e0e0",
  // medium
  "#ff6b6b", "#ff9f43", "#feca57", "#2ecc71", "#1abc9c", "#48dbfb", "#4a7dff", "#a66bff", "#f368e0", "#8d6e63", "#607d8b", "#9e9e9e",
  // strong
  "#e53935", "#f57c00", "#f9a825", "#2e7d32", "#00897b", "#0288d1", "#1e40af", "#6a1b9a", "#c2185b", "#6d4c41", "#37474f", "#616161",
  // dark
  "#8e1b1b", "#a0470a", "#9a6b00", "#1b4d23", "#00564d", "#01497c", "#172554", "#3f0f63", "#7a0e3a", "#3e2723", "#222f3e", "#212121",
];
// Pick black or white text for a background color (WCAG relative luminance).
const textOn = (hex) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return "#fff";
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(m[1].slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.45 ? "#2d2a26" : "#fff";
};
// "#abc" / "abc" / "#aabbcc" -> "#aabbcc", or null if not a hex color.
const normHex = (v) => {
  let h = String(v || "").trim().replace(/^#/, "").toLowerCase();
  if (/^[0-9a-f]{3}$/.test(h)) h = h.split("").map((c) => c + c).join("");
  return /^[0-9a-f]{6}$/.test(h) ? `#${h}` : null;
};

const PALETTE = [
  "#ff6b6b", "#ff9f43", "#feca57", "#2ecc71", "#1abc9c", "#48dbfb",
  "#4a7dff", "#a66bff", "#f368e0", "#8d6e63", "#607d8b", "#222f3e",
];
const AVATARS = [
  // family: dads, moms, kids
  "👨", "🧔", "🧔‍♂️", "👨‍🦰", "👨‍🦱", "👨‍🦳", "👱‍♂️", "👨‍🍳", "🍖", "🥩", "👨‍💼", "👨‍🔧", "👨‍💻", "👨‍🏫", "👨‍🌾", "👨‍🚒",
  "👩", "👱‍♀️", "👩‍🦰", "👩‍🦱", "👩‍🦳", "👩‍🍳", "🥘", "👩‍💼", "👩‍💻", "👩‍🏫", "👩‍⚕️", "👩‍🌾", "👩‍🎨", "💐",
  "👦", "👧", "🧒", "👶", "👴", "👵",
  // faces & animals
  "😀", "😎", "🤓", "🥳", "🦄", "🐶", "🐱", "🦊", "🐻", "🐻‍❄️", "🐼", "🐨", "🐯", "🦁", "🐸", "🐵", "🦖", "🐢", "🐙", "🦋", "🐝", "🦉",
  // sports
  "⚾", "🥎", "⚽", "🏀", "🏈", "🏐", "🎾", "🏒", "🥍", "⛳", "🏓", "🏊", "🚴", "⛸️", "🛹", "🥋", "🤸", "🏋️", "💪", "🏃",
  // music & arts
  "🎸", "🎹", "🥁", "🎻", "🎺", "🎷", "🎤", "🎧", "🎨", "🩰", "📷", "🎭",
  // home, food & hobbies
  "🍳", "🧁", "🍕", "🌮", "📚", "✏️", "🔬", "🧩", "🎮", "♟️", "🧶", "🪴", "🎣", "⛺", "🏕️",
  // fun
  "🚀", "🚗", "🚂", "✈️", "🌈", "⭐", "🌸", "🌻", "👑", "🎀", "🧸", "💎", "🔥",
];
// Emoji skin tones (Unicode modifiers). "" = default yellow.
const SKIN_TONES = [["", "Default"], ["\u{1F3FB}", "Light"], ["\u{1F3FC}", "Medium-light"], ["\u{1F3FD}", "Medium"], ["\u{1F3FE}", "Medium-dark"], ["\u{1F3FF}", "Dark"]];
const TONE_RE = /[\u{1F3FB}-\u{1F3FF}]/gu;
// People emoji that accept a skin tone (the first code point of the emoji).
const TONEABLE = new Set([..."👨👩🧔👱👦👧🧒👶👴👵🧑🏊🚴🏋🤸🏃💪"].map((c) => c.codePointAt(0)));
// Apply a tone to a person emoji (also inside sequences like 👨‍🍳); other emoji are unchanged.
const withTone = (emoji, tone) => {
  const plain = emoji.replace(TONE_RE, "");
  const cps = [...plain];
  if (!tone || !TONEABLE.has(cps[0].codePointAt(0))) return plain;
  const rest = cps.slice(1);
  if (rest[0] === "\uFE0F") rest.shift(); // e.g. 🏋️ -> 🏋🏻
  return cps[0] + tone + rest.join("");
};
const toneOf = (emoji) => (emoji.match(TONE_RE) || [""])[0];
// The original picker emoji for a (possibly toned) avatar, so switching back to Default restores it exactly.
const baseOf = (emoji) => {
  const key = (e) => e.replace(TONE_RE, "").replace(/\uFE0F/g, "");
  return AVATARS.find((x) => key(x) === key(emoji)) || emoji.replace(TONE_RE, "");
};

// Info-only calendars (birthdays, holidays, school...): icon + muted color choices.
const INFO_ICONS = ["🎂", "🎉", "🇺🇸", "🎄", "⛪", "🏫", "🏈", "⚽", "🗓️", "🌙", "✈️", "💼", "🗑️", "🌱", "📌"];
const INFO_COLORS = ["#9e9e9e", "#b0a58f", "#c29fa3", "#9fb3c8", "#a8c3a0", "#c9b37e", "#b39ddb", "#80cbc4"];

// Icon choices for chores (tap-to-pick instead of typing).
const CHORE_ICONS = [
  // trash & recycling
  "🗑️", "♻️", "🚮", "📦",
  // pets
  "🐶", "🐕", "🦮", "🐩", "🦴", "🥣", "💩", "🐱", "🐈", "🐟", "🐠", "🐹", "🐰", "🦜", "🐢",
  // kitchen & dishes
  "🍽️", "🥄", "🍴", "🧽", "🫧", "🧼", "🍳", "🥪", "🥗", "🧃",
  // cleaning & laundry
  "🧹", "🪣", "🧺", "👕", "👖", "🧦", "🧻", "🚽", "🛁", "🚿", "🪟", "🧴",
  // bedroom & tidying
  "🛏️", "🧸", "🧩", "🪀", "🎒", "👟",
  // outdoors & garden
  "🚜", "🌿", "☘️", "🌱", "🪴", "🌻", "🍂", "🍁", "❄️", "🚗", "🚲", "🪵", "💧",
  // self-care & routine
  "🪥", "🦷", "🛀", "💊", "💇", "⏰", "🌙", "☀️",
  // school, music & activity
  "📚", "✏️", "📝", "🧮", "💻", "🎹", "🎸", "🎻", "🥁", "🏃", "⚽", "🏀", "⚾", "🤸",
  // general
  "✅", "⭐", "💪", "❤️", "🙏", "📬", "🛒", "💵",
];

// Sunrise/sunset for a date and location (NOAA "Almanac for Computers" method, ~1-2 min accuracy).
const sunTimes = (date, lat, lon) => {
  const rad = Math.PI / 180, day = Math.floor((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - Date.UTC(date.getFullYear(), 0, 0)) / 86400000);
  const calc = (rising) => {
    const lngHour = lon / 15, t = day + ((rising ? 6 : 18) - lngHour) / 24;
    const M = 0.9856 * t - 3.289;
    let L = (M + 1.916 * Math.sin(M * rad) + 0.020 * Math.sin(2 * M * rad) + 282.634 + 360) % 360;
    let RA = (Math.atan(0.91764 * Math.tan(L * rad)) / rad + 360) % 360;
    RA += Math.floor(L / 90) * 90 - Math.floor(RA / 90) * 90;
    RA /= 15;
    const sinDec = 0.39782 * Math.sin(L * rad), cosDec = Math.cos(Math.asin(sinDec));
    const cosH = (Math.cos(90.833 * rad) - sinDec * Math.sin(lat * rad)) / (cosDec * Math.cos(lat * rad));
    if (cosH > 1 || cosH < -1) return null; // polar day/night
    const H = (rising ? 360 - Math.acos(cosH) / rad : Math.acos(cosH) / rad) / 15;
    const UT = ((H + RA - 0.06571 * t - 6.622 - lngHour) % 24 + 24) % 24;
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    return new Date(d.getTime() + UT * 3600000);
  };
  let rise = calc(true), set = calc(false);
  // UTC day boundary: keep both on the local calendar day asked for.
  const fix = (x) => { if (!x) return x; while (ymd(x) < ymd(date)) x = new Date(x.getTime() + 86400000); while (ymd(x) > ymd(date)) x = new Date(x.getTime() - 86400000); return x; };
  return { rise: fix(rise), set: fix(set) };
};

// Moon phase from the mean synodic month, measured from the new moon of 2000-01-06 18:14 UTC.
const moonPhase = (d) => {
  const days = (d.getTime() - Date.UTC(2000, 0, 6, 18, 14)) / 86400000;
  const age = ((days % 29.530588853) + 29.530588853) % 29.530588853;
  const names = [["🌑", "New moon"], ["🌒", "Waxing crescent"], ["🌓", "First quarter"], ["🌔", "Waxing gibbous"],
    ["🌕", "Full moon"], ["🌖", "Waning gibbous"], ["🌗", "Last quarter"], ["🌘", "Waning crescent"]];
  const [icon, name] = names[Math.floor((age / 29.530588853) * 8 + 0.5) % 8];
  return `${icon} ${name}`;
};

// Moon details: illumination and the next new / first quarter / full / last quarter (mean cycle, within about a day).
const SYNODIC = 29.530588853;
const moonInfo = (d) => {
  const days = (d.getTime() - Date.UTC(2000, 0, 6, 18, 14)) / 86400000;
  const age = ((days % SYNODIC) + SYNODIC) % SYNODIC;
  const illum = Math.round((1 - Math.cos((2 * Math.PI * age) / SYNODIC)) / 2 * 100);
  const next = [[0, "🌑", "New moon"], [0.25, "🌓", "First quarter"], [0.5, "🌕", "Full moon"], [0.75, "🌗", "Last quarter"]]
    .map(([f, icon, name]) => ({ icon, name, date: new Date(d.getTime() + ((f * SYNODIC - age + SYNODIC) % SYNODIC || SYNODIC) * 86400000) }))
    .sort((a, b) => a.date - b.date);
  return { age, illum, waxing: age < SYNODIC / 2, next };
};

const MEAL_SLOTS = [["breakfast", "Breakfast", "🥞"], ["lunch", "Lunch", "🥪"], ["dinner", "Dinner", "🍝"], ["snack", "Snack", "🍎"]];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
// Calendar tab views, in display order. N-day views start on the selected day, like the Today screen.
const CAL_VIEWS = [["agenda", "Agenda"], ["day", "Day"], ["3day", "3 days"], ["5day", "5 days"], ["7day", "7 days"], ["month", "Month"]];
const LEGACY_VIEWS = { schedule: "agenda", week: "7day" };
const viewDays = (v) => ({ day: 1, "3day": 3, "5day": 5, "7day": 7 }[v] || 0);

const TABS = [
  ["home", "Today", "mdi:view-dashboard"],
  ["weather", "Weather", "mdi:weather-partly-cloudy"],
  ["calendar", "Calendar", "mdi:calendar-month"],
  ["chores", "Chores", "mdi:checkbox-marked-circle-outline"],
  ["progress", "Progress", "mdi:chart-bar"],
  ["meals", "Meals", "mdi:silverware-fork-knife"],
  ["lists", "Lists", "mdi:format-list-checks"],
  ["photos", "Photos", "mdi:image-multiple"],
  ["settings", "Settings", "mdi:cog"],
];
const WEATHER_ICONS = {
  "clear-night": "🌙", cloudy: "☁️", fog: "🌫️", hail: "🌨️", lightning: "🌩️", "lightning-rainy": "⛈️",
  partlycloudy: "⛅", pouring: "🌧️", rainy: "🌦️", snowy: "❄️", "snowy-rainy": "🌨️", sunny: "☀️",
  windy: "💨", "windy-variant": "💨", exceptional: "⚠️",
};

// ---------- date helpers (all local time) ----------
const pad = (n) => String(n).padStart(2, "0");
// Adults and kids: only kids have chores; only adults own lists.
const kidsOf = (members) => (members || []).filter((m) => m.role === "kid");
const adultsOf = (members) => (members || []).filter((m) => m.role !== "kid");
// Open items in list order, then done items oldest check-off first (older items without a time keep list order).
const orderItems = (items) => [
  ...(items || []).filter((i) => !i.done),
  ...(items || []).map((i, n) => [i, n]).filter(([i]) => i.done)
    .sort(([a, na], [b, nb]) => (a.done_at || "").localeCompare(b.done_at || "") || na - nb).map(([i]) => i),
];
// Lists grouped for the Lists tab: Shared first, then each adult (in member order) who owns a list.
const groupLists = (lists, members) => {
  const adults = adultsOf(members);
  const ids = new Set(adults.map((m) => m.id));
  const groups = [{ owner: null, lists: (lists || []).filter((l) => !ids.has(l.owner)) }];
  for (const m of adults) groups.push({ owner: m, lists: (lists || []).filter((l) => l.owner === m.id) });
  return groups.filter((g) => g.lists.length);
};
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseYmd = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const sameDay = (a, b) => ymd(a) === ymd(b);
// Python weekday: Mon=0..Sun=6
const pyWeekday = (d) => (d.getDay() + 6) % 7;
const isoWeek = (d) => {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return `${t.getUTCFullYear()}-${Math.ceil(((t - y0) / 86400000 + 1) / 7)}`;
};
const localIso = (d) => {
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? "+" : "-";
  return `${ymd(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:00${sign}${pad(Math.floor(Math.abs(off) / 60))}:${pad(Math.abs(off) % 60)}`;
};
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
// ---------- look: theme presets, seasonal accents, night hours ----------
// Every preset defines every variable in THEME_VARS for both light and dark. Member colors are never touched.
const THEME_VARS = ["--bg", "--card", "--ink", "--muted", "--line", "--accent", "--chip"];
const THEMES = {
  warm: { label: "Warm (default)",
    light: { "--bg": "#f7f4ef", "--card": "#ffffff", "--ink": "#2d2a26", "--muted": "#8a8378", "--line": "rgba(0,0,0,.07)", "--accent": "#4a7dff", "--chip": "rgba(127,127,127,.1)" },
    dark: { "--bg": "#1b1a18", "--card": "#282724", "--ink": "#f1ede6", "--muted": "#a59f94", "--line": "rgba(255,255,255,.08)", "--accent": "#6b93ff", "--chip": "rgba(255,255,255,.08)" } },
  cool: { label: "Cool",
    light: { "--bg": "#eef3f8", "--card": "#ffffff", "--ink": "#1f2a37", "--muted": "#6b7a8c", "--line": "rgba(20,40,80,.09)", "--accent": "#0f8b8d", "--chip": "rgba(40,90,140,.08)" },
    dark: { "--bg": "#0f1720", "--card": "#18232f", "--ink": "#e6eef6", "--muted": "#8fa3b8", "--line": "rgba(200,220,255,.09)", "--accent": "#3cc2c4", "--chip": "rgba(200,220,255,.08)" } },
  slate: { label: "Slate (dark neutral)",
    light: { "--bg": "#e9eaec", "--card": "#f7f7f8", "--ink": "#23262b", "--muted": "#6d737c", "--line": "rgba(0,0,0,.09)", "--accent": "#5b6cff", "--chip": "rgba(0,0,0,.06)" },
    dark: { "--bg": "#16181c", "--card": "#212429", "--ink": "#e8e9ec", "--muted": "#9aa0a9", "--line": "rgba(255,255,255,.08)", "--accent": "#8a96ff", "--chip": "rgba(255,255,255,.07)" } },
  contrast: { label: "High contrast",
    light: { "--bg": "#ffffff", "--card": "#ffffff", "--ink": "#000000", "--muted": "#2b2b2b", "--line": "rgba(0,0,0,.55)", "--accent": "#0040c1", "--chip": "rgba(0,0,0,.08)" },
    dark: { "--bg": "#000000", "--card": "#0b0b0b", "--ink": "#ffffff", "--muted": "#e0e0e0", "--line": "rgba(255,255,255,.6)", "--accent": "#7fb2ff", "--chip": "rgba(255,255,255,.12)" } },
};
const THEME_CSS = Object.entries(THEMES).map(([name, t]) => ["light", "dark"].map((mode) =>
  `:host([data-theme="${name}"][data-scheme="${mode}"]) { ${Object.entries(t[mode]).map(([k, v]) => `${k}:${v};`).join(" ")} }`).join("\n")).join("\n");

// Seasonal accent + header emoji for a date (holidays first, then seasons).
const thanksgiving = (y) => { const first = new Date(y, 10, 1).getDay(); return new Date(y, 10, 1 + ((4 - first + 7) % 7) + 21); };
const seasonFor = (d) => {
  const m = d.getMonth() + 1, day = d.getDate(), md = m * 100 + day, t = startOfDay(d);
  const tg = thanksgiving(d.getFullYear());
  if (md >= 701 && md <= 705) return { key: "july4", emoji: "🎆", accent: "#c62828" };
  if (md >= 1015 && md <= 1031) return { key: "halloween", emoji: "🎃", accent: "#e8710a" };
  if (t >= addDays(tg, -3) && t <= addDays(tg, 3)) return { key: "thanksgiving", emoji: "🦃", accent: "#a0522d" };
  if (md >= 1201 && md <= 1226) return { key: "christmas", emoji: "🎄", accent: "#1f8a4c" };
  if (md >= 320 && md <= 620) return { key: "spring", emoji: "🌷", accent: "#d25b9a" };
  if (md >= 621 && md <= 921) return { key: "summer", emoji: "☀️", accent: "#f39c12" };
  if (md >= 922 && md <= 1220) return { key: "fall", emoji: "🍂", accent: "#c0632b" };
  return { key: "winter", emoji: "❄️", accent: "#3b82c4" };
};

// Night hours: same rules as nightmode.py on the server (kept in step by tests).
const parseHM = (v, dflt) => { const m = /^(\d{1,2}):(\d{2})/.exec(String(v || "")); if (!m) return dflt; const x = Number(m[1]) * 60 + Number(m[2]); return x < 1440 ? x : dflt; };
const inWindow = (now, start, end) => (start === end ? false : start < end ? now >= start && now < end : now >= start || now < end);
const sunIsDown = (rise, set) => (rise && set ? rise < set : null);
const isNightAt = (settings, now, rise = null, set = null) => (settings?.dark_mode === "sun"
  ? !!sunIsDown(rise, set)
  : inWindow(now.getHours() * 60 + now.getMinutes(), parseHM(settings?.night_start, 21 * 60), parseHM(settings?.night_end, 6 * 60 + 30)));

// ---------- birthdays, anniversaries and other yearly dates ----------
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const OCCASION_EMOJI = { birthday: "🎂", anniversary: "💍", other: "📅" };
const isLeap = (y) => y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
// The day a yearly date falls on in `year`; Feb 29 shows on Feb 28 in other years.
const occasionDay = (o, year) => new Date(year, o.month - 1, o.month === 2 && o.day === 29 && !isLeap(year) ? 28 : o.day);
// Next time it happens, today included.
const nextOccasion = (o, from) => {
  const f = startOfDay(from);
  const d = occasionDay(o, f.getFullYear());
  return d < f ? occasionDay(o, f.getFullYear() + 1) : d;
};
const daysBetween = (a, b) => Math.round((startOfDay(b) - startOfDay(a)) / 86400000); // DST-safe
// Members' birthdays plus stored occasions, as one list of yearly dates.
const allOccasions = (members, occasions, familyColor) => {
  const byId = Object.fromEntries((members || []).map((m) => [m.id, m]));
  const out = [];
  for (const m of members || []) {
    if (m.birthday?.month && m.birthday?.day) {
      out.push({ key: `m:${m.id}`, title: `${m.name}'s birthday`, type: "birthday", emoji: "🎂", ...m.birthday, color: m.color, member: m.id });
    }
  }
  for (const o of occasions || []) {
    const first = (o.members || []).map((id) => byId[id]).find(Boolean);
    out.push({ key: `o:${o.id}`, id: o.id, title: o.title, type: o.type || "other", emoji: o.emoji || OCCASION_EMOJI[o.type] || "📅",
      month: o.month, day: o.day, year: o.year, color: first ? first.color : familyColor, members: o.members || [] });
  }
  return out;
};
// The next `count` occasions within `days` days of `today`: [{...occasion, date, days, years}].
const upcomingOccasions = (list, today, days = 60, count = 3) => list
  .map((o) => {
    const date = nextOccasion(o, today);
    return { ...o, date, days: daysBetween(today, date), years: o.year ? date.getFullYear() - o.year : null };
  })
  .filter((o) => o.days <= days && (o.years === null || o.years >= 0))
  .sort((a, b) => a.days - b.days || a.title.localeCompare(b.title))
  .slice(0, count);
// "🎂 Mom's birthday — 12 days (turning 38)"
const occasionText = (u) => {
  const when = u.days === 0 ? "Today! 🎉" : u.days === 1 ? "tomorrow" : `${u.days} days`;
  const extra = u.years === null ? "" : u.type === "birthday" ? ` (${u.days === 0 ? "turns" : "turning"} ${u.years})` : ` (${u.years} year${u.years === 1 ? "" : "s"})`;
  return `${u.emoji} ${u.title} — ${when}${extra}`;
};

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ---------- chore rules (mirror of chores.py) ----------
const choreMatches = (c, day) => {
  const comps = c.completions || [];
  if (c.repeat === "once") return comps;
  if (c.repeat === "weekly") return comps.filter((x) => isoWeek(parseYmd(x)) === isoWeek(day));
  return comps.filter((x) => x === ymd(day));
};
const choreDone = (c, day) => choreMatches(c, day).length > 0;
// Every-N-weeks for "days" chores (mirror of chores.py _week_ok): whole Mon-Sun weeks since the start date.
const mondayOf = (d) => addDays(startOfDay(d), -pyWeekday(d));
const choreWeekOk = (c, day) => {
  const every = Number(c.every_weeks) || 1;
  if (every <= 1 && !c.start) return true;
  const anchor = c.start ? parseYmd(c.start) : day;
  const weeks = Math.round((mondayOf(day) - mondayOf(anchor)) / (7 * 86400000));
  return weeks >= 0 && weeks % every === 0;
};
const choreDue = (c, day) => {
  if (c.repeat === "days") return (c.days || []).includes(pyWeekday(day)) && choreWeekOk(c, day);
  if (c.repeat === "once") { const comps = c.completions || []; return !comps.length || comps.includes(ymd(day)); }
  return true;
};

class SkylightPanel extends HTMLElement {
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
      list: null, dialog: null, saver: false, choreDay: startOfDay(new Date()),
    };
    this._eventsKey = "";
    this._shadowBuilt = false;
  }

  // ---------- HA lifecycle ----------
  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    if (first) this._start();
  }
  get hass() { return this._hass; }
  set panel(_p) {}
  set narrow(n) { this._narrow = n; }
  setConfig(config) { this.config = config || {}; }
  getCardSize() { return 12; }

  connectedCallback() { if (this._hass && !this._unsub) this._start(); }
  // Show a banner when Home Assistant can't be reached (after 10 s, so brief blips don't flash it),
  // and refresh everything once it's back. The data subscription itself resumes automatically.
  _watchConnection() {
    const conn = this._hass.connection;
    if (!conn?.addEventListener || this._connWatched === conn) return;
    this._connWatched = conn;
    this._onConnLost = () => {
      if (this._lostAt) return;
      this._lostAt = Date.now();
      clearTimeout(this._lostTimer);
      this._lostTimer = setTimeout(() => { if (this._lostAt) this.render(); }, 10000);
    };
    this._onConnBack = () => {
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
    if (this._connWatched) {
      this._connWatched.removeEventListener?.("disconnected", this._onConnLost);
      this._connWatched.removeEventListener?.("reconnect-error", this._onConnLost);
      this._connWatched.removeEventListener?.("ready", this._onConnBack);
      window.removeEventListener("offline", this._onConnLost);
      this._connWatched = null; clearTimeout(this._lostTimer); this._lostAt = null;
    }
    if (this._unsub) { this._unsub.then((u) => u && u()).catch(() => {}); this._unsub = null; }
    clearInterval(this._clockTimer); clearInterval(this._idleTimer); clearInterval(this._slideTimer);
    clearInterval(this._refreshTimer); clearInterval(this._alertTimer);
    if (this._onResize) { window.removeEventListener("resize", this._onResize); this._onResize = null; }
    if (this._ro) { this._ro.disconnect(); this._ro = null; }
    for (const u of Object.values(this._todoSubs)) u.then((f) => f && f()).catch(() => {});
    this._todoSubs = {};
  }

  _start() {
    if (!this.isConnected) return;
    this._buildShadow();
    this._unsub = this._hass.connection.subscribeMessage((data) => this._onData(data), { type: "skylight/subscribe" });
    this._unsub.catch((e) => this._fatal(e));
    this._watchConnection();
    this._clockTimer = setInterval(() => this._tickClock(), 10000);
    this._refreshTimer = setInterval(() => { this._eventsKey = ""; this._loadEvents(); this._loadForecast(); if (this.ui.tab === "weather" || this.ui.tab === "home") this._loadWeatherFull(); this._loadWxExtra(); }, 5 * 60000);
    this._alertTimer = setInterval(() => this._loadAlerts(), 2 * 60000);
    this._lastActivity = Date.now();
    this._idleTimer = setInterval(() => this._checkIdle(), 15000);
    if (!this._onResize) {
      this._onResize = () => {
        if (this._wasPhone !== undefined && this._wasPhone !== this.isPhone) { this._eventsKey = ""; this.render(); this._loadEvents(); } // rotated / resized across the phone breakpoint
        this._wasPhone = this.isPhone;
        this._fitMonth();
        const g = this.$app?.querySelector(".tg-scroll");
        if (!g || !this._tgH) return;
        const hours = g.scrollTop / this._tgH;
        this._fitGrid();
        g.scrollTop = hours * this._tgH;
      };
      window.addEventListener("resize", this._onResize);
      if (window.ResizeObserver) {
        this._ro = new ResizeObserver(() => this._onResize());
        this._ro.observe(this.$app);
      }
    }
  }

  _fatal(e) {
    this.$app.innerHTML = `<div class="empty"><h2>Skylight is not available</h2><p>${esc(e?.message || e)}</p>
      <p>Make sure the Skylight integration is installed and added under Settings → Devices &amp; Services.</p></div>`;
  }

  // Non-admin users (the kitchen tablet, kids' devices) don't get Home Assistant's own sidebar and
  // header: HA's kiosk mode for this browser session, plus the "always hidden" sidebar setting as a
  // fallback on HA versions without kiosk mode. Admins are never affected. Not a security boundary:
  // Home Assistant's user permissions still decide what an account can do.
  _applyHaChrome() {
    const user = this._hass?.user;
    if (!user || user.is_admin) return;
    const hide = this.settings.hide_ha_sidebar !== false;
    if (this._haChromeHidden === hide) return;
    this._haChromeHidden = hide;
    window.dispatchEvent(new CustomEvent("hass-kiosk-mode", { detail: { enable: hide } }));
    this.dispatchEvent(new CustomEvent("hass-dock-sidebar", { detail: { dock: hide ? "always_hidden" : "docked" }, bubbles: true, composed: true }));
  }

  _onData(data) {
    const firstLoad = !this.data;
    this.data = data;
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
    this.shadowRoot.innerHTML = `<style>${STYLES}\n${THEME_CSS}</style><div id="app" class="app"><div class="empty">Loading…</div></div><div id="cook"></div><div id="dialog"></div><div id="saver"></div><div id="dim" aria-hidden="true"></div>`;
    this.$dim = this.shadowRoot.getElementById("dim");
    // "Follow tablet" dark mode: react when the device switches.
    this._mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    this._mq?.addEventListener?.("change", () => this._applyLook());
    this.$app = this.shadowRoot.getElementById("app");
    this.$dialog = this.shadowRoot.getElementById("dialog");
    this.$saver = this.shadowRoot.getElementById("saver");
    this.$cook = this.shadowRoot.getElementById("cook");
    this.shadowRoot.addEventListener("click", (e) => this._onClick(e));
    this.shadowRoot.addEventListener("focusin", (e) => { if (e.target.classList?.contains("tinput")) { this._closeTimeLists(); this._openTimeList(e.target); e.target.select(); } });
    this.shadowRoot.addEventListener("pointerdown", (e) => { if (!e.target.closest?.(".tpick")) this._closeTimeLists(); }, true);
    // Swipe left/right to go forward/back on Calendar, Chores and Meals.
    this.shadowRoot.addEventListener("pointerdown", (e) => this._swipeStart(e), { passive: true });
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
  _run(action, el) { Promise.resolve(this._action(action, el)).catch((err) => { if (err?.code !== "locked") console.debug("Skylight:", err); }); }

  _onChange(e) {
    const el = e.target;
    if (el.dataset.change) this._run(el.dataset.change, el);
  }

  async _ws(msg) {
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

  async _loadAlerts(force = false) {
    if (this.settings.weather_alerts === false) { this.alerts = null; return; }
    try { this.alerts = await this._hass.callWS({ type: "skylight/weather/alerts", force }); }
    catch (e) { this.alerts = null; return; } // e.g. server not restarted after an update
    this._checkNewAlerts();
    this.render();
  }
  alertColor(sev) { return { Extreme: "#7b1fa2", Severe: "#c62828", Moderate: "#ef6c00", Minor: "#f9a825" }[sev] || "#607d8b"; }
  renderAlertBanner() {
    const list = this.settings.weather_alerts === false ? [] : this.alerts?.alerts || [];
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
    return this.alerts.alerts.map((a) => {
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
    const list = (this.alerts?.alerts || []).filter((a) => this._popupLevels().includes(a.severity));
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

  // ----- extra weather data (Open-Meteo rain-by-15-min, comparisons, air quality, pollen) -----
  async _loadWxExtra(force = false) {
    if (this.settings.weather_extra === false) { this.wxx = null; return; }
    if (!force && this.wxx && Date.now() - this.wxx.at < 10 * 60000) return;
    if (this._wxxLoading) return;
    this._wxxLoading = true;
    try { this.wxx = { at: Date.now(), ...(await this._hass.callWS({ type: "skylight/weather/extra", force })) }; }
    catch (e) { this.wxx = null; } // e.g. server not restarted after an update
    finally { this._wxxLoading = false; }
    if (this.ui.tab === "weather" || this.ui.tab === "home") this.render();
  }
  _isMetric() {
    const w = this.settings.weather_entity && this._hass.states[this.settings.weather_entity];
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
    const alerts = this.alerts?.alerts || [];
    if (alerts.length) out.push({ icon: "⚠️", text: `${alerts[0].event} in effect`, level: "h-alert" });
    const soon = this._rainSoon();
    if (soon?.text) out.push({ icon: "🌧️", text: soon.text, level: "h-now" });
    // Outdoor events today
    const OUTDOOR = /soccer|baseball|softball|football|practice|game|tournament|park|zoo|pool|swim|picnic|hike|camp|parade|field|bbq|cookout|golf|tennis|run\b|race|fair|festival|playground|beach|lake|garden|yard|walk|bike|recess|outdoor/i;
    const evs = (this.events || []).filter((e) => !e.allDay && !e.info && sameDay(e.start, now) && e.end > now && OUTDOOR.test(`${e.summary} ${e.location}`));
    for (const e of evs.slice(0, 3)) {
      const h = hours.reduce((best, x) => (!best || Math.abs(x.t - e.start) < Math.abs(best.t - e.start) ? x : best), null);
      if (!h || Math.abs(h.t - e.start) > 2 * 3600000) continue;
      const when = `${esc(e.summary)} (${this.fmtTime(e.start)})`;
      const p = n(h.precipitation_probability), feel = n(h.apparent_temperature) ?? n(h.temperature);
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
    const coldAM = morning.length ? Math.min(...morning.map((h) => n(h.apparent_temperature) ?? n(h.temperature))) : null;
    if (coldAM !== null && coldAM <= F(50)) out.push({ icon: "🧥", text: `Jacket weather this morning, ${Math.round(coldAM)}°` });
    // Heat
    const feels = today.map((h) => n(h.apparent_temperature) ?? n(h.temperature)).filter((v) => v !== null);
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
    const uv = uvs.length ? Math.max(...uvs) : n(this._hass.states[this.settings.weather_entity]?.attributes?.uv_index);
    if (uv !== null && uv >= 7) out.push({ icon: "🧴", text: `High UV (${Math.round(uv)}) midday. Wear sunscreen` });
    // Air quality and pollen
    const aqi = n(this.wxx?.air?.aqi);
    if (aqi !== null && aqi > 150) out.push({ icon: "😷", text: `Unhealthy air (AQI ${aqi}). Keep outdoor play short` });
    else if (aqi !== null && aqi > 100) out.push({ icon: "😷", text: `Air quality is poor for sensitive groups (AQI ${aqi})` });
    const high = this._pollenToday().filter((p) => p.level >= 4);
    if (high.length) out.push({ icon: "🤧", text: `${high.map((p) => p.name).join(" & ")} pollen ${high.some((p) => p.level >= 5) ? "very high" : "high"} today` });
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
    const w = this.settings.weather_entity;
    if (!w || !this._hass.states[w]) return;
    if (!force && this.wx && Date.now() - this.wx.at < 15 * 60000) return;
    if (this._wxLoading) return;
    this._wxLoading = true;
    const get = async (type) => {
      try {
        const res = await this._hass.callWS({ type: "call_service", domain: "weather", service: "get_forecasts",
          service_data: { type }, target: { entity_id: w }, return_response: true });
        return res?.response?.[w]?.forecast || [];
      } catch (e) { return null; } // provider doesn't offer this forecast type
    };
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

  async _loadForecast() {
    const w = this.settings.weather_entity;
    if (!w || !this._hass.states[w]) return;
    const get = async (type) => {
      try {
        const res = await this._hass.callWS({
          type: "call_service", domain: "weather", service: "get_forecasts",
          service_data: { type }, target: { entity_id: w }, return_response: true,
        });
        return res?.response?.[w]?.forecast || [];
      } catch (e) { return null; } // this weather source doesn't offer that forecast type
    };
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

  // ---------- actions ----------
  async _action(action, el) {
    const d = el.dataset;
    const D = this.data;
    switch (action) {
      // navigation
      case "tab": if (d.tab === "settings") this._loadCalInfo(); if (this.ui.tab === "settings" && d.tab !== "settings") this.relock(); this.ui.tab = d.tab; this._resetScroll = true; this.render(); if (d.tab === "calendar" || d.tab === "home") this._loadEvents(); break;
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
        if (ev?.occasion) { this._toast("Birthdays and anniversaries are changed in Settings → Birthdays & anniversaries"); break; }
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
        a.href = URL.createObjectURL(blob); a.download = `skylight-backup-${ymd(new Date())}.json`;
        document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
        this._toast("Backup downloaded"); break;
      }
      case "backup-pick": this.shadowRoot.getElementById("backup-file")?.click(); break;
      case "backup-import": {
        const file = el.files?.[0]; el.value = "";
        if (!file) break;
        let backup;
        try { backup = JSON.parse(await file.text()); } catch (e) { this._toast("That file isn't a Skylight backup."); break; }
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
      case "setting": {
        let v = el.type === "checkbox" ? el.checked : el.value;
        if (el.type === "number" || d.num) v = Number(v);
        if (v === "") v = null;
        await this._set("settings", { [d.key]: v });
        if (d.key === "weather_entity") setTimeout(() => this._loadForecast(), 300);
        if (d.key === "weather_alerts") setTimeout(() => this._loadAlerts(true), 300);
        if (d.key === "weather_extra") setTimeout(() => this._loadWxExtra(true), 300);
        if (d.key === "week_start") { this._eventsKey = ""; }
        break;
      }

      // chores
      case "toggle-chore": {
        const chore = D.chores.find((c) => c.id === d.chore);
        const day = d.date ? parseYmd(d.date) : this.ui.choreDay;
        const wasDone = chore && choreDone(chore, day);
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
        await this._ws({ type: "skylight/list/delete", list_id: l.id }); this.ui.list = null; this.closeDialog(); break;
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
  closeDialog() { this.ui.dialog = null; this.$dialog.innerHTML = ""; }
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
    this.$dialog.querySelector("[autofocus]")?.focus();
  }
  _openDialog(dlg) { this.ui.dialog = dlg; this.$dialog.innerHTML = ""; this.renderDialog(); }

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
        ${!writable.length ? `<p class="hint">No calendars yet. Add one in Settings first.</p>` : ""}
        <label>Title<input id="ev-title" value="${esc(ev?.raw ?? ev?.summary)}" autofocus placeholder="Soccer practice"></label>
        <div class="label">Who</div>
        <div class="whopick">${this.members.map((m) => {
          const can = !!this.targetCalendar(m);
          return `<button class="whochip ${dlg.who.has(m.id) ? "on" : ""}" style="--c:${m.color}" ${can ? `data-action="who" data-member="${m.id}"` : `disabled title="${esc(m.name)} has no calendar yet"`}>
            <span class="av" style="background:${m.color}">${m.avatar}</span>${esc(m.name)}</button>`;
        }).join("")}</div>
        ${this.members.some((m) => !this.targetCalendar(m)) ? `<p class="hint">Grayed-out people have no calendar yet. Give them one in Settings → Family members, or use their title prefix.</p>` : ""}
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

  // ---------- location lookup ----------
  _locSearch(text) {
    clearTimeout(this._locTimer);
    const q = text.trim();
    if (q.length < 3) { this._clearSugg(); return; }
    this._locTimer = setTimeout(async () => {
      const seq = (this._locSeq = (this._locSeq || 0) + 1);
      let res;
      try { res = await this._hass.callWS({ type: "skylight/places/search", query: q }); }
      catch (e) {
        const msg = /unknown command/i.test(e.message || "")
          ? "Address lookup needs a Home Assistant restart after updating Skylight."
          : e.message;
        this._showSugg([], msg); return;
      }
      if (seq !== this._locSeq) return; // a newer search is running
      this._showSugg(res.results, null, res.provider);
    }, 450);
  }
  _showSugg(results, error, provider) {
    const box = this.shadowRoot.getElementById("loc-sugg");
    if (!box) return;
    const label = (r) => (r.address && !r.address.startsWith(r.name) ? `${r.name}, ${r.address}` : r.address || r.name);
    box.innerHTML = error ? `<div class="hint">⚠️ ${esc(error)}</div>`
      : results.length ? results.map((r) => `<button type="button" data-action="pick-place" data-value="${esc(label(r))}">
          <b>${esc(r.name)}</b><small>${esc(r.address)}</small></button>`).join("") + `<div class="attrib">${provider === "google" ? "Results from Google" : "Results © OpenStreetMap contributors"}</div>`
      : `<div class="hint">No matches. You can still type the address yourself.</div>`;
    box.hidden = false;
    box.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
  _clearSugg() {
    const box = this.shadowRoot.getElementById("loc-sugg");
    if (box) { box.hidden = true; box.innerHTML = ""; }
  }

  // Calendar where a person's copy of an event is saved: their first writable (non-info, non-feed) calendar.
  // Where new events for a person are saved: their chosen default, else a writable calendar that
  // belongs only to them (so shared ones like "Home Maintenance" don't pull in other people).
  targetCalendar(m) {
    if (!m) return null;
    const ok = (e) => this._hass.states[e] && !this.infoCal(e) && this.calInfo?.[e]?.integration !== "remote_calendar";
    if (m.default_calendar && (m.calendars || []).includes(m.default_calendar) && ok(m.default_calendar)) return m.default_calendar;
    const mine = (m.calendars || []).filter(ok);
    return mine.find((e) => this.calendarOwners(e).length === 1) || mine[0] || null;
  }

  // ---------- time picker: 15-minute list + free typing ----------
  fmtHM(h, m) { return this.fmtTime(new Date(2000, 0, 1, h, m)); }
  timeInput(id, hm) {
    const [h, m] = hm.split(":").map(Number);
    return `<span class="tpick"><input type="text" id="${id}" class="tinput" inputmode="text" autocomplete="off"
      value="${this.fmtHM(h, m)}" data-hm="${hm}" data-change="time-norm" data-enter="time-norm"><span class="tlist" hidden></span></span>`;
  }
  // "4", "4p", "4pm", "4:10", "4:10 pm", "410p", "16:10", "1610" -> [h, m] (null if not a time).
  _parseTime(text, prevH = 12) {
    const t = String(text || "").trim().toLowerCase().replace(/\s+/g, "").replace(/\./g, "");
    const m = /^(\d{1,2})(?::?(\d{2}))?(a|am|p|pm)?$/.exec(t);
    if (!m) return null;
    let h = Number(m[1]), min = Number(m[2] || 0);
    const ap = m[3];
    if (min > 59) return null;
    if (ap) {
      if (h < 1 || h > 12) return null;
      if (ap[0] === "p" && h !== 12) h += 12;
      if (ap[0] === "a" && h === 12) h = 0;
    } else if (h > 23) return null;
    else if (!this.settings.clock_24h && h >= 1 && h <= 12) {
      // No am/pm typed: keep the same half of the day as before (e.g. 4:10 stays PM if it was PM).
      const pm = prevH >= 12;
      if (pm && h !== 12) h += 12;
      if (!pm && h === 12) h = 0;
    }
    return [h, min];
  }
  _readTime(id) {
    const el = this.shadowRoot.getElementById(id);
    if (!el) return null;
    const prev = (el.dataset.hm || "12:00").split(":").map(Number);
    return this._parseTime(el.value, prev[0]) || prev;
  }
  _setTime(id, h, m) {
    const el = this.shadowRoot.getElementById(id);
    if (!el) return;
    el.dataset.hm = `${pad(h)}:${pad(m)}`;
    el.value = this.fmtHM(h, m);
  }
  _openTimeList(input) {
    const list = input.parentElement.querySelector(".tlist");
    if (!list) return;
    const [h0, m0] = this._readTime(input.id) || [9, 0];
    const items = [];
    for (let h = 0; h < 24; h++) for (let m = 0; m < 60; m += 15) items.push([h, m]);
    list.innerHTML = items.map(([h, m]) => `<button type="button" class="${h === h0 && m === m0 ? "on" : ""}" data-action="time-pick" data-for="${input.id}" data-h="${h}" data-m="${m}">${this.fmtHM(h, m)}</button>`).join("");
    list.hidden = false;
    // Scroll so the current time (or the nearest 15 minutes before it) is at the top.
    const idx = h0 * 4 + Math.floor(m0 / 15);
    list.scrollTop = Math.max(0, idx - 1) * (list.firstElementChild?.offsetHeight || 36);
  }
  _closeTimeLists(except) {
    this.shadowRoot.querySelectorAll(".tlist").forEach((l) => { if (l !== except) l.hidden = true; });
  }

  // Current start/end from the form fields.
  _formTimes() {
    const $ = (id) => this.shadowRoot.getElementById(id);
    const at = (dateId, timeId) => {
      const v = $(dateId)?.value; if (!v) return null;
      const d = parseYmd(v);
      const t = this._readTime(timeId);
      if (t) d.setHours(t[0], t[1]);
      return d;
    };
    return { start: at("ev-date", "ev-start"), end: at("ev-enddate", "ev-end") };
  }
  // Moving the start moves the end by the same amount, keeping the event's length.
  _shiftEnd() {
    const dlg = this.ui.dialog;
    const { start, end } = this._formTimes();
    if (!start || !end) return;
    const prev = dlg.prevStart || start;
    const moved = new Date(end.getTime() + (start - prev));
    dlg.prevStart = start;
    const $ = (id) => this.shadowRoot.getElementById(id);
    $("ev-enddate").value = ymd(moved);
    this._setTime("ev-end", moved.getHours(), moved.getMinutes());
  }

  _isRecurring(ev) { return !!(ev && (ev.rrule || ev.recurrence_id)); }
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
        ${seriesOk ? "" : `<p class="hint">This calendar (e.g. Google) doesn't let Skylight edit the whole series. Change the series in Google Calendar, or edit just this event here.</p>`}
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

  openMemberDialog(m) {
    const used = new Set(this.members.map((x) => x.color));
    const dlg = {
      type: "member", member: m, role: m?.role === "kid" ? "kid" : m ? "adult" : "kid",
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
        <label>Name<input id="m-name" value="${esc(m?.name)}" autofocus placeholder="Name"></label>
        <div class="label">Birthday <small class="hint">(optional; year optional too)</small></div>
        ${this._dateFields("m-bday", m?.birthday)}
        <div class="label">This person is</div>
        <div class="seg rolepick"><button class="${dlg.role === "adult" ? "on" : ""}" data-action="member-role" data-role="adult">🧑 Adult</button><button class="${dlg.role === "kid" ? "on" : ""}" data-action="member-role" data-role="kid">🧒 Kid</button></div>
        <p class="hint" style="margin-top:4px">Kids get chores and show on the Chores and Progress tabs. Adults can own lists (like a honey-do list).</p>
        ${(() => {
          const theirs = m ? (this.data.chores || []).filter((c) => c.member_id === m.id) : [];
          const kids = kidsOf(this.members).filter((k) => k.id !== m?.id);
          if (dlg.role !== "adult" || !theirs.length) return "";
          return `<div class="rolewarn">⚠️ ${esc(m.name)} has ${theirs.length} chore${theirs.length > 1 ? "s" : ""}. They're kept but hidden while ${esc(m.name)} is an adult.
            ${kids.length ? `<div class="row"><select id="m-movechores">${kids.map((k) => `<option value="${k.id}">${k.avatar} ${esc(k.name)}</option>`).join("")}</select><button data-action="move-chores">Move chores to this kid</button></div>` : ""}</div>`;
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
            ${dlg.role === "kid" ? `<option value="chores" ${dlg.today === "chores" ? "selected" : ""}>✅ Chores</option>` : ""}
            <option value="list" ${dlg.today === "list" ? "selected" : ""}>📝 A list (to-do / honey-do)</option>
            <option value="none" ${dlg.today === "none" ? "selected" : ""}>Nothing</option></select></label>
          <label ${dlg.today === "list" ? "" : "hidden"}><select id="m-todaylist">
            ${this.allLists().map((l) => `<option value="${esc(l.id)}" ${l.id === dlg.todayList ? "selected" : ""}>${l.linked ? "🔗 " : ""}${esc(l.name)}</option>`).join("")}
            <option value="__new__" ${!dlg.todayList ? "selected" : ""}>＋ New list for ${esc(m?.name || "this person")}</option></select></label>
        </div>
        <div class="label">Calendars</div>
        <div class="checklist">${cals.length ? cals.map((e) => `<label class="check"><input type="checkbox" class="m-cal" id="mc-${e}" value="${e}" ${mine.has(e) ? "checked" : ""}> ${esc(this.calName(e))}</label>`).join("") : `<p class="hint">No calendars found. Create one in Settings → Calendars.</p>`}</div>
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

  // ---------- emoji search ----------
  _emojiButtons(list, kind) {
    const dlg = this.ui.dialog || {};
    const current = kind === "avatar" ? dlg.avatar : dlg.icon;
    const attr = kind === "avatar" ? 'data-action="pick-avatar" data-avatar' : 'data-action="icon-pick" data-icon';
    return list.map((e) => `<button type="button" class="emoji ${e === current ? "sel" : ""}" ${attr}="${e}">${e}</button>`).join("");
  }
  async _loadEmojiData() {
    if (!this._emojiData) {
      this._emojiData = import(new URL(`emoji-data.js?v=${PANEL_VERSION}`, import.meta.url).href).then((m) => {
        // Every emoji that accepts a skin tone becomes toneable in the avatar picker.
        for (const [e, , tone] of m.default) if (tone) TONEABLE.add(e.codePointAt(0));
        return m.default;
      });
    }
    return this._emojiData;
  }
  // Every typed word must start a word in the emoji's keywords ("bea" finds bear; "lawn mow" finds 🚜).
  async _emojiSearch(input) {
    const kind = input.dataset.emojiSearch;
    const grid = this.shadowRoot.getElementById(kind === "avatar" ? "avatar-grid" : "icon-grid");
    const dlg = this.ui.dialog;
    if (!grid || !dlg) return;
    const q = input.value.trim().toLowerCase();
    const base = kind === "avatar" ? AVATARS : CHORE_ICONS;
    const tone = (e) => (kind === "avatar" ? withTone(e, dlg.tone) : e);
    if (!q) { grid.innerHTML = this._emojiButtons(base.map(tone), kind); return; }
    let data;
    try { data = await this._loadEmojiData(); } catch (e) { grid.innerHTML = `<p class="hint">Emoji search unavailable (${esc(e.message)})</p>`; return; }
    if (input.value.trim().toLowerCase() !== q) return; // user kept typing
    const terms = q.split(/\s+/);
    const scored = [];
    for (const [e, words] of data) {
      const w = " " + words + " ";
      if (!terms.every((t) => w.includes(" " + t))) continue;
      // Whole-word matches ("bear") rank above word-start matches ("beard").
      scored.push([e, terms.filter((t) => w.includes(" " + t + " ")).length]);
    }
    // Curated picks first within each level, then everything else in Unicode order.
    const key = (e) => e.replace(/\uFE0F/g, "");
    const baseKeys = new Set(base.map(key));
    const ranked = scored
      .map(([e, exact], i) => ({ e, i, exact, curated: baseKeys.has(key(e)) }))
      .sort((a, b) => b.exact - a.exact || b.curated - a.curated || a.i - b.i)
      .map((x) => x.e).slice(0, 120);
    grid.innerHTML = ranked.length ? this._emojiButtons(ranked.map(tone), kind) : `<p class="hint">No emoji match “${esc(q)}”.</p>`;
  }

  // Big icon button + expandable grid of choices (used by chores).
  iconPicker(dlg, icons) {
    return `<div class="iconpick">
      <button type="button" class="iconbtn" data-action="icon-open" title="Choose an icon">${dlg.icon}<small>▾</small></button>
      ${dlg.iconOpen ? `<div class="icongrid">
        <input class="emojisearch" id="icon-q" data-fresh="1" autocomplete="off" placeholder="🔍 Search (mow, trash, dishes…)" data-emoji-search="icon">
        <div class="iconitems" id="icon-grid">${this._emojiButtons(icons, "icon")}</div></div>` : ""}
    </div>`;
  }

  openChoreDialog(c, memberId) {
    const dlg = {
      type: "chore", chore: c, repeat: c?.repeat || "daily", icon: c?.icon || "✅", iconOpen: false,
      html: () => `
        <h2>${c ? "Edit" : "New"} chore</h2>
        ${!this.members.length ? `<p class="hint">Add family members in Settings first.</p>` : ""}
        <div class="row">
          <label style="flex:0 0 auto">Icon${this.iconPicker(dlg, CHORE_ICONS)}</label>
          <label>Chore<input id="c-title" value="${esc(c?.title)}" autofocus placeholder="Make bed"></label>
        </div>
        <label>Who<select id="c-member">${kidsOf(this.members).map((m) => `<option value="${m.id}" ${m.id === (c?.member_id || memberId) ? "selected" : ""}>${m.avatar} ${esc(m.name)}</option>`).join("")}</select></label>
        <label>Repeats<select id="c-repeat" data-change="chore-repeat">
          <option value="daily" ${dlg.repeat === "daily" ? "selected" : ""}>Every day</option>
          <option value="days" ${dlg.repeat === "days" ? "selected" : ""}>On certain days</option>
          <option value="weekly" ${dlg.repeat === "weekly" ? "selected" : ""}>Once a week (any day)</option>
          <option value="once" ${dlg.repeat === "once" ? "selected" : ""}>Just once</option></select></label>
        <div class="dayopts" ${dlg.repeat === "days" ? "" : "hidden"}>
          <div class="daypick">${WEEKDAYS.map((w, i) => `<label class="daychip"><input type="checkbox" class="c-day" id="cd-${i}" value="${i}" ${(c?.days || [0, 1, 2, 3, 4]).includes(i) ? "checked" : ""}><span>${w}</span></label>`).join("")}</div>
          <div class="row">
            <label>Every<select id="c-every">${[1, 2, 3, 4].map((n) => `<option value="${n}" ${n === (Number(c?.every_weeks) || 1) ? "selected" : ""}>${n === 1 ? "week" : `${n} weeks`}</option>`).join("")}</select></label>
            <label>Starting<input type="date" id="c-start" value="${c?.start || ymd(new Date())}"></label>
          </div>
          <p class="hint">For every other week, pick "2 weeks" and a start date in a week the chore happens (e.g. this Friday's recycling week).</p>
        </div>
        <div class="actions">
          ${c ? `<button class="danger" data-action="delete-chore">Delete</button>` : ""}
          <span class="spacer"></span>
          <button data-action="close">Cancel</button>
          <button class="primary" data-action="save-chore" ${this.members.length ? "" : "disabled"}>Save</button>
        </div>`,
    };
    this._openDialog(dlg);
  }
  _syncChoreDialog() {
    const dp = this.shadowRoot.querySelector(".dayopts");
    if (dp) dp.hidden = this.ui.dialog.repeat !== "days";
  }
  async saveChore() {
    const $ = (id) => this.shadowRoot.getElementById(id);
    const c = this.ui.dialog.chore;
    const title = $("c-title").value.trim();
    if (!title) { this._toast("Please name the chore"); return; }
    const rec = {
      ...(c || { id: uid(), completions: [], created: ymd(new Date()) }),
      title, icon: this.ui.dialog.icon || "✅", member_id: $("c-member").value,
      repeat: $("c-repeat").value,
      days: [...this.shadowRoot.querySelectorAll(".c-day:checked")].map((i) => Number(i.value)),
      every_weeks: Number($("c-every").value) || 1,
      start: $("c-start").value || ymd(new Date()),
    };
    const chores = c ? this.data.chores.map((x) => (x.id === c.id ? rec : x)) : [...this.data.chores, rec];
    await this._set("chores", chores); this.closeDialog();
  }

  // ---------- Mealie ----------
  async _reloadMealie() { this._mealieKey = ""; await this._loadMealie(); }
  async _loadMealie() {
    if (!this.mealieOn) return;
    const s = this.weekStart(this.ui.anchor);
    const key = `${ymd(s)}|${this.mealie.selected}`;
    if (key === this._mealieKey) return;
    this._mealieKey = key;
    try {
      const meals = await this._hass.callWS({ type: "skylight/mealie/week", start: ymd(s), end: ymd(addDays(s, 6)) });
      if (key !== this._mealieKey) return;
      this.mealieMeals = meals; this.ui.mealieError = null;
    } catch (e) { this.mealieMeals = []; this.ui.mealieError = e.message; }
    if (this.ui.tab === "meals") this.render();
  }
  mealieFor(date, slot) { return this.mealieMeals.filter((m) => m.date === date && m.slot === slot); }
  mealieName(m) { return m.recipe?.name || m.title || "Meal"; }

  openMealieDialog(date, slot) {
    const label = MEAL_SLOTS.find((x) => x[0] === slot);
    const dlg = {
      type: "mealie", date, slot, results: null, loading: false,
      html: () => {
        const current = this.mealieFor(date, slot);
        const synced = this.syncedMeals(parseYmd(date), slot);
        return `
        <h2>${label[2]} ${label[1]} · ${parseYmd(date).toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" })}</h2>
        ${current.map((m) => `<div class="mplan">
            ${m.recipe?.image ? `<img src="${m.recipe.image}" alt="">` : `<span class="noimg">📝</span>`}
            <div class="grow" ${m.recipe ? `data-action="view-recipe" data-recipe="${esc(m.recipe.id)}"` : ""}><b>${esc(this.mealieName(m))}</b>${m.recipe ? `<small>View recipe ›</small>` : m.text ? `<small>${esc(m.text)}</small>` : ""}</div>
            <button class="x" data-action="mealie-remove" data-meal="${m.id}">✕</button></div>`).join("")}
        ${synced.map((e) => `<div class="syncedrow">📅 <b>${esc(this.mealTitle(e))}</b> <small>from ${esc(this.entityName(e.entity))}</small></div>`).join("")}
        <div class="additem" style="margin-top:12px"><input id="mealie-q" placeholder="Search recipes…" data-enter="mealie-search" autofocus><button data-action="mealie-search">Search</button><button data-action="mealie-random" title="Random recipe">🎲</button></div>
        <div class="rgrid">${dlg.loading ? `<p class="hint">Searching…</p>` : (dlg.results || []).map((r) => `
          <button class="rcardmini" data-action="mealie-add" data-recipe="${esc(r.id)}">
            ${r.image ? `<img src="${r.image}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">` : ""}<span>${esc(r.name)}</span></button>`).join("") || (dlg.results ? `<p class="hint">No recipes found.</p>` : "")}</div>
        <details><summary>More options</summary>
          <div class="additem"><input id="mealie-note" placeholder="Just a note, e.g. Leftovers / Eat out" data-enter="mealie-note"><button data-action="mealie-note">Add note</button></div>
          <div class="additem"><input id="mealie-url" placeholder="Import recipe from a website URL"><button data-action="mealie-import">Import &amp; add</button></div>
        </details>
        <div class="actions"><span class="spacer"></span><button data-action="close">Done</button></div>`;
      },
    };
    this._openDialog(dlg);
    this._mealieSearch();
  }

  async _mealieSearch() {
    const dlg = this.ui.dialog;
    if (dlg?.type !== "mealie") return;
    const q = this.shadowRoot.getElementById("mealie-q")?.value || "";
    dlg.loading = true; this.renderDialog();
    try { dlg.results = await this._ws({ type: "skylight/mealie/recipes", query: q }); }
    catch (e) { dlg.results = []; }
    dlg.loading = false;
    if (this.ui.dialog === dlg) this.renderDialog();
  }

  async _mealieSet(extra) {
    const dlg = this.ui.dialog;
    await this._ws({ type: "skylight/mealie/set", date: dlg.date, slot: dlg.slot, ...extra });
    await this._reloadMealie();
    this.closeDialog();
  }

  async openRecipe(id) {
    let r;
    try { r = await this._ws({ type: "skylight/mealie/recipe", recipe_id: id }); } catch (e) { return; }
    const lists = [...(this.data.linked_todos || [])].filter((e) => this._hass.states[e]);
    this._openDialog({
      type: "recipe",
      html: () => `
        ${r.image ? `<img class="hero" src="${r.image}" alt="" onerror="this.remove()">` : ""}
        <h2>${esc(r.name)}</h2>
        ${r.total_time ? `<p class="hint">⏱ ${esc(r.total_time)}</p>` : ""}
        ${r.description ? `<p>${esc(r.description)}</p>` : ""}
        <h3>Ingredients</h3>
        <div class="checklist ings">${r.ingredients.map((i) => `<label class="check"><input type="checkbox" class="ing-check" value="${esc(i)}"> ${esc(i)}</label>`).join("") || `<p class="hint">None listed</p>`}</div>
        ${lists.length ? `<div class="additem"><select id="recipe-list">${lists.map((e) => `<option value="${e}">${esc(this.entityName(e))}</option>`).join("")}</select><button data-action="recipe-to-list">Add checked to list</button></div>`
          : `<p class="hint">Link a shopping list in Settings to send ingredients to it.</p>`}
        <h3>Steps</h3>
        <ol class="steps">${r.instructions.map((t) => `<li>${esc(t)}</li>`).join("")}</ol>
        <div class="actions"><span class="spacer"></span><button class="primary" data-action="close">Close</button></div>`,
    });
  }

  // ---------- Mealie: recipe browser ----------
  async _loadOrganizers() {
    if (this._orgLoaded) return;
    this._orgLoaded = true;
    try { this.mealieOrg = await this._hass.callWS({ type: "skylight/mealie/organizers" }); }
    catch (e) { this.mealieOrg = { categories: [], tags: [] }; }
    if (this.ui.tab === "meals") this.render();
  }
  async _browse(more = false) {
    const b = this.browse || (this.browse = { query: "", category: "", tag: "", sort: "name", items: null, page: 0, pages: 1 });
    const page = more ? b.page + 1 : 1;
    const req = (b.req = (b.req || 0) + 1);
    b.loading = true; if (!more) b.items = null;
    if (this.ui.tab === "meals") this.render();
    try {
      const msg = { type: "skylight/mealie/browse", query: b.query, sort: b.sort, page };
      if (b.category) msg.category = b.category;
      if (b.tag) msg.tag = b.tag;
      const r = await this._hass.callWS(msg);
      if (req !== b.req) return;
      b.items = more ? [...(b.items || []), ...r.items] : r.items;
      b.page = r.page; b.pages = r.total_pages; b.total = r.total; b.error = null;
    } catch (e) {
      if (req !== b.req) return;
      b.error = /unknown command/i.test(e.message || "") ? "Restart Home Assistant to finish updating Skylight." : e.message; b.items = b.items || [];
    }
    b.loading = false;
    if (this.ui.tab === "meals") this.render();
  }
  renderRecipes() {
    this._loadOrganizers();
    if (!this.browse) this._browse();
    const b = this.browse;
    const org = this.mealieOrg || { categories: [], tags: [] };
    const cats = org.categories.slice(0, 30);
    return `<div class="rbrowse">
      <div class="rbar">
        <input id="rb-q" type="search" placeholder="Search recipes or ingredients…" value="${esc(b.query)}" data-enter="rb-search">
        <select data-change="rb-sort" aria-label="Sort">${[["name", "A–Z"], ["new", "Newest"], ["rating", "Top rated"], ["updated", "Recently edited"]].map(([v, l]) => `<option value="${v}" ${b.sort === v ? "selected" : ""}>${l}</option>`).join("")}</select>
        ${org.tags.length ? `<select data-change="rb-tag" aria-label="Tag"><option value="">All tags</option>${org.tags.map((t) => `<option value="${esc(t.slug)}" ${b.tag === t.slug ? "selected" : ""}>${esc(t.name)}</option>`).join("")}</select>` : ""}
      </div>
      ${cats.length ? `<div class="seg rcats"><button class="${!b.category ? "on" : ""}" data-action="rb-cat" data-cat="">All</button>${cats.map((c) => `<button class="${b.category === c.slug ? "on" : ""}" data-action="rb-cat" data-cat="${esc(c.slug)}">${esc(c.name)}</button>`).join("")}</div>` : ""}
      ${b.error ? `<p class="hint">⚠️ ${esc(b.error)}</p>` : ""}
      <div class="rbgrid">${(b.items || []).map((r) => `<div class="rbcard" role="button" tabindex="0" data-action="cook" data-recipe="${esc(r.slug || r.id)}">
          <div class="rbimg">${r.image ? `<img src="${esc(r.image)}" alt="" loading="lazy" onerror="this.remove()">` : ""}<span>🍽️</span></div>
          <b>${esc(r.name)}</b><small>${[r.total_time ? `⏱ ${esc(r.total_time)}` : "", r.rating ? "★".repeat(Math.round(r.rating)) : ""].filter(Boolean).join(" · ")}</small></div>`).join("")}</div>
      ${b.loading ? `<p class="hint center">Loading recipes…</p>` : b.items && !b.items.length ? `<p class="hint center">No recipes found.</p>` : ""}
      ${!b.loading && b.items && b.page < b.pages ? `<div class="center"><button data-action="rb-more">Show more${b.total ? ` (${b.items.length} of ${b.total})` : ""}</button></div>` : ""}
    </div>`;
  }

  // Hidden delete: hold a recipe picture for 5 s to show its Delete button for 15 s.
  _delShown(key) { return this._delReveal?.key === key && Date.now() < this._delReveal.until; }
  _holdStart(e) {
    const t = e.target.closest?.("[data-hold]");
    if (!t || !e.isPrimary || e.target.closest(".rbdel")) return;
    this._holdCancel();
    const key = t.dataset.hold;
    t.classList.add("holding");
    this._hold = { key, el: t, x: e.clientX, y: e.clientY, timer: setTimeout(() => {
      this._hold = null; t.classList.remove("holding");
      this._holdFired = true; // the finger lifting mustn't open the recipe (see pointerup)
      this._delReveal = { key, until: Date.now() + 15000 };
      clearTimeout(this._delHideTimer);
      this._delHideTimer = setTimeout(() => { this._delReveal = null; this._refreshRecipeViews(); }, 15000);
      if (navigator.vibrate) try { navigator.vibrate(40); } catch (err) { /* not supported */ }
      this._refreshRecipeViews();
    }, 5000) };
  }
  _holdMove(e) {
    const h = this._hold;
    if (h && Math.hypot(e.clientX - h.x, e.clientY - h.y) > 12) this._holdCancel(); // scrolling, not holding
  }
  _holdCancel() {
    if (!this._hold) return;
    clearTimeout(this._hold.timer); this._hold.el.classList.remove("holding"); this._hold = null;
  }
  _refreshRecipeViews() {
    if (this.cook?.r) this.renderCook();
  }

  // ---------- Today screen: upcoming birthdays and anniversaries ----------
  renderUpcoming() {
    const list = upcomingOccasions(allOccasions(this.members, this.data.occasions, this.settings.family_color || "#ff9f43"),
      new Date(), Number(this.settings.upcoming_days ?? 60), Number(this.settings.upcoming_count ?? 3));
    if (!list.length) return "";
    return `<div class="upcoming"><div class="uhead">Upcoming</div>${list.map((u) => `
      <div class="urow ${u.days === 0 ? "today" : ""}" style="--c:${u.color}"><span class="uemoji">${u.emoji}</span>
        <span class="utext"><b>${esc(u.title)}</b><small>${esc(occasionText(u).split(" — ")[1] || "")}</small></span></div>`).join("")}</div>`;
  }

  // ---------- Settings: theme, dark mode, night dimming ----------
  renderLookCard() {
    const s = this.settings, mode = s.dark_mode || "follow";
    const bright = Object.keys(this._hass.states).filter((e) => /^(number|light|input_number)\./.test(e) && (e.startsWith("light.") || /bright/i.test(e) || /bright/i.test(this.entityName(e)))).sort();
    const showTimes = mode === "scheduled" || (s.night_dim && mode !== "sun");
    return `<section class="card">
      <h2>Look &amp; night mode</h2>
      <label class="inline">Theme <select data-change="setting" data-key="theme">${Object.entries(THEMES).map(([k, t]) => `<option value="${k}" ${(s.theme || "warm") === k ? "selected" : ""}>${t.label}</option>`).join("")}</select></label>
      <label class="inline">Seasonal accents ${s.seasonal ? seasonFor(new Date()).emoji : ""} <input type="checkbox" ${s.seasonal ? "checked" : ""} data-change="setting" data-key="seasonal"></label>
      <p class="hint">Changes the accent color and adds a small emoji by the clock for spring, summer, July 4th, fall, Halloween, Thanksgiving week, Christmas and winter.</p>
      <label class="inline">Dark mode <select data-change="setting" data-key="dark_mode">${[["follow", "Follow tablet"], ["light", "Always light"], ["dark", "Always dark"], ["scheduled", "Scheduled"], ["sun", "Sunset to sunrise"]].map(([v, l]) => `<option value="${v}" ${mode === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>
      ${showTimes ? `<div class="row"><label class="inline">Night starts <input type="time" value="${esc(s.night_start || "21:00")}" data-change="setting" data-key="night_start"></label>
        <label class="inline">ends <input type="time" value="${esc(s.night_end || "06:30")}" data-change="setting" data-key="night_end"></label></div>` : ""}
      <label class="inline">Dim the screen at night <input type="checkbox" ${s.night_dim ? "checked" : ""} data-change="setting" data-key="night_dim"></label>
      ${s.night_dim ? `
        <label class="inline">Screen brightness entity <select data-change="setting" data-key="brightness_entity"><option value="">None (dim with an overlay)</option>${bright.map((e) => `<option value="${e}" ${e === s.brightness_entity ? "selected" : ""}>${esc(this.entityName(e))}</option>`).join("")}</select></label>
        <div class="row"><label class="inline">Day brightness % <input type="number" min="1" max="100" value="${Number(s.day_brightness ?? 80)}" data-change="setting" data-key="day_brightness" data-num="1"></label>
          <label class="inline">Night brightness % <input type="number" min="1" max="100" value="${Number(s.night_brightness ?? 20)}" data-change="setting" data-key="night_brightness" data-num="1"></label></div>
        <p class="hint">${s.brightness_entity
          ? "Home Assistant sets this entity to the day or night level when night starts and ends (a manual change stays until the next switch). With Fully Kiosk Browser, use its integration's “Screen brightness” entity."
          : "No brightness entity: Skylight darkens the picture with an overlay. That dims pixels, not the backlight, so the screen still glows a little. For real dimming, add the Fully Kiosk Browser integration in Home Assistant and pick its “Screen brightness” entity here."}
          Night hours ${mode === "sun" ? "follow sunset and sunrise" : "use the times above"}; the photo screensaver is dimmed too.</p>` : ""}
    </section>`;
  }

  // ---------- Settings: birthdays & anniversaries ----------
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
        <label>Title<input id="o-title" value="${esc(o?.title || "")}" placeholder="${dlg.kind === "anniversary" ? "Mom & Dad's anniversary" : dlg.kind === "birthday" ? "Grandma's birthday" : "Adoption day"}" autofocus></label>
        ${this._dateFields("o", o)}
        <p class="hint" style="margin-top:-4px">With a year, Skylight shows the age or number of years.</p>
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

  // ---------- Mealie: tonight's dinner on the Today screen ----------
  async _loadTodayMeals() {
    if (!this.mealieOn) return;
    const today = ymd(new Date());
    if (this._todayMeals && this._todayMeals.date === today && Date.now() - this._todayMeals.at < 10 * 60000) return;
    if (this._todayLoading) return;
    this._todayLoading = true;
    try {
      const meals = await this._hass.callWS({ type: "skylight/mealie/week", start: today, end: today });
      this._todayMeals = { date: today, at: Date.now(), meals };
    } catch (e) { this._todayMeals = { date: today, at: Date.now(), meals: [] }; }
    finally { this._todayLoading = false; }
    if (this.ui.tab === "home") this.render();
  }
  renderTonight() {
    if (!this.mealieOn) return "";
    this._loadTodayMeals();
    const meals = this._todayMeals?.date === ymd(new Date()) ? this._todayMeals.meals : [];
    if (!meals.length) return "";
    const order = ["dinner", "lunch", "breakfast", "snack"];
    const after = new Date().getHours() >= 14; // afternoon: dinner is what matters
    const main = [...meals].sort((a, b) => order.indexOf(a.slot) - order.indexOf(b.slot)).find((m) => m.recipe && (after ? m.slot === "dinner" : true))
      || meals.find((m) => m.slot === "dinner") || meals[0];
    const others = meals.filter((m) => m !== main);
    const label = { dinner: "Tonight's dinner", lunch: "Lunch today", breakfast: "Breakfast today", snack: "Snack today" }[main.slot] || "Today";
    const img = main.recipe?.image;
    return `<div class="tonight ${main.recipe ? "tap" : ""}" ${main.recipe ? `data-action="cook" data-recipe="${esc(main.recipe.slug || main.recipe.id)}"` : ""}>
      ${img ? `<img src="${esc(img)}" alt="" onerror="this.remove()">` : `<span class="tnoimg">🍽️</span>`}
      <div><small>${label}</small><b>${esc(this.mealieName(main))}</b>${main.recipe ? `<span class="cookbtn">👩‍🍳 Cook ›</span>` : ""}
      ${others.length ? `<small class="tothers">${others.map((m) => `${(MEAL_SLOTS.find((s) => s[0] === m.slot) || [])[2] || ""} ${esc(this.mealieName(m))}`).join(" · ")}</small>` : ""}</div></div>`;
  }

  // ---------- Mealie: cook mode ----------
  async openCook(key) {
    this.cook = { loading: true, key };
    this.renderCook();
    try {
      const r = await this._ws({ type: "skylight/mealie/cook", recipe: key });
      if (this.cook?.key !== key) return;
      this.cook = { key, r, servings: r.servings || null, mult: 1, step: 0, got: new Set(), qr: false };
    } catch (e) {
      if (this.cook?.key !== key) return;
      this.cook = { key, error: /unknown command/i.test(e.message || "") ? "Restart Home Assistant to finish updating Skylight." : e.message };
    }
    this.renderCook();
  }
  closeCook() { this.cook = null; this.$cook.innerHTML = ""; this._lastActivity = Date.now(); }
  _cookFactor() {
    const c = this.cook;
    return c.r.servings && c.servings ? c.servings / c.r.servings : c.mult;
  }
  _fmtQty(q) {
    if (q >= 10) return String(Math.round(q));
    const whole = Math.floor(q + 1e-9), frac = q - whole;
    const fr = [[0, ""], [1 / 8, "⅛"], [1 / 4, "¼"], [1 / 3, "⅓"], [3 / 8, "⅜"], [1 / 2, "½"], [5 / 8, "⅝"], [2 / 3, "⅔"], [3 / 4, "¾"], [7 / 8, "⅞"], [1, ""]];
    const [v, sym] = fr.reduce((best, x) => (Math.abs(x[0] - frac) < Math.abs(best[0] - frac) ? x : best));
    if (Math.abs(v - frac) > 0.04) return String(Math.round(q * 100) / 100);
    const w = v === 1 ? whole + 1 : whole;
    return w && sym ? `${w} ${sym}` : sym || String(w);
  }
  _ingText(i, f) {
    if (!i.scalable || f === 1) return esc(i.text);
    const q = i.qty * f, plural = q > 1;
    const unit = plural ? i.unit_plural || i.unit : i.unit;
    const food = plural && !unit ? i.food_plural || i.food : i.food;
    return `<b>${this._fmtQty(q)}</b> ${esc([unit, food].filter(Boolean).join(" "))}${i.note ? `, ${esc(i.note)}` : ""}`;
  }
  renderCook() {
    if (!this.$cook) return;
    const c = this.cook;
    if (!c) { this.$cook.innerHTML = ""; return; }
    const shell = (inner) => `<div class="cook" role="dialog" aria-label="Cook mode">${inner}</div>`;
    if (c.loading || c.error) {
      this.$cook.innerHTML = shell(`<div class="cktop"><h2>${c.error ? "Couldn't open the recipe" : "Loading recipe…"}</h2><span class="spacer"></span><button class="ckx" data-action="cook-close">✕ Close</button></div>
        ${c.error ? `<p class="hint" style="padding:0 24px">${esc(c.error)}</p>` : ""}`);
      return;
    }
    const r = c.r, f = this._cookFactor();
    const unscalable = f !== 1 && r.ingredients.some((i) => !i.scalable && /\d/.test(i.text));
    const serv = r.servings
      ? `<div class="ckserv"><button data-action="cook-serv" data-d="-1" aria-label="Fewer servings">−</button><span><b>${Math.round(c.servings * 10) / 10}</b> servings</span><button data-action="cook-serv" data-d="1" aria-label="More servings">+</button>${c.servings !== r.servings ? `<button class="reset" data-action="cook-serv" data-d="0">Reset</button>` : ""}</div>`
      : `<div class="seg ckmult">${[0.5, 1, 1.5, 2, 3].map((m) => `<button class="${c.mult === m ? "on" : ""}" data-action="cook-mult" data-m="${m}">×${m === 0.5 ? "½" : m === 1.5 ? "1½" : m}</button>`).join("")}</div>`;
    let lastSec = null;
    const ings = r.ingredients.map((i, k) => {
      const head = i.section && i.section !== lastSec ? `<h4>${esc(i.section)}</h4>` : "";
      lastSec = i.section || lastSec;
      return `${head}<button class="ckii ${c.got.has(k) ? "got" : ""}" data-action="cook-ing" data-k="${k}"><span class="box">${c.got.has(k) ? "✓" : ""}</span><span>${this._ingText(i, f)}</span></button>`;
    }).join("");
    let lastStepSec = null;
    const steps = r.steps.map((s, k) => {
      const head = s.section && s.section !== lastStepSec ? `<h4>${esc(s.section)}</h4>` : "";
      lastStepSec = s.section || lastStepSec;
      return `${head}<button class="ckstep ${k === c.step ? "on" : k < c.step ? "past" : ""}" data-action="cook-step" data-k="${k}"><span class="num">${k + 1}</span><p>${esc(s.text)}</p></button>`;
    }).join("");
    const times = [r.prep_time ? `Prep ${esc(r.prep_time)}` : "", r.cook_time ? `Cook ${esc(r.cook_time)}` : "", r.total_time ? `Total ${esc(r.total_time)}` : ""].filter(Boolean).join(" · ");
    this.$cook.innerHTML = shell(`
      <div class="cktop">
        <div class="ckimg holdable" data-hold="${esc(r.slug || r.id)}">${r.image ? `<img src="${esc(r.image)}" alt="" draggable="false" onerror="this.remove()">` : ""}<span>🍽️</span>
          ${this._delShown(r.slug || r.id) ? `<button class="rbdel" data-action="recipe-delete" data-recipe="${esc(r.slug || r.id)}" data-name="${esc(r.name)}">🗑 Delete</button>` : ""}</div>
        <div class="cktitle"><h2>${esc(r.name)}</h2>${times ? `<small>⏱ ${times}</small>` : ""}</div>
        <span class="spacer"></span>
        ${serv}
        ${r.link ? `<button data-action="cook-qr" title="Open on your phone">📱 On my phone</button>` : ""}
        <button class="ckx" data-action="cook-close">✕ Close</button>
      </div>
      <div class="ckbody">
        <section class="ckings"><h3>Ingredients <small>${c.got.size}/${r.ingredients.length}</small></h3>
          ${unscalable ? `<p class="hint">Some amounts are plain text in Mealie and aren't scaled.</p>` : ""}
          ${ings || `<p class="hint">None listed</p>`}
          ${r.notes.length ? `<h3>Notes</h3>${r.notes.map((n) => `<p class="cknote">${n.title ? `<b>${esc(n.title)}:</b> ` : ""}${esc(n.text)}</p>`).join("")}` : ""}
        </section>
        <section class="cksteps"><h3>Steps${r.steps.length ? ` <small>${Math.min(c.step + 1, r.steps.length)} of ${r.steps.length}</small>` : ""}</h3>
          ${steps || `<p class="hint">No steps in this recipe.${r.source ? ` <br>Source: ${esc(r.source)}` : ""}</p>`}</section>
      </div>
      ${r.steps.length ? `<div class="cknav"><button data-action="cook-prev" ${c.step <= 0 ? "disabled" : ""}>‹ Back</button>
        <span>Step ${c.step + 1} of ${r.steps.length}</span>
        <button class="primary" data-action="${c.step >= r.steps.length - 1 ? "cook-close" : "cook-next"}">${c.step >= r.steps.length - 1 ? "Done 🎉" : "Next ›"}</button></div>` : ""}
      ${c.qr ? `<div class="ckqr" data-action="cook-qr"><div class="ckqrcard"><h3>Scan with your phone</h3><div class="qrbox">${c.qrSvg || "…"}</div>
        <p class="hint">Opens this recipe in Mealie. Your phone must be able to reach Mealie (same Wi-Fi, or a link set in Settings → Mealie).</p><small class="qrurl">${esc(r.link)}</small></div></div>` : ""}`);
    const on = this.$cook.querySelector(".ckstep.on");
    if (on && c.scrollStep) { on.scrollIntoView({ block: "center", behavior: "smooth" }); c.scrollStep = false; }
  }
  async _cookQr() {
    const c = this.cook;
    c.qr = !c.qr;
    if (c.qr && !c.qrSvg) {
      try {
        const m = await import(new URL(`qrcode.js?v=${PANEL_VERSION}`, import.meta.url).href);
        const q = m.default(0, "M"); q.addData(c.r.link); q.make();
        c.qrSvg = q.createSvgTag({ cellSize: 6, margin: 4, scalable: true });
      } catch (e) { c.qrSvg = `<p class="hint">Couldn't make the QR code.</p>`; }
    }
    this.renderCook();
  }

  // ---------- settings PIN ----------
  get pinSet() { return !!this.data?.security?.pin_set; }
  get unlocked() { return !this.pinSet || (this._unlockUntil || 0) > Date.now(); }
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
      title: "Enter settings PIN", sub: "Settings are locked so they can't be changed by accident.",
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
    const first = await this.promptPin({ title: "Choose a settings PIN", sub: "4 to 8 digits. Needed to change Settings, family members and chores." });
    if (first === null) return;
    const second = await this.promptPin({ title: "Enter the PIN again", check: async (p) => (p === first ? null : "Those didn't match. Try again.") });
    if (second === null) return;
    try {
      const r = await this._ws({ type: "skylight/pin/set", pin: first });
      this._unlockUntil = Date.now() + (r.seconds_left || 300) * 1000;
      this._toast("Settings PIN set");
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
      this._toast("Settings PIN changed");
    } catch (e) { /* toast shown */ }
    this.render();
  }
  async pinRemove() {
    const current = await this.promptPin({ title: "Current PIN", sub: "Removing the PIN leaves Settings open to everyone." });
    if (current === null) return;
    try { await this._ws({ type: "skylight/pin/clear", current }); this._unlockUntil = 0; this._toast("Settings PIN removed"); }
    catch (e) { /* toast shown */ }
    this.render();
  }
  renderPinCard() {
    const s = this.settings;
    return `<section class="card" id="pin-card">
      <h2>Settings PIN</h2>
      ${this.pinSet ? `
        <p class="hint">${this.unlocked ? "🔓 Unlocked on this screen. It locks again when you leave Settings, when the photo screensaver starts, or after the time below." : "🔒 Locked. Changes ask for the PIN."}</p>
        <div class="row">${this.unlocked ? `<button data-action="pin-lock">🔒 Lock now</button>` : `<button class="primary" data-action="pin-unlock">🔓 Unlock</button>`}
          <button data-action="pin-change">Change PIN</button><button data-action="pin-remove">Remove PIN</button></div>
        <label class="inline">Stay unlocked for (minutes) <input type="number" min="1" max="60" value="${Number(s.unlock_minutes) || 5}" data-change="setting" data-key="unlock_minutes"></label>
        <p class="hint">Forgot it? A Home Assistant admin can remove it: Settings → Devices &amp; Services → Skylight → Configure.</p>`
      : `<p class="hint">No PIN set: anyone using this display can change Settings, family members and chores.</p>
        <button class="primary" data-action="pin-setup">Set a settings PIN</button>`}
    </section>`;
  }

  // ---------- linked HA to-do lists ----------
  // ----- reordering list items: drag the ≡ handle -----
  _openIds() {
    if (this._isTodo()) return (this.todoItems[this._todoEntity()] || []).filter((t) => t.status !== "completed").map((t) => t.uid);
    return (this.data.lists.find((l) => l.id === this.ui.list)?.items || []).filter((i) => !i.done).map((i) => i.id);
  }
  // Put an open item at position `target` among the open items.
  async _moveItem(itemId, target) {
    const open = this._openIds();
    const k = open.indexOf(itemId);
    target = Math.max(0, Math.min(open.length - 1, target));
    if (k < 0 || target === k) { this.render(); return; }
    if (this._isTodo()) {
      // Home Assistant to-do: "put it after <previous>" (none = top).
      const rest = open.filter((id) => id !== itemId);
      const previous = target === 0 ? null : rest[target - 1];
      try { await this._hass.callWS({ type: "todo/item/move", entity_id: this._todoEntity(), uid: itemId, ...(previous ? { previous_uid: previous } : {}) }); }
      catch (e) { this._toast(e?.message || String(e)); this.render(); }
      return;
    }
    try { await this._ws({ type: "skylight/list/move", list_id: this.ui.list, item_id: itemId, to_index: target }); }
    catch (e) { this.render(); }
  }
  _dragStart(e) {
    const h = e.target.closest?.("[data-drag]");
    if (!h || this._drag || (e.pointerType === "mouse" && e.button !== 0)) return;
    e.preventDefault();
    const row = h.closest(".item");
    const rows = [...row.parentElement.querySelectorAll(".item:not(.done)")];
    const scroller = this.$app.querySelector(".content");
    this._drag = { id: h.dataset.drag, row, rows, from: rows.indexOf(row), to: rows.indexOf(row), y0: e.clientY, s0: scroller?.scrollTop || 0,
      scroller, tops: rows.map((r) => r.getBoundingClientRect().top), h: row.getBoundingClientRect().height, pid: e.pointerId };
    try { h.setPointerCapture(e.pointerId); } catch (err) { /* old WebView */ }
    row.classList.add("dragging");
    rows.forEach((r) => { if (r !== row) r.classList.add("shifting"); });
    if (navigator.vibrate) try { navigator.vibrate(15); } catch (err) { /* not supported */ }
  }
  _dragMove(e) {
    const g = this._drag;
    if (!g || e.pointerId !== g.pid) return;
    // Scroll the page when dragging near its top or bottom edge.
    if (g.scroller) {
      const box = g.scroller.getBoundingClientRect();
      if (e.clientY < box.top + 60) g.scroller.scrollTop -= 12;
      else if (e.clientY > box.bottom - 60) g.scroller.scrollTop += 12;
    }
    const dy = e.clientY - g.y0 + ((g.scroller?.scrollTop || 0) - g.s0);
    g.row.style.transform = `translateY(${dy}px)`;
    // Where would it land? Count the rows whose middle it has passed.
    const center = g.tops[g.from] + dy + g.h / 2;
    let to = 0;
    g.tops.forEach((t, i) => { if (i !== g.from && center > t + g.h / 2) to++; });
    if (to === g.to) return;
    g.to = to;
    // Slide the others out of the way.
    g.rows.forEach((r, i) => {
      if (r === g.row) return;
      const shift = g.from < to && i > g.from && i <= to ? -g.h : g.from > to && i >= to && i < g.from ? g.h : 0;
      r.style.transform = shift ? `translateY(${shift}px)` : "";
    });
  }
  _dragEnd(e) {
    const g = this._drag;
    if (!g || (e && e.pointerId !== g.pid)) return;
    this._drag = null;
    this._suppressClickUntil = Date.now() + 250;
    if (g.to === g.from || e?.type === "pointercancel") {
      g.rows.forEach((r) => { r.style.transform = ""; r.classList.remove("dragging"); });
      return;
    }
    // Leave the rows where they were dropped; the list redraws in its new order when the server confirms.
    g.row.style.transform = `translateY(${g.tops[g.to] - g.tops[g.from]}px)`;
    g.row.classList.remove("dragging");
    // If no update arrives (a move that didn't take), redraw anyway so nothing stays out of place.
    clearTimeout(this._dropTimer);
    this._dropTimer = setTimeout(() => this.render(), 1500);
    this._moveItem(g.id, g.to);
  }
  // A short slide when list items change places (a drop, a check-off, another screen's change).
  _snapshotItems() {
    const m = new Map();
    this.$app?.querySelectorAll(".items .item[data-key]").forEach((r) => m.set(r.dataset.key, r.getBoundingClientRect().top));
    return m;
  }
  _animateItems(before) {
    if (!before?.size || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    this.$app.querySelectorAll(".items .item[data-key]").forEach((r) => {
      const old = before.get(r.dataset.key);
      if (old === undefined) return;
      const dy = old - r.getBoundingClientRect().top;
      if (Math.abs(dy) < 2) return;
      r.animate?.([{ transform: `translateY(${dy}px)` }, { transform: "translateY(0)" }], { duration: 280, easing: "cubic-bezier(.2,.8,.2,1)" });
    });
  }

  // Skylight's own lists are also HA to-do entities; never offer those back as "linked" lists.
  _ownTodo(e) { return this._hass.entities?.[e]?.platform === "skylight" || this._hass.states[e]?.attributes?.skylight_list_id !== undefined; }
  _isTodo() { return String(this.ui.list || "").startsWith("todo:"); }
  _todoEntity() { return this.ui.list.slice(5); }
  _subscribeTodo(entity) {
    if (this._todoSubs[entity]) return;
    this._todoSubs[entity] = this._hass.connection.subscribeMessage((msg) => {
      this.todoItems[entity] = msg.items || [];
      if (this.ui.tab === "lists") this.render();
    }, { type: "todo/item/subscribe", entity_id: entity });
    this._todoSubs[entity].catch((e) => { console.warn("Skylight: todo subscribe failed", entity, e); delete this._todoSubs[entity]; });
  }
  linkedLists() {
    return (this.data.linked_todos || []).filter((e) => this._hass.states[e] && !this._ownTodo(e)).map((e, i) => {
      this._subscribeTodo(e);
      return {
        id: `todo:${e}`, linked: true, entity: e, canMove: !!((this._hass.states[e]?.attributes?.supported_features || 0) & 8) /* TodoListEntityFeature.MOVE_TODO_ITEM */, owner: (this.data.todo_owners || {})[e], name: this.entityName(e), color: PALETTE[(i * 5 + 3) % PALETTE.length],
        items: (this.todoItems[e] || []).map((t) => ({ id: t.uid, text: t.summary, done: t.status === "completed" })),
      };
    });
  }
  allLists() { return [...(this.data.lists || []), ...this.linkedLists()]; }
  async _listToggle(listId, itemId) {
    if (listId.startsWith("todo:")) {
      const entity_id = listId.slice(5);
      const it = (this.todoItems[entity_id] || []).find((t) => t.uid === itemId);
      try { await this._hass.callService("todo", "update_item", { item: itemId, status: it?.status === "completed" ? "needs_action" : "completed" }, { entity_id }); }
      catch (e) { this._toast(e?.message || String(e)); }
    } else {
      const it = (this.data.lists.find((l) => l.id === listId)?.items || []).find((i) => i.id === itemId);
      if (it) await this._ws({ type: "skylight/list/item/update", list_id: listId, item_id: itemId, done: !it.done });
    }
  }
  async _listAdd(listId, text) {
    if (listId.startsWith("todo:")) {
      try { await this._hass.callService("todo", "add_item", { item: text }, { entity_id: listId.slice(5) }); }
      catch (e) { this._toast(e?.message || String(e)); }
    } else {
      await this._ws({ type: "skylight/list/item/add", list_id: listId, text });
    }
  }

  async _todoAction(kind, itemId) {
    const entity_id = this._todoEntity();
    const target = { entity_id };
    try {
      if (kind === "add") {
        const input = this.shadowRoot.getElementById("newitem");
        const text = input.value.trim(); if (!text) return;
        input.value = "";
        await this._hass.callService("todo", "add_item", { item: text }, target);
        this.shadowRoot.getElementById("newitem")?.focus();
      } else if (kind === "toggle") {
        const it = (this.todoItems[entity_id] || []).find((t) => t.uid === itemId);
        await this._hass.callService("todo", "update_item", { item: itemId, status: it?.status === "completed" ? "needs_action" : "completed" }, target);
      } else if (kind === "delete") {
        await this._hass.callService("todo", "remove_item", { item: itemId }, target);
      } else if (kind === "clear") {
        await this._hass.callService("todo", "remove_completed_items", {}, target);
      }
    } catch (e) { this._toast(e?.message || String(e)); }
  }

  openMealDialog(date, slot) {
    const current = this.data.meals?.[date]?.[slot] || "";
    const label = MEAL_SLOTS.find((s) => s[0] === slot);
    const recent = [...new Set(Object.values(this.data.meals || {}).map((m) => m[slot]).filter(Boolean))].slice(-8);
    const synced = this.syncedMeals(parseYmd(date), slot);
    this._openDialog({
      type: "meal", date, slot,
      html: () => `
        <h2>${label[2]} ${label[1]} · ${parseYmd(date).toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" })}</h2>
        ${synced.map((e) => `<div class="syncedrow">📅 <b>${esc(this.mealTitle(e))}</b> <small>from ${esc(this.entityName(e.entity))}</small>${e.description ? `<p class="hint">${esc(e.description).slice(0, 300)}</p>` : ""}</div>`).join("")}
        ${synced.length ? `<p class="hint">Synced meals are edited in their own app (e.g. Plan to Eat). You can add an extra note below.</p>` : ""}
        <label>What's on the menu?<input id="mealtext" value="${esc(current)}" autofocus data-enter="save-meal" placeholder="Tacos"></label>
        ${recent.length ? `<div class="label">Recent</div><div class="chips">${recent.map((r) => `<button class="chip" onclick="this.getRootNode().getElementById('mealtext').value=this.textContent">${esc(r)}</button>`).join("")}</div>` : ""}
        <div class="actions"><span class="spacer"></span>
          <button data-action="close">Cancel</button>
          <button class="primary" data-action="save-meal">Save</button></div>`,
    });
  }

  openListDialog(l) {
    const dlg = {
      type: "list", list: l, color: l?.color || PALETTE[(this.data.lists.length * 3) % PALETTE.length],
      html: () => `
        <h2>${l ? "Edit" : "New"} list</h2>
        <label>Name<input id="l-name" value="${esc(l?.name)}" autofocus placeholder="Packing list"></label>
        <label>Whose list<select id="l-owner"><option value="">👪 Shared</option>${adultsOf(this.members).map((m) => `<option value="${m.id}" ${l?.owner === m.id ? "selected" : ""}>${m.avatar} ${esc(m.name)}</option>`).join("")}</select></label>
        <div class="label">Color</div>
        <div class="swatches">${PALETTE.map((c) => `<button class="swatch ${c === dlg.color ? "sel" : ""}" style="background:${c}" data-action="pick-color" data-color="${c}"></button>`).join("")}</div>
        <div class="actions">
          ${l ? `<button class="danger" data-action="delete-list">Delete</button>` : ""}
          <span class="spacer"></span>
          <button data-action="close">Cancel</button>
          <button class="primary" data-action="save-list">Save</button>
        </div>`,
    };
    this._openDialog(dlg);
  }
  async saveList() {
    const dlg = this.ui.dialog;
    const name = this.shadowRoot.getElementById("l-name").value.trim();
    if (!name) return;
    const owner = this.shadowRoot.getElementById("l-owner")?.value || "";
    const saved = await this._ws({ type: "skylight/list/save", ...(dlg.list ? { list_id: dlg.list.id } : {}), name, color: dlg.color, owner: owner || null });
    this.ui.list = saved.id; this.closeDialog(); this.render();
  }

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
  }
  // Default position: always the day window (7am-8pm), whatever the time.
  _scrollGridHome(grid = this.$app?.querySelector(".tg-scroll")) {
    if (!grid) return;
    const [a] = this._tgWindow || [7, 20];
    this._tgScroll = a; // hours
    grid.scrollTop = a * (this._tgH || 40);
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
    return parts.join("");
  }

  // Theme, light/dark, seasonal accent and the night dim overlay. Cheap; runs on every render and clock tick.
  _applyLook() {
    if (!this.data) return;
    const s = this.settings, now = new Date();
    const sun = this._hass.states["sun.sun"]?.attributes || {};
    const rise = sun.next_rising ? new Date(sun.next_rising) : null, set = sun.next_setting ? new Date(sun.next_setting) : null;
    const night = isNightAt(s, now, rise, set);
    const mode = s.dark_mode || "follow";
    const dark = mode === "dark" || ((mode === "scheduled" || mode === "sun") && night) || (mode === "follow" && !!this._mq?.matches);
    const theme = THEMES[s.theme] ? s.theme : "warm";
    if (this.dataset.theme !== theme) this.dataset.theme = theme;
    if (this.dataset.scheme !== (dark ? "dark" : "light")) this.dataset.scheme = dark ? "dark" : "light";
    const accent = s.seasonal ? seasonFor(now).accent : "";
    if (accent) this.style.setProperty("--accent", accent); else this.style.removeProperty("--accent");
    // Without a brightness entity, dim pixels with an overlay at night (also over the photo screensaver).
    const overlay = s.night_dim && !s.brightness_entity && isNightAt({ ...s, dark_mode: mode === "sun" ? "sun" : "scheduled" }, now, rise, set);
    const level = Math.min(0.85, Math.max(0, 1 - Number(s.night_brightness ?? 20) / 100));
    if (this.$dim) this.$dim.style.opacity = overlay ? String(level) : "0";
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
    // roll over "today" at midnight
    if (this._lastDay && this._lastDay !== ymd(now)) { this.ui.choreDay = startOfDay(now); this._eventsKey = ""; this.render(); this._loadEvents(); this._loadForecast(); }
    this._lastDay = ymd(now);
  }

  // ---------- rendering ----------
  render() {
    if (!this.$app || !this.data) return;
    const scroll = this._resetScroll ? 0 : this.$app.querySelector(".content")?.scrollTop || 0;
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
      settings: () => this.renderSettings(),
    }[tab]();
    this._applyLook();
    if (this._drag) return; // don't redraw under a finger that's dragging an item
    clearTimeout(this._dropTimer);
    const itemTops = tab === "lists" ? this._snapshotItems() : null;
    this.$app.innerHTML = `
      <nav class="rail">
        <div class="logo">☀︎</div>
        ${TABS.map(([id, label, icon]) => `<button class="tab ${tab === id ? "active" : ""}" data-action="tab" data-tab="${id}"><ha-icon icon="${icon}"></ha-icon><span>${label}${id === "settings" && this.pinSet ? ` <i class="lockmark" title="${this.unlocked ? "Unlocked" : "Locked"}">${this.unlocked ? "🔓" : "🔒"}</i>` : ""}</span></button>`).join("")}
      </nav>
      <main>
        ${this.renderHeader()}
        ${this.renderConnBanner()}
        ${this.renderAlertBanner()}
        <div class="content">${body}</div>
      </main>${this.renderAlertPopup()}`;
    const c = this.$app.querySelector(".content"); if (c) c.scrollTop = scroll;
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
    const w = this.settings.weather_entity && this._hass.states[this.settings.weather_entity];
    const weather = w ? `<div class="weather">${WEATHER_ICONS[w.state] || "🌡️"}<b>${Math.round(Number(w.attributes.temperature))}°</b></div>` : "";
    const showChips = ["calendar", "home"].includes(this.ui.tab);
    return `<header>
      <div class="when"><div id="clock" class="clock"></div><div id="date" class="date"></div>${this.settings.seasonal ? `<span class="season" title="Seasonal accent">${seasonFor(new Date()).emoji}</span>` : ""}</div>
      ${showChips ? `<div class="chips members">${this.members.map((m) => `
        <button class="mchip ${this.ui.filter === m.id ? "on" : this.ui.filter ? "dim" : ""}" style="--c:${m.color}" data-action="filter" data-member="${m.id}">
          <span class="av" style="background:${m.color}">${m.avatar}</span>${esc(m.name)}</button>`).join("")}
        ${this.members.length ? "" : `<button class="chip" data-action="tab" data-tab="settings">+ Add your family in Settings</button>`}
      </div>` : "<div></div>"}
      ${weather}
    </header>`;
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
    if (noCals) return toolbar + `<div class="empty"><h2>No calendars connected yet</h2><p>Open <b>Settings</b> to add family members and create or link calendars.</p><button class="primary" data-action="tab" data-tab="settings">Go to Settings</button></div>`;
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

  renderWeather() {
    const w = this.settings.weather_entity && this._hass.states[this.settings.weather_entity];
    if (!w) return `<div class="empty"><h2>No weather source</h2><p>Choose one in Settings → Display → Weather.</p><button class="primary" data-action="tab" data-tab="settings">Go to Settings</button></div>`;
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
        ${a.apparent_temperature !== undefined ? `<div class="hint">Feels like ${round(a.apparent_temperature)}${tu}</div>` : ""}</div>
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
      const lo = Math.min(...temps), hi = Math.max(...temps), span = Math.max(1, hi - lo);
      const x = (i) => 22 + i * 44, y = (t) => top + (1 - (t - lo) / span) * (H - top - bottom);
      const pts = temps.map((t, i) => `${x(i)},${y(t).toFixed(1)}`).join(" ");
      const iHi = temps.indexOf(hi), iLo = temps.indexOf(lo);
      const precip = (h) => (h.precipitation_probability !== undefined && h.precipitation_probability !== null
        ? (h.precipitation_probability >= 20 ? `${Math.round(h.precipitation_probability)}%` : "")
        : h.precipitation ? `${Number(h.precipitation).toFixed(1)}${pu}` : "");
      hourly = `<section class="wcard"><h3>Next ${hours.length} hours</h3><div class="whourly">
        <svg width="${W}" height="${H}" role="img" aria-label="Hourly temperature">
          <polyline points="${pts}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
          ${temps.map((t, i) => `<g class="wpt"><circle cx="${x(i)}" cy="${y(t).toFixed(1)}" r="${i === iHi || i === iLo ? 4 : 2.5}" fill="var(--accent)" stroke="var(--card)" stroke-width="2"/>
            <title>${this.fmtTime(new Date(hours[i].datetime))}: ${Math.round(t)}${tu}${precip(hours[i]) ? `, precip ${precip(hours[i])}` : ""}</title>
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
    const lat = r2(this._hass.config?.latitude), lon = r2(this._hass.config?.longitude);
    const radarSrc = this.settings.weather_radar === "off" || lat === undefined ? null
      : this.settings.weather_radar === "rainviewer"
        ? `https://www.rainviewer.com/map.html?loc=${lat},${lon},7&oFa=0&oC=1&oU=0&oCS=1&oF=0&oAP=1&c=3&o=83&lm=1&layer=radar&sm=1&sn=1`
        : `https://embed.windy.com/embed2.html?lat=${lat}&lon=${lon}&detailLat=${lat}&detailLon=${lon}&zoom=7&level=surface&overlay=${encodeURIComponent(this.radarLayer)}&product=${["radar", "satellite"].includes(this.radarLayer) ? this.radarLayer : "ecmwf"}&menu=&message=true&marker=true&calendar=now&type=map&location=coordinates&metricWind=${a.wind_speed_unit === "mph" ? "mph" : "km%2Fh"}&metricTemp=${tu.includes("F") ? "%C2%B0F" : "%C2%B0C"}`;
    const layers = [["radar", "Radar"], ["rain", "Rain forecast"], ["thunder", "Storms"], ["wind", "Wind"], ["gust", "Gusts"], ["temp", "Temperature"], ["clouds", "Clouds"], ["satellite", "Satellite"]];
    const layerPick = this.settings.weather_radar === "rainviewer" ? "" : `<div class="seg layers">${layers.map(([v, l]) => `<button class="${this.radarLayer === v ? "on" : ""}" data-action="radar-layer" data-layer="${v}">${l}</button>`).join("")}</div>`;
    const radar = radarSrc ? `<section class="wcard"><h3>Radar &amp; maps</h3>${layerPick}
      <iframe class="wradar" src="${radarSrc}" loading="lazy" referrerpolicy="no-referrer" title="Weather radar"></iframe></section>` : "";
    const extraIds = (this.settings.weather_sensors || []).filter((e) => this._hass.states[e]);
    const extras = extraIds.length ? `<section class="wcard"><h3>Air &amp; more</h3><div class="wstats">${extraIds.map((e) => {
      const st = this._hass.states[e];
      return stat(esc(st.attributes.friendly_name || e), `${esc(st.state)}${st.attributes.unit_of_measurement ? ` ${esc(st.attributes.unit_of_measurement)}` : ""}`);
    }).join("")}</div></section>` : "";
    return `<div class="wxtab">${this.renderAlertCards()}${this._wxHintsCard()}${this._rainSoonCard()}${current}${hourly}${radar}${this._airCard()}${extras}${daily}${this._compareCard(tu, pu)}${this._moonCard()}
      <p class="hint center">Source: ${esc(this.entityName(this.settings.weather_entity))} · updated ${this.fmtTime(new Date(this.wx.at))}</p></div>`;
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
      : `<p class="hint">Pollen: add a Google key in Settings → Location lookup and enable the Pollen API to see US pollen.</p>`;
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
      ["Real feel", (h) => deg(h.apparent_temperature)],
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

  // ---------- event search ----------
  openSearch() {
    this._openDialog({
      type: "search",
      html: () => `<h2>🔍 Search events</h2>
        <input id="search-q" autocomplete="off" autofocus placeholder="Title, place or notes (e.g. dentist, soccer, Grandma)">
        <p class="hint">Searches ${this._searchRangeText()} on every calendar shown in Skylight.</p>
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

  renderHome() {
    const today = startOfDay(new Date());
    const n = this.homeDays;
    const days = [...Array(n)].map((_, i) => addDays(today, i));
    const noCals = !this.shownCalendars().length;
    const label = (d) => this.dayLabel(d, n);
    const agenda = this.homeAgenda;
    const picker = `<div class="seg daypick"><button class="${agenda ? "on" : ""}" data-action="home-days" data-days="agenda">Agenda</button>${(this.isPhone ? [1, 3] : [1, 3, 5, 7]).map((k) => `<button class="${!agenda && k === n ? "on" : ""}" data-action="home-days" data-days="${k}">${k} day${k > 1 ? "s" : ""}</button>`).join("")}</div>`;
    const cal = noCals
      ? `<div class="empty"><h2>No calendars yet</h2><button class="primary" data-action="tab" data-tab="settings">Set up in Settings</button></div>`
      : agenda ? `<div class="hagenda">${this.renderSchedule()}</div>`
      : this.renderTimeGrid(days, { labels: label });
    const members = this.ui.filter ? this.members.filter((m) => m.id === this.ui.filter) : this.members;
    const free = [];
    const lists = this.allLists();
    // Chores first so they're never pushed out of view; to-do lists after them.
    const ordered = [...members.filter((m) => m.today !== "list"), ...members.filter((m) => m.today === "list")];
    const chores = ordered.map((m) => {
      if (m.today === "none") return "";
      if (m.today === "list") return this.renderHomeList(m, lists.find((l) => l.id === m.today_list));
      if (m.role !== "kid") return ""; // chores are for kids only
      const list = this.data.chores.filter((c) => c.member_id === m.id && choreDue(c, today));
      const done = list.filter((c) => choreDone(c, today)).length;
      if (!list.length) { free.push(m); return ""; } // summarized in one line below
      return `<div class="hchores" style="--c:${m.color}">
        <div class="hhead"><span class="av" style="background:${m.color}">${m.avatar}</span><b>${esc(m.name)}</b>
          <span class="hint">${done}/${list.length}</span></div>
        ${list.map((c) => { const dn = choreDone(c, today); return `<div class="chore ${dn ? "done" : ""}">
          <button class="ctoggle" data-action="toggle-chore" data-chore="${c.id}" data-date="${ymd(today)}">
            <span class="ci">${esc(c.icon || "✅")}</span><span class="ct">${esc(c.title)}</span><span class="box">${dn ? "✓" : ""}</span></button></div>`; }).join("")
          || `<p class="hint">No chores today</p>`}
        ${list.length && done === list.length ? `<div class="alldone">All done! 🎉</div>` : ""}
      </div>`;
    }).join("");
    if (this.settings.weather_hints !== false && this.settings.weather_entity) this._loadWeatherFull();
    return `<div class="toolbar hometool">${picker}<button class="primary fab" data-action="new-event">+ Event</button></div>
      <div class="home ${n >= 5 ? "wide" : ""}">
      <section class="hcal">${cal}</section>
      <aside class="hside">
        ${this.settings.weather_hints !== false ? this.renderHints(4) : ""}
        ${this.renderTonight()}
        ${this.renderUpcoming()}
        ${chores ? `<div class="hcols">${chores}</div>` : ""}
        ${free.length ? `<p class="nochores">No chores today: ${free.map((m) => `<span class="av sm" style="background:${m.color}">${m.avatar}</span>${esc(m.name)}`).join(", ")}</p>` : ""}
        ${this.members.length ? "" : `<div class="empty"><p>Add your family in Settings to see chores here.</p></div>`}
      </aside></div>`;
  }

  // A person's to-do / honey-do list on the Today screen.
  renderHomeList(m, list) {
    if (!list) return `<div class="hchores" style="--c:${m.color}"><div class="hhead"><span class="av" style="background:${m.color}">${m.avatar}</span><b>${esc(m.name)}</b></div>
      <p class="hint">List not found. Pick one in Settings → Family members.</p></div>`;
    const ordered = list.linked ? list.items : orderItems(list.items);
    const open = ordered.filter((i) => !i.done), done = ordered.filter((i) => i.done);
    const shown = [...open, ...done.slice(-2)]; // keep the two most recent check-offs visible
    return `<div class="hchores hlist" style="--c:${m.color}">
      <div class="hhead"><span class="av" style="background:${m.color}">${m.avatar}</span><b>${esc(m.name)}</b>
        <span class="hint">📝 ${esc(list.name)} · ${open.length} left</span></div>
      ${shown.map((i) => `<div class="chore ${i.done ? "done" : ""}">
        <button class="ctoggle" data-action="home-item" data-list="${esc(list.id)}" data-item="${esc(i.id)}">
          <span class="ct">${esc(i.text)}</span><span class="box">${i.done ? "✓" : ""}</span></button></div>`).join("")
        || `<p class="hint">Nothing on the list 🎉</p>`}
      <input class="hadd" id="hadd-${esc(list.id)}" data-list="${esc(list.id)}" data-enter="home-add" placeholder="＋ Add to ${esc(list.name)}">
    </div>`;
  }

  // Chore completion between two days (inclusive, never past today): {due, done}.
  // Days before a chore existed don't count against it. "Weekly" chores count once per week.
  completionStats(memberId, from, to) {
    const today = startOfDay(new Date());
    const end = startOfDay(to) > today ? today : startOfDay(to);
    let due = 0, done = 0;
    for (const c of (this.data.chores || []).filter((x) => x.member_id === memberId)) {
      const firstDone = (c.completions || [])[0];
      const began = c.created || firstDone || c.start;
      let d = startOfDay(from);
      if (began && parseYmd(began) > d) d = parseYmd(began);
      if (!began && d < this.weekStart(today)) d = this.weekStart(today); // no history: count from this week
      if (c.repeat === "weekly") {
        for (let w = this.weekStart(d); w <= end; w = addDays(w, 7)) {
          due++;
          if ([...Array(7)].some((_, i) => addDays(w, i) <= end && choreDone(c, addDays(w, i)))) done++;
        }
        continue;
      }
      for (; d <= end; d = addDays(d, 1)) {
        if (!choreDue(c, d)) continue;
        due++;
        if (choreDone(c, d)) done++;
      }
    }
    return { due, done };
  }

  // Progress: last 4 weeks of chore completion per person with chores (read-only).
  renderProgress() {
    const people = kidsOf(this.members).filter((m) => (this.data.chores || []).some((c) => c.member_id === m.id));
    if (!people.length) return `<div class="toolbar"><div class="nav"><h1>Progress</h1></div></div><div class="empty"><h2>No chores yet</h2><p>Add chores in the Chores tab to see weekly progress here.</p></div>`;
    const thisWeek = this.weekStart(new Date());
    const weeks = [3, 2, 1, 0].map((k) => addDays(thisWeek, -7 * k));
    const label = (w, k) => (k === 3 ? "This week" : w.toLocaleDateString([], { month: "short", day: "numeric" }));
    return `<div class="toolbar"><div class="nav"><h1>Progress</h1></div><span class="hint">Chores done, last 4 weeks</span></div>
      <div class="progress">${people.map((m) => `<div class="prow" style="--c:${m.color}">
        <div class="pwho"><span class="av" style="background:${m.color}">${m.avatar}</span><b>${esc(m.name)}</b></div>
        <div class="pbars">${weeks.map((w, k) => {
          const st = this.completionStats(m.id, w, addDays(w, 6));
          const pct = st.due ? Math.round((st.done / st.due) * 100) : null;
          return `<div class="pbar" title="${st.done} of ${st.due} chores">
            <div class="pcol"><i style="height:${pct === null ? 0 : Math.max(3, pct)}%"></i></div>
            <b>${pct === null ? "–" : `${pct}%`}</b><small>${label(w, k)}</small></div>`;
        }).join("")}</div></div>`).join("")}</div>`;
  }

  renderChores() {
    const day = this.ui.choreDay;
    const isToday = sameDay(day, new Date());
    const kids = kidsOf(this.members);
    if (!kids.length) return `<div class="empty"><h2>No kids set up yet</h2><p>Chores are for kids. Mark someone as a Kid in Settings → Family members.</p><button class="primary" data-action="tab" data-tab="settings">Go to Settings</button></div>`;
    const cols = kids.map((m) => {
      const chores = this.data.chores.filter((c) => c.member_id === m.id && choreDue(c, day));
      const done = chores.filter((c) => choreDone(c, day)).length;
      const pct = chores.length ? done / chores.length : 0;
      return `<div class="ccol" style="--c:${m.color}">
        <div class="chead">
          <div class="ring" style="--p:${pct * 360}deg"><span class="av" style="background:${m.color}">${m.avatar}</span></div>
          <div><div class="cname">${esc(m.name)}</div><div class="cstars">${done}/${chores.length} today${(() => { const w = this.completionStats(m.id, this.weekStart(day), day); return w.due ? ` · ${Math.round((w.done / w.due) * 100)}% this week` : ""; })()}</div></div>
        </div>
        <div class="clist">${chores.map((c) => {
          const dn = choreDone(c, day);
          return `<div class="chore ${dn ? "done" : ""}">
            <button class="ctoggle" data-action="toggle-chore" data-chore="${c.id}">
              <span class="ci">${esc(c.icon || "✅")}</span><span class="ct">${esc(c.title)}</span>
<span class="box">${dn ? "✓" : ""}</span></button>
            <button class="cedit" data-action="edit-chore" data-chore="${c.id}">⋯</button></div>`;
        }).join("") || `<p class="hint center">${pct === 0 && !chores.length ? "No chores" : ""}</p>`}
        ${chores.length && done === chores.length ? `<div class="alldone">All done! 🎉</div>` : ""}
        </div>
        <button class="add wide" data-action="new-chore" data-member="${m.id}">+ Add chore</button>
      </div>`;
    }).join("");
    return `<div class="toolbar"><div class="nav">
        <button class="icon" data-action="chore-day" data-dir="-1">‹</button>
        <button data-action="chore-day" data-dir="0">Today</button>
        <button class="icon" data-action="chore-day" data-dir="1">›</button>
        <h1>${isToday ? "Today" : day.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" })}</h1></div></div>
      <div class="chores">${cols}</div>`;
  }

  mealSlot(ev) {
    const entityText = `${ev.entity} ${this.entityName(ev.entity)}`.toLowerCase();
    const summary = ev.summary.toLowerCase();
    for (const text of [entityText, summary]) {
      for (const [slot] of MEAL_SLOTS) if (text.includes(slot)) return slot;
      if (text.includes("supper")) return "dinner";
    }
    if (ev.allDay) return "dinner";
    const h = ev.start.getHours() + ev.start.getMinutes() / 60;
    return h < 10.5 ? "breakfast" : h < 15 ? "lunch" : h < 17 ? "snack" : "dinner";
  }
  mealTitle(ev) { return ev.summary.replace(/^\s*(breakfast|lunch|dinner|supper|snacks?)\s*[:\-–]\s*/i, ""); }

  async _loadMealEvents() {
    const cals = (this.data.meal_calendars || []).filter((e) => this._hass.states[e]);
    const s = this.weekStart(this.ui.anchor), e = addDays(s, 7);
    const key = `${ymd(s)}|${cals.join(",")}`;
    if (key === this._mealKey) return;
    this._mealKey = key;
    const res = await Promise.all(cals.map(async (entity) => {
      try {
        const evs = await this._hass.callApi("GET", `calendars/${entity}?start=${encodeURIComponent(s.toISOString())}&end=${encodeURIComponent(e.toISOString())}`);
        return evs.map((x) => this._normalizeEvent(x, entity));
      } catch (err) { console.warn("Skylight: meal calendar failed", entity, err); return []; }
    }));
    if (key !== this._mealKey) return;
    this.mealEvents = res.flat();
    if (this.ui.tab === "meals") this.render();
  }
  syncedMeals(day, slot) {
    return this.mealEvents.filter((e) => sameDay(e.start, day) && this.mealSlot(e) === slot);
  }

  renderMeals() {
    const toggle = this.mealieOn ? `<div class="seg mealsview"><button class="${this.ui.mealsView !== "recipes" ? "on" : ""}" data-action="meals-view" data-view="week">📅 Meal plan</button><button class="${this.ui.mealsView === "recipes" ? "on" : ""}" data-action="meals-view" data-view="recipes">📖 Recipes</button></div>` : "";
    if (this.mealieOn && this.ui.mealsView === "recipes") return `<div class="toolbar"><div class="nav"><h1>Recipes</h1></div>${toggle}</div>${this.renderRecipes()}`;
    this._loadMealEvents();
    this._loadMealie();
    const [s] = [this.weekStart(this.ui.anchor)];
    const days = [...Array(7)].map((_, i) => addDays(s, i));
    if (this.isPhone) return this.renderMealsPhone(days, toggle);
    return `<div class="toolbar"><div class="nav"><button class="icon" data-action="prev">‹</button><button data-action="today">This week</button><button class="icon" data-action="next">›</button>
      <h1>Meals · ${s.toLocaleDateString([], { month: "short", day: "numeric" })}</h1></div>
      ${toggle}</div>
      ${this.ui.mealieError ? `<p class="hint">⚠️ Mealie: ${esc(this.ui.mealieError)}</p>` : ""}
      <div class="meals">
        <div class="mrow head"><div></div>${days.map((d) => `<div class="${sameDay(d, new Date()) ? "today" : ""}">${d.toLocaleDateString([], { weekday: "short" })} <b>${d.getDate()}</b></div>`).join("")}</div>
        ${MEAL_SLOTS.map(([slot, label, icon]) => `<div class="mrow">
          <div class="slot">${icon}<span>${label}</span></div>
          ${days.map((d) => {
            const t = this.mealieOn ? "" : this.data.meals?.[ymd(d)]?.[slot];
            const synced = this.syncedMeals(d, slot);
            const mm = this.mealieOn ? this.mealieFor(ymd(d), slot) : [];
            const has = t || synced.length || mm.length;
            const img = mm.find((m) => m.recipe?.image)?.recipe.image;
            return `<button class="meal ${has ? "" : "emptymeal"} ${img ? "withimg" : ""} ${sameDay(d, new Date()) ? "today" : ""}" data-action="edit-meal" data-date="${ymd(d)}" data-slot="${slot}" >
              ${img ? `<img class="mbg" src="${esc(img)}" alt="" onerror="this.parentNode.classList.remove('withimg');this.remove()">` : ""}
              ${mm.map((m) => `<span class="mname">${esc(this.mealieName(m))}</span>`).join("")}
              ${synced.map((e) => `<span class="synced">${esc(this.mealTitle(e))}</span>`).join("")}${t ? `<span>${esc(t)}</span>` : ""}${has ? "" : "+"}</button>`;
          }).join("")}
        </div>`).join("")}
      </div>`;
  }

  // Phone: one card per day with its meals listed, instead of the 7-column grid.
  renderMealsPhone(days, toggle) {
    const s = days[0];
    return `<div class="toolbar"><div class="nav"><button class="icon" data-action="prev">‹</button><button data-action="today">This week</button><button class="icon" data-action="next">›</button>
      <h1>${s.toLocaleDateString([], { month: "short", day: "numeric" })}</h1></div>${toggle}</div>
      ${this.ui.mealieError ? `<p class="hint">⚠️ Mealie: ${esc(this.ui.mealieError)}</p>` : ""}
      <div class="pmeals">${days.map((d) => `<section class="pmday ${sameDay(d, new Date()) ? "today" : ""}">
        <h3>${d.toLocaleDateString([], { weekday: "long" })} <small>${d.toLocaleDateString([], { month: "short", day: "numeric" })}</small></h3>
        ${MEAL_SLOTS.map(([slot, label, icon]) => {
          const t = this.mealieOn ? "" : this.data.meals?.[ymd(d)]?.[slot];
          const synced = this.syncedMeals(d, slot);
          const mm = this.mealieOn ? this.mealieFor(ymd(d), slot) : [];
          const img = mm.find((m) => m.recipe?.image)?.recipe.image;
          const names = [...mm.map((m) => esc(this.mealieName(m))), ...synced.map((e) => esc(this.mealTitle(e))), ...(t ? [esc(t)] : [])];
          return `<button class="pmslot ${names.length ? "" : "pmempty"}" data-action="edit-meal" data-date="${ymd(d)}" data-slot="${slot}">
            <span class="pmicon">${img ? `<img src="${esc(img)}" alt="" onerror="this.replaceWith('${icon}')">` : icon}</span>
            <span class="pmtext"><small>${label}</small>${names.length ? `<b>${names.join(" · ")}</b>` : `<b class="add">+ Add</b>`}</span></button>`;
        }).join("")}
      </section>`).join("")}</div>`;
  }

  renderLists() {
    const lists = [...(this.data.lists || []), ...this.linkedLists()];
    if (!this.ui.list || !lists.find((l) => l.id === this.ui.list)) this.ui.list = lists[0]?.id || null;
    const cur = lists.find((l) => l.id === this.ui.list);
    return `<div class="lists">
      <aside>${groupLists(lists, this.members).map((g) => `
        <div class="lgroup" ${g.owner ? `style="--oc:${g.owner.color}"` : ""}>${g.owner ? `<span class="av sm" style="background:${g.owner.color}">${g.owner.avatar}</span>${esc(g.owner.name)}` : "👪 Shared"}</div>
        ${g.lists.map((l) => `<button class="lname ${l.id === this.ui.list ? "on" : ""}" style="--c:${l.color}" data-action="pick-list" data-list="${l.id}">
        <span class="dot"></span>${l.linked ? "🔗 " : ""}${esc(l.name)}<span class="count">${l.items.filter((i) => !i.done).length}</span></button>`).join("")}`).join("")}
        <button class="add wide" data-action="new-list">+ New list</button></aside>
      <section>${cur ? `
        <div class="toolbar"><div class="nav"><h1 style="color:${cur.color}">${esc(cur.name)}</h1></div>
          <div><button data-action="clear-done">Clear completed</button> ${cur.linked
            ? `<select class="ownerpick" data-change="todo-owner" data-entity="${esc(cur.entity)}" aria-label="Whose list"><option value="">👪 Shared</option>${adultsOf(this.members).map((m) => `<option value="${m.id}" ${cur.owner === m.id ? "selected" : ""}>${m.avatar} ${esc(m.name)}</option>`).join("")}</select>`
            : `<button data-action="edit-list" data-list="${cur.id}">Edit</button>`}</div></div>
        <div class="additem"><input id="newitem" data-fresh="1" placeholder="Add an item…" data-enter="add-item"><button class="primary" data-action="add-item">Add</button></div>
        <div class="items">${(() => {
          const ordered = orderItems(cur.items), open = ordered.filter((i) => !i.done);
          const movable = (!cur.linked || cur.canMove) && open.length > 1;
          return ordered.map((i) => `
          <div class="item ${i.done ? "done" : ""}" style="--c:${cur.color}" data-key="${esc(i.id)}">
            ${!i.done && movable ? `<span class="dragh" data-drag="${esc(i.id)}" role="button" aria-label="Drag to move ${esc(i.text)}" title="Drag to move">≡</span>` : movable ? `<span class="dragh off"></span>` : ""}
            <button class="box" data-action="toggle-item" data-item="${esc(i.id)}">${i.done ? "✓" : ""}</button>
            <span data-action="toggle-item" data-item="${esc(i.id)}">${esc(i.text)}</span>
            <button class="x" data-action="delete-item" data-item="${esc(i.id)}">✕</button></div>`).join("") || `<p class="hint">Empty list</p>`;
        })()}
        </div>` : `<div class="empty"><h2>No lists</h2></div>`}</section></div>`;
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
      this._photoUrls().catch(() => {}).finally(() => { this._photoUrlsLoading = false; if (this.ui.tab === "photos") this.render(); });
    }
    const uploads = this.settings.allow_uploads !== false;
    return `<div class="toolbar"><div class="nav"><h1>Photos</h1></div>
      <div>${uploads ? `<input type="file" id="photo-input" accept="image/*" multiple hidden data-change="upload-photos">
        <button data-action="upload-photos">⬆ Upload</button>` : ""}
        <button class="primary" data-action="start-saver" ${this._hasPhotoSource() ? "" : "disabled"}>▶ Slideshow</button></div></div>
      ${this.data.immich?.url && this.data.immich?.has_key ? `<p class="hint">📷 Also showing ${[
        this.data.immich.albums?.length ? `${this.data.immich.albums.length} Immich album${this.data.immich.albums.length > 1 ? "s" : ""}` : "",
        this.data.immich.favorites ? "Immich favorites" : "",
      ].filter(Boolean).join(" + ") || "no Immich albums yet"}. Change in Settings → Photos from Immich.</p>` : ""}
      ${photos.length ? `<div class="pgrid">${photos.map((p) => `<div class="ph">${signed[p] ? `<img loading="lazy" src="${esc(signed[p])}">` : ""}<button class="x" data-action="delete-photo" data-name="${esc(p)}">✕</button></div>`).join("")}</div>`
        : this._hasPhotoSource() ? "" : `<div class="empty"><h2>No photos yet</h2><p>${uploads ? "Upload photos from this tablet or your phone (open the Skylight panel in the Home Assistant app)." : "Photo uploads are turned off in Settings."} They play as a screensaver when nobody is using the display. Or connect Immich in Settings.</p></div>`}`;
  }

  renderMealieSettings() {
    const m = this.mealie || { entries: [] };
    const todos = Object.keys(this._hass.states).filter((e) => e.startsWith("todo.") && !this._ownTodo(e)).sort();
    const linked = new Set(this.data.linked_todos || []);
    return `<section class="card">
      <h2>Mealie</h2>
      ${m.entries.length ? `
        <p class="hint">✅ Connected. The Meals tab reads and writes your Mealie meal plan: tap a meal slot to search recipes, pick a random one, or add a note.</p>
        <label class="inline">Link for phones (QR codes) <input placeholder="Optional, e.g. https://mealie.example.com" value="${esc(this.settings.mealie_phone_url || "")}" data-change="mealie-phone-url"></label>
        <p class="hint">The recipe QR code in cook mode uses the Mealie address Home Assistant uses. If your phone reaches Mealie by a different address, enter it here.</p>
        ${m.entries.length > 1 ? `<label class="inline">Mealie server <select data-change="mealie-entry">${m.entries.map((e) => `<option value="${e.entry_id}" ${e.entry_id === m.selected ? "selected" : ""}>${esc(e.title)}</option>`).join("")}</select></label>` : ""}`
        : `<p class="hint">Not connected. An admin adds it once: Home Assistant → Settings → Devices &amp; Services → Add Integration → <b>Mealie</b> (needs your Mealie URL and an API token from Mealie → User profile → API Tokens). Then reload this page.</p>`}
      <div class="label">Shopping &amp; to-do lists to show in the Lists tab</div>
      <div class="checklist">${todos.map((e) => `<label class="check"><input type="checkbox" data-change="linked-todo" data-entity="${e}" ${linked.has(e) ? "checked" : ""}> ${esc(this.entityName(e))}</label>`).join("") || `<p class="hint">No to-do lists in Home Assistant.</p>`}</div>
    </section>`;
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

  renderSettings() {
    const s = this.settings;
    const cals = this.allCalendars();
    const weathers = Object.keys(this._hass.states).filter((e) => e.startsWith("weather.")).sort();
    const fam = new Set(this.data.family_calendars || []);
    return `<div class="settings">
      ${this.pinSet ? "" : `<div class="pinbanner">🔒 <b>Set a settings PIN</b> so kids can use the display without changing its setup. <button class="primary" data-action="pin-setup">Set PIN</button></div>`}
      ${this.settings.roles_review ? `<div class="pinbanner">🧒 <b>Check each person's Adult/Kid setting.</b> People with chores were set to Kid, everyone else to Adult. <button class="primary" data-action="roles-reviewed">Looks right</button></div>` : ""}
      ${this.renderPinCard()}
      <section class="card">
        <div class="toolbar"><h2>Family members</h2><button class="primary" data-action="new-member">+ Add member</button></div>
        ${this.members.map((m, i) => `<div class="mrow2">
          <span class="av big" style="background:${m.color}">${m.avatar}</span>
          <div class="grow"><b>${esc(m.name)} <span class="rolebadge">${m.role === "kid" ? "🧒 Kid" : "🧑 Adult"}</span></b><small>${[...(m.prefixes || []).map((p) => `“${esc(p)}…”`), ...(m.calendars || []).map((c) => esc(this.calName(c)))].join(", ") || "No calendars"}</small></div>
          <button class="icon sm" data-action="member-up" data-member="${m.id}" ${i === 0 ? "disabled" : ""}>↑</button>
          <button class="icon sm" data-action="member-down" data-member="${m.id}" ${i === this.members.length - 1 ? "disabled" : ""}>↓</button>
          <button data-action="edit-member" data-member="${m.id}">Edit</button></div>`).join("") || `<p class="hint">Add everyone in your household. Each person gets a color used across the calendar and chores.</p>`}
      </section>

      ${this.renderOccasionsCard()}
      <section class="card">
        <h2>Backup</h2>
        <p class="hint">Saves family members, chores and their history, lists, meals, birthdays and settings to a file. API keys and the settings PIN aren't included. Restoring replaces what's here now; the current data is kept on the Home Assistant server first (<code>.storage/skylight.data.before_import</code>).</p>
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

      ${this.renderLookCard()}

      <section class="card">
        <h2>Display</h2>
        <label class="inline">Weather <select data-change="setting" data-key="weather_entity"><option value="">None</option>${weathers.map((w) => `<option value="${w}" ${w === s.weather_entity ? "selected" : ""}>${esc(this.entityName(w))}</option>`).join("")}</select></label>
        <label class="inline">Weather alerts (US National Weather Service) <input type="checkbox" ${s.weather_alerts !== false ? "checked" : ""} data-change="setting" data-key="weather_alerts"></label>
        <label class="inline">Pop up new alerts on this screen <select data-change="setting" data-key="alert_popup">
          ${[["severe", "Severe & extreme (warnings)"], ["extreme", "Extreme only"], ["all", "All alerts, including advisories"], ["off", "Off (banner only)"]].map(([v, l]) => `<option value="${v}" ${(s.alert_popup || "severe") === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>
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
        <p class="hint">On screens logged in as a non-admin Home Assistant user (like the kitchen tablet), Home Assistant's own menu and header are hidden so Skylight fills the screen. Admin accounts always keep them. This isn't a lock: what an account can do is still set by its Home Assistant permissions.</p>
        <label class="inline">Allow photo uploads <input type="checkbox" ${s.allow_uploads !== false ? "checked" : ""} data-change="setting" data-key="allow_uploads"></label>
        <label class="inline">Show date &amp; place on photos <input type="checkbox" ${s.photo_captions !== false ? "checked" : ""} data-change="setting" data-key="photo_captions"></label>
      </section>
      <p class="hint center">Skylight v${PANEL_VERSION}</p>
    </div>`;
  }
}

const STYLES = `
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
.rail { width:calc(92px + env(safe-area-inset-left)); flex:none; display:flex; flex-direction:column; align-items:center; gap:6px;
  padding:max(14px, env(safe-area-inset-top)) 6px max(14px, env(safe-area-inset-bottom)) calc(6px + env(safe-area-inset-left)); background:var(--card); border-right:1px solid var(--line); overflow-y:auto; }
.logo { font-size:30px; color:#ff9f43; margin-bottom:8px; }
.tab { width:78px; display:flex; flex-direction:column; align-items:center; gap:4px; padding:10px 4px; background:none; box-shadow:none; font-size:12px; color:var(--muted); }
.tab.active { background:var(--bg); color:var(--accent); font-weight:700; }
.tab ha-icon { --mdc-icon-size:28px; }
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
.customcolor { display:flex; align-items:center; gap:8px; margin-top:8px; }
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
.seg { display:flex; background:var(--card); border-radius:14px; padding:4px; gap:2px; box-shadow:0 1px 2px rgba(0,0,0,.06); }
.seg button { box-shadow:none; background:none; }
.seg button.on { background:var(--accent); color:#fff; font-weight:700; }
.empty { text-align:center; padding:60px 20px; color:var(--muted); }
.empty h2 { color:var(--ink); }
.hint { color:var(--muted); font-size:14px; }
.center { text-align:center; }
/* week */
.week { display:grid; grid-template-columns:repeat(7, minmax(0,1fr)); gap:10px; min-height:calc(100vh - 190px); }
.col { background:var(--card); border-radius:var(--radius); padding:10px 8px; display:flex; flex-direction:column; gap:6px; box-shadow:0 2px 10px rgba(60,50,30,.06); }
.col.today { outline:3px solid var(--accent); }
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
.tg-adcell { display:flex; flex-direction:column; gap:3px; padding:4px; border-left:1px solid var(--line); min-width:0; max-height:96px; overflow-y:auto; }
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
.tg-now { position:absolute; left:0; right:0; border-top:2px solid #ff4757; z-index:2; pointer-events:none; }
.tg-now::before { content:""; position:absolute; left:-5px; top:-6px; width:10px; height:10px; border-radius:50%; background:#ff4757; }
.hometool { margin-top:0; }
.home.wide { grid-template-columns:minmax(0,3fr) minmax(230px,1fr); }
/* day (legacy) */
.alldays { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:10px; }
.alldays .ev { width:auto; }
.timeline { position:relative; background:var(--card); border-radius:var(--radius); margin-left:0; }
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
.srow .sm { display:flex; flex-direction:column; }
/* chores */
.chores { display:grid; grid-template-columns:repeat(auto-fit, minmax(230px, 1fr)); gap:14px; align-items:start; }
.ccol { background:var(--card); border-radius:var(--radius); padding:14px; border-top:6px solid var(--c); display:flex; flex-direction:column; gap:10px; }
.chead { display:flex; align-items:center; gap:12px; }
.ring { width:60px; height:60px; border-radius:50%; display:grid; place-items:center; background:conic-gradient(var(--c) var(--p), var(--line) 0); }
.ring .av { width:50px; height:50px; font-size:28px; border:3px solid var(--card); }
.cname { font-size:20px; font-weight:800; }
.cstars { color:var(--muted); font-weight:700; }
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
label.check { flex-direction:row; align-items:center; gap:10px; font-weight:600; margin:4px 0; }
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

.three { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px; height:100%; }
.three .dn { font-size:15px; }
.hside { display:flex; flex-direction:column; gap:10px; overflow-y:auto; }
/* Cards flow into as many ~250px columns as fit (1 on a tablet, 2+ on wide screens). */
.hcols { column-width:250px; column-gap:10px; }
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
.wxgrid { display:grid; grid-template-columns:repeat(auto-fit, minmax(420px, 1fr)); gap:14px; }
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
#dim { position:fixed; inset:0; background:#000; opacity:0; pointer-events:none; z-index:950; transition:opacity 2s; }
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
.content { touch-action:pan-y; }
.repeat { background:var(--bg); border-radius:14px; padding:4px 12px 8px; margin:8px 0; }
.rpdays { margin:6px 0; }
.rpsum { margin:6px 0 2px; font-weight:700; color:var(--ink); }
.tpick { position:relative; display:block; }
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

.hmeals { background:var(--card); border-radius:var(--radius); padding:12px 14px; }
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
  .rail { width:100%; }
  header { padding:max(8px, env(safe-area-inset-top)) 12px 2px; }
  .content { padding-bottom:14px; }
  .rail { padding:2px 2px calc(2px + env(safe-area-inset-bottom)); gap:0; justify-content:stretch; }
  .tab { flex:1 1 0; min-width:0; padding:5px 0; gap:1px; font-size:9.5px; border-radius:10px; }
  .tab span { max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .tab ha-icon { --mdc-icon-size:22px; }
  header { padding:8px 12px 2px; gap:6px; }
  .clock { font-size:26px; } .date { font-size:13px; }
  header .members { order:3; flex:1 1 100%; flex-wrap:nowrap; overflow-x:auto; justify-content:flex-start; padding-bottom:2px; }
  header .mchip { flex:none; padding:4px 10px 4px 4px; font-size:14px; }
  header .mchip .av { width:26px; height:26px; font-size:15px; }
  header .weather { font-size:22px; margin-left:auto; }
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
  .app { flex-direction:row; }
  main { min-height:0; }
  .rail { flex-direction:column; justify-content:flex-start; border-top:0; border-right:1px solid var(--line); overflow-y:auto; overflow-x:hidden; }
  .rail .tab { flex:none; }
  .rail { width:calc(64px + env(safe-area-inset-left)); gap:2px; padding-top:max(6px, env(safe-area-inset-top)); padding-bottom:max(6px, env(safe-area-inset-bottom)); }
  .logo { display:none; }
  .tab { width:56px; padding:4px 2px; gap:1px; font-size:9px; }
  .tab ha-icon { --mdc-icon-size:20px; }
  header { padding:max(4px, env(safe-area-inset-top)) max(12px, env(safe-area-inset-right)) 2px 12px; gap:8px; flex-wrap:nowrap; }
  .clock { font-size:22px; } .date { font-size:12px; } .when { min-width:0; }
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
`;

if (!customElements.get("skylight-panel")) customElements.define("skylight-panel", SkylightPanel);
window.customCards = window.customCards || [];
if (!window.customCards.find((c) => c.type === "skylight-panel")) {
  window.customCards.push({ type: "skylight-panel", name: "Skylight Family Display", description: "Full Skylight-style family calendar, chores, meals, lists and photos." });
}
