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
      for (const t of ["home", "weather", "calendar", "chores", "meals", "lists", "settings", "team"]) {
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
    for (const t of ["home", "weather", "calendar", "chores", "meals", "lists", "settings"]) {
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

  async notch(browser, base) {
    // iPhone app with the panel starting below the status bar (47 px): the app fits the space below it,
    // with the tab bar on screen (it no longer tries to reach up behind the status bar; see v1.42.1).
    const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Home Assistant/2025.1";
    for (const covered of [false, true]) {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 797 }, isMobile: true, hasTouch: true, userAgent: UA });
      const p = await ctx.newPage(); p.errors = []; p.on("pageerror", (e) => p.errors.push(e.message));
      await p.addInitScript((covered) => {
        addEventListener("DOMContentLoaded", () => {
          document.body.style.margin = "0"; document.body.style.paddingTop = "47px";
          if (covered) { const bar = document.createElement("div"); bar.style.cssText = "position:fixed;top:0;left:0;right:0;height:47px;background:#000;z-index:99999"; document.body.appendChild(bar); }
        });
      }, covered);
      await p.goto(base); await p.waitForTimeout(300);
      await p.evaluate(() => { el.ui.alertPop = null; el.render(); window.dispatchEvent(new Event("resize")); }); await p.waitForTimeout(800);
      const m = await p.evaluate(() => {
        const app = el.shadowRoot.querySelector(".app").getBoundingClientRect();
        const chips = el.shadowRoot.querySelector("header").getBoundingClientRect();
        const first = el.shadowRoot.querySelector("header .members, header .weather")?.getBoundingClientRect();
        const tabs = [...el.shadowRoot.querySelectorAll(".rail .tab")].map((t) => t.getBoundingClientRect().bottom);
        return { appTop: Math.round(app.top), contentTop: Math.round(first?.top ?? chips.top), barBottom: Math.max(...tabs), h: innerHeight };
      });
      eq(m.appTop, 47, "app starts where the panel starts");
      check(m.contentTop >= 47, `header content below the status bar (${m.contentTop})`);
      check(m.barBottom <= m.h + 1, `bottom bar on screen (${m.barBottom} > ${m.h})`);
      eq(p.errors, [], "page errors");
      await ctx.close();
    }
  },

  async eventfit(browser, base) {
    // No event's text is cut off inside its box (e.g. 1-hour events on short screens): text that
    // doesn't fit on two lines goes to one line, and the time is dropped if even that doesn't fit.
    for (const [w, h, mobile] of [[1300, 912, false], [1000, 560, false], [844, 390, true], [390, 844, true]]) {
      const p = await open(browser, base, { width: w, height: h, ctx: mobile ? { isMobile: true, hasTouch: true } : {} });
      for (const view of ["day", "3day"]) {
        await p.evaluate((v) => { el.ui.tab = "calendar"; el.ui.view = v; el.render(); }, view); await p.waitForTimeout(400);
        const bad = await p.evaluate(() => [...el.shadowRoot.querySelectorAll(".tg-ev")].filter((e) => [...e.children].some((c) => c.offsetParent && c.scrollHeight > c.clientHeight + 1))
          .map((e) => `${e.querySelector("b").textContent} (${e.clientHeight}px)`));
        eq(bad, [], `${w}x${h} ${view}: event text fits`);
      }
      eq(p.errors, [], "page errors");
      await p.context().close();
    }
  },

  async navtabs(browser, base) {
    // 7 tabs: Progress lives on the Chores screen, Photos in Setup.
    const p = await open(browser, base, { width: 390, height: 844, ctx: { isMobile: true, hasTouch: true } });
    eq(await text(p.S(".rail .tab span")), ["Today", "Weather", "Calendar", "Chores", "Meals", "Lists", "Setup"], "tabs");
    await p.tab("chores");
    await p.S('[data-action="chores-mode"][data-mode="progress"]').click(); await p.waitForTimeout(300);
    check((await p.S(".progress").count()) === 1, "Progress opens from Chores");
    check(await p.S('.tab[data-tab="chores"]').evaluate((e) => e.classList.contains("active")), "Chores tab stays highlighted");
    await p.S('[data-action="chores-mode"][data-mode="day"]').click(); await p.waitForTimeout(300);
    check((await p.S(".chores").count()) === 1, "back to Chores");
    await p.S('[data-action="chores-mode"][data-mode="progress"]').click(); await p.waitForTimeout(200);
    await p.tab("home"); await p.tab("chores");
    check((await p.S(".chores").count()) === 1, "Chores tab opens on the day view again");
    await p.tab("settings");
    check((await p.S(".photosec h2").textContent()) === "Photos", "Photos section in Setup");
    check((await p.S('.photosec [data-action="start-saver"]').count()) === 1, "slideshow button there");
    const bar = await p.evaluate(() => { const t = el.shadowRoot.querySelector(".rail .tab"); const r = t.getBoundingClientRect(); return { w: r.width, font: parseFloat(getComputedStyle(t).fontSize) }; });
    check(bar.w >= 50 && bar.font >= 11, `bigger tab buttons (${JSON.stringify(bar)})`);
    await p.screenshot({ path: process.env.SHOT || "/dev/null" }).catch(() => {});
    eq(p.errors, [], "page errors");
    await p.context().close();
  },

  async navfill(browser, base) {
    // The nav buttons fill the side menu / bottom bar on every device and never get smaller than before.
    for (const [w, h, mobile, minIcon, minLabel] of [[1366, 768, false, 32, 12], [1920, 1080, false, 32, 12], [390, 844, true, 26, 11.5], [844, 390, true, 24, 10.5]]) {
      const p = await open(browser, base, { width: w, height: h, ctx: mobile ? { isMobile: true, hasTouch: true } : {} });
      const r = await p.evaluate(() => {
        const rail = el.shadowRoot.querySelector(".rail"), tabs = [...rail.querySelectorAll(".tab")];
        const rr = rail.getBoundingClientRect(), z = tabs.at(-1).getBoundingClientRect(), vertical = rr.height > rr.width;
        const sizes = tabs.map((t) => t.getBoundingClientRect()[vertical ? "height" : "width"]);
        return { gap: Math.round(vertical ? rr.bottom - z.bottom : rr.right - z.right), even: Math.max(...sizes) - Math.min(...sizes) < 2,
          icon: parseFloat(getComputedStyle(tabs[0].querySelector("ha-icon")).fontSize), label: parseFloat(getComputedStyle(tabs[0].querySelector("span")).fontSize),
          scroll: rail.scrollHeight > rail.clientHeight + 1 || rail.scrollWidth > rail.clientWidth + 1 };
      });
      check(r.gap <= 20 && r.even && !r.scroll, `${w}x${h}: buttons fill the menu evenly ${JSON.stringify(r)}`);
      check(r.icon >= minIcon - 0.1 && r.label >= minLabel - 0.1, `${w}x${h}: buttons not smaller than before ${JSON.stringify(r)}`);
      await p.context().close();
    }
  },

  async nobounce(browser, base) {
    // iPhone: an up/down drag starting on the header or tab bar is cancelled (no page bounce); sideways
    // drags there and up/down drags on the content are left alone.
    const p = await open(browser, base, { width: 390, height: 844, ctx: { isMobile: true, hasTouch: true } });
    const drag = (sel, dx, dy) => p.evaluate(([sel, dx, dy]) => {
      const t0 = el.shadowRoot.querySelector(sel); const r = t0.getBoundingClientRect();
      const x = r.left + 20, y = r.top + r.height / 2;
      const mk = (type, X, Y) => new TouchEvent(type, { bubbles: true, cancelable: true, composed: true,
        touches: [new Touch({ identifier: 1, target: t0, clientX: X, clientY: Y })] });
      t0.dispatchEvent(mk("touchstart", x, y));
      const mv = mk("touchmove", x + dx, y + dy); t0.dispatchEvent(mv);
      return mv.defaultPrevented;
    }, [sel, dx, dy]);
    eq(await drag(".rail .tab", 0, -40), true, "vertical drag on the tab bar cancelled");
    eq(await drag("header", 0, 40), true, "vertical drag on the header cancelled");
    eq(await drag("header .members", -60, 5), false, "sideways drag on the member chips allowed");
    eq(await drag(".content", 0, -40), false, "content still scrolls");
    // Only the header and tab bar have a blocking touch listener, so scrolling content never waits on the app.
    const cdp = await p.context().newCDPSession(p);
    const { result } = await cdp.send("Runtime.evaluate", { expression: "el.shadowRoot" });
    const { listeners } = await cdp.send("DOMDebugger.getEventListeners", { objectId: result.objectId, depth: 0 });
    eq(listeners.filter((l) => l.type === "touchmove" && !l.passive).length, 0, "no blocking touchmove listener on the whole app");
    eq(p.errors, [], "page errors");
    await p.context().close();
    // Phone on its side: bigger side-menu buttons, all 7 on screen without scrolling.
    const q = await open(browser, base, { width: 844, height: 390, ctx: { isMobile: true, hasTouch: true } });
    const m = await q.evaluate(() => { const rail = el.shadowRoot.querySelector(".rail"); const t = rail.querySelector(".tab");
      return { font: parseFloat(getComputedStyle(t).fontSize), w: t.getBoundingClientRect().width, fits: rail.scrollHeight <= rail.clientHeight + 1 }; });
    check(m.font >= 10.5 && m.w >= 64 && m.fits, `landscape side menu: ${JSON.stringify(m)}`);
    await q.context().close();
  },

  async saving(browser, base) {
    // A slow save shows "Saving…" on a grayed-out button, and a second tap doesn't save twice.
    const p = await open(browser, base);
    await p.evaluate(() => el.openEventDialog(null, "2026-10-05")); await p.waitForTimeout(300);
    await p.S("#ev-title").fill("Haircut");
    const before = await p.evaluate(() => window.calls.filter((c) => c.type === "calendar/event/create").length);
    await p.evaluate(() => { window.SLOW = 1500; });
    const btn = p.S('[data-action="save-event"]');
    await btn.click(); await p.waitForTimeout(200);
    eq(await btn.textContent(), "Saving…", "button says Saving…");
    eq(await btn.isDisabled(), true, "button grayed out");
    await btn.evaluate((b) => { b.disabled = false; b.click(); }); // even a forced second tap is ignored
    await p.waitForTimeout(2200);
    await p.evaluate(() => { window.SLOW = 0; });
    eq(await p.evaluate(() => window.calls.filter((c) => c.type === "calendar/event/create").length), before + 1, "saved once");
    eq(await p.S(".dialog").count(), 0, "dialog closed after saving");
    eq(p.errors, [], "page errors");
    await p.context().close();
  },

  async alldaybars(browser, base) {
    // A multi-day all-day event is one bar across its days, not a copy per day; overlapping ones stack.
    const p = await open(browser, base, { width: 1300, height: 912 });
    await p.evaluate(() => {
      const ymd = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
      const cal = "calendar.family";
      window.EVS[cal].push({ summary: "Fall Break", start: { date: ymd(0) }, end: { date: ymd(3) }, uid: "fb" },
                          { summary: "Stay at Holiday Inn", start: { date: ymd(1) }, end: { date: ymd(3) }, uid: "hi" });
      el.ui.tab = "calendar"; el.ui.view = "7day"; el.ui.anchor = new Date(); el._eventsKey = ""; el._loadEvents();
    });
    await p.waitForTimeout(800);
    const bars = await p.evaluate(() => {
      const col = el.shadowRoot.querySelector(".tg-adbg").getBoundingClientRect().width;
      return [...el.shadowRoot.querySelectorAll(".tg-adbar")].filter((b) => /Fall Break|Holiday Inn/.test(b.textContent))
        .map((b) => ({ t: b.textContent.trim().replace(/^↳\s*/, ""), days: Math.round(b.getBoundingClientRect().width / col), top: Math.round(b.getBoundingClientRect().top) }));
    });
    eq(bars.map((b) => [b.t, b.days]), [["Fall Break", 3], ["Stay at Holiday Inn", 2]], "one bar per event, as wide as its days");
    check(bars[0].top !== bars[1].top, "overlapping bars on separate rows");
    if (process.env.SHOT) await p.screenshot({ path: process.env.SHOT, clip: { x: 0, y: 150, width: 1300, height: 260 } });
    eq(p.errors, [], "page errors");
    await p.context().close();
  },

  async homelog(browser, base) {
    // Progress shows a maintenance log for Household profiles: when each task was done, at what time, by whom.
    const p = await open(browser, base, { setup: () => {
      D.members.push({ id: "h", name: "House", color: "#777777", avatar: "🏠", calendars: [], role: "home" });
      D.chores.push({ id: "ff", member_id: "h", title: "Furnace filter", icon: "🔧", repeat: "daily", completions: ["2026-08-01"] });
      push();
    } });
    await p.tab("chores");
    await p.S('.ccol:has(.cname:text("House")) [data-action="toggle-chore"]').first().click(); await p.waitForTimeout(500);
    await p.S('[data-action="chores-mode"][data-mode="progress"]').click(); await p.waitForTimeout(500);
    const log = await p.S(".homelog").textContent();
    check(log.includes("Furnace filter") && log.includes("Last done"), "maintenance log lists the task");
    check(/\d{1,2}:\d{2}/.test(log) && log.includes("Test User"), `time and who are shown: ${log.replace(/\s+/g, " ").slice(0, 200)}`);
    check(log.includes("History (2)"), "history includes the older, date-only check-off");
    if (process.env.SHOT) { await p.S(".hlhist summary").first().click(); await p.S(".homelog").screenshot({ path: process.env.SHOT }); }
    eq(p.errors, [], "page errors");
    await p.context().close();
  },

  async keyboardshift(browser, base) {
    // iPhone keyboard: after typing in a dialog the page can be left scrolled up. Closing the dialog
    // (or the keyboard) puts it back, so the tab bar is at the bottom again with no gap.
    const p = await open(browser, base, { width: 390, height: 844, ctx: { isMobile: true, hasTouch: true } });
    await p.evaluate(() => el.openEventDialog(null, "2026-10-05")); await p.waitForTimeout(300);
    await p.S("#ev-title").fill("Haircut");
    await p.evaluate(() => { document.body.style.paddingBottom = "300px"; window.scrollTo(0, 250); }); // what iOS does
    check(await p.evaluate(() => window.scrollY) > 0, "page scrolled up (simulated keyboard)");
    await p.evaluate(() => el.closeDialog()); await p.waitForTimeout(500);
    eq(await p.evaluate(() => window.scrollY), 0, "page back in place after the dialog closes");
    const m = await p.evaluate(() => ({ bottom: Math.max(...[...el.shadowRoot.querySelectorAll(".rail .tab")].map((t) => t.getBoundingClientRect().bottom)), h: innerHeight }));
    check(m.bottom <= m.h + 1 && m.bottom > m.h - 60, `tab bar at the bottom (${m.bottom} of ${m.h})`);
    eq(p.errors, [], "page errors");
    await p.context().close();
  },

  async touchforms(browser, base) {
    // Touch screens: dialogs don't pop the keyboard on their own; time boxes open a list (no keyboard)
    // on every tap; ⌨ switches a time box to typing.
    const p = await open(browser, base, { width: 390, height: 844, ctx: { isMobile: true, hasTouch: true } });
    check(await p.evaluate(() => matchMedia("(pointer: coarse)").matches), "emulating a touch screen");
    await p.evaluate(() => el.openEventDialog(null, "2026-10-05", 9)); await p.waitForTimeout(300);
    eq(await p.evaluate(() => el.shadowRoot.activeElement?.id || null), null, "no text box focused when the dialog opens");
    const start = p.S("#ev-start");
    eq(await start.evaluate((e) => e.readOnly), true, "time box is tap-for-list");
    await start.tap(); await p.waitForTimeout(200);
    check(await p.S("#ev-start + .ttype + .tlist").isVisible(), "tap opens the list");
    await p.S('#ev-start ~ .tlist [data-h="10"][data-m="30"]').tap(); await p.waitForTimeout(200);
    eq(await start.inputValue(), "10:30 AM", "picked from the list");
    await start.tap(); await p.waitForTimeout(200);
    check(await p.S("#ev-start ~ .tlist").isVisible(), "a second tap opens the list again");
    await p.S('[data-action="time-type"][data-for="ev-start"]').tap(); await p.waitForTimeout(200);
    eq(await start.evaluate((e) => [e.readOnly, el.shadowRoot.activeElement === e]), [false, true], "⌨ switches to typing");
    eq(p.errors, [], "page errors");
    await p.context().close();
  },

  async reminders(browser, base) {
    // Reminder set in the event editor is stored for the event; Setup lists phones; this screen pops it up.
    const p = await open(browser, base, { setup: () => { (window.hass.services ||= {}).notify = { mobile_app_alex: {}, mobile_app_kids: {}, send_message: {} }; } });
    await p.evaluate(() => el.openEventDialog(null, "2026-10-05", 16)); await p.waitForTimeout(300);
    await p.S("#ev-title").fill("Dentist");
    await p.S("#ev-remind").selectOption("30");
    await p.S('[data-action="save-event"]').click(); await p.waitForTimeout(800);
    const meta = await p.evaluate(() => Object.values(D.event_meta || {})[0]);
    check(meta && meta.summary === "Dentist" && meta.remind === "30" && /^2026-10-05T16:00:00[+-]\d\d:\d\d$/.test(meta.start), `reminder stored: ${JSON.stringify(meta)}`);
    await p.tab("settings");
    eq(await text(p.S(".reminders .remrow b")), ["📱 Alex", "📱 Kids", "🖥️ Pop up reminders here"], "phones listed (only mobile apps) plus this screen");
    await p.S('.reminders select[data-service="mobile_app_kids"]').selectOption("members"); await p.waitForTimeout(300);
    await p.S('.reminders input[data-service="mobile_app_kids"][data-member="z"]').evaluate((e) => e.click()); await p.waitForTimeout(300);
    eq(await p.evaluate(() => D.settings.reminder_phones.mobile_app_kids), { mode: "members", members: ["z"] }, "kids' phone: only Sam's events");
    await p.evaluate(() => window.remCb({ summary: "Dentist", message: "Today at 4:00 PM", members: [] })); await p.waitForTimeout(300);
    check((await p.S(".remcard").textContent()).includes("Dentist"), "this screen pops up the reminder");
    await p.S('[data-action="reminder-dismiss"]').click(); await p.waitForTimeout(200);
    eq(await p.S(".remcard").count(), 0, "dismissed");
    eq(p.errors, [], "page errors");
    await p.context().close();
  },

  async checkboxrow(browser, base) {
    // Tapping empty space to the right of "All day" must not toggle it; tapping the box or its text does.
    for (const [w, h, mobile] of [[1300, 912, false], [390, 844, true]]) {
      const p = await open(browser, base, { width: w, height: h, ctx: mobile ? { isMobile: true, hasTouch: true } : {} });
      await p.evaluate(() => el.openEventDialog(null, "2026-10-05", 9)); await p.waitForTimeout(300);
      const box = p.S("#ev-allday");
      const before = await box.isChecked();
      const dlg = await p.S(".dialog").boundingBox(), row = await p.S("label.check:has(#ev-allday)").boundingBox();
      await p.mouse.click(dlg.x + dlg.width - 30, row.y + row.height / 2); await p.waitForTimeout(200);
      eq(await box.isChecked(), before, `${w}px: empty space on the row doesn't toggle All day`);
      check(row.width < dlg.width * 0.6, `${w}px: the clickable label is just the box and its text (${Math.round(row.width)}px)`);
      await p.S("label.check:has(#ev-allday)").click({ position: { x: row.width - 5, y: row.height / 2 } }); await p.waitForTimeout(200);
      eq(await box.isChecked(), !before, `${w}px: tapping the words still toggles it`);
      await p.context().close();
    }
  },

  async screenscheme(browser, base) {
    // Light/dark is per screen: the default follows the device; a choice is saved on that device only.
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: "dark" });
    const p = await ctx.newPage(); p.errors = []; p.on("pageerror", (e) => p.errors.push(e.message));
    await p.goto(base); await p.waitForTimeout(1200);
    await p.evaluate(() => { el.ui.alertPop = null; el.render(); });
    eq(await p.evaluate(() => el.dataset.scheme), "dark", "default: follows this device (in Dark Mode)");
    await p.evaluate(() => { el.ui.tab = "settings"; el.render(); }); await p.waitForTimeout(300);
    check((await p.locator("skylight-panel").locator('select[data-key="dark_mode"]').count()) === 0, "no family-wide dark mode any more");
    await p.locator("skylight-panel").locator('select[data-change="screen-scheme"]').selectOption("light"); await p.waitForTimeout(300);
    eq(await p.evaluate(() => el.dataset.scheme), "light", "this screen: always light");
    eq(await p.evaluate(() => "dark_mode" in D.settings || "screenScheme" in D.settings), false, "nothing saved for the family");
    await p.reload(); await p.waitForTimeout(1200);
    eq(await p.evaluate(() => el.dataset.scheme), "light", "remembered on this device");
    eq(p.errors, [], "page errors");
    await ctx.close();
  },


  async photopeople(browser, base) {
    const p = await open(browser, base);
    const cap = () => p.evaluate(() => el._photoCaption({ taken: "2025-07-04", place: "Paris, France", people: ["Alex", "Jordan", "Sam", "Ava", "Leo"] }));
    check((await cap()).includes("👥 Alex, Jordan, Sam, Ava +1"), "people in the caption (first four, then +N)");
    await p.evaluate(() => { D.settings.photo_people = false; push(); }); await p.waitForTimeout(200);
    check(!(await cap()).includes("👥"), "can be turned off in Setup");
    eq(p.errors, [], "page errors");
    await p.context().close();
  },

  async savercaption(browser, base) {
    // Screensaver on phones: the clock, the verse of the day and the photo's date and place never cover each other.
    for (const [w, h] of [[390, 844], [844, 390], [1300, 912]]) {
      const p = await open(browser, base, { width: w, height: h, ctx: w < 1000 ? { isMobile: true, hasTouch: true } : {} });
      await p.evaluate(() => {
        el.ui.saver = true; el.render();
        el.verse = { date: "2026-01-01", reference: "Joshua 24:15", translation: "KJV", text: "And if it seem evil unto you to serve the LORD, choose you this day whom ye will serve; whether the gods which your fathers served that were on the other side of the flood, or the gods of the Amorites, in whose land ye dwell: but as for me and my house, we will serve the LORD." };
        el.$saver.innerHTML = `<div class="saver"><div class="saver-clock"><div id="sv-time">10:42 AM</div><div id="sv-date">Sunday, October 4</div></div>
          <div class="saver-cap"><span>September 14, 2025</span><span>Gatlinburg, Tennessee, United States</span></div>${el.renderSaverVerse()}</div>`;
      });
      await p.waitForTimeout(200);
      const boxes = await p.evaluate(() => [".saver-clock", ".saver-cap", ".saver-verse"].map((s) => { const r = el.shadowRoot.querySelector(s).getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; }));
      const overlap = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
      eq(overlap(boxes[0], boxes[1]), false, `${w}x${h}: clock and photo caption don't overlap`);
      eq(overlap(boxes[0], boxes[2]) || overlap(boxes[1], boxes[2]), false, `${w}x${h}: a long verse covers neither the clock nor the caption (${JSON.stringify(boxes)})`);
      await p.context().close();
    }
  },

  async resume(browser, base) {
    // "Frozen" screen guards: a drawing error shows a card with Try again; coming back to the app redraws and
    // clears a screensaver; the panel removed and re-added by Home Assistant still responds to taps.
    const p = await open(browser, base, { width: 390, height: 844, ctx: { isMobile: true, hasTouch: true } });
    await p.evaluate(() => { window.__orig = el.renderHome; el.renderHome = () => { throw new Error("boom"); }; el.ui.tab = "home"; el.render(); });
    check((await p.S(".content, .empty").first().textContent()).includes("Something went wrong") || (await p.S(".empty h2").textContent()).includes("Something went wrong"), "error card instead of a silent freeze");
    await p.evaluate(() => { el.renderHome = window.__orig; });
    await p.S('[data-action="retry-render"]').click(); await p.waitForTimeout(300);
    eq(await p.S(".rail .tab").count(), 7, "Try again brings the app back");
    // Leave the app and come back after a while with the screensaver running.
    await p.evaluate(() => {
      el.ui.saver = true; el.$saver.innerHTML = '<div class="saver"></div>';
      let v = "hidden"; Object.defineProperty(document, "visibilityState", { configurable: true, get: () => v });
      document.dispatchEvent(new Event("visibilitychange"));
      el._hiddenAt = Date.now() - 60000; v = "visible"; document.dispatchEvent(new Event("visibilitychange"));
    });
    await p.waitForTimeout(400);
    eq(await p.evaluate(() => el.ui.saver), false, "screensaver cleared on return");
    // Home Assistant removing and re-adding the panel element
    await p.evaluate(() => { const parent = el.parentNode; parent.removeChild(el); parent.appendChild(el); });
    await p.waitForTimeout(500);
    await p.S('.tab[data-tab="lists"]').click(); await p.waitForTimeout(300);
    eq(await p.evaluate(() => el.ui.tab), "lists", "taps work after the panel is re-added");
    // Loop brake: a position that keeps flipping stops the re-measuring instead of looping forever.
    eq(await p.evaluate(() => {
      let flip = 0; el.getBoundingClientRect = () => ({ top: (flip++ % 2) * 47, left: 0, right: 390, bottom: 844, width: 390, height: 844 });
      for (let i = 0; i < 40; i++) el._fitPhoneHeight();
      return el._fitStopped === true;
    }), true, "re-measuring stops when the layout keeps flipping");
    await p.evaluate(() => { delete el.getBoundingClientRect; });
    // Reset link clears this screen's own settings.
    await p.evaluate(() => localStorage.setItem("skylight.screenScheme", "dark"));
    await p.goto(base + "?reset_screen=1"); await p.waitForTimeout(1000);
    eq(await p.evaluate(() => localStorage.getItem("skylight.screenScheme")), null, "?reset_screen=1 clears this screen's settings");
    check((await p.S(".content").textContent()).length > 0, "content drawn");
    eq(p.errors, [], "page errors");
    await p.context().close();
  },

  async diagnostics(browser, base) {
    // Flight recorder: a session's events survive a reload; Setup shows the previous session and sends it.
    const p = await open(browser, base, { width: 390, height: 844, ctx: { isMobile: true, hasTouch: true } });
    await p.tab("calendar"); await p.tab("lists");
    await p.waitForTimeout(1300); // saved every second
    await p.reload(); await p.waitForTimeout(1500);
    await p.evaluate(() => { el.ui.alertPop = null; el.ui.tab = "settings"; el.render(); }); await p.waitForTimeout(300);
    const log = await p.S(".diaglog").inputValue();
    check(log.includes("panel-start") && log.includes("render lists"), `previous session shown: ${log.slice(-200)}`);
    check((await p.S(".diag").textContent()).includes("Last heartbeat") || (await p.S(".diag").textContent()).includes("last heartbeat"), "heartbeat reported");
    await p.S('[data-action="diag-send"]').click(); await p.waitForTimeout(300);
    check((await p.evaluate(() => window.DIAG || "")).includes("Session started"), "report sent to Home Assistant");
    eq(p.errors, [], "page errors");
    await p.context().close();
  },

  async radar(browser, base) {
    // The embedded radar map: on phones only after a tap; never kept while the app is in the background.
    const p = await open(browser, base, { width: 390, height: 844, ctx: { isMobile: true, hasTouch: true } });
    await p.evaluate(() => { D.settings.weather_radar = "windy"; push(); });
    await p.tab("weather");
    eq([await p.S("iframe.wradar").count(), await p.S(".radarbtn").count()], [0, 1], "phone: radar waits for a tap");
    await p.S(".radarbtn").click(); await p.waitForTimeout(300);
    eq(await p.S("iframe.wradar").count(), 1, "tap loads the radar map");
    await p.evaluate(() => { let v = "hidden"; Object.defineProperty(document, "visibilityState", { configurable: true, get: () => v }); document.dispatchEvent(new Event("visibilitychange")); });
    eq(await p.S("iframe.wradar").count(), 0, "radar map removed while the app is in the background");
    await p.evaluate(() => { Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" }); el._hiddenAt = Date.now() - 1000; document.dispatchEvent(new Event("visibilitychange")); });
    await p.waitForTimeout(300);
    eq([await p.S("iframe.wradar").count(), await p.S(".radarbtn").count()], [0, 1], "back: tap again to show it");
    await p.context().close();
    const t = await open(browser, base);
    await t.evaluate(() => { D.settings.weather_radar = "windy"; push(); });
    await t.tab("weather");
    eq(await t.S("iframe.wradar").count(), 1, "tablet: radar shows by itself");
    eq(t.errors, [], "page errors");
    await t.context().close();
  },

  async daysummary(browser, base) {
    // An ordinary day (no alerts, rain, heat, wind...) still shows a weather line on the Today screen.
    const p = await open(browser, base);
    await p.evaluate(() => {
      const t = new Date(); t.setHours(8, 0, 0, 0);
      el.alerts = { alerts: [], supported: true }; el.wxx = null;
      el.wx = { ...(el.wx || {}), hourly: [...Array(16)].map((_, i) => ({ datetime: new Date(+t + i * 3.6e6).toISOString(), temperature: 50 + i, apparent_temperature: 50 + i, precipitation_probability: 0, wind_speed: 3, condition: "partlycloudy" })) };
      const d = new Date(); const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      el.forecast = { ...el.forecast, [k]: { datetime: d.toISOString(), condition: "partlycloudy", temperature: 58, templow: 41 } };
      el._loadWeatherFull = () => {}; el._loadWxExtra = () => {};
      el.ui.tab = "home"; el.render();
    });
    const text = (await p.S(".hints").textContent()).replace(/\s+/g, " ");
    if (new Date().getHours() < 17) check(text.includes("Partly cloudy today, high 58° · low 41°"), `daily summary shown: ${text}`);
    else check(text.includes("tonight, low 41°"), `evening summary shown: ${text}`);
    // Evening: tonight's low and tomorrow
    await p.evaluate(() => {
      const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const eve = new Date(); eve.setHours(21, 28, 0, 0); const tm = new Date(eve); tm.setDate(tm.getDate() + 1);
      el.forecast = { [ymd(eve)]: { datetime: eve.toISOString(), condition: "clear-night", temperature: 65, is_daytime: false },
        [ymd(tm)]: { datetime: tm.toISOString(), condition: "sunny", temperature: 81, is_daytime: true } };
      window.__eve = el._daySummary(eve).text;
    });
    eq(await p.evaluate(() => window.__eve), "Clear tonight, low 65° · Tomorrow ☀️ sunny, high 81°", "evening wording");
    eq(p.errors, [], "page errors");
    await p.context().close();
  },

  async keepscroll(browser, base) {
    // Today screen: checking off a chore far down the right column keeps the column where it was.
    const p = await open(browser, base, { width: 1300, height: 560 }); // short enough that the column has to scroll
    await p.tab("home");
    const side = p.S(".hside");
    const can = await side.evaluate((e) => e.scrollHeight > e.clientHeight + 50);
    check(can, "right column scrolls on this screen size");
    await side.evaluate((e) => { e.scrollTop = e.scrollHeight; });
    const before = await side.evaluate((e) => e.scrollTop);
    await p.S('.hside [data-action="toggle-chore"]').last().click(); await p.waitForTimeout(600);
    const after = await p.S(".hside").evaluate((e) => e.scrollTop);
    check(Math.abs(after - before) < 30 && after > 0, `column stays put (${before} -> ${after})`);
    await p.tab("calendar"); await p.tab("home");
    eq(await p.S(".hside").evaluate((e) => e.scrollTop), 0, "a tab switch starts at the top");
    eq(p.errors, [], "page errors");
    await p.context().close();
  },

  async livetimes(browser, base) {
    // Finished events are dimmed; the current one shows a progress bar and time left; later ones "in …".
    const p = await open(browser, base, { at: "2026-10-07T12:00:00" });
    await p.evaluate(() => {
      const at = (h, m) => { const d = new Date(); d.setHours(h, m, 0, 0); return d.toISOString(); };
      window.EVS["calendar.family"].push(
        { summary: "Done thing", start: { dateTime: at(8, 0) }, end: { dateTime: at(9, 0) }, uid: "p1" },
        { summary: "Happening now", start: { dateTime: at(11, 30) }, end: { dateTime: at(12, 40) }, uid: "n1" },
        { summary: "Later today", start: { dateTime: at(14, 15) }, end: { dateTime: at(15, 0) }, uid: "s1" });
      el.ui.tab = "calendar"; el.ui.view = "agenda"; el.ui.anchor = new Date(); el._eventsKey = ""; el._loadEvents();
    });
    await wait(p, 1500);
    const row = (t) => p.evaluate((t) => { const r = [...el.shadowRoot.querySelectorAll(".srow")].find((x) => x.textContent.includes(t)); return r ? [r.className.includes("past"), r.className.includes("evon"), r.textContent.replace(/\s+/g, " ").trim()] : null; }, t);
    const [donePast] = await row("Done thing");
    check(donePast, "finished event dimmed in the agenda");
    const [, nowOn, nowText] = await row("Happening now");
    const bars = await p.S(".srow.evon .evprog i").count();
    check(nowOn && nowText.includes("40 min left") && bars >= 1, `current event: progress bar + time left (${nowOn} ${bars} ${nowText})`);
    const [, , soonText] = await row("Later today");
    check(soonText.includes("in 2 h 15 min"), `countdown (${soonText})`);
    if (process.env.SHOT) await p.S(".schedule").screenshot({ path: process.env.SHOT });
    await p.evaluate(() => { el.ui.view = "day"; el.render(); }); await wait(p, 300);
    const grid = await p.evaluate(() => [...el.shadowRoot.querySelectorAll(".tg-ev")].filter((b) => /Done thing|Happening now/.test(b.textContent)).map((b) => [b.querySelector("b").textContent, b.className.includes("past"), b.className.includes("evon")]));
    eq(grid.sort(), [["Done thing", true, false], ["Happening now", false, true]], "time grid: dimmed and highlighted");
    await wait(p, 61000); // a minute later the countdown has moved on by itself
    await p.evaluate(() => { el.ui.view = "agenda"; el.render(); }); await wait(p, 300);
    check((await row("Later today"))[2].includes("in 2 h 14 min"), "updates every minute");
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
    for (const r of ["Feels like", "Rain chance", "Wind (mph)", "Humidity", "UV index"]) check(rows.some((x) => x.startsWith(r)), `hourly row ${r}`);
    eq(await p.S(".whourly svg polyline.wfeels").count(), 1, "feels-like line on the hourly chart");
    check((await text(p.S(".wnow .hint")))[0]?.startsWith("Feels like"), "feels like under the current temperature");
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
    await p.tab("chores"); await p.S('[data-action="chores-mode"][data-mode="progress"]').click(); await p.waitForTimeout(300);
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
    await p.tab("chores"); await p.S('[data-action="chores-mode"][data-mode="progress"]').click(); await p.waitForTimeout(300);
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
    await p.evaluate(() => localStorage.setItem("skylight.screenScheme", "night")); // this screen: dark at night
    await set({ theme: "cool", night_by: "schedule", night_start: "21:00", night_end: "06:30" });
    eq(await look(), ["cool", "dark", "#0f1720", ""], "dark at night at 22:30 (window crosses midnight)");
    eq(await p.evaluate(() => getComputedStyle(el.$dim).display), "none", "no dim layer in the page while not dimming");
    await set({ night_start: "23:00" });
    eq((await look())[1], "light", "before the window");
    await p.evaluate(() => localStorage.setItem("skylight.screenScheme", "light"));
    await set({ seasonal: true, night_dim: true, brightness_entity: null, night_level: 82, night_start: "21:00" });
    eq((await look())[3], "0.7", "dim overlay at night without a brightness entity");
    eq(await p.evaluate(() => getComputedStyle(el.$dim).display), "block", "dim layer shown while dimming");
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
    await p.evaluate(() => {
      window.WAKE = [];
      Object.defineProperty(navigator, "wakeLock", { configurable: true, value: { request: async (t) => { window.WAKE.push(t);
        return { released: false, addEventListener() {}, release: async () => { window.WAKE.push("released"); } }; } } });
    });
    await p.evaluate(() => el.openCook("r1")); await p.waitForTimeout(500);
    eq(await p.evaluate(() => window.WAKE), ["screen"], "cook mode keeps the screen on");
    for (let i = 0; i < 4; i++) await p.S('[data-action="cook-serv"][data-d="1"]').click();
    const ing = await text(p.S(".ckii"));
    check(ing[0].startsWith("3 pounds") && ing[2].startsWith("2 onions"), `scaled ingredients: ${ing}`);
    await p.S('[data-action="cook-qr"]').first().click(); await p.waitForTimeout(800);
    eq(await p.S(".qrbox svg").count(), 1, "QR code");
    await p.evaluate(() => el.closeCook());
    eq(await p.evaluate(() => [window.WAKE.at(-1), !!document.querySelector("video")]), ["released", false], "screen may sleep again after cook mode");
    await p.tab("settings");
    await p.S('select[data-change="screen-awake"]').selectOption("1"); await p.waitForTimeout(200);
    eq([await p.evaluate(() => window.WAKE.at(-1)), await p.evaluate(() => localStorage.getItem("skylight.awake"))], ["screen", "1"], "keep this screen on");
    await p.S('select[data-change="screen-awake"]').selectOption(""); await p.waitForTimeout(200);
    eq(await p.evaluate(() => [window.WAKE.at(-1), localStorage.getItem("skylight.awake")]), ["released", null], "and off again");
    await p.evaluate(() => { window.CHIMED = 0; el._chime = () => { window.CHIMED++; }; });
    await p.S('[data-action="chime-test"]').click(); await p.waitForTimeout(100);
    eq(await p.evaluate(() => window.CHIMED), 1, "Test plays the alert chime");
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
    // Non-admin phone freeze (v1.43.1): if Home Assistant rebuilds the panel whenever it's asked to hide its
    // sidebar, each new panel used to ask again -> endless rebuilds. Now it asks once per page load.
    const context = await browser.newContext();
    const p = await context.newPage();
    p.errors = []; p.on("pageerror", (e) => p.errors.push(e.message));
    await p.addInitScript(() => {
      window.DOCK = 0;
      window.addEventListener("hass-dock-sidebar", () => {
        if (++window.DOCK > 50) return; // safety for the old code
        setTimeout(() => { // like Home Assistant re-laying-out: a brand-new panel element replaces the old one
          const old = window.el, fresh = document.createElement("skylight-panel");
          old.replaceWith(fresh); fresh.hass = window.hass; window.el = fresh;
        }, 20);
      });
    });
    await p.goto(base); await p.waitForTimeout(300);
    await p.evaluate(() => { window.hass.user = { id: "u", is_admin: false }; el.hass = window.hass; push(); });
    await p.waitForTimeout(2500);
    eq(await p.evaluate(() => window.DOCK), 1, "asked Home Assistant to hide its sidebar once, not over and over");
    await p.evaluate(() => { window.hass.dockedSidebar = "always_hidden"; delete window.__lydingChrome; push(); });
    await p.waitForTimeout(500);
    eq(await p.evaluate(() => window.DOCK), 1, "not asked again when the sidebar is already hidden");
    eq(p.errors, [], "page errors");
    await context.close();
  },
  async baseball(browser, base) {
    const at = "2026-09-19T16:00:00";
    const start = new Date(new Date(at).getTime() + 61 * 60000).toISOString();
    const g = { pk: 1, start, away: 119, home: 109, state: "Preview", detail: "Scheduled" };
    const p = await open(browser, base, { at });
    await p.evaluate(({ g, start }) => {
      window.MLB = {
        today: { team: 109, game: g },
        team: { team: 109, errors: {}, schedule: [{ ...g }, { ...g, pk: 2, away: 109, home: 135, start: "2026-09-21T02:10:00Z" }],
          division: { name: "NL West", rows: [{ id: 119, name: "Dodgers", w: 90, l: 60, gb: 0 }, { id: 109, name: "D-backs", w: 85, l: 65, gb: 5 }] },
          wildcard: { name: "NL wild card", spots: 3, rows: [{ id: 112, name: "Cubs", w: 87, l: 63, gb: -2, in: true }, { id: 121, name: "Mets", w: 86, l: 64, gb: -1, in: true },
            { id: 109, name: "D-backs", w: 85, l: 65, gb: 0, in: true }, { id: 135, name: "Padres", w: 84, l: 66, gb: 1, in: false }] },
          rooting: [{ pk: 3, away: 112, home: 113, state: "Preview", start, root_for: 113, root_against: 112, reason: "Cubs are 2 games ahead of us in the NL wild-card race" }] },
      };
      el._mlbAt = 0; el._loadMlb();
    }, { g, start });
    await wait(p, 500);
    const note = async () => (await text(p.S(".mlbnote")))[0] || "";
    check((await note()).includes("D-backs vs Dodgers") && (await note()).includes("Today at"), `game-day note: ${await note()}`);
    const tick = async (ms) => { await p.evaluate(() => { el._lastActivity = Date.now(); }); await wait(p, ms); };
    await tick(60000); // inside the last hour: counts down by the minute
    check((await note()).includes("First pitch in 60 min"), `countdown: ${await note()}`);
    await tick(60000);
    check((await note()).includes("First pitch in 59 min"), `countdown moves: ${await note()}`);
    await p.evaluate(() => { Object.assign(window.MLB.today.game, { state: "Live", away_score: 2, home_score: 3, inning: "5th", half: "Top" }); });
    await tick(61000);
    check((await note()).includes("LAD 2 – ARI 3") && (await note()).includes("Top 5th"), `live score: ${await note()}`);
    await p.evaluate(() => { el.ui.alertPop = null; el._alertTimer && clearInterval(el._alertTimer); el.render(); });
    await p.S(".mlbnote").click(); await wait(p, 300);
    const page = (await text(p.S(".mlbpage")))[0];
    check(page.includes("Root for Reds") && page.includes("Cubs are 2 games ahead of us in the NL wild-card race"), `rooting: ${page}`);
    check(page.includes("NL West") && page.includes("NL wild card") && page.includes("Coming up"), "tables shown");
    eq(await p.S(".mlbtab tr.cut").count(), 1, "wild-card cutoff line");
    await p.evaluate(() => { Object.assign(window.MLB.team, { phase: "postseason", rooting_note: "The D-backs are out of the postseason, so root for NL West teams." }); el._loadMlbTeam(); });
    await wait(p, 300);
    check((await text(p.S(".mlbpage")))[0].includes("so root for NL West teams"), "postseason note shown");
    await p.evaluate(() => { Object.assign(window.MLB.today.game, { state: "Final", detail: "Final", away_score: 2, home_score: 4 }); });
    await tick(61000);
    await p.S('[data-action="tab"][data-tab="home"]').first().click(); await wait(p, 300);
    check((await note()).includes("Final") && (await note()).includes("Win!"), `final: ${await note()}`);
    await p.evaluate(() => { window.MLB.today = { team: 109, game: null, next: { pk: 5, away: 109, home: 135, state: "Preview", start: "2026-09-22T01:40:00Z" } }; el._mlbAt = 0; el._loadMlb(); });
    await wait(p, 500);
    eq(await p.S(".mlbnote").count(), 0, "no game today: no note");
    await p.S(".mlbbtn").click(); await wait(p, 300);
    check((await text(p.S(".mlbpage")))[0]?.includes("NL West"), "the ⚾ button opens the team page");
    await p.evaluate(() => { el.settings.mlb_team = 0; el.ui.tab = "home"; el.render(); });
    eq(await p.S(".mlbnote, .mlbbtn").count(), 0, "off when no favorite team");
    eq(p.errors, [], "page errors");
    await p.context().close();
  },
  async leave_by(browser, base) {
    const p = await open(browser, base, { at: "2026-10-07T12:00:00" });
    await p.evaluate(() => {
      const at = (h, m) => { const d = new Date(); d.setHours(h, m, 0, 0); return d.toISOString(); };
      window.EVS["calendar.family"].push({ summary: "Soccer game", location: "Main Park", start: { dateTime: at(13, 0) }, end: { dateTime: at(14, 0) }, uid: "lv1" });
      el.ui.alertPop = null; clearInterval(el._alertTimer);
      el._eventsKey = ""; el._loadEvents();
    });
    await wait(p, 1500);
    await wait(p, 10000);
    eq(await p.S(".leavenote").count(), 0, "no note without the Waze integration");
    eq(await p.evaluate(() => el.travel.available), false, "told Waze isn't there");
    await p.evaluate(() => { window.TRAVEL = { "Main Park": 22 }; el._travelAt = 0; el.travel = null; });
    await wait(p, 10000);
    eq(await p.evaluate(() => window.TRAVELCALLS.at(-1)), ["Main Park"], "asked about today's event location");
    const note = async () => (await text(p.S(".leavenote")))[0] || "";
    check((await note()).includes("Leave by 12:33") && (await note()).includes("Soccer game") && (await note()).includes("22 min drive"), `leave-by note: ${await note()}`);
    await p.evaluate(() => { el._lastActivity = Date.now(); });
    await wait(p, 34 * 60000);
    await p.evaluate(() => { el.ui.alertPop = null; el.ui.saver = false; el.ui.tab = "home"; el.render(); });
    check((await note()).includes("Leave now"), `leave-now: ${await note()}`);
    eq(await p.S(".leavenote.go").count(), 1, "highlighted when it's time to go");
    await p.evaluate(() => { el.ui.tab = "calendar"; el.ui.view = "agenda"; el.render(); });
    check((await text(p.S(".srow .evleave")))[0]?.includes("Leave now"), "agenda row shows it too");
    await p.evaluate(() => { el.settings.leave_by = false; el.ui.tab = "home"; el.render(); });
    eq(await p.S(".leavenote").count(), 0, "can be turned off");
    eq(p.errors, [], "page errors");
    await p.context().close();
  },
  async board_and_countdowns(browser, base) {
    const p = await open(browser, base);
    await p.evaluate(() => { el.ui.alertPop = null; clearInterval(el._alertTimer); el.render(); });
    check((await text(p.S(".board")))[0]?.includes("none yet"), "empty board");
    await p.S('[data-action="note-new"]').click(); await p.waitForTimeout(200);
    await p.S("#note-text").fill("Soccer moved to 5:00!");
    const who = await p.evaluate(() => el.members[0]?.name);
    await p.S('[data-action="note-by"]').first().click();
    await p.S('[data-action="note-exp"][data-v="tomorrow"]').click();
    await p.S('[data-action="note-color"]').nth(2).click();
    await p.S('[data-action="note-save"]').click(); await p.waitForTimeout(500);
    const msg = await p.evaluate(() => calls.filter((c) => c.type === "skylight/note/add").at(-1));
    eq([msg.text, msg.expires, msg.color, !!msg.by], ["Soccer moved to 5:00!", "tomorrow", "#c8f0d0", true], "note posted");
    const note = (await text(p.S(".note")))[0];
    check(note.includes("Soccer moved to 5:00!") && (!who || note.includes(who)), `note shown: ${note}`);
    p.once("dialog", (d) => d.accept());
    await p.S('[data-action="note-delete"]').click(); await p.waitForTimeout(500);
    eq(await p.S(".note").count(), 0, "note removed");

    // Countdown from the event editor, shown in the Upcoming card
    const day = await p.evaluate(() => { const d = new Date(Date.now() + 23 * 864e5); return d.toISOString().slice(0, 10); });
    await p.evaluate((day) => el.openEventDialog(null, day, 10), day); await p.waitForTimeout(300);
    await p.S("#ev-title").fill("Disney trip");
    await p.S("#ev-countdown").check();
    await p.S('[data-action="save-event"]').click(); await p.waitForTimeout(800);
    const cd = await p.evaluate(() => Object.values(D.countdowns || {})[0]);
    check(cd && cd.summary === "Disney trip" && !cd.all_day, `countdown stored: ${JSON.stringify(cd)}`);
    await p.evaluate(() => { el.ui.tab = "home"; el.render(); });
    const up = (await text(p.S(".upcoming .urow.cd")))[0] || "";
    check(up.includes("Disney trip") && /2[23] days/.test(up), `countdown row: ${up}`);
    eq(p.errors, [], "page errors");
    await p.context().close();
  },
  async address_list(browser, base) {
    // The address suggestions never trap you: tap elsewhere, Enter, or "Use …" keeps what you typed.
    const p = await open(browser, base, { width: 390, height: 760, ctx: { isMobile: true, hasTouch: true } });
    await p.evaluate(() => el.openEventDialog(null, "2026-10-05", 16)); await p.waitForTimeout(300);
    const box = p.S("#loc-sugg");
    await p.S("#ev-loc").fill("Grandma's farm"); await p.waitForTimeout(700);
    check(await box.isVisible(), "suggestions open");
    eq((await text(p.S("#loc-sugg .keep")))[0], "✓ Use “Grandma's farm”Keep what you typed", "offers the typed text");
    await p.S("#ev-title").tap(); await p.waitForTimeout(200);
    check(!(await box.isVisible()), "tapping elsewhere closes the list");
    eq(await p.S("#ev-loc").inputValue(), "Grandma's farm", "typed address kept");
    await p.S("#ev-loc").fill("Grandma's farm road"); await p.waitForTimeout(100);
    await p.S("#ev-title").tap(); await p.waitForTimeout(800);
    check(!(await box.isVisible()), "a search still running doesn't reopen it");
    await p.S("#ev-loc").fill("Chick"); await p.waitForTimeout(700);
    await p.S("#loc-sugg .keep").tap(); await p.waitForTimeout(200);
    check(!(await box.isVisible()) && (await p.S("#ev-loc").inputValue()) === "Chick", "Use keeps it and closes");
    await p.S("#ev-loc").fill("Chick-fil"); await p.waitForTimeout(700);
    await p.S('#loc-sugg [data-action="pick-place"]:not(.keep)').first().tap(); await p.waitForTimeout(200);
    eq(await p.S("#ev-loc").inputValue(), "Chick-fil-A, 123 Main St, Springfield, Missouri, 65806", "picking a suggestion still works");
    await p.S("#ev-loc").fill("Somewhere new"); await p.waitForTimeout(700);
    await p.S("#ev-loc").press("Enter"); await p.waitForTimeout(100);
    check(!(await box.isVisible()), "Enter closes it");
    eq(p.errors, [], "page errors");
    await p.context().close();
  },
  async list_order(browser, base) {
    const p = await open(browser, base);
    await p.tab("lists");
    const names = async () => (await text(p.S(".lists aside .lname"))).map((t) => t.replace(/(\d+|▲▼)$/, "").trim());
    const first = (await names())[0];
    eq(await p.evaluate(() => el.orderedLists()[0].id === el.ui.list), true, "opens on the top list by default");
    await p.S('[data-action="list-arrange"]').click(); await p.waitForTimeout(200);
    await p.S('[data-action="list-move"][data-dir="1"]').first().click(); await p.waitForTimeout(300);
    const after = await names();
    eq(after[1], first, "moved down one");
    eq(await p.evaluate(() => D.settings.list_order.length > 1), true, "order saved for the family");
    await p.S('select[data-key="list_default"]').selectOption("none"); await p.waitForTimeout(300);
    await p.S('[data-action="list-arrange"]').click(); await p.waitForTimeout(200);
    await p.tab("home"); await p.tab("lists");
    eq(await p.S(".lists section h2").textContent(), "Pick a list", "no list opens when set to None");
    const id = await p.evaluate(() => el.orderedLists()[1].id);
    await p.evaluate((id) => { el.settings.list_default = id; }, id);
    await p.tab("home"); await p.tab("lists");
    eq(await p.evaluate(() => el.ui.list), id, "opens the chosen list");
    eq(p.errors, [], "page errors");
    await p.context().close();
  },
  async weather_here(browser, base) {
    const p = await open(browser, base, { ctx: { geolocation: { latitude: 35.1983, longitude: -111.6513 }, permissions: ["geolocation"] } });
    await p.evaluate(() => { el.ui.alertPop = null; clearInterval(el._alertTimer); });
    await p.tab("weather");
    await p.S('[data-action="wx-where"][data-where="here"]').click(); await p.waitForTimeout(800);
    const page = (await text(p.S(".wxtab")))[0] || "";
    check(page.includes("Open-Meteo · 📍 Flagstaff, Arizona") && page.includes("28°"), `weather for here: ${page.slice(0, 300)}`);
    eq(await p.evaluate(() => window.HERECALLS.at(-1).map((v) => Math.round(v))), [35, -112], "sent the screen's location");
    check((await p.S("header .weather").textContent()).includes("28°"), "header shows the weather here");
    const extra = await p.evaluate(() => calls.filter((c) => c.type === "skylight/weather/extra").at(-1));
    check(extra && Math.round(extra.lat) === 35, `extras follow the screen: ${JSON.stringify(extra)}`);
    eq(await p.evaluate(() => localStorage.getItem("skylight.weatherWhere")), "here", "remembered on this screen only");
    await p.S('[data-action="wx-where"][data-where="home"]').click(); await p.waitForTimeout(500);
    check(!(await text(p.S(".wxtab")))[0].includes("Flagstaff"), "back to home weather");
    eq(p.errors, [], "page errors");
    await p.context().close();
  },
  async weather_here_denied(browser, base) {
    // Browser refuses location (no permission, or plain http): must show a message, not loop.
    const p = await open(browser, base);
    await p.evaluate(() => { el.ui.alertPop = null; clearInterval(el._alertTimer); window.GEO = 0;
      const g = navigator.geolocation.getCurrentPosition.bind(navigator.geolocation);
      navigator.geolocation.getCurrentPosition = (ok, fail, o) => { window.GEO++; fail({ code: 1, message: "denied" }); };
      window.RENDERS = 0; const r = el.render.bind(el); el.render = () => { window.RENDERS++; r(); }; });
    await p.tab("weather");
    await p.S('[data-action="wx-where"][data-where="here"]').click(); await p.waitForTimeout(3000);
    const [geo, renders] = await p.evaluate(() => [window.GEO, window.RENDERS]);
    check(geo <= 2 && renders < 20, `asked for location ${geo} times and redrew ${renders} times in 3 s`);
    const msg = (await text(p.S(".empty")))[0] || "";
    check(msg.includes("won't share its location"), `explains the problem: ${msg}`);
    await p.tab("home"); await p.waitForTimeout(1500);
    eq(await p.evaluate(() => window.GEO), geo, "other screens don't keep asking either");
    await p.tab("weather"); await p.S('[data-action="wx-here-retry"]').click(); await p.waitForTimeout(500);
    eq(await p.evaluate(() => window.GEO), geo + 1, "Try again asks once more");
    // The Home Assistant iPhone app doesn't pass location to pages: use where the app reported the phone.
    await p.evaluate(() => {
      window.hass.user = { ...(window.hass.user || {}), id: "u-alex", is_admin: true };
      window.hass.states["person.alex"] = { entity_id: "person.alex", state: "not_home",
        attributes: { friendly_name: "Alex", user_id: "u-alex", latitude: 35.1983, longitude: -111.6513 } };
      el.hass = window.hass;
    });
    await p.S('[data-action="wx-here-retry"]').click(); await p.waitForTimeout(800);
    const page = (await text(p.S(".wxtab")))[0] || "";
    check(page.includes("Flagstaff") && page.includes("your phone's location in Home Assistant"), `falls back to the phone's location: ${page.slice(-200)}`);
    eq(await p.evaluate(() => window.HERECALLS.at(-1).map((v) => Math.round(v))), [35, -112], "used the person's location");
    eq(p.errors, [], "page errors");
    await p.context().close();
  },
  async hardening(browser, base) {
    // Odd calendar data and hostile text must never hide a calendar or run as HTML.
    const p = await open(browser, base, { at: "2026-10-31T20:00:00", ctx: { timezoneId: "America/Denver" } });
    const BAD = `<img src=x onerror="window.XSS=1">`;
    await p.evaluate((BAD) => {
      window.EVS["calendar.family"].push(
        { summary: "No end", start: { dateTime: "2026-10-31T21:00:00-06:00" }, uid: "ne" },
        { summary: "No start", end: { dateTime: "2026-10-31T22:00:00-06:00" }, uid: "ns" },
        { summary: "Garbage", start: { dateTime: "garbage" }, end: { dateTime: "garbage" }, uid: "gb" },
        { summary: "Early run", start: { dateTime: "2026-11-01T07:00:00-07:00" }, end: { dateTime: "2026-11-01T08:00:00-07:00" }, uid: "er" });
      D.members[0].avatar = BAD; D.members[0].color = "red\"onclick=\"window.XSS=1";
      D.chores[0].icon = BAD; D.settings.family_color = BAD;
      push(); el._eventsKey = ""; el._loadEvents();
    }, BAD);
    await wait(p, 1500);
    const vis = await p.evaluate(() => el.visibleEvents().map((e) => e.summary));
    check(vis.includes("Vacation") && vis.includes("No end") && !vis.includes("No start") && !vis.includes("Garbage"), `odd events handled, calendar still shown: ${JSON.stringify(vis.filter((s) => /Vacation|No |Garbage/.test(s)))}`);
    check(await p.evaluate(() => el.visibleEvents().find((e) => e.uid === "ne").end - el.visibleEvents().find((e) => e.uid === "ne").start === 3600000), "an event with no end lasts an hour");
    // The morning after clocks go back, 7:00 is drawn at 7, not 8.
    await p.evaluate(() => { el.ui.tab = "calendar"; el.ui.view = "day"; el.ui.anchor = new Date(2026, 10, 1); el.render(); });
    const top = await p.evaluate(() => [...el.shadowRoot.querySelectorAll(".tg-ev")].find((x) => x.textContent.includes("Early run"))?.style.top);
    eq(top, "calc(var(--h) * 7.000)", "event position on the day clocks change");
    for (const t of ["home", "chores", "settings"]) { await p.evaluate((t) => { el.ui.tab = t; el.render(); }, t); await wait(p, 100); }
    eq(await p.evaluate(() => window.XSS), undefined, "avatar/icon/color text never runs");
    eq(await p.evaluate(() => [el.members[0].avatar, el.members[0].color, el.settings.family_color]), ["img src=", "#4a7dff", "#ff9f43"], "display tokens cleaned on arrival");
    eq(p.errors, [], "page errors");
    await p.context().close();
  },
  async forecast_once(browser, base) {
    // A weather source without twice_daily is asked once, not on every refresh (it logs an error in HA each time).
    const p = await open(browser, base);
    await p.evaluate(() => {
      window.ASKED = []; const orig = window.hass.callWS;
      window.hass.callWS = async (m) => {
        if (m.type === "call_service" && m.domain === "weather") {
          window.ASKED.push(m.service_data.type);
          if (m.service_data.type === "twice_daily") throw new Error("Weather entity 'weather.home' does not support 'twice_daily' forecast");
          const d = new Date(); d.setHours(12, 0, 0, 0);
          return { response: { [m.target.entity_id]: { forecast: [{ datetime: d.toISOString(), condition: "sunny", temperature: 70, templow: 50 }] } } };
        }
        return orig(m);
      };
      el.wx = null; el._noForecast = null;
    });
    for (let i = 0; i < 3; i++) { await p.evaluate(() => { el._loadWeatherFull(true); el._loadForecast(); }); await p.waitForTimeout(300); }
    const asked = await p.evaluate(() => window.ASKED.filter((t) => t === "twice_daily").length);
    eq(asked, 1, "twice_daily asked once");
    check((await p.evaluate(() => window.ASKED.filter((t) => t === "daily").length)) >= 3, "daily still refreshed");
    eq(p.errors, [], "page errors");
    await p.context().close();
  },
  async night_level_slider(browser, base) {
    // One "how dark at night" slider: with a backlight entity the first half only turns the backlight down,
    // the second half darkens the picture on top; without one the picture alone darkens.
    const p = await open(browser, base, { at: "2026-10-17T23:00:00" });
    const op = () => p.evaluate(() => { const d = el.shadowRoot.getElementById("dim"); return [d.classList.contains("on"), d.style.opacity]; });
    const lv = (o) => p.evaluate((o) => { Object.assign(el.settings, o); el._applyLook(); return window.__h.nightLevels(el.settings); }, o);
    await p.evaluate(() => import("/src/helpers.js").then((h) => { window.__h = h; }));
    await p.evaluate(() => { Object.assign(el.settings, { night_dim: true, night_start: "21:00", night_end: "06:30" }); });
    eq(await lv({ brightness_entity: "number.kitchen_brightness", night_level: 40 }), { backlight: 20, overlay: 0 }, "40%: backlight 20, no overlay");
    eq(await op(), [false, ""], "no overlay in the page");
    eq(await lv({ night_level: 50 }), { backlight: 0, overlay: 0 }, "50%: backlight at 0, still no overlay");
    eq(await lv({ night_level: 80 }), { backlight: 0, overlay: 51 }, "80%: backlight 0 + picture 51%");
    eq(await op(), [true, "0.51"], "overlay in the page matches");
    eq(await lv({ night_level: 100 }), { backlight: 0, overlay: 85 }, "100%: never fully black");
    eq(await lv({ brightness_entity: null, night_level: 94 }), { backlight: null, overlay: 80 }, "no entity: picture only");
    eq(await op(), [true, "0.8"], "overlay-only in the page");
    // Daytime, but the room is empty: dims; someone walks in: back to normal on the next state update.
    await p.evaluate(() => { el.settings.idle_entity = "input_boolean.kitchen_occupied"; window.hass.states["input_boolean.kitchen_occupied"] = { state: "off" }; el.settings.night_start = "23:30"; el.settings.night_end = "23:45"; el.hass = { ...window.hass }; });
    eq(await op(), [true, "0.8"], "empty room in the daytime dims");
    await p.evaluate(() => { window.hass.states["input_boolean.kitchen_occupied"] = { state: "on" }; el.hass = { ...window.hass }; });
    eq(await op(), [false, ""], "someone's there: normal again");
    eq(p.errors, [], "page errors");
    await p.context().close();

    // Phones and tablets keep their own brightness: no overlay at night unless this screen is switched on in Setup.
    const ph = await open(browser, base, { at: "2026-10-17T23:00:00", width: 390, height: 844,
      ctx: { isMobile: true, hasTouch: true, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Home Assistant/2025.9" } });
    const pop = () => ph.evaluate(() => { const d = el.shadowRoot.getElementById("dim"); return [d.classList.contains("on"), d.style.opacity]; });
    await ph.evaluate(() => { Object.assign(el.settings, { night_dim: true, night_start: "21:00", night_end: "06:30", night_level: 94, brightness_entity: null }); el._applyLook(); });
    eq(await pop(), [false, ""], "phone: no night overlay by default");
    await ph.tab("settings");
    await ph.S('select[data-change="screen-dim"]').selectOption("1"); await wait(ph, 200);
    eq(await pop(), [true, "0.8"], "phone: dims once this screen is switched on");
    await ph.S('select[data-change="screen-dim"]').selectOption("0"); await wait(ph, 200);
    eq(await pop(), [false, ""], "phone: and back off");
    eq(ph.errors, [], "page errors (phone)");
    await ph.context().close();
  },
  async settings_every_section(browser, base) {
    // Setup must draw with every optional section switched on (night dim with and without an entity, etc.).
    const p = await open(browser, base);
    const combos = [
      { night_dim: true, brightness_entity: null }, { night_dim: true, brightness_entity: "number.kitchen_brightness", night_level: 80, night_by: "sun" },
      { night_dim: true, night_by: "schedule" }, { seasonal: true, weather_alerts: true, weather_extra: true, mlb_team: 109, leave_by: true, message_board: true },
      { allow_uploads: false, hide_chrome: true, photo_source: "immich" },
      { screen_off: true, screen_off_entity: "light.touchkio_display" }, { screen_off: true, screen_off_entity: null },
      { night_dim: true, idle_entity: "input_boolean.kitchen_occupied" },
    ];
    for (const c of combos) {
      await p.evaluate((c) => { Object.assign(el.settings, c); el.ui.tab = "settings"; el.render(); }, c);
      await p.waitForTimeout(100);
      const crashed = await p.evaluate(() => !!el._renderError);
      check(!crashed, `Setup drew with ${JSON.stringify(c)}: ${await p.evaluate(() => String(el._renderError?.message || ""))}`);
    }
    eq(p.errors, [], "page errors");
    await p.context().close();
  },
  async auto_reload_on_update(browser, base) {
    // When Home Assistant reports a newer version than the page, the screen reloads itself, once.
    const p = await open(browser, base);
    await p.evaluate(() => { window.RELOADS = 0; el._reloadPage = () => { window.RELOADS++; }; sessionStorage.removeItem("skylight.reloadedFor"); });
    await p.evaluate(() => { D.version = "99.0.0"; push(); }); await p.waitForTimeout(200);
    eq(await p.evaluate(() => window.RELOADS), 1, "reloaded for the new version");
    await p.evaluate(() => { push(); }); await p.waitForTimeout(200);
    eq(await p.evaluate(() => window.RELOADS), 1, "not again for the same version (no reload loop if the files didn't change)");
    await p.evaluate(() => { sessionStorage.removeItem("skylight.reloadedFor"); el.openEventDialog(null, "2026-10-05", 10); D.version = "99.0.1"; push(); }); await p.waitForTimeout(200);
    eq(await p.evaluate(() => window.RELOADS), 1, "waits while someone is in a dialog");
    await p.evaluate(() => { el.closeDialog(); D.version = "99.0.1"; push(); }); await p.waitForTimeout(200);
    eq(await p.evaluate(() => window.RELOADS), 2, "reloads once the dialog is closed");
    eq(p.errors, [], "page errors");
    await p.context().close();
  },
  async kiosk_no_autofocus(browser, base) {
    // A desktop kiosk with a touch monitor reports a fine pointer but has touch points: no auto-focus
    // (which would pop the on-screen keyboard and select the title) and the touch time picker.
    const p = await open(browser, base, { width: 1920, height: 1080 });
    await p.evaluate(() => { // what Chromium reports on a Pi desktop with a touch monitor
      const orig = window.matchMedia.bind(window);
      window.matchMedia = (q) => (/pointer:\s*coarse/.test(q) ? { matches: false, addEventListener() {} } : orig(q));
      Object.defineProperty(navigator, "maxTouchPoints", { value: 10, configurable: true });
    });
    await p.evaluate(() => el.openEventDialog(null, "2026-10-05", 16)); await p.waitForTimeout(300);
    eq(await p.evaluate(() => el.shadowRoot.activeElement?.id || null), null, "nothing focused on open (new event)");
    await p.evaluate(() => { el.closeDialog(); const ev = el.visibleEvents()[0]; el.openEventDialog(ev); }); await p.waitForTimeout(300);
    eq(await p.evaluate(() => el.shadowRoot.activeElement?.id || null), null, "nothing focused on open (existing event)");
    eq(await p.evaluate(() => el.shadowRoot.getElementById("ev-start")?.readOnly), true, "touch time picker in use");
    eq(p.errors, [], "page errors");
    await p.context().close();
  },
  async today_chores_fit(browser, base) {
    // Today screen at the kitchen screen's size (1080p at zoom 1.25): up to 5 calendar days, the family cards span
    // the side column and the kids' chores, lists and tonight's dinner flow in columns under them, all on screen.
    const p = await open(browser, base, { width: 1536, height: 864 });
    await p.evaluate(() => { el.ui.alertPop = null; clearInterval(el._alertTimer);
      const d = new Date(Date.now() + 12 * 864e5); D.occasions = [{ id: "o1", title: "Matt's birthday", type: "birthday", month: d.getMonth() + 1, day: d.getDate() }]; push(); });
    await p.waitForTimeout(300);
    const layout = () => p.evaluate(() => {
      const body = el.shadowRoot.querySelector(".hbody").getBoundingClientRect(), info = el.shadowRoot.querySelector(".hinfo").getBoundingClientRect();
      return { fullWidth: Math.abs(info.width - body.width) < 2, bottom: Math.round(el.shadowRoot.querySelector(".hside").getBoundingClientRect().bottom), infoBottom: Math.round(info.bottom),
        cards: [...el.shadowRoot.querySelectorAll(".hchores, .hcols .tonight")].map((c) => { const r = c.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.bottom)]; }),
        chores: [...el.shadowRoot.querySelectorAll(".hchores")].map((c) => { const r = c.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.bottom)]; }) };
    });
    for (const v of ["agenda", "1", "3", "5"]) {
      await p.evaluate((v) => { el.homeAgenda = v === "agenda"; if (v !== "agenda") el.homeDays = Number(v); el.render(); }, v); await p.waitForTimeout(300);
      const l = await layout();
      eq(l.cards.length, 4, `${v}: three kids' chores plus tonight's dinner in the columns`);
      check(await p.evaluate(() => { const u = el.shadowRoot.querySelector(".hinfo .upcoming"), b = el.shadowRoot.querySelector(".hbody"); return u && u.getBoundingClientRect().width < b.getBoundingClientRect().width * 0.55; }), `${v}: upcoming dates card is up top, one column wide`);
      check(l.fullWidth, `${v}: tips, messages and verse span the whole side column`);
      check(new Set(l.cards.map(([left]) => left)).size >= 2, `${v}: cards flow into 2+ columns (${JSON.stringify(l)})`);
      check(l.cards.every(([, top]) => top >= l.infoBottom), `${v}: columns start under the family cards`);
      check(l.chores.every(([, , bottom]) => bottom <= l.bottom), `${v}: every kid's chores fully on screen (${JSON.stringify(l)})`);
    }
    // A grown-up's to-do list on Today sits below every kid's chores, whichever column it lands in.
    await p.evaluate(() => { D.members[0].today = "list"; D.members[0].today_list = "groceries"; D.lists[0].items = [...Array(8)].map((_, i) => ({ id: `g${i}`, text: `Item ${i}`, done: false })); push(); });
    await p.evaluate(() => { el.homeAgenda = false; el.homeDays = 5; el.render(); }); await p.waitForTimeout(400);
    const order = await p.evaluate(() => ({ chores: [...el.shadowRoot.querySelectorAll(".hchores:not(.hlist)")].map((c) => Math.round(c.getBoundingClientRect().bottom)),
      lists: [...el.shadowRoot.querySelectorAll(".hchores.hlist")].map((c) => Math.round(c.getBoundingClientRect().top)) }));
    eq(order.lists.length, 1, "the list card is shown");
    check(Math.max(...order.chores) <= Math.min(...order.lists), `chores above the list (${JSON.stringify(order)})`);
    await p.evaluate(() => { D.members[0].today = undefined; push(); });
    await p.evaluate(() => { el.homeAgenda = false; el.homeDays = 7; el.render(); }); await p.waitForTimeout(300);
    const l7 = await layout();
    eq(new Set(l7.cards.map(([left]) => left)).size, 1, "7 days: one narrow column");
    eq(await p.S(".hinfo .tonight").count(), 1, "7 days: tonight's dinner stays with the family cards");
    check((await text(p.S(".board")))[0]?.includes("none yet"), "empty message board is one line");
    eq(p.errors, [], "page errors");
    await p.context().close();
  },

  async reminder_stops_saver(browser, base) {
    // A reminder going off clears the photo screensaver and keeps it off until someone taps OK.
    const p = await open(browser, base, { at: "2026-10-17T12:00:00" }); // daytime: night hours are the exception below
    await p.evaluate(() => { el.ui.alertPop = null; clearInterval(el._alertTimer); el.render(); });
    await p.evaluate(async () => { await el.startSaver(); }); await wait(p, 300);
    eq(await p.evaluate(() => el.ui.saver), true, "screensaver running");
    await p.evaluate(() => window.remCb({ summary: "Dentist", message: "Today at 4:00 PM", members: [] })); await wait(p, 400);
    eq(await p.evaluate(() => el.ui.saver), false, "reminder stopped the screensaver");
    eq(await p.S(".saver").count(), 0, "screensaver element gone");
    check((await p.S(".remcard").textContent()).includes("Dentist"), "reminder pop-up visible");
    // nobody touches the screen for longer than the screensaver delay: it must stay off over the reminder
    await p.evaluate(() => { el._lastActivity = Date.now() - 60 * 60000; el._checkIdle(); }); await wait(p, 400);
    eq(await p.evaluate(() => el.ui.saver), false, "screensaver stays off while the reminder waits for OK");
    await p.evaluate(async () => { await el.startSaver(); }); await wait(p, 300);
    eq(await p.evaluate(() => el.ui.saver), false, "even a direct start is refused");
    await p.S('[data-action="reminder-dismiss"]').click(); await wait(p, 200);
    eq(await p.evaluate(() => [el.ui.reminderPop?.length || 0, el.ui.alertPop, !!el.ui.dialog]), [0, null, false], "nothing left waiting for OK");
    await p.evaluate(async () => { await el.startSaver(); }); await wait(p, 400); // (the fake has no photo source for _checkIdle)
    eq(await p.evaluate(() => el.ui.saver), true, "after OK, the screensaver can come back");
    await p.evaluate(() => el.stopSaver());

    // The event is over: the pop-up closes by itself
    await p.evaluate(() => window.remCb({ summary: "Piano", message: "Today at 3:00 PM", members: [], end: new Date(Date.now() + 1500).toISOString() }));
    await wait(p, 300);
    eq(await p.S(".remcard").count(), 1, "pop-up for an event that is still on");
    await p.evaluate(() => el._expireReminders()); eq(await p.S(".remcard").count(), 1, "not closed early");
    await wait(p, 1500); await p.evaluate(() => el._expireReminders()); await wait(p, 200);
    eq(await p.S(".remcard").count(), 0, "closed by itself once the event ended");
    await p.evaluate(async () => { await el.startSaver(); }); await wait(p, 300);
    eq(await p.evaluate(() => el.ui.saver), true, "and the screensaver is allowed again");
    eq(p.errors, [], "page errors");
    await p.context().close();

    // Night hours are the exception: the screensaver may come back over a waiting pop-up, and in the morning
    // the pop-up is shown again.
    const n = await open(browser, base, { at: "2026-10-17T23:00:00" });
    await n.evaluate(() => { el.ui.alertPop = null; clearInterval(el._alertTimer); Object.assign(el.settings, { night_start: "21:00", night_end: "06:30" }); el._applyLook(); el.render(); });
    await n.evaluate(() => window.remCb({ summary: "Trash out", message: "Tomorrow (all day)", members: [], end: "2026-10-19T00:00:00" })); await wait(n, 300);
    eq(await n.evaluate(() => [el.ui.saver, el.popupShowing, el._night]), [false, true, true], "night: reminder shown, screensaver stopped");
    await n.evaluate(async () => { await el.startSaver(); }); await wait(n, 300);
    eq(await n.evaluate(() => el.ui.saver), true, "night: the screensaver may come back over the pop-up");
    await n.clock.setFixedTime(new Date("2026-10-18T06:31:00")); await n.evaluate(() => el._applyLook()); await wait(n, 300);
    eq(await n.evaluate(() => [el.ui.saver, el.ui.reminderPop.length]), [false, 1], "morning: screensaver off, the reminder is back in view");
    eq(n.errors, [], "page errors (night)");
    await n.context().close();
  },

  async jump_to_date(browser, base) {
    // Meals and calendar: 📅 opens a date picker; picking a far-off date goes straight to that week.
    for (const [w, h] of [[1300, 912], [390, 844]]) {
      const p = await open(browser, base, { width: w, height: h, ctx: w < 1000 ? { isMobile: true, hasTouch: true } : {} });
      await p.tab("meals"); await p.waitForTimeout(300);
      eq(await p.S('[data-action="jump"]').count(), 1, `${w}: jump button on meals`);
      const year = new Date().getFullYear() + 1;
      await p.S("#jump-date").evaluate((i, y) => { i.value = `${y}-12-25`; i.dispatchEvent(new Event("change", { bubbles: true })); }, year);
      await p.waitForTimeout(600);
      const head = (await text(p.S(".nav h1")))[0] || "";
      check(head.includes("Dec") && head.includes(String(year)), `${w}: meals header shows the week of Christmas: ${head}`);
      const wk = await p.evaluate(() => calls.filter((c) => c.type === "skylight/mealie/week").at(-1));
      check(wk && wk.start <= `${year}-12-25` && wk.end >= `${year}-12-25`, `${w}: Mealie asked for that week: ${JSON.stringify(wk)}`);
      await p.S('[data-action="today"]').click(); await p.waitForTimeout(300);
      check(!((await text(p.S(".nav h1")))[0] || "").includes(String(year)), `${w}: back to this week`);
      if (w >= 1000) {
        await p.tab("calendar"); await p.waitForTimeout(300);
        await p.S("#jump-date").evaluate((i, y) => { i.value = `${y}-07-04`; i.dispatchEvent(new Event("change", { bubbles: true })); }, year);
        await p.waitForTimeout(600);
        eq(await p.evaluate(() => el.ui.anchor.getMonth()), 6, "calendar moved to July");
      }
      eq(p.errors, [], "page errors");
      await p.context().close();
    }
  },

  async rrule_until_forms(browser, base) {
    // "Repeats until a date": Google wants UNTIL as the end of that day in UTC, Local Calendar the local form,
    // all-day events a plain date; the plain-English text shows the right local day for the UTC form.
    const p = await open(browser, base, { ctx: { timezoneId: "America/New_York" } });
    await p.evaluate(() => { window.hass.entities = { "calendar.family": { platform: "google" }, "calendar.alex": { platform: "local_calendar" } }; el.hass = { ...window.hass }; });
    const r = { freq: "DAILY", interval: 1, days: new Set(), end: "until", until: "2026-12-20", count: 10 };
    eq(await p.evaluate((r) => el._buildRrule({ ...r, days: new Set() }, false, "calendar.family"), r), "FREQ=DAILY;UNTIL=20261221T045959Z", "Google, timed: end of Dec 20 Eastern in UTC");
    eq(await p.evaluate((r) => el._buildRrule({ ...r, days: new Set() }, false, "calendar.alex"), r), "FREQ=DAILY;UNTIL=20261220T235959", "Local Calendar, timed: local form");
    eq(await p.evaluate((r) => el._buildRrule({ ...r, days: new Set() }, true, "calendar.family"), r), "FREQ=DAILY;UNTIL=20261220", "all-day: plain date");
    eq(await p.evaluate((r) => el._buildRrule({ ...r, days: new Set() }, false, "calendar.unknown"), r), "FREQ=DAILY;UNTIL=20261221T045959Z", "unknown calendar: the RFC 5545 form");
    eq(await p.evaluate(() => el._rruleText("FREQ=DAILY;UNTIL=20261221T045959Z")), "every day, until Dec 20, 2026", "UTC until shown as the local day");
    eq(await p.evaluate(() => el._rruleText("FREQ=WEEKLY;BYDAY=TU,TH;UNTIL=20261220")), "every week on Tue, Thu, until Dec 20, 2026", "date until unchanged");
    eq(p.errors, [], "page errors");
    await p.context().close();
  },

  async verse_of_day(browser, base) {
    // Today card, screensaver line, and the Setup section (key, translation, family verses).
    const p = await open(browser, base);
    await p.evaluate(() => { el.ui.alertPop = null; clearInterval(el._alertTimer); el.render(); });
    await p.waitForTimeout(400);
    const hv = (await text(p.S("header .hverse")))[0] || "";
    check(hv.includes("Be strong and courageous") && hv.includes("Joshua 1:9") && hv.includes("ESV"), `verse in the header under the date: ${hv}`);
    eq(await p.S(".verse").count(), 0, "no card while it's in the header");
    await p.evaluate(() => { D.settings.verse_place = "card"; push(); }); await p.waitForTimeout(300);
    const card = (await text(p.S(".verse")))[0] || "";
    check(card.includes("Be strong and courageous") && card.includes("Joshua 1:9") && card.includes("ESV"), `verse card: ${card}`);
    eq(await p.S("header .hverse").count(), 0, "no header verse while it's a card");
    await p.evaluate(() => { D.settings.verse_place = "header"; push(); }); await p.waitForTimeout(300);
    eq(await p.evaluate(() => window.VERSECALLS), 1, "fetched once");
    await p.evaluate(() => el._tickClock()); await p.waitForTimeout(200);
    eq(await p.evaluate(() => window.VERSECALLS), 1, "not fetched again the same day");
    // screensaver: the verse sits under the clock, with the photo's caption still at the bottom
    await p.evaluate(async () => { await el.startSaver(); }); await p.waitForTimeout(400);
    const sv = (await text(p.S("#sv-verse")))[0] || "";
    check(sv.includes("Be strong and courageous") && sv.includes("Joshua 1:9 (ESV)"), `saver verse: ${sv}`);
    await p.evaluate(() => el.stopSaver());
    // Setup: save a key (never echoed back), pick a translation, type family verses
    await p.tab("settings"); await p.waitForTimeout(300);
    await p.S("#esv-key").fill("esv-secret-123");
    await p.S('[data-action="esv-save"]').click(); await p.waitForTimeout(400);
    const cfg = await p.evaluate(() => calls.filter((c) => c.type === "skylight/verse/configure").at(-1));
    eq(cfg?.esv_key, "esv-secret-123", "key sent to the server");
    check((await p.S("#esv-key").getAttribute("placeholder")).includes("saved"), "key shown as saved");
    check(!(await p.content()).includes("esv-secret-123"), "key not echoed into the page");
    await p.S('select[data-key="verse_translation"]').selectOption("net"); await p.waitForTimeout(400);
    eq(await p.evaluate(() => D.settings.verse_translation), "net", "translation saved");
    await p.S("#family-verses").fill("Joshua 24:15\n\nPhilippians 4:13 ");
    await p.S("#family-verses").dispatchEvent("change"); await p.waitForTimeout(400);
    eq(await p.evaluate(() => D.settings.family_verses), ["Joshua 24:15", "Philippians 4:13"], "family verses saved as a list");
    check(await p.evaluate(() => window.VERSECALLS) >= 3, "verse fetched again after Setup changes");
    // off on Today: the card goes away
    await p.S('select[data-change="verse-today"]').selectOption("off"); await p.waitForTimeout(300);
    await p.evaluate(() => { el.ui.tab = "home"; el.render(); });
    eq(await p.S(".verse, header .hverse").count(), 0, "verse hidden when off");
    eq(p.errors, [], "page errors");
    await p.context().close();
  },

  async feels_like_computed(browser, base) {
    // A source with no apparent temperature: "feels like" is worked out from temperature, humidity and wind.
    const p = await open(browser, base);
    await p.evaluate(() => {
      window.hass.states["weather.home"].attributes = { ...window.hass.states["weather.home"].attributes, temperature: 90, humidity: 70, wind_speed: 5, temperature_unit: "°F", wind_speed_unit: "mph" };
      delete window.hass.states["weather.home"].attributes.apparent_temperature;
      const orig = window.hass.callWS;
      window.hass.callWS = async (m) => {
        if (m.type === "call_service" && m.domain === "weather" && m.service_data.type === "hourly") {
          return { response: { "weather.home": { forecast: [...Array(12)].map((_, k) => ({ datetime: new Date(Date.now() + k * 36e5).toISOString(), condition: "sunny", temperature: 20 + k, humidity: 50, wind_speed: 20 })) } } };
        }
        return orig(m);
      };
      el.hass = { ...window.hass }; el.wx = null; el._noForecast = null;
    });
    await p.tab("weather");
    await p.evaluate(() => el._loadWeatherFull(true)); await p.waitForTimeout(800);
    const feels = (await text(p.S(".wnow .hint")))[0] || "";
    check(/Feels like 10[5-7]°/.test(feels), `heat index for 90°F / 70% (NWS table says 106): ${feels}`);
    eq(await p.S(".whourly svg polyline.wfeels").count(), 1, "computed wind chill drawn on the hourly chart");
    const row = (await text(p.S(".wtable tr"))).find((r) => r.startsWith("Feels like")) || "";
    check(/Feels like\s*4°/.test(row.replace(/−/g, "-")), `wind chill for 20°F at 20 mph (NWS table says 4): ${row.slice(0, 40)}`);
    eq(p.errors, [], "page errors");
    await p.context().close();
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
