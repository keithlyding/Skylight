# Skylight for Home Assistant

A Skylight Calendar–style family display for Home Assistant, built for a wall-mounted Android tablet.
**Everything is set up from the touchscreen**: family members, calendars, events, chores, rewards,
meals, lists, photos and display settings. No YAML editing.

## What you get

A **Skylight** entry in the Home Assistant sidebar that opens a full-screen app with these tabs:

| Tab | What it does |
|---|---|
| **Calendar** | Day / Week / Month / Schedule views, color-coded per person. Tap a name to filter. Tap a day or **+ Event** to add an event, and tap an event to edit or delete it. For a repeating event you choose **This event / This and following events / All events**. Daily weather is shown. |
| **Chores** | One column per person with a progress ring. Tap a chore to check it off and earn stars. Chores repeat daily, on certain weekdays, weekly or once. You can page back and forth by day. |
| **Rewards** | Star balances with manual +/−, and rewards with progress bars. **Redeem** spends the stars. |
| **Meals** | A weekly grid for breakfast, lunch, dinner and snack. Meals sync from **Plan to Eat** (via its calendar feed) or **Mealie**, and you can add extra notes by hand. |
| **Lists** | Groceries, to-dos, or any list you create, each with its own color. |
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

## Meal planning

**Plan to Eat**
1. In Plan to Eat, open the Planner's settings and copy its **iCal / calendar feed link**. (I couldn't confirm this menu's exact name; it's the same link people use to show their meal plan in Google Calendar.)
2. In Skylight → Settings → Calendars, paste the link under *Subscribe to a calendar link* and name it "Plan to Eat".
3. In Settings → **Meal plan sync**, tick "Plan to Eat".

Each meal is placed in a row using, in order: the calendar name, a word in the meal name ("Dinner: Tacos"), then the time of day (before 10:30 breakfast, before 15:00 lunch, before 17:00 snack, otherwise dinner). All-day items go to dinner. Meals are edited in Plan to Eat, not on the tablet. Remote Calendar refreshes the feed periodically, so changes can take a while to show.

**Mealie** (free, self-hosted alternative): add HA's Mealie integration. Its breakfast/lunch/dinner/side calendars appear under Meal plan sync, and the calendar names sort meals automatically.

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
pip install pytest-homeassistant-custom-component home-assistant-frontend ical respx
pytest            # 22 tests: chore rules, integration, Immich, feeds, recurring edits (real HA core)
```

The frontend (`custom_components/skylight/frontend/skylight-panel.js`) is a single plain web component with no build step.
