"""Verse of the day: a Bible verse on the Today screen and the photo screensaver.

One verse per day, the same on every screen: the family's own references (Setup → Bible verse) and a
built-in list of well-known verses, chosen by the date. Home Assistant fetches the text once a day
in the chosen translation and keeps it in memory:

- ESV: Crossway's ESV API (api.esv.org), free for non-commercial use with a key the family requests
  themselves. The key is kept on the server, never sent to the browser or put in backups.
- NET: the NET Bible API (labs.bible.org), no key.
- WEB / KJV: bible-api.com (public domain texts), no key.

NASB, NIV and CSB are not offered: their publishers only license them through paid API plans.
If the text can't be fetched (offline, bad key), the built-in King James text is shown instead.
"""

from __future__ import annotations

import logging
import re
from datetime import date
from typing import Any

import aiohttp
import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.util import dt as dt_util

from . import security
from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)

CACHE_KEY = f"{DOMAIN}_verse"
TIMEOUT = aiohttp.ClientTimeout(total=10)
HEADERS = {"User-Agent": "Skylight (Home Assistant)"}
ESV_URL = "https://api.esv.org/v3/passage/text/"
NET_URL = "https://labs.bible.org/api/"
BIBLE_API_URL = "https://bible-api.com/"
RETRY_SECONDS = 10 * 60  # after a failed fetch, try again this often
MAX_FAMILY = 50
MAX_REF = 60

# code: (short label shown after the reference, full name, needs a key)
TRANSLATIONS = {
    "esv": ("ESV", "English Standard Version", True),
    "net": ("NET", "NET Bible", False),
    "web": ("WEB", "World English Bible", False),
    "kjv": ("KJV", "King James Version", False),
}
DEFAULT_TRANSLATION = "esv"
FALLBACK = "net"  # used when ESV is chosen but no key is saved

# "Psalm 23:1-3", "1 John 4:19", "John 3:16,18", "Song of Solomon 2:4", "Psalm 23"
REF_RE = re.compile(r"^[1-3]? ?[A-Za-z][A-Za-z .]{1,30} ?\d{1,3}(:\d{1,3})?([-–]\d{1,3}(:\d{1,3})?)?(, ?\d{1,3}([-–]\d{1,3})?)*$")
TAG_RE = re.compile(r"<[^>]+>")

# Built-in rotation, with the public-domain King James text as the offline fallback.
CURATED: list[tuple[str, str]] = [
    ("John 3:16", "For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life."),
    ("Psalm 118:24", "This is the day which the LORD hath made; we will rejoice and be glad in it."),
    ("Proverbs 3:5-6", "Trust in the LORD with all thine heart; and lean not unto thine own understanding. In all thy ways acknowledge him, and he shall direct thy paths."),
    ("Philippians 4:13", "I can do all things through Christ which strengtheneth me."),
    ("Lamentations 3:22-23", "It is of the LORD's mercies that we are not consumed, because his compassions fail not. They are new every morning: great is thy faithfulness."),
    ("Joshua 1:9", "Have not I commanded thee? Be strong and of a good courage; be not afraid, neither be thou dismayed: for the LORD thy God is with thee whithersoever thou goest."),
    ("Psalm 23:1", "The LORD is my shepherd; I shall not want."),
    ("Jeremiah 29:11", "For I know the thoughts that I think toward you, saith the LORD, thoughts of peace, and not of evil, to give you an expected end."),
    ("Matthew 11:28", "Come unto me, all ye that labour and are heavy laden, and I will give you rest."),
    ("Romans 8:28", "And we know that all things work together for good to them that love God, to them who are the called according to his purpose."),
    ("Isaiah 41:10", "Fear thou not; for I am with thee: be not dismayed; for I am thy God: I will strengthen thee; yea, I will help thee; yea, I will uphold thee with the right hand of my righteousness."),
    ("1 Thessalonians 5:16-18", "Rejoice evermore. Pray without ceasing. In every thing give thanks: for this is the will of God in Christ Jesus concerning you."),
    ("Psalm 46:1", "God is our refuge and strength, a very present help in trouble."),
    ("Philippians 4:6-7", "Be careful for nothing; but in every thing by prayer and supplication with thanksgiving let your requests be made known unto God. And the peace of God, which passeth all understanding, shall keep your hearts and minds through Christ Jesus."),
    ("Proverbs 22:6", "Train up a child in the way he should go: and when he is old, he will not depart from it."),
    ("Isaiah 40:31", "But they that wait upon the LORD shall renew their strength; they shall mount up with wings as eagles; they shall run, and not be weary; and they shall walk, and not faint."),
    ("Psalm 119:105", "Thy word is a lamp unto my feet, and a light unto my path."),
    ("Matthew 6:33", "But seek ye first the kingdom of God, and his righteousness; and all these things shall be added unto you."),
    ("1 Corinthians 13:13", "And now abideth faith, hope, charity, these three; but the greatest of these is charity."),
    ("Galatians 5:22-23", "But the fruit of the Spirit is love, joy, peace, longsuffering, gentleness, goodness, faith, Meekness, temperance: against such there is no law."),
    ("Psalm 37:4", "Delight thyself also in the LORD; and he shall give thee the desires of thine heart."),
    ("Ephesians 2:8-9", "For by grace are ye saved through faith; and that not of yourselves: it is the gift of God: Not of works, lest any man should boast."),
    ("Micah 6:8", "He hath shewed thee, O man, what is good; and what doth the LORD require of thee, but to do justly, and to love mercy, and to walk humbly with thy God?"),
    ("Colossians 3:23-24", "And whatsoever ye do, do it heartily, as to the Lord, and not unto men; Knowing that of the Lord ye shall receive the reward of the inheritance: for ye serve the Lord Christ."),
    ("Psalm 27:1", "The LORD is my light and my salvation; whom shall I fear? the LORD is the strength of my life; of whom shall I be afraid?"),
    ("Hebrews 11:1", "Now faith is the substance of things hoped for, the evidence of things not seen."),
    ("2 Timothy 1:7", "For God hath not given us the spirit of fear; but of power, and of love, and of a sound mind."),
    ("Psalm 34:8", "O taste and see that the LORD is good: blessed is the man that trusteth in him."),
    ("James 1:5", "If any of you lack wisdom, let him ask of God, that giveth to all men liberally, and upbraideth not; and it shall be given him."),
    ("Romans 15:13", "Now the God of hope fill you with all joy and peace in believing, that ye may abound in hope, through the power of the Holy Ghost."),
    ("Psalm 100:4-5", "Enter into his gates with thanksgiving, and into his courts with praise: be thankful unto him, and bless his name. For the LORD is good; his mercy is everlasting; and his truth endureth to all generations."),
    ("Matthew 5:16", "Let your light so shine before men, that they may see your good works, and glorify your Father which is in heaven."),
    ("John 14:27", "Peace I leave with you, my peace I give unto you: not as the world giveth, give I unto you. Let not your heart be troubled, neither let it be afraid."),
    ("1 Peter 5:7", "Casting all your care upon him; for he careth for you."),
    ("Psalm 121:1-2", "I will lift up mine eyes unto the hills, from whence cometh my help. My help cometh from the LORD, which made heaven and earth."),
    ("Isaiah 26:3", "Thou wilt keep him in perfect peace, whose mind is stayed on thee: because he trusteth in thee."),
    ("Ephesians 4:32", "And be ye kind one to another, tenderhearted, forgiving one another, even as God for Christ's sake hath forgiven you."),
    ("Deuteronomy 6:5", "And thou shalt love the LORD thy God with all thine heart, and with all thy soul, and with all thy might."),
    ("Psalm 139:14", "I will praise thee; for I am fearfully and wonderfully made: marvellous are thy works; and that my soul knoweth right well."),
    ("Nahum 1:7", "The LORD is good, a strong hold in the day of trouble; and he knoweth them that trust in him."),
    ("Proverbs 18:10", "The name of the LORD is a strong tower: the righteous runneth into it, and is safe."),
    ("Romans 5:8", "But God commendeth his love toward us, in that, while we were yet sinners, Christ died for us."),
    ("Psalm 19:14", "Let the words of my mouth, and the meditation of my heart, be acceptable in thy sight, O LORD, my strength, and my redeemer."),
    ("Matthew 22:37-39", "Jesus said unto him, Thou shalt love the Lord thy God with all thy heart, and with all thy soul, and with all thy mind. This is the first and great commandment. And the second is like unto it, Thou shalt love thy neighbour as thyself."),
    ("Philippians 4:8", "Finally, brethren, whatsoever things are true, whatsoever things are honest, whatsoever things are just, whatsoever things are pure, whatsoever things are lovely, whatsoever things are of good report; if there be any virtue, and if there be any praise, think on these things."),
    ("Proverbs 16:3", "Commit thy works unto the LORD, and thy thoughts shall be established."),
    ("Psalm 90:12", "So teach us to number our days, that we may apply our hearts unto wisdom."),
    ("Hebrews 13:8", "Jesus Christ the same yesterday, and to day, and for ever."),
    ("1 John 4:19", "We love him, because he first loved us."),
    ("Psalm 56:3", "What time I am afraid, I will trust in thee."),
    ("John 16:33", "These things I have spoken unto you, that in me ye might have peace. In the world ye shall have tribulation: but be of good cheer; I have overcome the world."),
    ("Galatians 6:9", "And let us not be weary in well doing: for in due season we shall reap, if we faint not."),
    ("Psalm 55:22", "Cast thy burden upon the LORD, and he shall sustain thee: he shall never suffer the righteous to be moved."),
    ("Isaiah 43:2", "When thou passest through the waters, I will be with thee; and through the rivers, they shall not overflow thee: when thou walkest through the fire, thou shalt not be burned; neither shall the flame kindle upon thee."),
    ("Zephaniah 3:17", "The LORD thy God in the midst of thee is mighty; he will save, he will rejoice over thee with joy; he will rest in his love, he will joy over thee with singing."),
    ("Matthew 7:7-8", "Ask, and it shall be given you; seek, and ye shall find; knock, and it shall be opened unto you: For every one that asketh receiveth; and he that seeketh findeth; and to him that knocketh it shall be opened."),
    ("Psalm 143:8", "Cause me to hear thy lovingkindness in the morning; for in thee do I trust: cause me to know the way wherein I should walk; for I lift up my soul unto thee."),
    ("Proverbs 17:17", "A friend loveth at all times, and a brother is born for adversity."),
    ("2 Corinthians 5:17", "Therefore if any man be in Christ, he is a new creature: old things are passed away; behold, all things are become new."),
    ("1 Corinthians 10:31", "Whether therefore ye eat, or drink, or whatsoever ye do, do all to the glory of God."),
    ("Psalm 16:11", "Thou wilt shew me the path of life: in thy presence is fulness of joy; at thy right hand there are pleasures for evermore."),
    ("Numbers 6:24-26", "The LORD bless thee, and keep thee: The LORD make his face shine upon thee, and be gracious unto thee: The LORD lift up his countenance upon thee, and give thee peace."),
    ("Psalm 150:6", "Let every thing that hath breath praise the LORD. Praise ye the LORD."),
    ("Proverbs 15:1", "A soft answer turneth away wrath: but grievous words stir up anger."),
    ("Philippians 2:3-4", "Let nothing be done through strife or vainglory; but in lowliness of mind let each esteem other better than themselves. Look not every man on his own things, but every man also on the things of others."),
    ("Psalm 62:1-2", "Truly my soul waiteth upon God: from him cometh my salvation. He only is my rock and my salvation; he is my defence; I shall not be greatly moved."),
    ("Psalm 103:8", "The LORD is merciful and gracious, slow to anger, and plenteous in mercy."),
    ("Proverbs 4:23", "Keep thy heart with all diligence; for out of it are the issues of life."),
    ("Deuteronomy 31:6", "Be strong and of a good courage, fear not, nor be afraid of them: for the LORD thy God, he it is that doth go with thee; he will not fail thee, nor forsake thee."),
    ("John 15:5", "I am the vine, ye are the branches: He that abideth in me, and I in him, the same bringeth forth much fruit: for without me ye can do nothing."),
    ("1 John 1:9", "If we confess our sins, he is faithful and just to forgive us our sins, and to cleanse us from all unrighteousness."),
    ("Psalm 5:3", "My voice shalt thou hear in the morning, O LORD; in the morning will I direct my prayer unto thee, and will look up."),
    ("Psalm 30:5", "For his anger endureth but a moment; in his favour is life: weeping may endure for a night, but joy cometh in the morning."),
    ("Matthew 19:26", "But Jesus beheld them, and said unto them, With men this is impossible; but with God all things are possible."),
    ("Psalm 32:8", "I will instruct thee and teach thee in the way which thou shalt go: I will guide thee with mine eye."),
    ("2 Chronicles 7:14", "If my people, which are called by my name, shall humble themselves, and pray, and seek my face, and turn from their wicked ways; then will I hear from heaven, and will forgive their sin, and will heal their land."),
    ("Ephesians 6:10", "Finally, my brethren, be strong in the Lord, and in the power of his might."),
    ("Psalm 86:5", "For thou, Lord, art good, and ready to forgive; and plenteous in mercy unto all them that call upon thee."),
    ("Luke 1:37", "For with God nothing shall be impossible."),
    ("Romans 8:38-39", "For I am persuaded, that neither death, nor life, nor angels, nor principalities, nor powers, nor things present, nor things to come, Nor height, nor depth, nor any other creature, shall be able to separate us from the love of God, which is in Christ Jesus our Lord."),
    ("Psalm 1:1-2", "Blessed is the man that walketh not in the counsel of the ungodly, nor standeth in the way of sinners, nor sitteth in the seat of the scornful. But his delight is in the law of the LORD; and in his law doth he meditate day and night."),
    ("3 John 1:4", "I have no greater joy than to hear that my children walk in truth."),
    ("Psalm 73:26", "My flesh and my heart faileth: but God is the strength of my heart, and my portion for ever."),
    ("Matthew 5:9", "Blessed are the peacemakers: for they shall be called the children of God."),
    ("Psalm 136:1", "O give thanks unto the LORD; for he is good: for his mercy endureth for ever."),
    ("Joshua 24:15", "And if it seem evil unto you to serve the LORD, choose you this day whom ye will serve; whether the gods which your fathers served that were on the other side of the flood, or the gods of the Amorites, in whose land ye dwell: but as for me and my house, we will serve the LORD."),
]
KJV_TEXT = dict(CURATED)


class VerseError(Exception):
    """The text couldn't be fetched (offline, bad key, unknown reference)."""


def clean_refs(refs: Any) -> list[str]:
    """The family's verse references, tidied: plain text, one per entry, no duplicates."""
    out: list[str] = []
    for r in refs if isinstance(refs, list) else []:
        ref = " ".join(str(r or "").split())[:MAX_REF]
        if ref and REF_RE.match(ref) and ref.lower() not in {o.lower() for o in out}:
            out.append(ref)
    return out[:MAX_FAMILY]


def translation_code(settings: dict, has_key: bool) -> str:
    """The translation to fetch: the chosen one, or NET while ESV has no key yet."""
    code = str(settings.get("verse_translation") or DEFAULT_TRANSLATION).lower()
    if code not in TRANSLATIONS:
        code = DEFAULT_TRANSLATION
    if TRANSLATIONS[code][2] and not has_key:
        code = FALLBACK
    return code


def pick(day: date, settings: dict) -> str:
    """Today's reference. The family's own verses alternate with the built-in list, day by day,
    unless "only our verses" is on."""
    family = clean_refs(settings.get("family_verses"))
    n = day.toordinal()
    if family and (settings.get("verse_only_family") or n % 2):
        return family[(n // (1 if settings.get("verse_only_family") else 2)) % len(family)]
    return CURATED[n % len(CURATED)][0]


def _tidy(text: str) -> str:
    return " ".join(TAG_RE.sub(" ", text or "").replace(" ", " ").split())


def _not_found(ref: str) -> VerseError:
    return VerseError(f"'{ref}' isn't a passage the translation knows")


async def fetch(hass: HomeAssistant, ref: str, code: str, esv_key: str = "") -> dict[str, Any]:
    """{reference, text} for one reference in one translation. Raises VerseError."""
    session = async_get_clientsession(hass)
    try:
        if code == "esv":
            params = {"q": ref, "include-headings": "false", "include-footnotes": "false", "include-verse-numbers": "false",
                      "include-short-copyright": "false", "include-passage-references": "false", "indent-poetry": "false",
                      "include-selahs": "false", "include-heading-horizontal-lines": "false"}
            async with session.get(ESV_URL, params=params, timeout=TIMEOUT,
                                   headers={**HEADERS, "Authorization": f"Token {esv_key}"}) as resp:
                if resp.status in (401, 403):
                    raise VerseError("the ESV API didn't accept the key")
                resp.raise_for_status()
                data = await resp.json(content_type=None)
            text = _tidy(" ".join(p for p in data.get("passages") or [] if isinstance(p, str)))
            if not text:
                raise _not_found(ref)
            return {"reference": data.get("canonical") or ref, "text": text}
        if code == "net":
            async with session.get(NET_URL, params={"passage": ref, "type": "json", "formatting": "plain"},
                                   timeout=TIMEOUT, headers=HEADERS) as resp:
                resp.raise_for_status()
                data = await resp.json(content_type=None)
            verses = [v for v in data if isinstance(v, dict) and v.get("text")] if isinstance(data, list) else []
            text = _tidy(" ".join(str(v["text"]) for v in verses))
            if not text:
                raise _not_found(ref)
            return {"reference": ref, "text": text}
        # bible-api.com: public-domain texts
        async with session.get(f"{BIBLE_API_URL}{ref}", params={"translation": code}, timeout=TIMEOUT, headers=HEADERS) as resp:
            if resp.status == 404:
                raise _not_found(ref)
            resp.raise_for_status()
            data = await resp.json(content_type=None)
        text = _tidy(data.get("text") or " ".join(str(v.get("text", "")) for v in data.get("verses") or []))
        if not text:
            raise _not_found(ref)
        return {"reference": data.get("reference") or ref, "text": text}
    except VerseError:
        raise
    except (aiohttp.ClientError, TimeoutError, ValueError, TypeError, AttributeError) as err:
        raise VerseError(f"couldn't reach the {TRANSLATIONS[code][0]} service: {err}") from err


def offline(ref: str, day: date) -> dict[str, Any]:
    """The built-in King James text: the reference's own if it's in the list, else the day's built-in verse."""
    if ref not in KJV_TEXT:
        ref = CURATED[day.toordinal() % len(CURATED)][0]
    return {"reference": ref, "text": KJV_TEXT[ref], "translation": "KJV", "name": TRANSLATIONS["kjv"][1], "offline": True}


async def async_today(hass: HomeAssistant) -> dict[str, Any]:
    """Today's verse, fetched once and remembered; a failed fetch is retried every 10 minutes."""
    store = hass.data[DOMAIN]["store"]
    settings = store.data["settings"]
    esv_key = str(store.data.get("bible", {}).get("esv_key") or "")
    day = dt_util.now().date()
    ref = pick(day, settings)
    code = translation_code(settings, bool(esv_key))
    want = (day.isoformat(), ref, code, bool(esv_key))
    cache = hass.data.setdefault(CACHE_KEY, {})
    now = dt_util.utcnow().timestamp()
    hit = cache.get("result")
    if hit and cache.get("key") == want and (not hit.get("offline") or now - cache.get("at", 0) < RETRY_SECONDS):
        return hit
    try:
        got = await fetch(hass, ref, code, esv_key)
        result = {**got, "translation": TRANSLATIONS[code][0], "name": TRANSLATIONS[code][1], "offline": False}
    except VerseError as err:
        _LOGGER.info("Verse of the day (%s, %s): %s; showing the built-in text", ref, code, err)
        result = {**offline(ref, day), "error": str(err)}
    result["date"] = day.isoformat()
    cache.update({"key": want, "result": result, "at": now})
    return result


@callback
def async_register(hass: HomeAssistant) -> None:
    websocket_api.async_register_command(hass, ws_today)
    websocket_api.async_register_command(hass, ws_configure)


@websocket_api.websocket_command({vol.Required("type"): "skylight/verse/today"})
@websocket_api.async_response
async def ws_today(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    settings = hass.data[DOMAIN]["store"].data["settings"]
    if settings.get("verse_today") is False and settings.get("verse_saver") is False:
        connection.send_result(msg["id"], None)
        return
    connection.send_result(msg["id"], await async_today(hass))


@websocket_api.websocket_command({vol.Required("type"): "skylight/verse/configure", vol.Required("esv_key"): str})
@websocket_api.async_response
@security.gated
async def ws_configure(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    """Set (or clear, with an empty string) the ESV API key."""
    await hass.data[DOMAIN]["store"].async_set_bible_key(msg["esv_key"].strip()[:200])
    connection.send_result(msg["id"])
