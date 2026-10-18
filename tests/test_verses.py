"""Verse of the day: rotation, translations (ESV with a key, NET, bible-api.com), offline text, key secrecy."""

import re
from datetime import date

import pytest
from homeassistant.core import HomeAssistant
from homeassistant.setup import async_setup_component
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.skylight import verses
from custom_components.skylight.const import DOMAIN

ESV = re.compile(r"^https://api\.esv\.org/v3/passage/text/")
NET = re.compile(r"^https://labs\.bible\.org/api/")
BIBLE_API = re.compile(r"^https://bible-api\.com/")


def test_rotation_is_by_date():
    s = {}
    a, b = verses.pick(date(2026, 10, 18), s), verses.pick(date(2026, 10, 19), s)
    assert a != b and verses.pick(date(2026, 10, 18), s) == a
    refs = {verses.pick(date(2026, 1, 1).fromordinal(date(2026, 1, 1).toordinal() + i), s) for i in range(len(verses.CURATED))}
    assert len(refs) == len(verses.CURATED)  # every built-in verse gets a day
    assert len(verses.CURATED) == len(verses.KJV_TEXT) and all(t.strip() for _, t in verses.CURATED)


def test_family_verses_alternate_or_only():
    fam = ["Joshua 24:15", "Philippians 4:13"]
    s = {"family_verses": fam}
    days = [date(2026, 10, 18).fromordinal(date(2026, 10, 18).toordinal() + i) for i in range(6)]
    picks = [verses.pick(d, s) for d in days]
    assert sum(p in fam for p in picks) == 3 and all(p not in fam for p in picks if p not in fam)
    assert set(p for p in picks if p in fam) == set(fam)  # both get a turn
    only = [verses.pick(d, {**s, "verse_only_family": True}) for d in days]
    assert all(p in fam for p in only) and set(only) == set(fam)


def test_clean_refs():
    assert verses.clean_refs(["  Psalm   23:1-3 ", "1 John 4:19", "john 3:16,18", "Song of Solomon 2:4", "Psalm 23", "psalm 23", "", 7,
                              "<b>x</b> 1:1", "Psalm 23:1; DROP"]) == ["Psalm 23:1-3", "1 John 4:19", "john 3:16,18", "Song of Solomon 2:4", "Psalm 23"]
    assert verses.clean_refs("Psalm 23") == [] and len(verses.clean_refs([f"Psalm {i}" for i in range(1, 80)])) == verses.MAX_FAMILY


def test_translation_choice():
    assert verses.translation_code({}, False) == "net" and verses.translation_code({}, True) == "esv"
    assert verses.translation_code({"verse_translation": "kjv"}, False) == "kjv"
    assert verses.translation_code({"verse_translation": "nasb"}, False) == "net"  # unknown: the default, NET without a key


def test_offline_text():
    assert verses.offline("John 3:16", date(2026, 1, 1)) == {"reference": "John 3:16", "text": verses.KJV_TEXT["John 3:16"],
                                                              "translation": "KJV", "name": "King James Version", "offline": True}
    assert verses.offline("Obadiah 1:1", date(2026, 1, 1))["reference"] == verses.pick(date(2026, 1, 1), {})


@pytest.fixture
async def ws(hass: HomeAssistant, tmp_path, hass_ws_client):
    hass.config.config_dir = str(tmp_path)
    assert await async_setup_component(hass, "http", {})
    entry = MockConfigEntry(domain="skylight", data={})
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    return await hass_ws_client(hass)


async def _cmd(ws, msg, _id=[700]):
    _id[0] += 1
    await ws.send_json({"id": _id[0], **msg})
    while True:
        r = await ws.receive_json()
        if r.get("id") == _id[0] and r["type"] == "result":
            return r


async def test_net_without_key_then_esv_with_key(hass, ws, aioclient_mock):
    aioclient_mock.get(NET, json=[{"bookname": "John", "chapter": "3", "verse": "16", "text": "For this is the way <b>God</b> loved the world: He gave his one and only Son."}])
    aioclient_mock.get(ESV, json={"canonical": "John 3:16", "passages": ["For God so loved the world, that he gave his only Son.\n\n"]})
    await _cmd(ws, {"type": "skylight/set", "key": "settings", "value": {"family_verses": ["John 3:16"], "verse_only_family": True}})
    r = (await _cmd(ws, {"type": "skylight/verse/today"}))["result"]
    assert r["translation"] == "NET" and r["offline"] is False and r["reference"] == "John 3:16"
    assert r["text"] == "For this is the way God loved the world: He gave his one and only Son."  # tags stripped
    assert len(aioclient_mock.mock_calls) == 1 and "passage=John" in str(aioclient_mock.mock_calls[0][1])
    assert (await _cmd(ws, {"type": "skylight/verse/today"}))["result"] == r and len(aioclient_mock.mock_calls) == 1  # remembered

    assert (await _cmd(ws, {"type": "skylight/verse/configure", "esv_key": "ESVKEY9"}))["success"]
    r = (await _cmd(ws, {"type": "skylight/verse/today"}))["result"]
    assert r["translation"] == "ESV" and r["name"] == "English Standard Version" and r["text"] == "For God so loved the world, that he gave his only Son."
    call = aioclient_mock.mock_calls[-1]
    assert call[3]["Authorization"] == "Token ESVKEY9" and call[1].query["include-verse-numbers"] == "false"
    data = (await _cmd(ws, {"type": "skylight/get"}))["result"]
    assert data["bible"] == {"has_esv_key": True} and "ESVKEY9" not in str(data)
    backup = (await _cmd(ws, {"type": "skylight/backup/export"}))["result"]
    assert "ESVKEY9" not in str(backup) and "bible" not in backup["data"]
    assert hass.data[DOMAIN]["store"].data["bible"]["esv_key"] == "ESVKEY9"


async def test_public_domain_via_bible_api_and_offline_fallback(hass, ws, aioclient_mock):
    aioclient_mock.get(BIBLE_API, json={"reference": "Psalm 23:1", "text": "Yahweh is my shepherd:\nI shall lack nothing.\n", "translation_id": "web"})
    await _cmd(ws, {"type": "skylight/set", "key": "settings", "value": {"verse_translation": "web", "family_verses": ["Psalm 23:1"], "verse_only_family": True}})
    r = (await _cmd(ws, {"type": "skylight/verse/today"}))["result"]
    assert r["translation"] == "WEB" and r["text"] == "Yahweh is my shepherd: I shall lack nothing."
    assert str(aioclient_mock.mock_calls[0][1]).startswith("https://bible-api.com/Psalm%2023:1?translation=web")

    # the service is down: the built-in King James text, marked offline, with the reason for Setup
    aioclient_mock.clear_requests()
    aioclient_mock.get(BIBLE_API, status=503)
    await _cmd(ws, {"type": "skylight/set", "key": "settings", "value": {"verse_translation": "kjv"}})
    r = (await _cmd(ws, {"type": "skylight/verse/today"}))["result"]
    assert r["offline"] is True and r["translation"] == "KJV" and r["text"] == verses.KJV_TEXT["Psalm 23:1"] and "503" in r["error"]
    # a reference the service doesn't know: the day's built-in verse instead, and no retry storm
    aioclient_mock.clear_requests()
    aioclient_mock.get(BIBLE_API, status=404, json={"error": "not found"})
    await _cmd(ws, {"type": "skylight/set", "key": "settings", "value": {"family_verses": ["Hezekiah 3:1"]}})
    r = (await _cmd(ws, {"type": "skylight/verse/today"}))["result"]
    assert r["offline"] is True and r["reference"] in verses.KJV_TEXT and "isn't a passage" in r["error"]
    n = len(aioclient_mock.mock_calls)
    await _cmd(ws, {"type": "skylight/verse/today"})
    assert len(aioclient_mock.mock_calls) == n


async def test_off_and_locked(hass, ws, aioclient_mock, hass_ws_client):
    await _cmd(ws, {"type": "skylight/set", "key": "settings", "value": {"verse_today": False, "verse_saver": False}})
    assert (await _cmd(ws, {"type": "skylight/verse/today"}))["result"] is None and not aioclient_mock.mock_calls
    await _cmd(ws, {"type": "skylight/pin/set", "pin": "1234"})
    other = await hass_ws_client(hass)
    r = await _cmd(other, {"type": "skylight/verse/configure", "esv_key": "x"})
    assert not r["success"] and r["error"]["code"] == "locked"
    assert hass.data[DOMAIN]["store"].data["settings"]["verse_translation"] == "esv"
    await _cmd(ws, {"type": "skylight/set", "key": "settings", "value": {"verse_translation": "nasb"}})
    assert hass.data[DOMAIN]["store"].data["settings"]["verse_translation"] == "esv"  # unknown codes are ignored
