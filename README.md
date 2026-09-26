# Skylight replica for Home Assistant

A Skylight Calendar–style family display for Home Assistant, shown full-screen on a large Android tablet.

| Skylight feature | This replica |
|---|---|
| Color-coded family calendar (week view) | `week-planner-card` with one color per person, plus tap-to-filter chips |
| Clock, date, weather header | Markdown + Mushroom cards |
| Chore chart with stars | Local To-do list per person + `counter` stars, auto-award on check-off, daily reset |
| Rewards | Star goal (`input_number`) with progress |
| Meal plan | `calendar.meals` week view + today's menu |
| Lists (groceries, to-do) | Local To-do lists |
| Photo frame | Cross-fading slideshow page with clock overlay |
| Always-on display, night off | Fully Kiosk Browser + automations |

## Files

```
packages/skylight.yaml     helpers, scripts, automations
themes/skylight.yaml       warm, rounded Skylight-like theme
dashboards/skylight.yaml   the dashboard (5 views)
www/skylight/              photo slideshow (copy to <config>/www/skylight/)
```

## 1. Install HACS frontend cards

- [week-planner-card](https://github.com/FamousWolf/week-planner-card)
- [Mushroom](https://github.com/piitaya/lovelace-mushroom)
- [card-mod](https://github.com/thomasloven/lovelace-card-mod)
- [kiosk-mode](https://github.com/NemesisRE/kiosk-mode)

## 2. Copy files and edit `configuration.yaml`

Copy `packages/`, `themes/`, `dashboards/` and `www/skylight/` into your HA config folder, then add:

```yaml
homeassistant:
  packages: !include_dir_named packages

frontend:
  themes: !include_dir_merge_named themes

lovelace:
  dashboards:
    skylight-dashboard:
      mode: yaml
      filename: dashboards/skylight.yaml
      title: Skylight
      icon: mdi:calendar-heart
      show_in_sidebar: true
```

Restart Home Assistant.

## 3. Create entities the YAML can't create

- **Calendars**: add Google Calendar / CalDAV / Local Calendar integrations so you have
  `calendar.family`, `calendar.alex`, `calendar.jordan`, `calendar.sam`, `calendar.riley`, `calendar.meals`.
  If your entity IDs differ, find/replace them in `dashboards/skylight.yaml`.
- **To-do lists** (Settings → Devices & Services → Add Integration → *Local To-do*), one per list:
  `Chores Alex`, `Chores Jordan`, `Chores Sam`, `Chores Riley`, `Groceries`, `Family Todo`
  (these become `todo.chores_alex`, …, `todo.groceries`, `todo.family_todo`).
- **Weather**: any weather integration; default ID is `weather.home`.
- **Family names**: find/replace `alex|jordan|sam|riley` (and capitalized) in `packages/` and `dashboards/`.

## 4. Photos

Put images in `<config>/www/skylight/photos/` and list them in `<config>/www/skylight/photos.json`:

```json
["photos/beach.jpg", "photos/birthday.jpg"]
```

The Photos view shows them full-screen, cross-fading every 15 s.

## 5. Android tablet setup

1. Install **Fully Kiosk Browser** (Plus license needed for remote admin / HA integration).
2. Start URL: `http://<ha-ip>:8123/skylight-dashboard/calendar`
3. Settings → Web Content: enable **Autoplay**, disable **pull to refresh**.
4. Settings → Device Management: **Keep screen on**, launch on boot.
5. Screensaver: timeout 5–10 min, **Screensaver URL** `http://<ha-ip>:8123/local/skylight/slideshow.html`
   — this gives Skylight's "photo frame when idle" behavior.
6. Enable **Remote Administration**, then add the *Fully Kiosk Browser* integration in HA.
   Rename its screen switch / brightness number to `switch.skylight_tablet_screen` and
   `number.skylight_tablet_screen_brightness` (used by the night-mode automations).
7. Log the tablet into a dedicated **non-admin** HA user so kiosk-mode hides the header and sidebar.

## Behavior notes / known limitations

- Checking off a chore awards a star. **Deleting** an unchecked chore also awards one (the automation
  only sees the incomplete-item count drop).
- Completed chores are unchecked at 04:00 every day, so every chore is treated as daily.
- Adding calendar events from the tablet uses HA's built-in calendar dialog (tap an event/day in the
  core Calendar panel); `week-planner-card` is display-focused.
- Stars: tap a star tile to add one, long-press to remove one.
