"""Photo upload endpoint and file handling."""

from __future__ import annotations

import pathlib
import re
import secrets

from aiohttp import web

from homeassistant.components.http import HomeAssistantView
from homeassistant.core import HomeAssistant

from .const import DOMAIN, PHOTO_DIR

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
