import pathlib

import pytest

# pytest-homeassistant-custom-component ships its own `custom_components`
# package; add this repo's folder to it so our integration is discoverable.
import custom_components

_ours = str(pathlib.Path(__file__).parents[1] / "custom_components")
if _ours not in custom_components.__path__:
    custom_components.__path__.append(_ours)


@pytest.fixture(autouse=True)
def auto_enable_custom_integrations(enable_custom_integrations):
    yield
