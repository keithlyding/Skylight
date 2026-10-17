#!/usr/bin/env python3
"""Monitor brightness for Home Assistant, over MQTT, using DDC/CI (ddcutil).

Runs on the kiosk computer (e.g. a Raspberry Pi driving an HDMI monitor). Publishes a `number`
entity through MQTT discovery, so Home Assistant shows a 0-100 brightness slider for the monitor;
Lyding Strike's "screen brightness entity" setting can then dim it at night. Changes made on the
monitor's own buttons are picked up every minute.

Install (see README "Raspberry Pi + touch monitor"):
    sudo apt install -y ddcutil python3-paho-mqtt
    sudo cp ddc_brightness.py /usr/local/bin/ && sudo chmod +x /usr/local/bin/ddc_brightness.py
    sudo cp ddc-brightness.service /etc/systemd/system/ && sudo systemctl edit ddc-brightness  (set MQTT_URL etc.)
    sudo systemctl enable --now ddc-brightness

Settings come from the environment: MQTT_HOST (required), MQTT_PORT (1883), MQTT_USER, MQTT_PASSWORD,
DEVICE_NAME ("Kitchen screen"), DEVICE_ID (hostname), DDC_DISPLAY (1), POLL_SECONDS (60).
"""

import json
import os
import re
import socket
import subprocess
import sys
import threading
import time

import paho.mqtt.client as mqtt

HOST = os.environ.get("MQTT_HOST")
PORT = int(os.environ.get("MQTT_PORT", "1883"))
USER = os.environ.get("MQTT_USER")
PASSWORD = os.environ.get("MQTT_PASSWORD")
NAME = os.environ.get("DEVICE_NAME", "Kitchen screen")
DEVICE_ID = re.sub(r"[^a-z0-9_]", "_", os.environ.get("DEVICE_ID", socket.gethostname()).lower())
DISPLAY = os.environ.get("DDC_DISPLAY", "1")
POLL = int(os.environ.get("POLL_SECONDS", "60"))
PREFIX = os.environ.get("DISCOVERY_PREFIX", "homeassistant")

BASE = f"{DEVICE_ID}/brightness"
TOPIC_STATE, TOPIC_SET, TOPIC_AVAIL = f"{BASE}/state", f"{BASE}/set", f"{BASE}/available"


def log(msg: str) -> None:
    print(msg, flush=True)


def ddc(*args: str) -> str:
    """Run ddcutil; DDC is slow and occasionally flaky, so retry once."""
    cmd = ["ddcutil", "--display", DISPLAY, "--noverify", *args]
    for attempt in (1, 2):
        try:
            return subprocess.run(cmd, capture_output=True, text=True, timeout=15, check=True).stdout
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as err:
            if attempt == 2:
                raise RuntimeError(f"ddcutil {' '.join(args)}: {getattr(err, 'stderr', '') or err}") from err
            time.sleep(1)
    return ""


def read_brightness() -> int | None:
    m = re.search(r"current value\s*=\s*(\d+)", ddc("getvcp", "10"))
    return int(m.group(1)) if m else None


def set_brightness(value: int) -> None:
    ddc("setvcp", "10", str(max(0, min(100, value))))


class Service:
    def __init__(self) -> None:
        # paho-mqtt 2.x wants the callback version; 1.x (older Debian/Ubuntu) doesn't know it.
        if hasattr(mqtt, "CallbackAPIVersion"):
            self.client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=f"ddc-{DEVICE_ID}")
        else:
            self.client = mqtt.Client(client_id=f"ddc-{DEVICE_ID}")
        if USER:
            self.client.username_pw_set(USER, PASSWORD)
        self.client.will_set(TOPIC_AVAIL, "offline", retain=True)
        self.client.on_connect = self.on_connect
        self.client.on_message = self.on_message
        self.lock = threading.Lock()
        self.last: int | None = None

    def on_connect(self, client, userdata, flags, reason_code, properties=None) -> None:
        log(f"connected to {HOST}: {reason_code}")
        config = {
            "name": "Brightness", "unique_id": f"{DEVICE_ID}_brightness",
            "command_topic": TOPIC_SET, "state_topic": TOPIC_STATE, "availability_topic": TOPIC_AVAIL,
            "min": 0, "max": 100, "step": 1, "unit_of_measurement": "%", "icon": "mdi:brightness-6", "mode": "slider",
            "device": {"identifiers": [f"ddc_{DEVICE_ID}"], "name": NAME, "manufacturer": "DDC/CI", "model": "Monitor brightness"},
        }
        client.publish(f"{PREFIX}/number/{DEVICE_ID}_brightness/config", json.dumps(config), retain=True)
        client.subscribe(TOPIC_SET)
        client.publish(TOPIC_AVAIL, "online", retain=True)
        self.publish_state()

    def on_message(self, client, userdata, msg) -> None:
        try:
            value = int(round(float(msg.payload.decode().strip())))
        except ValueError:
            log(f"ignored {msg.payload!r}")
            return
        with self.lock:
            try:
                set_brightness(value)
                self.last = max(0, min(100, value))
                client.publish(TOPIC_STATE, str(self.last), retain=True)
                log(f"brightness -> {self.last}")
            except RuntimeError as err:
                log(str(err))

    def publish_state(self) -> None:
        with self.lock:
            try:
                value = read_brightness()
            except RuntimeError as err:
                log(str(err))
                return
        if value is not None and value != self.last:
            self.last = value
            self.client.publish(TOPIC_STATE, str(value), retain=True)

    def run(self) -> None:
        self.client.connect_async(HOST, PORT, keepalive=60)
        self.client.loop_start()
        while True:
            time.sleep(POLL)
            if self.client.is_connected():
                self.publish_state()


if __name__ == "__main__":
    if not HOST:
        sys.exit("MQTT_HOST is not set")
    Service().run()
