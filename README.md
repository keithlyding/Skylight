# Lyding Strike for Home Assistant

[![Validate](https://github.com/keithlyding/Skylight/actions/workflows/validate.yml/badge.svg)](https://github.com/keithlyding/Skylight/actions/workflows/validate.yml) [![HACS Custom](https://img.shields.io/badge/HACS-Custom-41BDF5.svg)](https://hacs.xyz/)

A family display for Home Assistant in the style of a Skylight Calendar, built for a wall-mounted Android tablet. It's called **Lyding Strike** by default; rename it under Setup → Display → *Name* (the sidebar, the integration and the to-do list names follow).
**Everything is set up from the touchscreen**: family members, calendars, events, chores,
meals, lists, photos and display settings. No YAML editing.

## What you get

A **Lyding Strike** entry in the Home Assistant sidebar that opens a full-screen app. Seven tabs (Today, Weather, Calendar, Chores, Meals, Lists, Setup) keep the buttons big; Progress and Photos live inside Chores and Setup:

| Tab | What it does |
|---|---|
| **Today** | Overview: Agenda or a 1, 3, 5 or 7-day time-block calendar (remembered per device) with weather; plain-language weather tips; tonight's dinner (tap to cook); **Upcoming** birthdays and anniversaries; each kid's and Household chores for today (tap to check off) and adults' to-do lists. Opens by default. |
| **Weather** | Current conditions, 24-hour temperature chart with rain bars, multi-day forecast with high/low ranges, sunrise/sunset, moon phase, a live radar map (Windy or RainViewer), optional air-quality / pollen / UV sensors, and official **US National Weather Service alerts** (cards on the Weather tab plus a banner on every screen). Tap a forecast day for the written day/night forecast. Uses the weather integration chosen in Setup; the **NWS** integration is recommended in the US for rain chances and forecast text. |
| **Weather extras** | **Today's tips** in plain language on the Today screen and Weather tab (umbrella for an outdoor event, jacket this morning, freeze tonight, gusty, high UV, poor air, high pollen, much colder than yesterday). **Rain in the next 2 hours** in 15-minute steps ("Rain starting in about 30 min"). **Alert pop-ups**: a new NWS warning covers the screen (and wakes the photo screensaver) with an optional chime until someone taps OK. **Radar layers** (radar, rain forecast, storms, wind, gusts, temperature, clouds, satellite), **air quality** (US AQI with a 24-hour outlook), **pollen**, **comparisons** (yesterday, this day last year, rain over the last 7/30 days) and a **moon** card with the next phases. Rain-soon, air quality and comparisons come from Open-Meteo (free, no key). US pollen uses the Google Pollen API with the Google key from Location lookup. **Choose alert types** under Setup → Display (tornado, thunderstorm, flooding, winter, heat, …): turned-off types don't pop up or show in the banner, so a day of flood watches doesn't train everyone to ignore alerts; the Weather tab still lists every alert. |
| **Calendar** | Agenda, Day, 3, 5 and 7-day (a Google/Outlook-style time grid fitted to 7 AM–8 PM, like the Today screen), and Month views, color-coded per person. Tap a name to filter. Tap a day or **+ Event** to add an event, and tap an event to edit or delete it. For a repeating event you choose **This event / This and following events / All events**. Daily weather is shown. Finished events are **dimmed** in every view; the event happening now is highlighted, and the Agenda shows a **progress bar with the time left** for it and **"in 2 h 15 min"** for events later today (updated every minute). |
| **Chores** | One column per **kid** and **Household** profile with today's progress ring and **this week's completion %**. Tap a chore to check it off. Chores repeat daily, on certain weekdays (every 1 to 52 weeks), once a week on any day, **monthly on chosen dates** (e.g. the 1st and 15th, or the last day; every 1, 2, 3, 4, 6 or 12 months), or once. Weekday and monthly chores can **keep showing until done**: a missed one stays on the list, marked "since Oct 1", until it's checked off. You can page back and forth by day. |
| **Progress** (📊 button on the Chores screen) | Read-only: one row per kid with chores, showing the share of chores done in each of the last 4 weeks as small bars. Below that, a **maintenance log** for each Household profile: every task with its schedule, whether it's overdue or when it's next due, when it was last done (**date, time and who** checked it off) and its full history. Times and names are recorded from v1.40; earlier check-offs show the date only. |
| **Meals** | A weekly grid synced two-way with **Mealie**: add recipes, pick a random one, and send ingredients to a shopping list. **📖 Recipes** browses your whole Mealie library, and **cook mode** shows a recipe full screen with scalable servings and a QR code for your phone. Other meal apps can be shown read-only through their calendar feed. |
| **Lists** | Your own lists, plus any Home Assistant to-do list (Mealie shopping lists, HA Shopping list) kept in sync. Lists are grouped as **Shared** and then by adult (e.g. a honey-do list), each with that person's color and avatar. Reorder items by dragging the **≡** handle (finger or mouse); items slide into place, and checked-off items slide to the bottom in the order they were checked. |
| **Photos** (a section in Setup) | Show **Immich** albums and/or favorites, or upload from the tablet or your phone. After a set idle time the photos play full screen with a clock, like a Skylight frame's photo mode. |
| **Setup** | Add, edit and reorder family members (name, **Adult/Kid/Household**, color, avatar, their calendars). Create new calendars, subscribe to calendar links, choose shared family and meal calendars, connect Immich, birthdays & anniversaries, theme and night mode, and set the weather source, week start, 24-hour clock and screensaver timing. Protected by an optional **setup PIN** (see below). |

Every screen showing the panel (tablet, phones, PC) stays in sync live.

**On a phone** (e.g. the Home Assistant app on an iPhone, open ☰ → Lyding Strike) the layout adapts automatically, upright or on its side, and keeps clear of the notch and the home-indicator bar. Held upright (below 600px wide) the clock is left out (the phone shows it) and you get a bottom tab bar, a scrollable row of family chips, calendar views up to 3 days (5/7-day choices are kept for bigger screens), Agenda by default on the Today screen, meals as one card per day, 2-column recipes, and dialogs as bottom sheets. Turned sideways, a slim menu sits on the left with a compact header, 3-day calendars and the same day-by-day meals. Tablets and PCs are unchanged.

## Install

### Option A: HACS (recommended)
1. HACS → ⋮ → **Custom repositories** → add `https://github.com/keithlyding/Skylight`, category **Integration**.
2. Install **Lyding Strike**, then restart Home Assistant.

### Option B: manual
Copy `custom_components/skylight` into your Home Assistant `config/custom_components/` folder and restart.

### Then
**Settings → Devices & Services → Add Integration → "Lyding Strike"**. A **Lyding Strike** item appears in the sidebar. Open it, go to **Setup**, and add your family.

Requires Home Assistant **2024.7 or newer**. The automated tests run against 2026.2.

## Calendars

- **Create calendar** in Lyding Strike Setup creates a Home Assistant *Local Calendar* stored on your HA server. This works from the kiosk tablet without an admin account.
- **Google / iCloud / Outlook**: an admin adds the matching integration once (Google Calendar, CalDAV, or a remote-calendar integration) under Settings → Devices & Services. Those calendars then show up in Lyding Strike's member and family calendar pickers. Whether you can *add* events to them from the tablet depends on that integration: Local and Google calendars support it, while read-only feeds such as ICS URLs do not.
- **Subscribe to a calendar link** (iCal / webcal) from Lyding Strike Setup for school, sports or Plan to Eat. This uses HA's *Remote Calendar* integration (HA 2025.4+), and the calendar is read-only.
- A calendar assigned to a person uses that person's color. Calendars ticked as **Shared family calendars** use the family color.

## Meal planning with Mealie (recommended)

On the Meals and Calendar tabs, **📅** next to ‹ › opens a date picker, so a week months away (Christmas dinner, a trip) is one tap away instead of a week at a time; **This week** / **Today** brings you back.

Lyding Strike uses Home Assistant's built-in **Mealie** integration, so the tablet reads and writes your Mealie meal plan.

**One-time setup (admin):**
1. In Mealie: click your avatar, then **API Tokens**, create a token and copy it.
2. In Home Assistant: **Settings → Devices & Services → Add Integration → Mealie**. Enter the Mealie URL as *Home Assistant* reaches it; with Docker that's the port you published, often `http://<server-ip>:9925` (Mealie listens on 9000 inside its container), not `localhost`. Paste the token.
3. Reload the Lyding Strike page. Setup → **Mealie** should show ✅ Connected.
4. Optional: in the same section, tick the **Mealie shopping list** (and HA's own Shopping list) to show them in the Lists tab.

**On the tablet:**
- The **Meals** tab shows the week from Mealie, with recipe photos.
- Tap a slot to search your recipes and tap one to add it. You can also use 🎲 for a random recipe, add a note ("Leftovers"), or import a recipe from a website.
- Tap a planned recipe to see its **ingredients and steps**, then tick ingredients and send them to a shopping list.
- Tap ✕ to remove a meal from the plan.

**Recipes and cook mode:**
- **Meals → 📖 Recipes** browses your whole Mealie library: search, categories, tags, and sort by name, newest or rating.
- Tap any recipe (or **Tonight's dinner** on the Today screen) for **cook mode**: a full-screen recipe with large text, ingredients to tick off, and one highlighted step at a time. Use Next/Back or swipe. The screensaver stays off while cooking.
- **Servings −/+** rescales ingredient amounts (for ingredients Mealie has parsed into amount/unit/food; plain-text ingredients are shown as written).
- **Delete a recipe:** open it, then press and hold its picture at the top-left of cook mode for 5 seconds. A red **🗑 Delete** button appears for 15 seconds; tapping it asks for confirmation. Deleting is permanent in Mealie and affects everyone. For bigger clean-ups, use Mealie itself.
- **📱 On my phone** shows a QR code that opens the recipe in Mealie. If your phone reaches Mealie by a different address than Home Assistant does, set it under Setup → Mealie → *Link for phones*.

Rows map to Mealie types: Breakfast, Lunch, Dinner, and **Snack**, which shows Mealie's snack, side, dessert and drink entries. Adding to Snack uses "snack" on Mealie 3.7+ and "side" on older versions.

Recipe images are passed through Home Assistant, so the tablet never needs to reach Mealie directly.

**Other meal apps (Plan to Eat, etc.):** subscribe to the app's calendar (iCal) link in Setup → Calendars, then tick it under **Meal plan sync**. These meals are read-only on the tablet. They're sorted into rows by the calendar name, a word in the meal name ("Dinner: Tacos"), or the time of day.

## Photos from Immich

1. In Immich: **Account Settings → API Keys → New API Key**. If Immich asks for permissions, give it album and asset read access.
2. In Lyding Strike → Setup → **Photos from Immich**: enter your server URL (e.g. `http://192.168.1.20:2283`) and the key. Tap **Load albums**, tick albums and/or *Include my favorites*, then tap **Save**.

The slideshow shows each photo's **date taken and place** (and, for Immich photos, **who's in it**: the people Immich recognized and you've named, hidden people left out; turn off under Setup → *Show who's in the photo*) in the bottom-right corner (turn off under Setup → *Show date & place on photos*). Immich photos use Immich's own date and place names. Uploaded photos use the date and GPS saved in the photo file; the place name is looked up once through OpenStreetMap (Photon). Photos without that information simply show no caption.

The API key stays on your HA server and is never sent to the tablet. Immich images are fetched through HA using links that expire after 24 hours. The album list refreshes every 30 minutes, and at most 500 random photos are used per refresh.

**Uploaded photos** need a Home Assistant login to view. Screens get signed links that expire after 24 hours, the same as Immich photos. Uploads can be switched off under Setup → Display → *Allow photo uploads*; photos already uploaded keep showing until you delete them.

## Android tablet setup

1. Install **Fully Kiosk Browser** from the Play Store (the free version works; Plus adds remote control).
2. **Start URL**: `http://<your-ha-address>:8123/skylight`
3. Log in with a dedicated non-admin HA user, such as "kitchen". Tick *Keep me logged in*.
4. Lyding Strike hides Home Assistant's own sidebar and header for **non-admin** users automatically, so it fills the screen (Setup → Display → *Hide Home Assistant's sidebar for non-admin users*). Admin accounts always keep them. This is a convenience, not a lock: also turn on Fully Kiosk's kiosk mode (*Kiosk Mode → Enable*, with its own PIN) so the browser can't be left, and keep the tablet's account a non-admin user.
5. In Fully Kiosk: **Keep screen on**, **Launch on boot**, and disable **Pull to refresh**.
6. Optional: add the **Fully Kiosk Browser** integration in Home Assistant and pick its *Screen brightness* entity in Lyding Strike → Setup → Look & night mode to dim the screen at night. Fully Kiosk's motion detection or schedule can also turn the screen off.

Lyding Strike's own photo screensaver runs inside the page, so Fully's screensaver is not needed.

## Raspberry Pi + touch monitor (TouchKio)

For a Pi 5 driving an HDMI touch monitor, [TouchKio](https://github.com/leukipp/touchkio) is a good kiosk: it runs the page full screen and, through MQTT, gives Home Assistant control of the display's power, brightness and an on-screen keyboard.

1. Install TouchKio (its `install.sh`) and run `touchkio --setup`.
2. `--web-url http://<your-ha-address>:8123/skylight` and log in as a dedicated non-admin HA user with *Keep me logged in*.
3. `--web-zoom` sets the size of everything (TouchKio's default is 1.25). For a 22" 1080p screen seen from across a kitchen, try 1.25 to 1.5 and judge from where you normally stand.
4. Try `--web-widget false` and `--web-pager false` if TouchKio's own side controls get in the way of the full-width layout.
5. With MQTT set up, TouchKio's *display power* switch appears in Home Assistant: automate it (motion sensor, schedule) instead of using the in-page screensaver, or use both. Pick its brightness entity in Setup → Look & night mode to dim at night.
6. The in-page **Keep this screen on** setting isn't needed on the Pi: TouchKio keeps the display on.
7. Pi OS has no color emoji font, so avatars and chore icons look wrong until you add one: `sudo apt install -y fonts-noto-color-emoji && fc-cache -f`, then restart TouchKio.
8. Dates look British (17/10/2026)? Pi OS defaults to the `en_GB` locale: `sudo raspi-config nonint do_change_locale en_US.UTF-8` and reboot. The panel shows the Pi's own clock: `sudo timedatectl set-timezone America/New_York` (your zone) if it's off.
9. The desktop's taskbar shows under the on-screen keyboard. A kiosk doesn't need it, and it's started through a respawner, so killing it doesn't stick: comment it out with `sudo sed -i 's|^\([^#].*wf-panel-pi.*\)$|# \1|' /etc/xdg/labwc/autostart` and reboot. (An OS update may restore the line.)
10. On the Argon ONE V3 the Pi can't see the power supply's 5 A rating; Argon's script (`argon1.sh`) sets `PSU_MAX_CURRENT=5000` in the bootloader, or add `usb_max_current_enable=1` to `config.txt`.

### Monitor brightness from Home Assistant (DDC/CI)

HDMI monitors don't expose a backlight to the OS, but most accept brightness commands over DDC/CI. Check from the Pi: `sudo apt install -y ddcutil && sudo ddcutil detect && sudo ddcutil getvcp 10`. If that prints a current value, `tools/pi/ddc_brightness.py` turns it into a Home Assistant brightness slider over MQTT (the same Mosquitto broker TouchKio uses):

```
sudo apt install -y ddcutil python3-paho-mqtt
sudo cp ddc_brightness.py /usr/local/bin/ && sudo chmod +x /usr/local/bin/ddc_brightness.py
sudo cp ddc-brightness.service /etc/systemd/system/
sudo systemctl edit ddc-brightness      # add Environment=MQTT_HOST=…, MQTT_USER=…, MQTT_PASSWORD=…
sudo systemctl enable --now ddc-brightness
```

A `number.<hostname>_brightness` entity appears under Settings → Devices & services → MQTT. Pick it in Lyding Strike → Setup → Look & night mode as the screen brightness entity, and the display dims at night and brightens in the morning. Changes made with the monitor's own buttons show up within a minute.

You can also place Lyding Strike on any dashboard as a card (`type: custom:skylight-panel`). It is designed to fill the screen, so the sidebar panel works best.

## Setup PIN (keeps kids out of the setup)

Lyding Strike → Setup → **Set a setup PIN** (4–8 digits, entered twice). After that:

- **Needs the PIN:** changing Setup, adding/editing/removing family members, adding/editing/deleting chores, choosing calendars, creating or subscribing to calendars, connecting Immich or Google location lookup, deleting uploaded photos, and deleting a Mealie recipe.
- **Never needs the PIN:** checking off chores, list items, adding/editing/deleting calendar events, meal planning, recipes and cook mode, and viewing photos.
- Unlocking applies to **that screen only**, for 5 minutes (adjustable up to 60). It locks again when you leave Setup or when the photo screensaver starts.
- After **5 wrong PINs**, unlocking is blocked for 5 minutes.
- The check happens on the Home Assistant server, not just on screen. The PIN is stored only as a salted hash and is never sent to any screen.
- **Forgot the PIN?** A Home Assistant admin opens Settings → Devices & Services → **Lyding Strike** → **Configure** and ticks *Remove the setup PIN*.

## Event reminders

Home Assistant can't attach a reminder to a Google (or other) calendar event, so Lyding Strike sends them itself:

- In the event editor, pick a **Reminder**: at the start, 5/10/15/30 minutes, 1 or 2 hours, 1 day before, or the evening before (7 PM). Setup → **⏰ Reminders** sets the default for new events.
- **Phones:** every phone with the Home Assistant app (`notify.mobile_app_…`) is listed under Setup → Reminders with **Off / All events / Only events for…** (pick people), e.g. a shared kids' phone that only gets the kids' events. Home Assistant sends a push notification, so it arrives with the app closed.
- **Screens:** each screen showing the panel chooses for itself (saved on that device) whether reminders pop up there with a chime. The wall display defaults to all events; phones default to off, since they get push notifications.
- A reminder (or a weather alert pop-up) counts as someone needing the screen: it clears the photo screensaver, and the screensaver stays off until someone taps OK or the event is over (then the pop-up closes by itself). During the family's night hours the screensaver may come back over a waiting pop-up; it's shown again in the morning.
- Reminders follow the event: Home Assistant looks up the event's current time before reminding, so moving it in Google Calendar moves the reminder. Each reminder is sent once.
- Limits: reminders exist only in Lyding Strike (they don't show in the Google Calendar app), and only for events you set one on here. For a repeating Google event, the reminder covers the occurrence you edited; on a Local Calendar it covers every repeat.

## Weather: "feels like"

The Weather tab shows "Feels like" under the current temperature, as a dashed second line on the hourly chart, and as a row under it. Weather sources that provide an apparent temperature are used as-is; for the rest it's worked out from temperature, humidity and wind with the US National Weather Service wind-chill and heat-index formulas.

## Look and night mode

Setup → **Look & night mode**:

- **Theme:** Warm (default), Cool, Slate (dark neutral) or High contrast. Each has a light and a dark version. Only surfaces, text and the accent color change; family members keep their own colors.
- **Seasonal accents** (off by default): a different accent color and a small emoji by the clock for spring, summer, July 4th (Jul 1–5), fall, Halloween (Oct 15–31), Thanksgiving week, Christmas (Dec 1–26) and winter.
- **Light or dark is chosen on each screen** (saved on that device, so every phone and the wall display can differ): **Follow this device** (the default; uses the phone's or tablet's own Dark Mode), **Always light**, **Always dark** or **Dark at night**. Handy on phones: following the phone keeps the app dark whenever the phone is in Dark Mode, so the phone's own clock at the top stays readable.
- **Night is** (for everyone): between set start and end times (can cross midnight) or sunset to sunrise (from Home Assistant's `sun.sun`). Used by screens set to *Dark at night* and by night dimming. Upgrading from v1.41 or earlier keeps your old choice of sunset-to-sunrise or times; each screen starts on *Follow this device*.
- **Dim during night hours:** one slider, **How dark at night** (0–100 %). Without a backlight entity it darkens the picture (pixels, not the backlight, so the screen still glows a little). With a **backlight control entity** (TouchKio + the DDC brightness script, Fully Kiosk Browser's "Screen brightness", a light or `input_number`), the first half of the slider turns the backlight down to 0 and the second half darkens the picture on top, since most monitors still glow at their lowest setting; Home Assistant sets the backlight when night starts and ends, and a manual change in between stays. **Daytime backlight %** is the level it returns to. Night hours are the dark-mode schedule (or sunset to sunrise), and the photo screensaver is dimmed too.

- **Also dim when nobody's around:** pick an on/off entity (a presence or motion sensor, or a toggle helper that an Alexa routine switches on when an Echo detects people and off after 10 minutes without). While it's off the screen dims to the slider level at any time of day; when it turns on, it's back to normal within a second. Unknown/unavailable counts as occupied, so a broken sensor never leaves the screen dim.
- **Turn the screen off when everyone's in bed:** a second, later window with its own off and on times, separate from dimming. Pick the kiosk's display entity (TouchKio's "Display" light, Fully Kiosk's "Screen" switch) and Home Assistant switches it off and on at those times; a manual change in between stays until the next switch.
- **For your own automations:** `binary_sensor.<name>_night` is on during night hours and `binary_sensor.<name>_screen_off` during the screen-off window, so automations follow Setup without copying times into them.

## Birthdays and anniversaries

- **Family members' birthdays:** in each person's editor (month and day; the year is optional).
- **Everything else** (grandparents' birthdays, anniversaries, other yearly dates): Setup → **Birthdays & anniversaries**. Pick a type, a title, the date, an optional year and emoji, and optionally who it belongs to (for the color).
- The **Today** screen shows an **Upcoming** card with the next 3 dates within 60 days (both adjustable), e.g. "🎂 Mom's birthday — 12 days (turning 38)" or "💍 Anniversary — 45 days (15 years)". On the day it says **Today! 🎉** and is highlighted. Ages and years only show when a year is set.
- A **Feb 29** date shows on Feb 28 in years that aren't leap years.
- The calendar shows them as all-day markers in every view, in the person's color (or the family color). Tapping one points you to Setup; they aren't calendar events and aren't written to any calendar.
- Adding or changing them needs the setup PIN, like other setup.

## Today screen layout

The Today screen is the calendar on the left and the family's side column on the right. With up to 5 calendar days (Agenda, 1, 3 or 5 days) the side column is wide: the weather tips (two to a row), messages, verse and upcoming dates span it, and below them the kids' chores, personal lists and tonight's dinner flow side by side in columns, so every kid's list is on screen without scrolling (sized for a 1080p screen at TouchKio's 1.25 zoom). 7 days keeps the calendar wide and stacks everything in one narrow column.

## Favorite baseball team

Setup → **Birthdays & anniversaries** has a **Favorite baseball team** choice (Diamondbacks by default, or Off).

- On game days the **Today** screen shows a ⚾ note with the opponent and first-pitch time. In the last hour it counts down by the minute ("First pitch in 42 min"). During the game it shows the live score and inning, and afterwards the final.
- On other days there's just a small ⚾ button next to **+ Event** that opens the team page.
- Tap the note for the team page. It shows who to root for in today's other games, the division standings, the league wild-card race with a line under the last spot, and the next three weeks of games.
- **Who to root for:** a team is "in the race" when it is ahead of yours, or no more than 5 games behind, in your division or in the wild-card race. In a game between a race team and anyone else, root against the race team. When two race teams play each other, root against the one closer to yours in the standings.
- **After the regular season:** if your team missed the postseason or has been knocked out, the advice switches to rooting for teams from your division (a tough division makes your team look better). While your team is still in it, it just says to root for them. In the offseason there's no advice.
- Data comes from MLB's free public stats feed (statsapi.mlb.com, no account or key). Standings are worked out from wins and losses, so tiebreakers aren't applied.

## Weather for where you are

On the Weather tab, **🏠 Home | 📍 Here** chooses, for that screen only, between Home Assistant's home weather and the weather where the device is. "Here" asks the device for its location (allow it when asked), rounds it to about 1 km, and Home Assistant gets the forecast from Open-Meteo and the town name from OpenStreetMap. The header, calendar day icons, Today hints, rain-soon and air quality then follow that screen. Weather alerts stay for home. If the browser won't share its location (the Home Assistant iPhone app doesn't pass it to pages, and plain http never gets it), "Here" uses where the Home Assistant app last reported your phone: the location of the person linked to the signed-in user (Settings → People). The Weather tab says when it's using that.

## Lists order

On the Lists tab, **↕ Arrange lists** moves lists up and down (within each person's group) and sets which list opens first: the top one, a chosen one, or none (pick each time). This is family-wide, so it may ask for the setup PIN.

## Message board and countdowns

- **Message board:** the Today screen has a 📌 Messages card. Tap **＋ Note** to post a sticky note, optionally saying who it's from, in one of six colors. Each note can last until the end of today, tomorrow, a week, or until someone removes it. Anyone at the screen can post or remove notes; the setup PIN isn't needed. Turn the card off in Setup → Birthdays & anniversaries.
- **Countdowns:** tick **⏳ Show countdown on the Today screen** in the event editor. The event then shows in the Upcoming card ("Disney trip · 23 days · Fri, Oct 30"), and on the day "Today! 🎉". It disappears after the event. If the event is moved in Google Calendar, the countdown keeps the old date until the event is opened and saved again here (calendars that can edit events in place are followed automatically).

## Bible verse of the day

One verse a day, the same on every screen: a 📖 card on the Today screen and a line under the clock on the photo screensaver. Setup → Bible verse:

- **Translation:** ESV, NET Bible, World English Bible or King James. The **ESV** needs a key from Crossway, free for personal use: sign up at [api.esv.org](https://api.esv.org/), create an application and paste its key into Setup (it stays on the server, like the other keys, and isn't in backups). Until a key is saved the NET Bible is shown. NASB, NIV and CSB aren't offered: their publishers only license them through paid API plans.
- **Our family's verses:** references, one per line ("Joshua 24:15", "Psalm 23:1-3"). They take every other day, alternating with a built-in list of about 80 well-known verses, or every day with "Only our verses".
- Home Assistant fetches the day's text once and remembers it. If the service can't be reached (or the key is wrong), the built-in King James text is shown and Setup says why.
- Each translation's own quoting terms apply to what's on your screen (the ESV API, for example, is for non-commercial use).

## "Leave by" times (Waze)

For today's events that have a location and start within 4 hours, the Today screen shows when to leave: "🚗 Leave by 3:25 PM · Soccer · 22 min drive". When it's time, it turns red and says **Leave now**. The agenda view shows the same on each event.

- **Setup:** add Home Assistant's own **Waze Travel Time** integration once (Settings → Devices & services → Add integration → Waze Travel Time). Any destination will do; Lyding Strike asks it about each event's location, from your Home zone, with live traffic.
- Setup → Birthdays & anniversaries: turn it on or off, choose how many minutes early to leave (default 5), and pick the Waze region.
- Each place is checked at most every 10 minutes. Addresses Waze can't find simply don't get a time.

## Adults, kids and Household

Every family member is an **Adult**, a **Kid** or **Household** (Setup → family member → *This person is*).

- **Kids** have chores. Kids appear on the Chores and Progress tabs, in the chore editor's *Who* list, and in the Today screen's chores section.
- **Household** is for things that aren't one person's job, like house maintenance (furnace filter, fridge water filter, smoke detectors). It gets a Chores column, can be picked in the chore editor and shows on the Today screen, but isn't on the Progress tab and can't own lists.
- **Adults** can own lists. In the list editor, *Whose list* is Shared or one adult; linked Home Assistant to-do lists get the same choice from a picker next to the list name. The Today screen can still show an adult's list.
- Calendars work the same for everyone.
- Switching someone with chores to Adult keeps their chores but hides them; the editor warns you and offers **Move chores here**. Switching an adult to Kid makes their lists Shared.
- **Upgrading from v1.28 or earlier:** people with at least one chore become Kids and everyone else Adults. A banner in Setup asks you to check this until you tap *Looks right*.

## Updating

Update through HACS, then restart Home Assistant. Every open screen notices the new version on its next data refresh and reloads itself once (not while someone is in cook mode or has a dialog open), so a wall display picks up updates without being touched.

## Automatic updates (HACS)

HACS adds an update entity for Lyding Strike (`update.lyding_strike_update`; check the exact id under Settings → Devices & services → Entities). An automation can install new versions on its own and restart Home Assistant, and the screens then reload themselves (see above). Settings → Automations → Create → ⋮ → Edit in YAML:

```yaml
alias: Lyding Strike auto-update
description: Install new Lyding Strike versions overnight and restart Home Assistant
triggers:
  - trigger: time
    at: "03:30:00"
conditions: []
actions:
  - action: homeassistant.update_entity
    target:
      entity_id: update.lyding_strike_update
  - delay: "00:00:30"
  - if:
      - condition: state
        entity_id: update.lyding_strike_update
        state: "on"
    then:
      - action: update.install
        target:
          entity_id: update.lyding_strike_update
      - delay: "00:01:00"
      - action: homeassistant.restart
mode: single
```

- The time trigger plus `homeassistant.update_entity` makes HACS look for a new version at that moment, so the schedule doesn't depend on how often HACS checks by itself.
- To install the moment a version appears instead, use a state trigger on the update entity going to `on` (and keep the restart; Home Assistant doesn't restart by itself after a HACS update). An overnight window is kinder to a kitchen screen in use.
- Without releases on GitHub, HACS follows the latest commit on the repository's default branch.

## Upgrading from v1.27 or earlier

v1.28 removes **stars and rewards**. On the first start after upgrading, Lyding Strike deletes the saved star balances, the rewards and each chore's star value (logged once in the Home Assistant log). Chores and their completion history are kept, and the history now holds up to 400 check-offs per chore for the Progress view. Weeks before a chore was created don't count against it; for chores made before v1.28, the first check-off is used as the start.

## Lists in Home Assistant (To-do, phone app, voice)

Every list also appears in Home Assistant as a to-do entity named **_app name_ _list name_** (e.g. **Lyding Strike Groceries**, `todo.lyding_strike_groceries`). Renaming the app changes these names but keeps the entity ids, so automations keep working; installs from before the rename keep their `todo.skylight_…` ids. So the lists show in HA's **To-do** panel and phone app, and **Assist** can add to them ("add milk to Lyding Strike Groceries"). Changes either way show up everywhere at once. New lists get an entity automatically; deleted lists lose theirs. Each entity has an `owner` attribute (Shared or the adult who owns it).

These entities are for Home Assistant's own tools. Alexa via Home Assistant Cloud doesn't sync to-do lists as far as we know, so "Alexa, add milk" still goes to Alexa's own list.

## Backup and restore

Setup → **Backup**:

- **⬇ Download backup** saves a `.json` file with family members, chores and their history, lists, meals, birthdays and anniversaries, and settings. API keys and the setup PIN are never included.
- **⬆ Restore from file…** replaces those on every screen after asking you to confirm. Your current API keys and PIN stay. Photos in the backup are only kept if the files are still on the server. The data from just before the restore is saved on the server as `config/.storage/skylight.data.before_import`, in case you need to undo it.
- Both need the setup PIN. On the kiosk tablet the download goes to its Downloads folder; it's easiest from a PC or phone.

## Privacy: what leaves your home

Lyding Strike keeps family data on your Home Assistant server. Some features ask outside services for information. Home Assistant makes these requests (except the radar map, which the screen loads itself), and the home location is **rounded to about 1 km** first.

| Service | Used for | What it receives |
|---|---|---|
| US National Weather Service (api.weather.gov) | Weather alerts | Rounded home location |
| Open-Meteo | Rain in the next 2 hours, comparisons, air quality | Rounded home location |
| Google Pollen API | US pollen (only if you add a Google key) | Rounded home location, your Google key |
| Google Places | Place search in the event editor (only with a Google key) | What you type, rounded home location |
| Photon / OpenStreetMap (komoot) | Place search without a Google key; town names for uploaded photos | What you type and the rounded home location; for photos, the photo's GPS rounded to about 100 m |
| Windy or RainViewer | Radar map on the Weather tab (loaded by the screen) | Rounded home location, plus whatever those sites log about visitors |
| Waze (through Home Assistant's Waze Travel Time integration) | "Leave by" times | Your Home zone location and the locations of today's upcoming events |
| Open-Meteo and Photon (OpenStreetMap) | 📍 Here weather, only on screens set to it | That screen's location rounded to about 1 km |
| MLB stats (statsapi.mlb.com) | Favorite team's games, scores and standings | Only the team and date asked for (no location) |
| Crossway ESV API, NET Bible API (labs.bible.org) or bible-api.com | Verse of the day, in the chosen translation | The day's verse reference (and your ESV key, for the ESV) |
| Your own Mealie and Immich servers | Recipes, meal plans, photos | Talks only to the addresses you entered |

To avoid a service: turn off weather alerts or the Open-Meteo extras in Setup, set the favorite baseball team to Off, turn off "Leave by" times, turn the Bible verse off on Today and the screensaver, don't add a Google key, and set the radar map to Off. The weather integration you pick in Home Assistant has its own privacy terms.

Nothing is sent to the author of Lyding Strike, and there is no tracking or analytics.

## Where data lives

- Family data (members and their birthdays, birthdays & anniversaries, chores and their completion history, meals, lists, settings, settings-PIN hash): `config/.storage/skylight.data`. This is included in HA backups.
- Photos: `config/skylight_photos/`, also included in backups.
- Calendar events: in the calendar integrations themselves.

## Diagnostics (a screen froze?)

Each screen keeps a small flight recorder on the device: what the app did (start, going to the background and back, redraws, connection, server calls, errors) plus a heartbeat every second, saved every second so it survives a freeze. After a freeze: force-close the app, reopen it and open Setup → **🩺 Diagnostics** to see the previous session. **Send to Home Assistant log** writes it to Settings → System → Logs. If the heartbeat stopped right after the last event, the app's code was stuck there; if it kept going, the code was running and the screen itself froze.

## Known limitations

- **Keeping the screen on:** cook mode always asks to keep the screen on, and Setup → Look → **Keep this screen on** does it whenever Lyding Strike is open on that device. It uses the browser's screen wake lock plus a tiny silent video (which iPhones and iPads respect inside apps). It only works while the app is open and in front; the device's own settings still win when it's closed, in Low Power Mode, or locked by hand. For a wall tablet, a kiosk browser (Fully Kiosk on Android) or the device's own setting (iPad: Auto-Lock → Never, or Guided Access) is more reliable.

- **Creating a calendar from the tablet** still adds a Local Calendar without a Home Assistant admin account, but only on a screen unlocked with the setup PIN. With no PIN set, anyone using Lyding Strike can do it.
- **One PIN for the whole family.** There are no per-person accounts or permissions inside Lyding Strike; the PIN separates "can change the setup" from "everyday use".
- **Photo links expire after 24 hours** (uploaded and Immich photos both need a Home Assistant login or a signed link). A screen left open for days gets fresh links automatically.
- **No Google Photos or iCloud album sync** (Immich and uploads only).
- **"All events" on a repeating event** looks back up to 3 years to find the series start. Events that repeat "forever" and began earlier than that may be re-anchored.
- **Repeating-event choices depend on the calendar.** Local Calendar supports all three; Google Calendar may reject edits, and subscribed feeds are read-only.
- **Concurrent setup edits: the last save wins.** Lists are safe: adding, checking, renaming, deleting and reordering items, and chore check-offs, are each done as one small change on the server, so two screens never overwrite each other. Setup changes (family members, chores, settings) still save the whole section, so two people editing *setup* at the same moment could overwrite each other.
- **Reordering Home Assistant to-do lists** only works when their integration supports it (for example, the built-in Local To-do and Shopping List do; many others don't); the ≡ handles are hidden otherwise.

## Development

```bash
pip install pytest-homeassistant-custom-component home-assistant-frontend ical respx aiomealie
pytest            # 108 tests: chores, integration, Immich, feeds, recurring edits, Mealie, security/PIN, roles, lists, birthdays, night mode (real HA core; some run the panel's JS in Node)

npm install       # once: Playwright, for the browser tests
npx playwright install chromium
npm run e2e       # 40 end-to-end scenarios: the real panel in Chromium against a fake Home Assistant (tests/e2e)
```

The frontend is a plain web component with no build step: the browser loads the files as they are.

| File (`custom_components/skylight/frontend/`) | What's in it |
|---|---|
| `skylight-panel.js` | Entry point: registers the `<skylight-panel>` element |
| `src/panel.js` | The element itself: start-up, data, tap/change handling, layout, header |
| `src/helpers.js` | Constants and DOM-free helpers (dates, themes, night mode, birthdays) |
| `src/styles.js` | All CSS |
| `src/calendar.js`, `weather.js`, `home.js`, `chores.js`, `meals.js`, `lists.js`, `photos.js`, `settings.js`, `pickers.js` | One file per area; their methods are mixed into the panel element |

Chore schedules (what's due on which day, missed chores, weekly totals) are worked out only by Home Assistant in `chores.py`; the panel asks for them (`skylight/chores/view`) and just draws the answer.

Files import each other with `?v=<version>` so an update never mixes old and new files. Change the version with `python3 tools/bump_version.py X.Y.Z`, which updates every place it appears; a test fails if any import is out of step.

## License

MIT. See [LICENSE](LICENSE). Copyright (c) 2026 Keith Lyding.
