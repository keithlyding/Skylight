"""Settings PIN: keeps configuration changes behind a PIN on the shared tablet.

- The PIN is stored only as a PBKDF2 hash with a per-install salt.
- Unlocking marks one websocket connection as unlocked for a few minutes.
  That state lives here on the server, keyed to the connection, and is
  dropped when the connection closes.
- Five wrong PINs lock out further attempts for five minutes (per install,
  so reconnecting doesn't reset it).
"""

from __future__ import annotations

import functools
import hashlib
import hmac
import re
import time
from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback

from .const import DOMAIN

PIN_RE = re.compile(r"^\d{4,8}$")
ITERATIONS = 200_000
MAX_ATTEMPTS = 5
LOCKOUT_SECONDS = 5 * 60
DEFAULT_UNLOCK_MINUTES = 5
STATE_KEY = f"{DOMAIN}_security_state"

# skylight/set keys that change configuration. Lists and meals are everyday use.
GATED_KEYS = frozenset({
    "members", "settings", "family_calendars", "meal_calendars", "info_calendars", "linked_todos", "chores", "rewards",
})


def hash_pin(pin: str, salt: str) -> str:
    return hashlib.pbkdf2_hmac("sha256", pin.encode(), bytes.fromhex(salt), ITERATIONS).hex()


def _state(hass: HomeAssistant) -> dict[str, Any]:
    return hass.data.setdefault(STATE_KEY, {"unlocked": {}, "fails": 0, "locked_until": 0.0})


def _store(hass: HomeAssistant):
    return hass.data[DOMAIN]["store"]


def pin_set(hass: HomeAssistant) -> bool:
    return bool(_store(hass).data["security"].get("pin_hash"))


def _unlock_seconds(hass: HomeAssistant) -> int:
    try:
        minutes = float(_store(hass).data["settings"].get("unlock_minutes") or DEFAULT_UNLOCK_MINUTES)
    except (TypeError, ValueError):
        minutes = DEFAULT_UNLOCK_MINUTES
    return int(max(1, min(60, minutes)) * 60)


def seconds_left(hass: HomeAssistant, connection) -> int:
    expiry = _state(hass)["unlocked"].get(id(connection), 0)
    return max(0, int(expiry - time.monotonic()))


def is_unlocked(hass: HomeAssistant, connection) -> bool:
    """No PIN set means everything is open."""
    return not pin_set(hass) or seconds_left(hass, connection) > 0


def lock_all(hass: HomeAssistant) -> None:
    _state(hass)["unlocked"].clear()


def send_locked(connection, msg_id: int) -> None:
    connection.send_error(msg_id, "locked", "Settings are locked. Enter the settings PIN.")


def gated(handler):
    """Wrap a websocket handler so it only runs on an unlocked connection."""

    @functools.wraps(handler)
    async def run(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
        if not is_unlocked(hass, connection):
            send_locked(connection, msg["id"])
            return
        await handler(hass, connection, msg)

    return run


def _lockout_left(hass: HomeAssistant) -> int:
    return max(0, int(_state(hass)["locked_until"] - time.monotonic() + 0.999))


async def _check_pin(hass: HomeAssistant, pin: str) -> bool:
    sec = _store(hass).data["security"]
    if not sec.get("pin_hash") or not PIN_RE.match(pin or ""):
        return False
    digest = await hass.async_add_executor_job(hash_pin, pin, sec["salt"])
    return hmac.compare_digest(digest, sec["pin_hash"])


async def _verify_with_lockout(hass: HomeAssistant, connection, msg_id: int, pin: str) -> bool:
    """Check a PIN, counting failures. Sends the error itself on failure."""
    st = _state(hass)
    left = _lockout_left(hass)
    if left:
        connection.send_error(msg_id, "lockout", f"Too many attempts, try again in {max(1, round(left / 60))} min.")
        return False
    if await _check_pin(hass, pin):
        st["fails"] = 0
        return True
    st["fails"] += 1
    if st["fails"] >= MAX_ATTEMPTS:
        st["fails"] = 0
        st["locked_until"] = time.monotonic() + LOCKOUT_SECONDS
        connection.send_error(msg_id, "lockout", f"Too many attempts, try again in {LOCKOUT_SECONDS // 60} min.")
    else:
        connection.send_error(msg_id, "wrong_pin", f"Wrong PIN ({MAX_ATTEMPTS - st['fails']} tries left)")
    return False


def _mark_unlocked(hass: HomeAssistant, connection, msg_id: int) -> int:
    key = id(connection)
    unlocked = _state(hass)["unlocked"]
    unlocked[key] = time.monotonic() + _unlock_seconds(hass)
    # Forget the unlock when this connection closes, so a new connection that
    # happens to reuse the same id() never inherits it.
    connection.subscriptions[f"skylight_unlock_{msg_id}"] = lambda: unlocked.pop(key, None)
    return _unlock_seconds(hass)


@callback
def async_register(hass: HomeAssistant) -> None:
    for cmd in (ws_status, ws_unlock, ws_lock, ws_pin_set, ws_pin_clear):
        websocket_api.async_register_command(hass, cmd)


@websocket_api.websocket_command({vol.Required("type"): "skylight/security/status"})
@callback
def ws_status(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    connection.send_result(msg["id"], {
        "pin_set": pin_set(hass), "unlocked": is_unlocked(hass, connection),
        "seconds_left": seconds_left(hass, connection) if pin_set(hass) else None,
        "lockout_seconds": _lockout_left(hass),
    })


@websocket_api.websocket_command({vol.Required("type"): "skylight/unlock", vol.Required("pin"): str})
@websocket_api.async_response
async def ws_unlock(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    if not pin_set(hass):
        connection.send_result(msg["id"], {"seconds_left": None})
        return
    if await _verify_with_lockout(hass, connection, msg["id"], msg["pin"]):
        connection.send_result(msg["id"], {"seconds_left": _mark_unlocked(hass, connection, msg["id"])})


@websocket_api.websocket_command({vol.Required("type"): "skylight/lock"})
@callback
def ws_lock(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    _state(hass)["unlocked"].pop(id(connection), None)
    connection.send_result(msg["id"])


@websocket_api.websocket_command(
    {vol.Required("type"): "skylight/pin/set", vol.Required("pin"): str, vol.Optional("current"): str}
)
@websocket_api.async_response
async def ws_pin_set(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    """Set the PIN (first time), or change it (needs the current PIN)."""
    if not PIN_RE.match(msg["pin"]):
        connection.send_error(msg["id"], "invalid", "The PIN must be 4 to 8 digits.")
        return
    if pin_set(hass) and not await _verify_with_lockout(hass, connection, msg["id"], msg.get("current", "")):
        return
    await _store(hass).async_set_pin(msg["pin"])
    lock_all(hass)
    connection.send_result(msg["id"], {"seconds_left": _mark_unlocked(hass, connection, msg["id"])})


@websocket_api.websocket_command({vol.Required("type"): "skylight/pin/clear", vol.Required("current"): str})
@websocket_api.async_response
async def ws_pin_clear(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    """Turn the PIN off (needs the current PIN). Admins can also clear it from the integration's options."""
    if pin_set(hass) and not await _verify_with_lockout(hass, connection, msg["id"], msg["current"]):
        return
    await _store(hass).async_set_pin(None)
    lock_all(hass)
    connection.send_result(msg["id"])
