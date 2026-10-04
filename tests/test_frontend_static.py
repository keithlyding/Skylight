"""Static checks on the panel JS (catches deleted/renamed methods that are still called)."""

import pathlib
import re

from panel_js import ALL, HELPERS

JS = ALL


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


def test_linked_list_fields_not_commented_out():
    """Regression (v1.30.0): a // comment mid-line hid name/owner/color of linked to-do lists."""
    line = next(l for l in JS.splitlines() if "id: `todo:${e}`, linked: true" in l)
    assert "//" not in line
    for field in ("name: this.entityName(e)", "owner:", "color:", "canMove:"):
        assert field in line


def test_module_imports_are_versioned():
    """Every import between panel files carries ?v=<version>, so an update never mixes old and new files."""
    import json
    from panel_js import FILES
    version = json.loads((pathlib.Path(__file__).parents[1] / "custom_components/skylight/manifest.json").read_text())["version"]
    for f in FILES:
        for spec in re.findall(r'^import .* from "([^"]+)";$', f.read_text(), re.M):
            target, _, query = spec.partition("?")
            assert query == f"v={version}", f"{f.name}: {spec}"
            assert (f.parent / target).resolve().is_file(), f"{f.name}: {spec} does not exist"


def test_helpers_used_are_imported():
    """A file that uses a shared helper must import it (otherwise it fails only when that code runs)."""
    from panel_js import SRC, FILES
    shared = {}
    for mod in ("helpers", "styles"):
        for name in re.findall(r"^export const ([A-Za-z_$][\w$]*)", (SRC / f"{mod}.js").read_text(), re.M):
            shared[name] = mod
    for f in FILES:
        text = f.read_text()
        own = set(re.findall(r"^export const ([A-Za-z_$][\w$]*)", text, re.M))
        imported = {n.strip() for group in re.findall(r"^import \{([^}]*)\} from", text, re.M) for n in group.split(",")}
        code = re.sub(r"^import .*$", "", text, flags=re.M)
        # (?<![^.]\.) skips property access (x.name) but still counts spreads (...name)
        used = {n for n in shared if n not in own and re.search(r"(?<![\w$])(?<![^.]\.)" + re.escape(n) + r"(?![\w$])", code)}
        assert used <= imported, f"{f.name} uses {sorted(used - imported)} without importing"


def test_alert_types():
    """NWS event names sort into the types offered in Setup."""
    import json
    import subprocess
    events = {
        "Tornado Warning": "tornado", "Tornado Watch": "tornado", "Severe Thunderstorm Warning": "thunderstorm",
        "Flash Flood Warning": "flood", "Flood Watch": "flood", "Coastal Flood Advisory": "flood",
        "Hydrologic Outlook": "flood", "Winter Storm Warning": "winter", "Wind Chill Advisory": "winter",
        "Freeze Warning": "winter", "Lake Effect Snow Warning": "winter", "Excessive Heat Warning": "heat",
        "Heat Advisory": "heat", "Red Flag Warning": "fire", "Dense Fog Advisory": "air", "Air Quality Alert": "air",
        "High Wind Warning": "wind", "Wind Advisory": "wind", "Hurricane Warning": "tropical",
        "Tropical Storm Watch": "tropical", "Rip Current Statement": "marine", "Small Craft Advisory": "marine",
        "Special Weather Statement": "other",
    }
    script = HELPERS + f"console.log(JSON.stringify({json.dumps(list(events))}.map(alertType)))"
    try:
        got = json.loads(subprocess.run(["node", "-e", script], capture_output=True, text=True, check=True).stdout)
    except FileNotFoundError:
        import pytest
        pytest.skip("node not installed")
    assert dict(zip(events, got)) == events
