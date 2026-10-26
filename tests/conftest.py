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


@pytest.fixture(autouse=True)
def _views_after_server_start(monkeypatch):
    """Let components register HTTP views after the test server has started.

    Home Assistant allows this in production (http.start() disables the aiohttp router freeze) and
    the HA test plugin does the same inside its aiohttp_client fixture. But pytest-aiohttp ships a
    fixture of the same name, and whichever plugin pytest registers last wins; on some CI runners
    that is pytest-aiohttp, the router freezes, and every test that creates a calendar after the
    client has connected fails with "Cannot register a resource into frozen router". Make the
    production behaviour unconditional here.
    """
    from aiohttp.web_urldispatcher import UrlDispatcher

    monkeypatch.setattr(UrlDispatcher, "freeze", lambda self: None)
