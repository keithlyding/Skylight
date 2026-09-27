"""Static checks on the panel JS (catches deleted/renamed methods that are still called)."""

import pathlib
import re

JS = (pathlib.Path(__file__).parents[1] / "custom_components/skylight/frontend/skylight-panel.js").read_text()


def _defined_methods() -> set[str]:
    return set(re.findall(r"^  (?:async )?(?:get |set )?([A-Za-z_]\w*)\s*\(", JS, re.M))


def test_every_called_method_is_defined():
    called = set(re.findall(r"this\.((?:render|open|save|_load|_fit|_scroll)\w*)\(", JS))
    missing = sorted(called - _defined_methods())
    assert not missing, f"called but not defined: {missing}"


def test_every_calendar_view_has_a_renderer():
    views = re.findall(r'\["(\w+)", "[^"]+"\]', JS.split("const CAL_VIEWS = [", 1)[1].split("];", 1)[0])
    assert views == ["agenda", "day", "3day", "5day", "7day", "month"]


def test_panel_version_matches_manifest():
    import json
    manifest = json.loads((pathlib.Path(__file__).parents[1] / "custom_components/skylight/manifest.json").read_text())
    assert f'const PANEL_VERSION = "{manifest["version"]}"' in JS


def test_emoji_data_is_valid_module():
    import json
    data_js = (pathlib.Path(__file__).parents[1] / "custom_components/skylight/frontend/emoji-data.js").read_text()
    body = data_js.split("export default ", 1)[1].rstrip().rstrip(";")
    rows = json.loads(body)
    assert len(rows) > 1800
    words = {e: w for e, w, _ in rows}
    assert "bear" in words["🐻"] and "mow" in words["🚜"] and "trash" in words["🗑️"]
