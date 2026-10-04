"""Constants for the Skylight integration."""

DOMAIN = "skylight"  # internal id; kept so existing installs, data and entity ids carry on
DEFAULT_APP_NAME = "Lyding Strike"
APP_NAME_MAX = 40
VERSION = "1.36.1"

STORAGE_KEY = "skylight.data"
STORAGE_VERSION = 1

EVENT_UPDATED = "skylight_updated"

URL_FRONTEND = "/skylight_static"
URL_PHOTO_FILE = "/api/skylight/photo_file"
PHOTO_DIR = "skylight_photos"
PANEL_PATH = "skylight"
PANEL_ELEMENT = "skylight-panel"

def coarse_location(hass) -> tuple[float, float] | None:
    """Home location rounded to 2 decimals (about 1 km) for outside services; None if unset."""
    lat, lon = hass.config.latitude, hass.config.longitude
    if lat is None or lon is None:
        return None
    return round(float(lat), 2), round(float(lon), 2)


# Top-level keys the frontend may replace wholesale via skylight/set.
EDITABLE_KEYS = (
    "members", "chores", "meals", "todo_owners", "occasions", "lists", "settings", "family_calendars", "meal_calendars", "linked_todos", "info_calendars",
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
    # Birthdays of people who aren't members, anniversaries, other yearly dates:
    # [{"id", "title", "type": "birthday"|"anniversary"|"other", "month", "day", "year"?, "members"?: [ids], "emoji"?}]
    "occasions": [],
    # api_key is never sent to the browser (see SkylightStore.public).
    "immich": {"url": "", "api_key": "", "albums": [], "favorites": False},
    # Optional Google Places key for location lookup (never sent to the browser).
    "places": {"google_key": ""},
    # Settings PIN: salt + PBKDF2 hash only. Never sent to the browser (see SkylightStore.public).
    "security": {"salt": "", "pin_hash": ""},
    "settings": {
        # Shown in the sidebar, the panel and the to-do list names. Families can rename it.
        "app_name": DEFAULT_APP_NAME,
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
        # Today screen "Upcoming" card: how many occasions, and how far ahead (days).
        "upcoming_count": 3,
        "upcoming_days": 60,
        # Look: theme preset, seasonal accents, dark mode and night dimming.
        "theme": "warm",            # warm | cool | slate | contrast
        "seasonal": False,
        "dark_mode": "follow",      # follow | light | dark | scheduled | sun
        "night_start": "21:00",
        "night_end": "06:30",
        "night_dim": False,
        "brightness_entity": None,  # e.g. number.<tablet>_screen_brightness (Fully Kiosk)
        "day_brightness": 80,
        "night_brightness": 20,
        # Hide Home Assistant's own sidebar/header for non-admin users (e.g. the kitchen tablet).
        "hide_ha_sidebar": True,
    },
}


def app_name(data: dict | None) -> str:
    """The display name from settings (trimmed), or the default."""
    name = " ".join(str(((data or {}).get("settings") or {}).get("app_name") or "").split())[:APP_NAME_MAX]
    return name or DEFAULT_APP_NAME
