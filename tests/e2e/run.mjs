// End-to-end tests: the real skylight-panel.js in Chromium against a fake Home Assistant (fake_ha.html).
//
//   npm install --no-save playwright   (once)
//   node tests/e2e/run.mjs             (all scenarios)   node tests/e2e/run.mjs pin lists   (some)
//
// Uses Playwright's Chromium, or the browser at $CHROMIUM_PATH. Exits non-zero if any scenario fails.
import { chromium } from "playwright";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND = path.resolve(HERE, "../../custom_components/skylight/frontend");

function serve() {
  const srv = http.createServer((req, res) => {
    const url = req.url.split("?")[0];
    const file = url === "/" ? path.join(HERE, "fake_ha.html") : url.startsWith("/e2e/") ? path.join(HERE, path.basename(url)) : path.join(FRONTEND, path.normalize(url).replace(/^(\.\.[/\\])+/, ""));
    if (!file.startsWith(HERE) && !file.startsWith(FRONTEND)) { res.writeHead(403); return res.end(); }
    if (!fs.existsSync(file)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { "content-type": /\.m?js$/.test(file) ? "text/javascript" : "text/html" });
    res.end(fs.readFileSync(file));
  });
  return new Promise((ok) => srv.listen(0, () => ok(srv)));
}

class Fail extends Error {}
const check = (cond, msg) => { if (!cond) throw new Fail(msg); };
const eq = (got, want, msg) => check(JSON.stringify(got) === JSON.stringify(want), `${msg}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

// Open the panel. `at` fixes the clock; `setup` runs in the page before the first render settles.
async function open(browser, base, { width = 1300, height = 912, at = null, setup = null, ctx = {} } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, acceptDownloads: true, ...ctx });
  const page = await context.newPage();
  page.errors = [];
  page._clockInstalled = !!at;
  page.on("pageerror", (e) => page.errors.push(e.message));
  if (at) await page.clock.install({ time: new Date(at) });
  await page.goto(base);
  await (at ? page.clock.runFor(1500) : page.waitForTimeout(1200));
  await page.evaluate(() => { el.ui.alertPop = null; el.render(); });
  if (setup) { await page.evaluate(setup); await wait(page, 300); }
  page.S = (sel) => page.locator("skylight-panel").locator(sel);
  page.tab = async (t) => { await page.S(`.tab[data-tab="${t}"]`).click(); await wait(page, 300); };
  return page;
}
const wait = (page, ms) => (page._clockInstalled ? page.clock.runFor(ms) : page.waitForTimeout(ms));
const text = async (loc) => (await loc.allTextContents()).map((t) => t.replace(/\s+/g, " ").trim());

const SCENARIOS = {
  async smoke(browser, base) {
    for (const [w, h] of [[1300, 912], [390, 760]]) {
      const p = await open(browser, base, { width: w, height: h, ctx: w < 600 ? { isMobile: true, hasTouch: true } : {} });
      for (const t of ["home", "weather", "calendar", "chores", "progress", "meals", "lists", "photos", "settings"]) {
        await p.evaluate((t) => { el.ui.tab = t; el.render(); }, t);
        await p.waitForTimeout(250);
        const over = await p.evaluate(() => document.documentElement.scrollWidth);
        check(over <= w, `${t} at ${w}px scrolls sideways (${over}px)`);
      }
      eq(p.errors, [], `page errors at ${w}px`);
      await p.context().close();
    }
  },

  async orientation(browser, base) {
    // Phones upright and on their side, an iPad upright: every menu button on screen, nothing scrolls sideways,
    // and Skylight fills the panel area Home Assistant gives it (not the whole screen).
    for (const [name, w, h, side] of [["portrait", 390, 844, false], ["landscape", 844, 390, true], ["ipad", 820, 1180, false]]) {
      const p = await open(browser, base, { width: w, height: h, ctx: { isMobile: true, hasTouch: true } });
      await p.evaluate(() => { el.panel = {}; el.render(); }); // like HA: a container without a fixed height
      for (const t of ["home", "calendar", "meals", "lists", "settings"]) {
        await p.evaluate((t) => { el.ui.tab = t; el.render(); }, t); await p.waitForTimeout(150);
        const m = await p.evaluate(() => {
          const tabs = [...el.shadowRoot.querySelectorAll(".rail .tab")].map((t) => t.getBoundingClientRect());
          const rail = el.shadowRoot.querySelector(".rail").getBoundingClientRect();
          return { vis: tabs.filter((b) => b.top >= 0 && b.bottom <= innerHeight + 1 && b.left >= 0 && b.right <= innerWidth + 1).length, n: tabs.length,
            sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight, railLeft: rail.left, railWide: rail.width > innerWidth / 2 };
        });
        eq(m.vis, m.n, `${name}/${t}: all menu buttons visible`);
        check(m.sw <= w && m.sh <= h, `${name}/${t}: page overflows (${m.sw}x${m.sh})`);
        eq(!m.railWide, side || w > 900, `${name}/${t}: side menu vs bottom bar`);
      }
      if (name !== "ipad") eq(await p.evaluate(() => el.calView), "3day", `${name}: calendar limited to 3 days`);
      eq(p.errors, [], `${name}: page errors`);
      await p.context().close();
    }
  },

  async phonebar(browser, base) {
    // Regression (v1.36.2): in the HA iPhone app the panel can start below the top of the screen;
    // the bottom bar must still be fully on screen (it used to be pushed off by a 100dvh-tall app).
    const p = await open(browser, base, { width: 390, height: 844, ctx: { isMobile: true, hasTouch: true } });
    await p.evaluate(() => { document.body.style.margin = "0"; document.body.style.paddingTop = "60px"; el.panel = {}; window.dispatchEvent(new Event("resize")); });
    await p.waitForTimeout(400);
    const m = await p.evaluate(() => {
      const tabs = [...el.shadowRoot.querySelectorAll(".rail .tab")].map((t) => t.getBoundingClientRect());
      return { bottom: Math.max(...tabs.map((b) => b.bottom)), h: innerHeight, n: tabs.length };
    });
    check(m.n > 0 && m.bottom <= m.h + 1, `bottom bar on screen (${m.bottom} > ${m.h})`);
    // "Setup" fits on a phone, also with the PIN lock badge
    const label = () => p.evaluate(() => { const s = el.shadowRoot.querySelector('.tab[data-tab="settings"] span'); return [s.textContent.trim(), s.scrollWidth <= s.clientWidth + 1]; });
    eq(await label(), ["Setup", true], "settings label on phone");
    await p.evaluate(() => { el.data.security = { ...(el.data.security || {}), pin_set: true }; el.render(); }); await p.waitForTimeout(200);
    const [txt, fits] = await label();
    check(txt.startsWith("Setup") && fits, `label with lock fits (${txt})`);
    eq(p.errors, [], "page errors");
    await p.context().close();
  },

  async nosideways(browser, base) {
    // On a phone nothing may stick out past the right edge, except inside strips made to scroll sideways
    // (the 24-hour forecast, the member chips, ...). Checks every tab and the main dialogs at 360 px wide.
    const w = 360;
    const p = await open(browser, base, { width: w, height: 780, ctx: { isMobile: true, hasTouch: true } });
    const wide = () => p.evaluate((w) => {
      const scroller = (e) => { for (let x = e.parentElement; x; x = x.parentElement) { if (/(auto|scroll)/.test(getComputedStyle(x).overflowX) && x.clientWidth < w - 2) return true; } return false; };
      return [...el.shadowRoot.querySelectorAll(".app *, #dialog *")].filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && (b.right > w + 1 || b.left < -1) && !scroller(e); })
        .slice(0, 3).map((e) => `${e.tagName.toLowerCase()}.${[...e.classList].join(".")} "${(e.textContent || "").trim().slice(0, 30)}"`);
    }, w);
    for (const t of ["home", "weather", "calendar", "chores", "progress", "meals", "lists", "photos", "settings"]) {
      await p.evaluate((t) => { el.ui.tab = t; el.render(); }, t); await p.waitForTimeout(500);
      eq(await wide(), [], `${t}: nothing sticks out sideways`);
    }
    const dialogs = { event: () => el.openEventDialog(null, "2026-10-05"), member: () => el.openMemberDialog(el.members[0]),
      chore: () => el.openChoreDialog(null), occasion: () => el.openOccasionDialog(), list: () => el.openListDialog(),
      meal: () => el.openMealDialog("2026-10-05", "dinner") };
    for (const [name, fn] of Object.entries(dialogs)) {
      await p.evaluate(`(${fn.toString()})()`); await p.waitForTimeout(300);
      eq(await wide(), [], `${name} dialog: nothing sticks out sideways`);
      await p.evaluate(() => el.closeDialog());
    }
    eq(p.errors, [], "page errors");
    await p.context().close();
  },

  async steady(browser, base) {
    // Regression (v1.33.2): the page must not keep resizing/scrolling itself when HA's panel
    // container has no fixed height.
    const p = await open(browser, base);
    await p.evaluate(() => { el.panel = {}; el.ui.tab = "calendar"; el.render(); });
    await p.waitForTimeout(500);
    const sample = () => p.evaluate(() => { const g = el.shadowRoot.querySelector(".tg-scroll"); return [Math.round(el.shadowRoot.querySelector(".app").getBoundingClientRect().height), Math.round(g.scrollTop), Math.round(el._tgH)]; });
    const a = await sample(); await p.waitForTimeout(1500); const b = await sample();
    eq(b, a, "calendar height and scroll stay put");
    eq(a[0], 912, "fills the screen height");
    await p.context().close();
  },

  async weather(browser, base) {
    const p = await open(browser, base);
    // NWS has no daily forecast: day headers fall back to day/night periods
    const heads = await text(p.S(".tg-dh .wx"));
    check(heads.length >= 3 && heads.every((h) => /\d+°/.test(h)), `day-header weather missing: ${heads}`);
    await p.tab("weather");
    const rows = await text(p.S(".wtable th"));
    for (const r of ["Real feel", "Rain chance", "Wind (mph)", "Humidity", "UV index"]) check(rows.some((x) => x.startsWith(r)), `hourly row ${r}`);
    check((await p.S(".rsline").textContent()).includes("Rain"), "rain-soon card");
    check((await p.S(".moonnow").count()) === 1, "moon card");
    eq(p.errors, [], "page errors");
    await p.context().close();
  },

  async alerts(browser, base) {
    const p = await open(browser, base);
    await p.evaluate(() => { el.__seen = []; try { localStorage.removeItem("skylight.seenAlerts"); } catch (e) {} el._checkNewAlerts(); el.render(); });
    check((await p.S(".alertpop").count()) === 1, "severe alert pops up");
    await p.S('[data-action="alert-dismiss"]').click();
    await p.evaluate(() => el._checkNewAlerts());
    check((await p.S(".alertpop").count()) === 0, "dismissed alert stays dismissed");
    // Turn thunderstorms off in Setup: no pop-up and no banner, but still listed on the Weather tab
    await p.evaluate(() => { el.__seen = []; try { localStorage.removeItem("skylight.seenAlerts"); } catch (e) {} });
    await p.tab("settings");
    await p.S('input[data-change="alert-type"][data-type="thunderstorm"]').evaluate((e) => e.click()); await p.waitForTimeout(300);
    eq(await p.evaluate(() => D.settings.alert_hide), ["thunderstorm"], "type turned off");
    await p.tab("home");
    await p.evaluate(() => { el._checkNewAlerts(); el.render(); }); await p.waitForTimeout(200);
    check((await p.S(".alertpop").count()) === 0, "turned-off type doesn't pop up");
    check(!(await p.S(".alertbar").textContent().catch(() => "")).includes("Thunderstorm"), "turned-off type not in the banner");
    await p.tab("weather");
    check((await p.S(".alertcard").count()) === 2, "Weather tab still lists every alert");
    check((await p.S(".content").textContent()).includes("turned off in Setup"), "note about hidden types");
    eq(p.errors, [], "page errors");
    await p.context().close();
  },

  async pin(browser, base) {
    const p = await open(browser, base);
    const pad = async (digits) => { for (const d of digits) await p.S(`[data-action="pin-key"][data-k="${d}"]`).click(); await p.S('[data-action="pin-ok"]').click(); await p.waitForTimeout(150); };
    await p.tab("settings");
    check((await p.S(".pinbanner").count()) >= 1, "set-a-PIN banner");
    await p.S('.pinbanner [data-action="pin-setup"]').click();
    await pad("2468"); await pad("2469");
    check((await p.S(".pinerr").textContent()).includes("didn't match"), "mismatch message");
    await pad("2468");
    await p.tab("home");
    eq(await p.evaluate(() => window.SEC.unlocked), false, "leaving Settings relocks");
    await p.tab("settings");
    await p.S('[data-key="clock_24h"]').click(); await p.waitForTimeout(300);
    check((await p.S(".pinpad").count()) === 1, "locked change asks for the PIN");
    await pad("1111");
    check((await p.S(".pinerr").textContent()).includes("Wrong PIN"), "wrong PIN message");
    await pad("2468"); await p.waitForTimeout(300);
    eq(await p.evaluate(() => el.data.settings.clock_24h), true, "change saved after unlocking");
    eq(p.errors, [], "page errors");
    await p.context().close();
  },

  async roles(browser, base) {
    const p = await open(browser, base);
    await p.tab("chores");
    eq(await text(p.S(".cname")), ["Sam", "Ava", "Leo"], "only kids on Chores");
    await p.S('[data-action="new-chore"]').first().click(); await p.waitForTimeout(200);
    eq(await text(p.S("#c-member option")), ["⚾ Sam", "🧸 Ava", "🎀 Leo"], "chore picker kids only");
    await p.evaluate(() => el.closeDialog());
    await p.tab("settings");
    await p.S('[data-action="edit-member"][data-member="z"]').click(); await p.waitForTimeout(200);
    await p.S('[data-action="member-role"][data-role="adult"]').click(); await p.waitForTimeout(200);
    check((await p.S(".rolewarn").count()) === 1, "warning about hidden chores");
    await p.S('[data-action="move-chores"]').click(); await p.waitForTimeout(300);
    eq(await p.evaluate(() => D.chores.filter((c) => c.member_id === "z").length), 0, "chores moved");
    eq(p.errors, [], "page errors");
    await p.context().close();
  },

  async monthly(browser, base) {
    // A yearly Household chore that was due 3 days ago and is still not done.
    const p = await open(browser, base, { setup: () => {
      const d = new Date(); d.setDate(d.getDate() - 3);
      const start = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      D.members.push({ id: "h", name: "House", color: "#777777", avatar: "🏠", calendars: [], role: "home" });
      D.chores.push({ id: "f1", member_id: "h", title: "Furnace filter", icon: "🔧", repeat: "days", days: [(d.getDay() + 6) % 7],
        every_weeks: 52, start, carry: true, completions: [] });
      push();
    } });
    await p.tab("chores");
    check((await text(p.S(".cname"))).includes("House"), "Household profile gets a Chores column");
    check((await p.S(".since").count()) === 1, "missed chore keeps showing with a 'since' note");
    await p.S('[data-action="new-chore"]').first().click(); await p.waitForTimeout(200);
    check((await text(p.S("#c-member option"))).includes("🏠 House"), "Household in the chore picker");
    await p.S("#c-title").fill("Smoke detectors");
    await p.S("#c-repeat").selectOption("monthly"); await p.waitForTimeout(100);
    check(await p.S(".monthopts").isVisible(), "monthly options shown");
    check(!(await p.S(".dayopts").isVisible()), "weekday options hidden");
    check(await p.S("#c-carry").isChecked(), "keep-showing defaults on for monthly");
    await p.S('.c-mday[value="1"]').evaluate((e) => e.click());
    await p.S('.c-mday[value="15"]').evaluate((e) => e.click());
    await p.S('.c-mday[value="-1"]').evaluate((e) => e.click());
    await p.S("#c-every-months").selectOption("3");
    await p.S('[data-action="save-chore"]').click(); await p.waitForTimeout(300);
    const c = await p.evaluate(() => D.chores.find((x) => x.title === "Smoke detectors"));
    eq([c.repeat, c.month_days, c.every_months, c.carry], ["monthly", [15, -1], 3, true], "monthly chore saved");
    await p.S('[data-action="new-chore"]').first().click(); await p.waitForTimeout(200);
    eq((await text(p.S("#c-every option"))).slice(-2), ["26 weeks", "52 weeks"], "every N weeks goes to 52");
    await p.evaluate(() => el.closeDialog());
    await p.tab("progress");
    check(!(await p.content()).includes(">House<"), "Household not in Progress");
    eq(p.errors, [], "page errors");
    await p.context().close();
  },

  async lists(browser, base) {
    const p = await open(browser, base, { setup: () => { D.lists[0].items = ["Milk", "Eggs", "Bread", "Apples"].map((t, i) => ({ id: "i" + i, text: t, done: false })); push(); } });
    await p.tab("lists");
    const names = async () => (await text(p.S(".items .item > span:not(.dragh)"))).join(",");
    // drag the ≡ handle: mouse and touch both arrive as pointer events
    const drag = async (id, rows) => {
      const h = await p.S(`[data-drag="${id}"]`).boundingBox();
      const rowH = (await p.S(".items .item").first().boundingBox()).height;
      await p.mouse.move(h.x + h.width / 2, h.y + h.height / 2); await p.mouse.down();
      for (let k = 1; k <= 8; k++) await p.mouse.move(h.x + h.width / 2, h.y + h.height / 2 + (rows * rowH * k) / 8);
      await p.mouse.up(); await p.waitForTimeout(400);
    };
    eq(await p.S(".imove").count(), 0, "no arrow buttons");
    eq(await p.S(".dragh[data-drag]").count(), 4, "a handle on every open item");
    await drag("i3", -3);
    eq(await names(), "Apples,Milk,Eggs,Bread", "drag Apples to the top");
    await drag("i0", 1.2);
    eq(await names(), "Apples,Eggs,Milk,Bread", "drag Milk down one");
    eq(await p.evaluate(() => el._drag), null, "drag finished");
    await p.S('.item span[data-item="i1"]').click(); await p.waitForTimeout(50);
    check(await p.evaluate(() => [...el.shadowRoot.querySelectorAll(".items .item")].some((r) => r.getAnimations().length)), "items slide when a check-off moves them");
    await p.waitForTimeout(400);
    eq(await names(), "Apples,Milk,Bread,Eggs", "checked item moved below");
    await p.S("#newitem").fill("Cheese"); await p.S('[data-action="add-item"]').click(); await p.waitForTimeout(200);
    eq(await names(), "Apples,Milk,Bread,Cheese,Eggs", "new item at the bottom of the open ones");
    await p.S('[data-action="edit-list"]').click(); await p.S("#l-name").fill("Food"); await p.S('[data-action="save-list"]').click(); await p.waitForTimeout(300);
    eq(await p.evaluate(() => D.lists[0].name + ":" + D.lists[0].items.length), "Food:5", "rename keeps items");
    // linked HA list: handles only when it supports reordering
    await p.evaluate(() => { window.TODO = [{ uid: "t1", summary: "A", status: "needs_action" }, { uid: "t2", summary: "B", status: "needs_action" }, { uid: "t3", summary: "C", status: "needs_action" }]; todoCb({ items: TODO }); el.render(); });
    await p.S(`[data-action="pick-list"][data-list="todo:todo.mealie_shopping"]`).click(); await p.waitForTimeout(200);
    eq(await p.S("[data-drag]").count(), 0, "no handles without HA move support");
    await p.evaluate(() => { el._hass.states["todo.mealie_shopping"].attributes.supported_features = 15; el.render(); });
    await drag("t3", -2);
    eq(await p.evaluate(() => (window.TMOVES || []).map((m) => [m.uid, m.previous_uid || null])), [["t3", null]], "todo/item/move to the top");
    await drag("t1", 1.2);
    eq(await p.evaluate(() => (window.TMOVES || []).map((m) => [m.uid, m.previous_uid || null])).then((x) => x[1]), ["t1", "t2"], "todo/item/move after B");
    eq(p.errors, [], "page errors");
    await p.context().close();
  },

  async progress(browser, base) {
    const p = await open(browser, base, { at: "2026-09-29T17:00:00", setup: () => {
      const t = new Date(2026, 8, 29), ago = (n) => { const d = new Date(t); d.setDate(d.getDate() - n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
      for (const c of D.chores) { c.created = ago(35); c.completions = []; for (let n = 30; n >= 0; n--) if (c.member_id === "c" || (c.member_id === "z" && n % 2 === 0)) c.completions.push(ago(n)); c.completions.sort(); }
      push();
    } });
    await p.tab("progress");
    const rows = await text(p.S(".prow"));
    check(rows[0].includes("67%This week") && rows[1].includes("100%") && rows[2].includes("0%"), `progress rows: ${rows}`);
    await p.context().close();
  },

  async occasions(browser, base) {
    const p = await open(browser, base, { at: "2026-09-29T09:00:00", setup: () => {
      D.members.find((m) => m.id === "z").birthday = { month: 10, day: 3, year: 2016 };
      D.members.find((m) => m.id === "t").birthday = { month: 9, day: 29, year: 1990 };
      D.occasions = [{ id: "g", title: "Grandma's birthday", type: "birthday", month: 10, day: 20 }]; push();
    } });
    const up = await text(p.S(".urow"));
    check(up.length === 3 && up[0].includes("Jordan's birthday") && up[0].includes("Today! 🎉 (turns 36)")
      && up[1].includes("4 days (turning 10)") && up[2].includes("Grandma's birthday") && up[2].includes("21 days"), `upcoming card: ${up}`);
    eq(await p.S(".urow.today").count(), 1, "today highlighted");
    await p.tab("calendar");
    await p.S('[data-action="view"][data-view="month"]').click(); await wait(p, 300);
    const marks = await p.evaluate(() => el.visibleEvents().filter((e) => e.occasion).map((e) => e.summary));
    eq(marks, ["Jordan's birthday (36)", "Sam's birthday (10)"], "calendar markers");
    await p.context().close();
  },

  async rename(browser, base) {
    const p = await open(browser, base);
    await p.tab("settings");
    const name = p.S('input[data-key="app_name"]');
    eq(await name.inputValue(), "Lyding Strike", "default name");
    await name.fill("The Smith Board"); await name.dispatchEvent("change"); await p.waitForTimeout(300);
    eq(await p.evaluate(() => D.settings.app_name), "The Smith Board", "name saved");
    check((await p.S(".settings").textContent()).includes("The Smith Board v"), "version line uses the name");
    await name.fill("<b>x</b>"); await name.dispatchEvent("change"); await p.waitForTimeout(300);
    eq(await p.S(".settings b", { hasText: "x" }).filter({ hasText: /^x$/ }).count(), 0, "name is escaped, not HTML");
    eq(p.errors, [], "page errors");
    await p.context().close();
  },

  async theme(browser, base) {
    const p = await open(browser, base, { at: "2026-10-20T22:30:00" });
    const look = () => p.evaluate(() => [el.dataset.theme, el.dataset.scheme, getComputedStyle(el).getPropertyValue("--bg").trim(), el.$dim.style.opacity]);
    const set = async (v) => { await p.evaluate((v) => { Object.assign(D.settings, v); push(); }, v); await wait(p, 300); };
    await set({ theme: "cool", dark_mode: "scheduled", night_start: "21:00", night_end: "06:30" });
    eq(await look(), ["cool", "dark", "#0f1720", "0"], "scheduled dark at 22:30 (crosses midnight)");
    await set({ night_start: "23:00" });
    eq((await look())[1], "light", "before the window");
    await set({ dark_mode: "light", seasonal: true, night_dim: true, brightness_entity: null, night_brightness: 30, night_start: "21:00" });
    eq((await look())[3], "0.7", "dim overlay at night without a brightness entity");
    eq(await p.S(".season").textContent(), "🎃", "Halloween accent");
    await p.context().close();
  },

  async connection(browser, base) {
    const p = await open(browser, base, { at: "2026-09-30T19:42:00" });
    await p.evaluate(() => CONN.dispatchEvent(new Event("disconnected"))); await wait(p, 3000);
    eq(await p.S(".connbar").count(), 0, "no banner for a short blip");
    await wait(p, 8000);
    check((await p.S(".connbar").textContent()).includes("Can't reach Home Assistant"), "banner after 10 s");
    await p.evaluate(() => CONN.dispatchEvent(new Event("ready"))); await wait(p, 300);
    eq(await p.S(".connbar").count(), 0, "banner gone when back");
    await p.context().close();
  },

  async backup(browser, base) {
    const p = await open(browser, base);
    await p.tab("settings");
    const [dl] = await Promise.all([p.waitForEvent("download"), p.S('[data-action="backup-export"]').click()]);
    const j = JSON.parse(fs.readFileSync(await dl.path(), "utf8"));
    eq([j.skylight_backup, j.data.members.length], [1, 5], "backup file");
    const tmp = path.join(os.tmpdir(), `skylight-e2e-${process.pid}.json`);
    fs.writeFileSync(tmp, JSON.stringify(j));
    p.on("dialog", (d) => d.accept());
    await p.S("#backup-file").setInputFiles(tmp); await p.waitForTimeout(400);
    eq(await p.evaluate(() => window.IMPORTED?.data?.members?.length), 5, "restore sent");
    fs.unlinkSync(tmp);
    await p.context().close();
  },

  async cook(browser, base) {
    const p = await open(browser, base);
    await p.evaluate(() => el.openCook("r1")); await p.waitForTimeout(500);
    for (let i = 0; i < 4; i++) await p.S('[data-action="cook-serv"][data-d="1"]').click();
    const ing = await text(p.S(".ckii"));
    check(ing[0].startsWith("3 pounds") && ing[2].startsWith("2 onions"), `scaled ingredients: ${ing}`);
    await p.S('[data-action="cook-qr"]').first().click(); await p.waitForTimeout(800);
    eq(await p.S(".qrbox svg").count(), 1, "QR code");
    eq(p.errors, [], "page errors");
    await p.context().close();
    // Next on a long recipe glides down; it must never jump back to the top first.
    const q = await open(browser, base, { height: 600 });
    await q.evaluate(() => el.openCook("r1")); await q.waitForTimeout(500);
    await q.evaluate(() => { el.cook.r.steps = [...Array(14)].map((_, i) => ({ text: `Step ${i + 1}. ` + "Stir the pot slowly and keep an eye on it. ".repeat(4) })); el.renderCook(); });
    const sc = () => q.evaluate(() => { const b = el.$cook.querySelector(".cksteps"); return b.scrollHeight > b.clientHeight ? b.scrollTop : el.$cook.querySelector(".ckbody").scrollTop; });
    let peak = 0, dropped = false;
    for (let i = 0; i < 12; i++) {
      await q.S('[data-action="cook-next"]').click();
      for (let t = 0; t < 6; t++) { const y = await sc(); if (peak > 50 && y < peak - 50) dropped = true; peak = Math.max(peak, y); await q.waitForTimeout(60); }
    }
    check(peak > 200, `steps scrolled down (${peak})`);
    check(!dropped, "Next never jumps back to the top");
    eq(q.errors, [], "page errors (long recipe)");
    await q.context().close();
  },

  async sidebar(browser, base) {
    for (const admin of [false, true]) {
      const context = await browser.newContext();
      const p = await context.newPage();
      await p.addInitScript((admin) => { window.__admin = admin; window.EVT = []; window.addEventListener("hass-kiosk-mode", (e) => EVT.push(e.detail.enable)); }, admin);
      await p.goto(base); await p.waitForTimeout(300);
      await p.evaluate(() => { window.hass.user = { id: "u", is_admin: window.__admin }; el.hass = window.hass; push(); });
      await p.waitForTimeout(800);
      eq(await p.evaluate(() => EVT), admin ? [] : [true], `kiosk mode for ${admin ? "admin" : "non-admin"}`);
      await context.close();
    }
  },
};

const wanted = process.argv.slice(2);
const names = wanted.length ? wanted : Object.keys(SCENARIOS);
const srv = await serve();
const base = `http://localhost:${srv.address().port}/`;
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
let failed = 0;
for (const name of names) {
  const t0 = Date.now();
  try {
    if (!SCENARIOS[name]) throw new Fail(`no scenario "${name}"`);
    await SCENARIOS[name](browser, base);
    console.log(`ok    ${name} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  } catch (e) {
    failed++;
    console.log(`FAIL  ${name}: ${e instanceof Fail ? e.message : e.stack || e}`);
  }
}
await browser.close();
srv.close();
console.log(failed ? `${failed} of ${names.length} failed` : `all ${names.length} passed`);
process.exit(failed ? 1 : 0);
