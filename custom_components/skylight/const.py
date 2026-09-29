"""Constants for the Skylight integration."""

DOMAIN = "skylight"
VERSION = "1.29.0"

STORAGE_KEY = "skylight.data"
STORAGE_VERSION = 1

EVENT_UPDATED = "skylight_updated"

URL_FRONTEND = "/skylight_static"
URL_PHOTO_FILE = "/api/skylight/photo_file"
PHOTO_DIR = "skylight_photos"
PANEL_PATH = "skylight"
PANEL_ELEMENT = "skylight-panel"

# Top-level keys the frontend may replace wholesale via skylight/set.
EDITABLE_KEYS = (
    "members", "chores", "meals", "todo_owners", "lists", "settings", "family_calendars", "meal_calendars", "linked_todos", "info_calendars",
)

DEFAULT_DATA = {
    "members": [],
    "family_calendars": [],
    "chores": [],
    "meals": {},
    "lists": [
        {"id": "groceries", "name": "Groceries", "color": "#2ecc71", "items": []},
        {"id": "todo", "name": "To Do", "color": "#4a7dff", "items": []},
    ],
    "photos": [],
    # Calendars whose events fill the Meals grid (Plan to Eat feed, Mealie, ...).
    "meal_calendars": [],
    # Info-only calendars (birthdays, holidays): [{"entity": ..., "icon": ..., "color": ...}]
    "info_calendars": [],
    # HA to-do lists (e.g. Mealie shopping lists) shown in the Lists tab.
    "linked_todos": [],
    # Owner (an adult member id) for linked HA to-do lists: {entity_id: member_id}. Missing = Shared.
    "todo_owners": {},
    # api_key is never sent to the browser (see SkylightStore.public).
    "immich": {"url": "", "api_key": "", "albums": [], "favorites": False},
    # Optional Google Places key for location lookup (never sent to the browser).
    "places": {"google_key": ""},
    # Settings PIN: salt + PBKDF2 hash only. Never sent to the browser (see SkylightStore.public).
    "security": {"salt": "", "pin_hash": ""},
    "settings": {
        "weather_entity": None,
        "week_start": 0,
        "clock_24h": False,
        "screensaver_minutes": 10,
        "photo_seconds": 15,
        "family_color": "#ff9f43",
        "default_view": "7day",
        "mealie_entry": None,
        "info_on_today": True,
        "weather_alerts": True,
        "allow_uploads": True,
        "unlock_minutes": 5,
        # Set by the v1.29 migration; the Settings banner asks to check Adult/Kid until dismissed.
        "roles_review": False,
    },
}
