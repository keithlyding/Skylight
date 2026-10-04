"""The panel's JavaScript, for tests: all of it as one string, and the DOM-free helpers as a plain script."""

import pathlib
import re

FRONTEND = pathlib.Path(__file__).parents[1] / "custom_components/skylight/frontend"
SRC = FRONTEND / "src"
FILES = [FRONTEND / "skylight-panel.js", *sorted(SRC.glob("*.js"))]

# Every panel file joined (for "is this string in the panel" checks).
ALL = "\n".join(f.read_text() for f in FILES)


def _plain(path: pathlib.Path) -> str:
    """A module as a classic script: drop imports and the `export` keyword."""
    text = re.sub(r"^import .*$", "", path.read_text(), flags=re.M)
    return re.sub(r"^export ", "", text, flags=re.M)


# helpers.js, runnable with `node -e HELPERS + "...script..."`.
HELPERS = _plain(SRC / "helpers.js") + "\n"
