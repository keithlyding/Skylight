/* Skylight panel: constants and helpers shared by every part of the panel (no DOM). */

export const DEFAULT_APP_NAME = "Lyding Strike";
export const PANEL_VERSION = "1.38.0";
// Profile colors: each column is a color family, rows go light -> dark.
export const MEMBER_COLORS = [
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
export const textOn = (hex) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return "#fff";
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(m[1].slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.45 ? "#2d2a26" : "#fff";
};
// "#abc" / "abc" / "#aabbcc" -> "#aabbcc", or null if not a hex color.
export const normHex = (v) => {
  let h = String(v || "").trim().replace(/^#/, "").toLowerCase();
  if (/^[0-9a-f]{3}$/.test(h)) h = h.split("").map((c) => c + c).join("");
  return /^[0-9a-f]{6}$/.test(h) ? `#${h}` : null;
};

export const PALETTE = [
  "#ff6b6b", "#ff9f43", "#feca57", "#2ecc71", "#1abc9c", "#48dbfb",
  "#4a7dff", "#a66bff", "#f368e0", "#8d6e63", "#607d8b", "#222f3e",
];
export const AVATARS = [
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
export const SKIN_TONES = [["", "Default"], ["\u{1F3FB}", "Light"], ["\u{1F3FC}", "Medium-light"], ["\u{1F3FD}", "Medium"], ["\u{1F3FE}", "Medium-dark"], ["\u{1F3FF}", "Dark"]];
export const TONE_RE = /[\u{1F3FB}-\u{1F3FF}]/gu;
// People emoji that accept a skin tone (the first code point of the emoji).
export const TONEABLE = new Set([..."👨👩🧔👱👦👧🧒👶👴👵🧑🏊🚴🏋🤸🏃💪"].map((c) => c.codePointAt(0)));
// Apply a tone to a person emoji (also inside sequences like 👨‍🍳); other emoji are unchanged.
export const withTone = (emoji, tone) => {
  const plain = emoji.replace(TONE_RE, "");
  const cps = [...plain];
  if (!tone || !TONEABLE.has(cps[0].codePointAt(0))) return plain;
  const rest = cps.slice(1);
  if (rest[0] === "\uFE0F") rest.shift(); // e.g. 🏋️ -> 🏋🏻
  return cps[0] + tone + rest.join("");
};
export const toneOf = (emoji) => (emoji.match(TONE_RE) || [""])[0];
// The original picker emoji for a (possibly toned) avatar, so switching back to Default restores it exactly.
export const baseOf = (emoji) => {
  const key = (e) => e.replace(TONE_RE, "").replace(/\uFE0F/g, "");
  return AVATARS.find((x) => key(x) === key(emoji)) || emoji.replace(TONE_RE, "");
};

// Info-only calendars (birthdays, holidays, school...): icon + muted color choices.
export const INFO_ICONS = ["🎂", "🎉", "🇺🇸", "🎄", "⛪", "🏫", "🏈", "⚽", "🗓️", "🌙", "✈️", "💼", "🗑️", "🌱", "📌"];
export const INFO_COLORS = ["#9e9e9e", "#b0a58f", "#c29fa3", "#9fb3c8", "#a8c3a0", "#c9b37e", "#b39ddb", "#80cbc4"];

// Icon choices for chores (tap-to-pick instead of typing).
export const CHORE_ICONS = [
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
export const sunTimes = (date, lat, lon) => {
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
export const moonPhase = (d) => {
  const days = (d.getTime() - Date.UTC(2000, 0, 6, 18, 14)) / 86400000;
  const age = ((days % 29.530588853) + 29.530588853) % 29.530588853;
  const names = [["🌑", "New moon"], ["🌒", "Waxing crescent"], ["🌓", "First quarter"], ["🌔", "Waxing gibbous"],
    ["🌕", "Full moon"], ["🌖", "Waning gibbous"], ["🌗", "Last quarter"], ["🌘", "Waning crescent"]];
  const [icon, name] = names[Math.floor((age / 29.530588853) * 8 + 0.5) % 8];
  return `${icon} ${name}`;
};

// Moon details: illumination and the next new / first quarter / full / last quarter (mean cycle, within about a day).
export const SYNODIC = 29.530588853;
export const moonInfo = (d) => {
  const days = (d.getTime() - Date.UTC(2000, 0, 6, 18, 14)) / 86400000;
  const age = ((days % SYNODIC) + SYNODIC) % SYNODIC;
  const illum = Math.round((1 - Math.cos((2 * Math.PI * age) / SYNODIC)) / 2 * 100);
  const next = [[0, "🌑", "New moon"], [0.25, "🌓", "First quarter"], [0.5, "🌕", "Full moon"], [0.75, "🌗", "Last quarter"]]
    .map(([f, icon, name]) => ({ icon, name, date: new Date(d.getTime() + ((f * SYNODIC - age + SYNODIC) % SYNODIC || SYNODIC) * 86400000) }))
    .sort((a, b) => a.date - b.date);
  return { age, illum, waxing: age < SYNODIC / 2, next };
};

export const MEAL_SLOTS = [["breakfast", "Breakfast", "🥞"], ["lunch", "Lunch", "🥪"], ["dinner", "Dinner", "🍝"], ["snack", "Snack", "🍎"]];
export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
// Calendar tab views, in display order. N-day views start on the selected day, like the Today screen.
export const CAL_VIEWS = [["agenda", "Agenda"], ["day", "Day"], ["3day", "3 days"], ["5day", "5 days"], ["7day", "7 days"], ["month", "Month"]];
export const LEGACY_VIEWS = { schedule: "agenda", week: "7day" };
export const viewDays = (v) => ({ day: 1, "3day": 3, "5day": 5, "7day": 7 }[v] || 0);

export const TABS = [
  ["home", "Today", "mdi:view-dashboard"],
  ["weather", "Weather", "mdi:weather-partly-cloudy"],
  ["calendar", "Calendar", "mdi:calendar-month"],
  ["chores", "Chores", "mdi:checkbox-marked-circle-outline"],
  ["meals", "Meals", "mdi:silverware-fork-knife"],
  ["lists", "Lists", "mdi:format-list-checks"],
  ["settings", "Setup", "mdi:cog"],
];
export const WEATHER_ICONS = {
  "clear-night": "🌙", cloudy: "☁️", fog: "🌫️", hail: "🌨️", lightning: "🌩️", "lightning-rainy": "⛈️",
  partlycloudy: "⛅", pouring: "🌧️", rainy: "🌦️", snowy: "❄️", "snowy-rainy": "🌨️", sunny: "☀️",
  windy: "💨", "windy-variant": "💨", exceptional: "⚠️",
};

// ---------- date helpers (all local time) ----------
export const pad = (n) => String(n).padStart(2, "0");
// Adults and kids: only kids have chores; only adults own lists.
export const kidsOf = (members) => (members || []).filter((m) => m.role === "kid");
// Who can have chores: kids, plus "household" profiles (e.g. Maintenance: furnace filters, smoke detectors).
export const choreOwnersOf = (members) => (members || []).filter((m) => m.role === "kid" || m.role === "home");
export const adultsOf = (members) => (members || []).filter((m) => m.role !== "kid" && m.role !== "home");
export const ROLE_LABEL = { adult: "🧑 Adult", kid: "🧒 Kid", home: "🏠 Household" };
// Open items in list order, then done items oldest check-off first (older items without a time keep list order).
export const orderItems = (items) => [
  ...(items || []).filter((i) => !i.done),
  ...(items || []).map((i, n) => [i, n]).filter(([i]) => i.done)
    .sort(([a, na], [b, nb]) => (a.done_at || "").localeCompare(b.done_at || "") || na - nb).map(([i]) => i),
];
// Lists grouped for the Lists tab: Shared first, then each adult (in member order) who owns a list.
export const groupLists = (lists, members) => {
  const adults = adultsOf(members);
  const ids = new Set(adults.map((m) => m.id));
  const groups = [{ owner: null, lists: (lists || []).filter((l) => !ids.has(l.owner)) }];
  for (const m of adults) groups.push({ owner: m, lists: (lists || []).filter((l) => l.owner === m.id) });
  return groups.filter((g) => g.lists.length);
};
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseYmd = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const sameDay = (a, b) => ymd(a) === ymd(b);
// Python weekday: Mon=0..Sun=6
export const pyWeekday = (d) => (d.getDay() + 6) % 7;
export const isoWeek = (d) => {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return `${t.getUTCFullYear()}-${Math.ceil(((t - y0) / 86400000 + 1) / 7)}`;
};
export const localIso = (d) => {
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? "+" : "-";
  return `${ymd(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:00${sign}${pad(Math.floor(Math.abs(off) / 60))}:${pad(Math.abs(off) % 60)}`;
};
export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
// ---------- look: theme presets, seasonal accents, night hours ----------
// Every preset defines every variable in THEME_VARS for both light and dark. Member colors are never touched.
export const THEME_VARS = ["--bg", "--card", "--ink", "--muted", "--line", "--accent", "--chip"];
export const THEMES = {
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
export const THEME_CSS = Object.entries(THEMES).map(([name, t]) => ["light", "dark"].map((mode) =>
  `:host([data-theme="${name}"][data-scheme="${mode}"]) { ${Object.entries(t[mode]).map(([k, v]) => `${k}:${v};`).join(" ")} }`).join("\n")).join("\n");

// Seasonal accent + header emoji for a date (holidays first, then seasons).
export const thanksgiving = (y) => { const first = new Date(y, 10, 1).getDay(); return new Date(y, 10, 1 + ((4 - first + 7) % 7) + 21); };
export const seasonFor = (d) => {
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
export const parseHM = (v, dflt) => { const m = /^(\d{1,2}):(\d{2})/.exec(String(v || "")); if (!m) return dflt; const x = Number(m[1]) * 60 + Number(m[2]); return x < 1440 ? x : dflt; };
export const inWindow = (now, start, end) => (start === end ? false : start < end ? now >= start && now < end : now >= start || now < end);
export const sunIsDown = (rise, set) => (rise && set ? rise < set : null);
export const isNightAt = (settings, now, rise = null, set = null) => (settings?.dark_mode === "sun"
  ? !!sunIsDown(rise, set)
  : inWindow(now.getHours() * 60 + now.getMinutes(), parseHM(settings?.night_start, 21 * 60), parseHM(settings?.night_end, 6 * 60 + 30)));

// ---------- birthdays, anniversaries and other yearly dates ----------
export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const OCCASION_EMOJI = { birthday: "🎂", anniversary: "💍", other: "📅" };
export const isLeap = (y) => y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
// The day a yearly date falls on in `year`; Feb 29 shows on Feb 28 in other years.
export const occasionDay = (o, year) => new Date(year, o.month - 1, o.month === 2 && o.day === 29 && !isLeap(year) ? 28 : o.day);
// Next time it happens, today included.
export const nextOccasion = (o, from) => {
  const f = startOfDay(from);
  const d = occasionDay(o, f.getFullYear());
  return d < f ? occasionDay(o, f.getFullYear() + 1) : d;
};
export const daysBetween = (a, b) => Math.round((startOfDay(b) - startOfDay(a)) / 86400000); // DST-safe
// Members' birthdays plus stored occasions, as one list of yearly dates.
export const allOccasions = (members, occasions, familyColor) => {
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
export const upcomingOccasions = (list, today, days = 60, count = 3) => list
  .map((o) => {
    const date = nextOccasion(o, today);
    return { ...o, date, days: daysBetween(today, date), years: o.year ? date.getFullYear() - o.year : null };
  })
  .filter((o) => o.days <= days && (o.years === null || o.years >= 0))
  .sort((a, b) => a.days - b.days || a.title.localeCompare(b.title))
  .slice(0, count);
// "🎂 Mom's birthday — 12 days (turning 38)"
export const occasionText = (u) => {
  const when = u.days === 0 ? "Today! 🎉" : u.days === 1 ? "tomorrow" : `${u.days} days`;
  const extra = u.years === null ? "" : u.type === "birthday" ? ` (${u.days === 0 ? "turns" : "turning"} ${u.years})` : ` (${u.years} year${u.years === 1 ? "" : "s"})`;
  return `${u.emoji} ${u.title} — ${when}${extra}`;
};

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ---------- weather alert types (by the National Weather Service event name) ----------
// Setup lets the family turn types off, so e.g. dozens of flood watches don't pop up all day.
export const ALERT_TYPES = [
  ["tornado", "🌪️ Tornado", /tornado/i],
  ["thunderstorm", "⛈️ Thunderstorm", /thunderstorm|lightning/i],
  ["tropical", "🌀 Hurricane & tropical", /hurricane|tropical|typhoon|storm surge/i],
  ["flood", "🌊 Flooding", /flood|hydrologic/i],
  ["winter", "❄️ Winter & cold", /winter|snow|blizzard|ice storm|\bice\b|freez|frost|sleet|wind chill|cold/i],
  ["heat", "🌡️ Heat", /heat/i],
  ["fire", "🔥 Fire & smoke", /fire|red flag|smoke/i],
  ["air", "🌫️ Fog & air quality", /fog|air quality|air stagnation|ashfall|dust/i],
  ["marine", "🏖️ Coast & marine", /marine|small craft|gale|surf|rip current|coastal|beach|lakeshore|tsunami|seas\b/i],
  ["wind", "💨 Wind", /wind/i],
];
export const alertType = (event) => (ALERT_TYPES.find(([, , re]) => re.test(event || "")) || ["other"])[0];
export const ALERT_TYPE_LABELS = Object.fromEntries([...ALERT_TYPES.map(([k, l]) => [k, l]), ["other", "⚠️ Other"]]);
