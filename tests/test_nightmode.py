"""Phase 6: night hours (scheduled and sunset-to-sunrise), brightness, theme presets."""

import json
import pathlib
import re
import subprocess
from datetime import datetime, timedelta, timezone

import pytest
from homeassistant.core import HomeAssistant
from homeassistant.setup import async_setup_component
from pytest_homeassistant_custom_component.common import MockConfigEntry, async_mock_service

from custom_components.skylight import nightmode

DOMAIN = "skylight"
JS = (pathlib.Path(__file__).parents[1] / "custom_components/skylight/frontend/skylight-panel.js").read_text()


def _t(h, m=0):
    return datetime(2026, 1, 15, h, m)


def test_window_same_day_and_across_midnight():
    # 21:00 -> 06:30 crosses midnight
    s = {"night_start": "21:00", "night_end": "06:30"}
    assert nightmode.is_night(s, _t(21, 0)) and nightmode.is_night(s, _t(23, 59))
    assert nightmode.is_night(s, _t(0, 0)) and nightmode.is_night(s, _t(6, 29))
    assert not nightmode.is_night(s, _t(6, 30)) and not nightmode.is_night(s, _t(12)) and not nightmode.is_night(s, _t(20, 59))
    # 13:00 -> 15:00 within one day (e.g. nap time)
    d = {"night_start": "13:00", "night_end": "15:00"}
    assert nightmode.is_night(d, _t(14)) and not nightmode.is_night(d, _t(15)) and not nightmode.is_night(d, _t(12, 59))
    # empty and bad values fall back / are empty
    assert not nightmode.in_window(600, 600, 600)
    assert nightmode.parse_hm("25:00", 42) == 42 and nightmode.parse_hm("nope", 7) == 7 and nightmode.parse_hm("06:05", 0) == 365


def test_sunset_to_sunrise():
    s = {"dark_mode": "sun"}
    now = datetime(2026, 6, 1, 23, 0, tzinfo=timezone.utc)
    rise, set_ = now + timedelta(hours=7), now + timedelta(hours=21)  # after sunset: next event is sunrise
    assert nightmode.is_night(s, now, rise, set_) is True
    assert nightmode.is_night(s, now, now + timedelta(hours=31), now + timedelta(hours=8)) is False  # daytime
    assert nightmode.is_night(s, now, None, None) is False  # no sun data: treat as day
    # the schedule times are ignored in sun mode
    assert nightmode.is_night({**s, "night_start": "00:00", "night_end": "23:59"}, now, now + timedelta(hours=31), now + timedelta(hours=8)) is False


def test_js_night_rules_match_python():
    helpers = JS[JS.index("const pad = "):JS.index("class SkylightPanel")]
    windows = [("21:00", "06:30"), ("13:00", "15:00"), ("00:00", "00:00"), ("22:15", "07:45"), ("bad", "06:00")]
    times = [(h, m) for h in range(24) for m in (0, 14, 15, 29, 30, 45, 59)]
    script = helpers + f"""
const ws = {json.dumps(windows)}, ts = {json.dumps(times)};
const out = ws.map(([a, b]) => ts.map(([h, m]) => isNightAt({{night_start: a, night_end: b}}, new Date(2026, 0, 15, h, m))));
const now = new Date(2026, 5, 1, 23);
out.push([isNightAt({{dark_mode: "sun"}}, now, new Date(+now + 7 * 3.6e6), new Date(+now + 21 * 3.6e6)),
          isNightAt({{dark_mode: "sun"}}, now, new Date(+now + 31 * 3.6e6), new Date(+now + 8 * 3.6e6)),
          isNightAt({{dark_mode: "sun"}}, now)]);
console.log(JSON.stringify(out));"""
    try:
        js = json.loads(subprocess.run(["node", "-e", script], capture_output=True, text=True, check=True).stdout)
    except FileNotFoundError:
        pytest.skip("node not installed")
    py = [[nightmode.is_night({"night_start": a, "night_end": b}, _t(h, m)) for h, m in times] for a, b in windows]
    assert js[:-1] == py
    assert js[-1] == [True, False, False]


def test_every_theme_defines_every_variable():
    vars_ = json.loads(re.search(r"const THEME_VARS = (\[[^\]]*\]);", JS).group(1))
    assert {"--bg", "--card", "--ink", "--muted", "--line", "--accent"} <= set(vars_)
    helpers = JS[JS.index("const pad = "):JS.index("class SkylightPanel")]
    try:
        themes = json.loads(subprocess.run(["node", "-e", helpers + "console.log(JSON.stringify(THEMES))"],
                                           capture_output=True, text=True, check=True).stdout)
    except FileNotFoundError:
        pytest.skip("node not installed")
    assert set(themes) == {"warm", "cool", "slate", "contrast"}
    for name, t in themes.items():
        for mode in ("light", "dark"):
            missing = [v for v in vars_ if not t[mode].get(v)]
            assert not missing, f"{name}/{mode} is missing {missing}"
    # every variable the stylesheet relies on for surfaces/text is themeable
    for v in ("--bg", "--card", "--ink", "--muted", "--line", "--accent"):
        assert f"var({v}" in JS


def test_seasons():
    helpers = JS[JS.index("const pad = "):JS.index("class SkylightPanel")]
    days = ["2026-07-01", "2026-07-05", "2026-07-06", "2026-10-15", "2026-10-31", "2026-11-23", "2026-11-26", "2026-11-29",
            "2026-11-30", "2026-12-01", "2026-12-26", "2026-12-27", "2026-03-19", "2026-03-20", "2026-06-21", "2026-09-22"]
    script = helpers + f"console.log(JSON.stringify({json.dumps(days)}.map((d) => seasonFor(parseYmd(d)).key)))"
    try:
        got = json.loads(subprocess.run(["node", "-e", script], capture_output=True, text=True, check=True).stdout)
    except FileNotFoundError:
        pytest.skip("node not installed")
    # Thanksgiving 2026 is Thu Nov 26; its week is Nov 23-29
    assert got == ["july4", "july4", "summer", "halloween", "halloween", "thanksgiving", "thanksgiving", "thanksgiving",
                   "fall", "christmas", "christmas", "winter", "winter", "spring", "summer", "fall"]


async def test_brightness_follows_night(hass: HomeAssistant, tmp_path):
    hass.config.config_dir = str(tmp_path)
    (tmp_path / ".storage").mkdir()
    assert await async_setup_component(hass, "http", {})
    e = MockConfigEntry(domain=DOMAIN, data={})
    e.add_to_hass(hass)
    assert await hass.config_entries.async_setup(e.entry_id)
    calls = async_mock_service(hass, "number", "set_value")
    lights = async_mock_service(hass, "light", "turn_on")
    # Fully Kiosk's screen brightness: 0-255
    hass.states.async_set("number.tablet_screen_brightness", "200", {"min": 0, "max": 255, "step": 1})
    hass.states.async_set("light.kitchen", "on")
    store = hass.data[DOMAIN]["store"]
    store.data["settings"].update({"night_dim": True, "brightness_entity": "number.tablet_screen_brightness",
                                   "day_brightness": 80, "night_brightness": 20, "night_start": "21:00", "night_end": "06:30"})
    day, night = datetime(2026, 1, 15, 12), datetime(2026, 1, 15, 22)
    assert await nightmode.async_apply(hass, day) is False
    assert await nightmode.async_apply(hass, day) is False  # no change -> no second call
    await hass.async_block_till_done()
    assert [c.data for c in calls] == [{"entity_id": "number.tablet_screen_brightness", "value": 204.0}]
    assert await nightmode.async_apply(hass, night) is True
    await hass.async_block_till_done()
    assert calls[-1].data["value"] == 51.0 and len(calls) == 2
    # a light entity gets brightness_pct
    store.data["settings"]["brightness_entity"] = "light.kitchen"
    await nightmode.async_apply(hass, night)
    await hass.async_block_till_done()
    assert lights[-1].data == {"entity_id": "light.kitchen", "brightness_pct": 20}
    # off -> nothing is called
    store.data["settings"]["night_dim"] = False
    assert await nightmode.async_apply(hass, day) is None
    await hass.async_block_till_done()
    assert len(calls) == 2 and len(lights) == 1
    # unsupported domain is ignored safely
    store.data["settings"].update({"night_dim": True, "brightness_entity": "switch.something"})
    assert nightmode.brightness_call(hass, "switch.something", 50) is None
