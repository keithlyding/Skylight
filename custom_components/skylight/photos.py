"""Photo upload endpoint and file handling."""

from __future__ import annotations

import pathlib
import re
import secrets

import aiohttp
from aiohttp import web

from homeassistant.components.http import HomeAssistantView
from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .const import DOMAIN, PHOTO_DIR, VERSION
from .immich import place_name

ALLOWED = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".heic"}
SAFE_NAME = re.compile(r"^[A-Za-z0-9_-]+\.[a-z]+$")


def photo_dir(hass: HomeAssistant) -> pathlib.Path:
    return pathlib.Path(hass.config.path(PHOTO_DIR))


class SkylightPhotoUploadView(HomeAssistantView):
    """POST multipart 'file' -> stores photo, returns its name."""

    url = "/api/skylight/photo"
    name = "api:skylight:photo"
    requires_auth = True

    async def post(self, request: web.Request) -> web.Response:
        hass: HomeAssistant = request.app["hass"]
        reader = await request.multipart()
        field = await reader.next()
        if field is None or field.name != "file":
            return self.json_message("Missing 'file' field", 400)
        ext = pathlib.Path(field.filename or "").suffix.lower()
        if ext not in ALLOWED:
            return self.json_message(f"Unsupported file type {ext}", 400)
        content = bytearray()
        while chunk := await field.read_chunk():
            content.extend(chunk)
        name = secrets.token_hex(12) + ext
        target = photo_dir(hass) / name
        await hass.async_add_executor_job(_write, target, bytes(content))
        await hass.data[DOMAIN]["store"].async_add_photo(name)
        return self.json({"name": name})


def _write(target: pathlib.Path, content: bytes) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(content)


async def async_delete_photo(hass: HomeAssistant, name: str) -> None:
    await hass.data[DOMAIN]["store"].async_remove_photo(name)
    if SAFE_NAME.match(name):
        await hass.async_add_executor_job(
            lambda: (photo_dir(hass) / name).unlink(missing_ok=True)
        )


# ---------- date taken / place for uploaded photos (from the photo's own EXIF) ----------
META_KEY = f"{DOMAIN}_photo_meta"
PHOTON_REVERSE = "https://photon.komoot.io/reverse"


def _read_exif(path: pathlib.Path) -> tuple[str | None, tuple[float, float] | None]:
    """(YYYY-MM-DD taken, (lat, lon)) from EXIF, or Nones. Runs in an executor."""
    try:
        from PIL import Image  # Home Assistant ships Pillow
    except ImportError:
        return None, None
    try:
        with Image.open(path) as img:
            exif = img.getexif()
            sub = exif.get_ifd(0x8769)  # Exif IFD: DateTimeOriginal lives here
            raw = sub.get(36867) or sub.get(36868) or exif.get(306)
            taken = None
            if raw and re.match(r"^\d{4}:\d{2}:\d{2}", str(raw)) and not str(raw).startswith("0000"):
                taken = str(raw)[:10].replace(":", "-")
            gps = exif.get_ifd(0x8825)
            coords = None
            if gps.get(2) and gps.get(4):
                def deg(v, ref):
                    d, m, s = (float(x) for x in v)
                    val = d + m / 60 + s / 3600
                    return -val if ref in ("S", "W") else val
                coords = (deg(gps[2], gps.get(1, "N")), deg(gps[4], gps.get(3, "E")))
            return taken, coords
    except Exception:  # noqa: BLE001 - unreadable or unusual files just get no caption
        return None, None


async def _reverse_geocode(hass: HomeAssistant, lat: float, lon: float) -> str | None:
    try:
        async with async_get_clientsession(hass).get(
            PHOTON_REVERSE, params={"lat": f"{lat:.5f}", "lon": f"{lon:.5f}", "lang": "en"},
            headers={"User-Agent": f"HomeAssistant-Skylight/{VERSION}"}, timeout=aiohttp.ClientTimeout(total=8),
        ) as resp:
            if resp.status != 200:
                return None
            feats = (await resp.json(content_type=None)).get("features") or []
    except (aiohttp.ClientError, TimeoutError, ValueError):
        return None
    if not feats:
        return None
    p = feats[0].get("properties", {})
    return place_name(p.get("city") or p.get("town") or p.get("village") or p.get("county"), p.get("state"), p.get("country"))


async def async_photo_meta(hass: HomeAssistant, name: str) -> dict[str, str | None]:
    """Date taken and place for an uploaded photo, cached in memory after the first read."""
    cache = hass.data.setdefault(META_KEY, {})
    if name in cache:
        return cache[name]
    meta: dict[str, str | None] = {"taken": None, "place": None}
    if SAFE_NAME.match(name):
        taken, coords = await hass.async_add_executor_job(_read_exif, photo_dir(hass) / name)
        meta["taken"] = taken
        if coords:
            meta["place"] = await _reverse_geocode(hass, *coords)
    cache[name] = meta
    return meta
