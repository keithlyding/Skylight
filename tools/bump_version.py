"""Set the Skylight version everywhere it appears.

    python3 tools/bump_version.py 1.35.0

Updates manifest.json, const.py, PANEL_VERSION, and the ?v= on every import between
panel files (so browsers load the new files together after an update).
"""

import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).parents[1] / "custom_components" / "skylight"


def main(version: str) -> None:
    if not re.fullmatch(r"\d+\.\d+\.\d+", version):
        sys.exit(f"not a version: {version}")
    manifest = ROOT / "manifest.json"
    data = json.loads(manifest.read_text())
    data["version"] = version
    manifest.write_text(json.dumps(data, indent=2) + "\n")
    const = ROOT / "const.py"
    const.write_text(re.sub(r'^VERSION = "[^"]+"', f'VERSION = "{version}"', const.read_text(), flags=re.M))
    frontend = ROOT / "frontend"
    for f in [frontend / "skylight-panel.js", *sorted((frontend / "src").glob("*.js"))]:
        text = f.read_text()
        text = re.sub(r'^(export )?const PANEL_VERSION = "[^"]+"', lambda m: f'{m.group(1) or ""}const PANEL_VERSION = "{version}"', text, flags=re.M)
        text = re.sub(r'^(import .* from "[^"?]+)\?v=[^"]*(";)$', lambda m: f"{m.group(1)}?v={version}{m.group(2)}", text, flags=re.M)
        f.write_text(text)
    print(f"Skylight version set to {version}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "")
