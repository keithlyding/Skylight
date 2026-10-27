"""All-day events on Google calendars are created as Free; existing ones can be fixed."""

from datetime import date, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock

from gcal_sync.model import Event
from homeassistant.util import dt as dt_util

from custom_components.skylight import calendar_events as ce


def _entity(platform="google", events=()):
    coordinator = SimpleNamespace(
        sync=SimpleNamespace(store_service=SimpleNamespace(async_add_event=AsyncMock()), api=SimpleNamespace(async_patch_event=AsyncMock())),
        async_refresh=AsyncMock(), async_get_events=AsyncMock(return_value=list(events)))
    return SimpleNamespace(platform=SimpleNamespace(platform_name=platform), coordinator=coordinator,
                           calendar_id="fam@group.calendar.google.com", async_create_event=AsyncMock(), entity_id="calendar.family")


async def test_all_day_google_event_is_free():
    e = _entity()
    await ce.async_create_event(e, {"summary": "Vacation", "dtstart": date(2026, 11, 2), "dtend": date(2026, 11, 5), "location": "Beach"})
    e.async_create_event.assert_not_awaited()
    ev = e.coordinator.sync.store_service.async_add_event.await_args.args[0]
    assert ev.transparency == "transparent" and ev.summary == "Vacation" and ev.location == "Beach"
    assert ev.start.date == date(2026, 11, 2) and ev.end.date == date(2026, 11, 5) and ev.start.date_time is None
    e.coordinator.async_refresh.assert_awaited_once()


async def test_all_day_google_series_keeps_its_rule():
    e = _entity()
    await ce.async_create_event(e, {"summary": "Trash day", "dtstart": date(2026, 11, 2), "dtend": date(2026, 11, 3), "rrule": "FREQ=WEEKLY"})
    ev = e.coordinator.sync.store_service.async_add_event.await_args.args[0]
    assert ev.recurrence == ["RRULE:FREQ=WEEKLY"] and ev.transparency == "transparent"


async def test_timed_google_event_stays_busy_on_the_normal_path():
    e = _entity()
    start = datetime(2026, 11, 2, 9, tzinfo=dt_util.get_default_time_zone())
    event = {"summary": "Dentist", "dtstart": start, "dtend": start + timedelta(hours=1)}
    await ce.async_create_event(e, event)
    e.async_create_event.assert_awaited_once_with(**event)
    e.coordinator.sync.store_service.async_add_event.assert_not_awaited()


async def test_busy_override_and_free_timed_event():
    e = _entity()
    await ce.async_create_event(e, {"summary": "Spirit week", "dtstart": date(2026, 11, 2), "dtend": date(2026, 11, 3)}, busy=True)
    e.async_create_event.assert_awaited_once()  # asked for Busy: Home Assistant's own path
    e = _entity()
    start = datetime(2026, 11, 2, 9, tzinfo=dt_util.get_default_time_zone())
    await ce.async_create_event(e, {"summary": "Heads-up", "dtstart": start, "dtend": start + timedelta(hours=1)}, busy=False)
    ev = e.coordinator.sync.store_service.async_add_event.await_args.args[0]
    assert ev.transparency == "transparent" and ev.start.date_time is not None and ev.start.timezone


async def test_other_calendars_are_untouched():
    e = _entity(platform="local_calendar")
    event = {"summary": "Vacation", "dtstart": date(2026, 11, 2), "dtend": date(2026, 11, 5)}
    await ce.async_create_event(e, event)
    e.async_create_event.assert_awaited_once_with(**event)


def _ev(**kw):
    return Event.model_validate({"summary": "x", **kw})


async def test_free_existing_all_day_events_once_per_series():
    tz = dt_util.get_default_time_zone()
    events = [
        _ev(id="single", start={"date": "2026-11-02"}, end={"date": "2026-11-03"}),  # busy all-day → fixed
        _ev(id="already", start={"date": "2026-11-04"}, end={"date": "2026-11-05"}, transparency="transparent"),  # skipped
        _ev(id="timed", start={"dateTime": "2026-11-02T09:00:00-05:00"}, end={"dateTime": "2026-11-02T10:00:00-05:00"}),  # skipped
        _ev(id="series_1", recurringEventId="series", start={"date": "2026-11-06"}, end={"date": "2026-11-07"}),
        _ev(id="series_2", recurringEventId="series", start={"date": "2026-11-13"}, end={"date": "2026-11-14"}),
    ]
    e = _entity(events=events)
    n = await ce.async_free_all_day(e, datetime(2026, 11, 1, tzinfo=tz), datetime(2027, 1, 1, tzinfo=tz))
    assert n == 2
    patched = [(c.args[1], c.args[2]) for c in e.coordinator.sync.api.async_patch_event.await_args_list]
    assert patched == [("single", {"transparency": "transparent"}), ("series", {"transparency": "transparent"})]
    assert all(c.args[0] == "fam@group.calendar.google.com" for c in e.coordinator.sync.api.async_patch_event.await_args_list)
    e.coordinator.async_refresh.assert_awaited_once()


async def test_nothing_to_fix_means_no_refresh():
    e = _entity(events=[_ev(id="a", start={"date": "2026-11-02"}, end={"date": "2026-11-03"}, transparency="transparent")])
    tz = dt_util.get_default_time_zone()
    assert await ce.async_free_all_day(e, datetime(2026, 11, 1, tzinfo=tz), datetime(2027, 1, 1, tzinfo=tz)) == 0
    e.coordinator.async_refresh.assert_not_awaited()
