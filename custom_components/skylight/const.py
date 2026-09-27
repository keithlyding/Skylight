"""Constants for the Skylight integration."""

DOMAIN = "skylight"
VERSION = "1.6.1"

STORAGE_KEY = "skylight.data"
STORAGE_VERSION = 1

EVENT_UPDATED = "skylight_updated"

URL_FRONTEND = "/skylight_static"
URL_PHOTOS = "/skylight_photos"
PHOTO_DIR = "skylight_photos"
PANEL_PATH = "skylight"
PANEL_ELEMENT = "skylight-panel"

# Top-level keys the frontend may replace wholesale via skylight/set.
EDITABLE_KEYS = (
    "members", "chores", "rewards", "meals", "lists", "settings", "family_calendars", "meal_calendars", "linked_todos",
)

DEFAULT_DATA = {
    "members": [],
    "family_calendars": [],
    "chores": [],
    "stars": {},
    "rewards": [],
    "meals": {},
    "lists": [
        {"id": "groceries", "name": "Groceries", "color": "#2ecc71", "items": []},
        {"id": "todo", "name": "To Do", "color": "#4a7dff", "items": []},
    ],
    "photos": [],
    # Calendars whose events fill the Meals grid (Plan to Eat feed, Mealie, ...).
    "meal_calendars": [],
    # HA to-do lists (e.g. Mealie shopping lists) shown in the Lists tab.
    "linked_todos": [],
    # api_key is never sent to the browser (see SkylightStore.public).
    "immich": {"url": "", "api_key": "", "albums": [], "favorites": False},
    "settings": {
        "weather_entity": None,
        "week_start": 0,
        "clock_24h": False,
        "screensaver_minutes": 10,
        "photo_seconds": 15,
        "family_color": "#ff9f43",
        "default_view": "week",
        "mealie_entry": None,
    },
}
