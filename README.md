# Skylight for Home Assistant

A Skylight Calendar–style family display for Home Assistant, built for a wall-mounted Android tablet.
**Everything is set up from the touchscreen**: family members, calendars, events, chores, rewards,
meals, lists, photos and display settings. No YAML editing.

## What you get

A **Skylight** entry in the Home Assistant sidebar that opens a full-screen app with these tabs:

| Tab | What it does |
|---|---|
| **Today** | Overview: a 1, 3, 5 or 7-day time-block calendar (remembered per device) with weather, each person's chores for today (tap to check off), and today's meals. Opens by default. |
| **Weather** | Current conditions, 24-hour temperature chart with rain bars, multi-day forecast with high/low ranges, sunrise/sunset, moon phase, a live radar map (Windy or RainViewer), optional air-quality / pollen / UV sensors, and official **US National Weather Service alerts** (cards on the Weather tab plus a banner on every screen). Tap a forecast day for the written day/night forecast. Uses the weather integration chosen in Settings; the **NWS** integration is recommended in the US for rain chances and forecast text. |
| **Weather extras** | **Today's tips** in plain language on the Today screen and Weather tab (umbrella for an outdoor event, jacket this morning, freeze tonight, gusty, high UV, poor air, high pollen, much colder than yesterday). **Rain in the next 2 hours** in 15-minute steps ("Rain starting in about 30 min"). **Alert pop-ups**: a new NWS warning covers the screen (and wakes the photo screensaver) with an optional chime until someone taps OK. **Radar layers** (radar, rain forecast, storms, wind, gusts, temperature, clouds, satellite), **air quality** (US AQI with a 24-hour outlook), **pollen**, **comparisons** (yesterday, this day last year, rain over the last 7/30 days) and a **moon** card with the next phases. Rain-soon, air quality and comparisons come from Open-Meteo (free, no key). US pollen uses the Google Pollen API with the Google key from Location lookup. |
| **Calendar** | Agenda, Day, 3, 5 and 7-day (a Google/Outlook-style time grid fitted to 7 AM–8 PM, like the Today screen), and Month views, color-coded per person. Tap a name to filter. Tap a day or **+ Event** to add an event, and tap an event to edit or delete it. For a repeating event you choose **This event / This and following events / All events**. Daily weather is shown. |
| **Chores** | One column per person with a progress ring. Tap a chore to check it off and earn stars. Chores repeat daily, on certain weekdays, weekly or once. You can page back and forth by day. |
| **Rewards** | Star balances with manual +/−, and rewards with progress bars. **Redeem** spends the stars. |
| **Meals** | A weekly grid synced two-way with **Mealie**: add recipes, pick a random one, view ingredients and steps, and send ingredients to a shopping list. Other meal apps can be shown read-only through their calendar feed. |
| **Lists** | Your own lists, plus any Home Assistant to-do list (Mealie shopping lists, HA Shopping list) kept in sync. |
| **Photos** | Show **Immich** albums and/or favorites, or upload from the tablet or your phone. After a set idle time the photos play full screen with a clock, like Skylight's photo frame. |
| **Settings** | Add, edit and reorder family members (name, color, avatar, their calendars). Create new calendars, subscribe to calendar links, choose shared family and meal calendars, connect Immich, and set the weather source, week start, 24-hour clock and screensaver timing. |

Every screen showing the panel (tablet, phones, PC) stays in sync live.

## Install

### Option A: HACS (recommended)
1. HACS → ⋮ → **Custom repositories** → add `https://github.com/keithlyding/Skylight`, category **Integration**.
2. Install **Skylight Family Display**, then restart Home Assistant.

### Option B: manual
Copy `custom_components/skylight` into your Home Assistant `config/custom_components/` folder and restart.

### Then
**Settings → Devices & Services → Add Integration → "Skylight Family Display"**. A **Skylight** item appears in the sidebar. Open it, go to **Settings**, and add your family.

Requires Home Assistant **2024.7 or newer**. The automated tests run against 2026.2.

## Calendars

- **Create calendar** in Skylight Settings creates a Home Assistant *Local Calendar* stored on your HA server. This works from the kiosk tablet without an admin account.
- **Google / iCloud / Outlook**: an admin adds the matching integration once (Google Calendar, CalDAV, or a remote-calendar integration) under Settings → Devices & Services. Those calendars then show up in Skylight's member and family calendar pickers. Whether you can *add* events to them from the tablet depends on that integration: Local and Google calendars support it, while read-only feeds such as ICS URLs do not.
- **Subscribe to a calendar link** (iCal / webcal) from Skylight Settings for school, sports or Plan to Eat. This uses HA's *Remote Calendar* integration (HA 2025.4+), and the calendar is read-only.
- A calendar assigned to a person uses that person's color. Calendars ticked as **Shared family calendars** use the family color.

## Meal planning with Mealie (recommended)

Skylight uses Home Assistant's built-in **Mealie** integration, so the tablet reads and writes your Mealie meal plan.

**One-time setup (admin):**
1. In Mealie: click your avatar, then **API Tokens**, create a token and copy it.
2. In Home Assistant: **Settings → Devices & Services → Add Integration → Mealie**. Enter the Mealie URL as *Home Assistant* reaches it; with Docker that's usually `http://<server-ip>:9000`, not `localhost`. Paste the token.
3. Reload the Skylight page. Settings → **Mealie** should show ✅ Connected.
4. Optional: in the same section, tick the **Mealie shopping list** (and HA's own Shopping list) to show them in the Lists tab.

**On the tablet:**
- The **Meals** tab shows the week from Mealie, with recipe photos.
- Tap a slot to search your recipes and tap one to add it. You can also use 🎲 for a random recipe, add a note ("Leftovers"), or import a recipe from a website.
- Tap a planned recipe to see its **ingredients and steps**, then tick ingredients and send them to a shopping list.
- Tap ✕ to remove a meal from the plan.

Rows map to Mealie types: Breakfast, Lunch, Dinner, and **Snack**, which shows Mealie's snack, side, dessert and drink entries. Adding to Snack uses "snack" on Mealie 3.7+ and "side" on older versions.

Recipe images are passed through Home Assistant, so the tablet never needs to reach Mealie directly.

**Other meal apps (Plan to Eat, etc.):** subscribe to the app's calendar (iCal) link in Settings → Calendars, then tick it under **Meal plan sync**. These meals are read-only on the tablet. They're sorted into rows by the calendar name, a word in the meal name ("Dinner: Tacos"), or the time of day.

## Photos from Immich

1. In Immich: **Account Settings → API Keys → New API Key**. If Immich asks for permissions, give it album and asset read access.
2. In Skylight → Settings → **Photos from Immich**: enter your server URL (e.g. `http://192.168.1.20:2283`) and the key. Tap **Load albums**, tick albums and/or *Include my favorites*, then tap **Save**.

The API key stays on your HA server and is never sent to the tablet. Images are fetched through HA using links that expire after 24 hours. The album list refreshes every 30 minutes, and at most 500 random photos are used per refresh.

## Android tablet setup

1. Install **Fully Kiosk Browser** from the Play Store (the free version works; Plus adds remote control).
2. **Start URL**: `http://<your-ha-address>:8123/skylight`
3. Log in with a dedicated non-admin HA user, such as "kitchen". Tick *Keep me logged in*.
4. Tap ☰ at the top of the HA sidebar to collapse it so Skylight fills the screen; Skylight has its own navigation rail. (A setting to hide the sidebar completely varies by HA version; check your user profile page.)
5. In Fully Kiosk: **Keep screen on**, **Launch on boot**, and disable **Pull to refresh**.
6. Optional: use Fully Kiosk's motion detection or its schedule to turn the screen off at night.

Skylight's own photo screensaver runs inside the page, so Fully's screensaver is not needed.

You can also place Skylight on any dashboard as a card (`type: custom:skylight-panel`). It is designed to fill the screen, so the sidebar panel works best.

## Where data lives

- Family data (members, chores, stars, rewards, meals, lists, settings): `config/.storage/skylight.data`. This is included in HA backups.
- Photos: `config/skylight_photos/`, also included in backups.
- Calendar events: in the calendar integrations themselves.

## Known limitations

- **Photos are served without login**, at `/skylight_photos/<random-24-hex-name>`. The names are unguessable, but anyone who has a link can view that photo. Don't upload anything you'd consider sensitive.
- **Creating a calendar from the tablet bypasses HA's admin-only rule** for adding integrations (limited to Local Calendars). Leave the integration out if that matters in your setup.
- **Any logged-in HA user can change Skylight data.** There are no per-person permissions or parent PINs yet.
- **No Google Photos or iCloud album sync** (Immich and uploads only).
- **"All events" on a repeating event** looks back up to 3 years to find the series start. Events that repeat "forever" and began earlier than that may be re-anchored.
- **Repeating-event choices depend on the calendar.** Local Calendar supports all three; Google Calendar may reject edits, and subscribed feeds are read-only.
- **Concurrent edits: the last save wins.** If two people edit the *same* list on two devices at the exact same moment, one change can be lost. Chore check-offs and star changes are atomic on the server.

## Development

```bash
pip install pytest-homeassistant-custom-component home-assistant-frontend ical respx aiomealie
pytest            # 49 tests: chore rules, integration, Immich, feeds, recurring edits, Mealie (real HA core)
```

The frontend (`custom_components/skylight/frontend/skylight-panel.js`) is a single plain web component with no build step.
