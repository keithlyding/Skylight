"""Event reminders: stored per event, matched to the real event, sent once to the right phones/screens."""

from datetime import datetime, timedelta

from homeassistant.core import HomeAssistant
from homeassistant.setup import async_setup_component
from homeassistant.util import dt as dt_util
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.skylight import reminders


def test_fire_time():
    tz = dt_util.get_default_time_zone()
    start = datetime(2026, 10, 7, 16, 0, tzinfo=tz)
    assert reminders.fire_time(start, "30") == datetime(2026, 10, 7, 15, 30, tzinfo=tz)
    assert reminders.fire_time(start, "0") == start
    assert reminders.fire_time(start, "1440") == datetime(2026, 10, 6, 16, 0, tzinfo=tz)
    assert reminders.fire_time(start, "eve") == datetime(2026, 10, 6, 19, 0, tzinfo=tz)


def test_clean_meta():
    assert reminders.clean_meta({"entity": "calendar.x", "remind": "30", "summary": "A", "start": "2026-10-07T16:00:00"})
    assert reminders.clean_meta({"entity": "calendar.x", "remind": "7"}) is None  # not a choice
    assert reminders.clean_meta({"entity": "light.x", "remind": "30", "uid": "u"}) is None
    assert reminders.clean_meta({"entity": "calendar.x", "remind": "30"}) is None  # no way to find the event


class _Ev:
    def __init__(self, uid, summary, start, location=None, end=None):
        self.uid, self.summary, self.start, self.location, self.rrule = uid, summary, start, location, None
        self.end = end


class _Cal:
    def __init__(self):
        self.events = []

    async def async_get_events(self, hass, start, end):
        return [e for e in self.events if start <= e.start < end]


class _Component:
    def __init__(self, cals):
        self.cals = cals

    def get_entity(self, entity_id):
        return self.cals.get(entity_id)


async def _setup(hass: HomeAssistant, tmp_path, hass_ws_client):
    hass.config.config_dir = str(tmp_path)
    assert await async_setup_component(hass, "http", {})
    entry = MockConfigEntry(domain="skylight", data={})
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    cal = _Cal()
    hass.data["calendar"] = _Component({"calendar.family": cal})
    sent = []

    async def phone(call):
        sent.append((call.service, call.data))

    for svc in ("mobile_app_alex", "mobile_app_kids", "mobile_app_wife"):
        hass.services.async_register("notify", svc, phone)
    return cal, sent, await hass_ws_client(hass)


async def test_reminder_flow(hass, tmp_path, hass_ws_client):
    cal, sent, ws = await _setup(hass, tmp_path, hass_ws_client)
    store = hass.data["skylight"]["store"]
    rem = hass.data["skylight"]["reminders"]
    now = dt_util.now().replace(microsecond=0)
    start = now + timedelta(minutes=20)
    store.data["settings"]["reminder_phones"] = {
        "mobile_app_alex": {"mode": "all"},
        "mobile_app_kids": {"mode": "members", "members": ["sam"]},
        "mobile_app_wife": {"mode": "off"},
    }
    fired = []
    hass.bus.async_listen(reminders.EVENT_REMINDER, lambda e: fired.append(e.data))

    # Saved from the event editor right after creating the event: no uid yet.
    await ws.send_json({"id": 1, "type": "skylight/reminder/set", "key": "", "meta": {
        "entity": "calendar.family", "summary": "Dentist", "start": start.isoformat(), "remind": "30", "members": ["alex"]}})
    r = await ws.receive_json()
    assert r["success"] and r["result"]["key"] == f"calendar.family|Dentist|{start.isoformat()}"
    cal.events.append(_Ev("g-123", "Dentist", start, "Main St", start + timedelta(minutes=45)))

    await rem._tick(now)
    await hass.async_block_till_done()
    assert list(store.data["event_meta"]) == ["g-123"]  # learned the event's uid
    assert [s for s, _ in sent] == ["mobile_app_alex"]  # kids' phone only gets Sam's events; wife's is off
    assert sent[0][1]["title"] == "⏰ Dentist" and "Main St" in sent[0][1]["message"]
    assert fired and fired[0]["summary"] == "Dentist" and fired[0]["end"] == (start + timedelta(minutes=45)).isoformat()

    await rem._tick(now + timedelta(minutes=1))
    await hass.async_block_till_done()
    assert len(sent) == 1  # sent once

    # Moved in Google to tomorrow: matched by uid, reminded again at the new time.
    cal.events[0].start = start + timedelta(days=1)
    rem.invalidate()
    await rem._tick(now + timedelta(days=1))
    await hass.async_block_till_done()
    assert len(sent) == 2

    # Removing the reminder
    await ws.send_json({"id": 2, "type": "skylight/reminder/set", "key": "g-123", "meta": None})
    assert (await ws.receive_json())["success"]
    assert store.data["event_meta"] == {}
    assert "reminders_sent" not in store.public()


async def test_screens_get_reminders(hass, tmp_path, hass_ws_client):
    _cal, _sent, ws = await _setup(hass, tmp_path, hass_ws_client)
    await ws.send_json({"id": 5, "type": "skylight/reminder/subscribe"})
    assert (await ws.receive_json())["success"]
    hass.bus.async_fire(reminders.EVENT_REMINDER, {"summary": "Soccer", "message": "Today at 4:00 PM"})
    msg = await ws.receive_json()
    assert msg["type"] == "event" and msg["event"]["summary"] == "Soccer"


async def test_diag_report_goes_to_the_log(hass, tmp_path, hass_ws_client, caplog):
    _cal, _sent, ws = await _setup(hass, tmp_path, hass_ws_client)
    await ws.send_json({"id": 9, "type": "skylight/diag/report", "text": "12:00:01 render home"})
    assert (await ws.receive_json())["success"]
    assert "Lyding Strike diagnostics" in caplog.text and "render home" in caplog.text
