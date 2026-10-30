"""Local browser preview for the Stamp Timer Power2 firmware Web UI.

Run from the repository root:
    python3 scripts/preview_server.py --web esp_web --mock mock_api.py --port 8766
"""
from __future__ import annotations

_REGS = bytearray(256)
for _addr, _value in {
    0x00: 0x50, 0x01: 0x01, 0x02: 0x01, 0x03: 0x06, 0x04: 0x01,
    0x06: 0x17, 0x07: 0x00, 0x08: 0x40, 0x09: 0x00,
    0x13: 0x1F, 0x20: 0xE4, 0x21: 0x0C, 0x22: 0x0A, 0x23: 0x0F,
    0x24: 0x92, 0x25: 0x13, 0x26: 0x00, 0x27: 0x00, 0x34: 0xF4,
    0x35: 0x01, 0x49: 0x2A,
}.items():
    _REGS[_addr] = _value


def _state():
    return {
        "connected": True,
        "bus": "M5_INTERNAL",
        "sda": 47,
        "scl": 48,
        "speed": 100000,
        "vinMv": 5012,
        "vbatMv": 3890,
        "extMv": 0,
        "powerSource": 0,
        "vref": 3300,
        "gpioIn": 0x1F,
        "btnPressed": False,
        "tempC": 31,
        "regs": _REGS.hex().upper(),
    }


def _num(form, key, default=0):
    try:
        return int(form.get(key, default))
    except (TypeError, ValueError):
        return default


def _apply_op(form):
    op = form.get("op", "")
    if op == "write":
        _REGS[_num(form, "reg") & 0xFF] = _num(form, "value") & 0xFF
    elif op == "field":
        reg = _num(form, "reg") & 0xFF
        mask = _num(form, "mask") & 0xFF
        value = _num(form, "value") & 0xFF
        _REGS[reg] = (_REGS[reg] & ~mask) | (value & mask)
    elif op == "gpio":
        pin = _num(form, "pin")
        kind = form.get("kind")
        value = _num(form, "value")
        if 0 <= pin <= 4:
            if kind == "func" and 0 <= value <= 3:
                reg, shift = (0x16, pin * 2) if pin < 4 else (0x17, 0)
                _REGS[reg] = (_REGS[reg] & ~(3 << shift)) | (value << shift)
            elif kind == "mode":
                _REGS[0x10] = (_REGS[0x10] & ~(1 << pin)) | ((value & 1) << pin)
            elif kind == "out":
                _REGS[0x11] = (_REGS[0x11] & ~(1 << pin)) | ((value & 1) << pin)
            elif kind == "drv":
                _REGS[0x13] = (_REGS[0x13] & ~(1 << pin)) | ((value & 1) << pin)
            elif kind == "pull" and pin < 4:
                _REGS[0x14] = (_REGS[0x14] & ~(3 << (pin * 2))) | ((value & 3) << (pin * 2))
    elif op == "wake":
        pin = _num(form, "pin")
        if 0 <= pin <= 4:
            _REGS[0x18] = (_REGS[0x18] & ~(1 << pin)) | ((_num(form, "value") & 1) << pin)
    elif op == "pwm_duty":
        ch = _num(form, "ch")
        pct = max(0, min(100, _num(form, "value")))
        duty = int(pct * 4095 / 100)
        _REGS[0x30 + 2 * ch] = duty & 0xFF
        _REGS[0x31 + 2 * ch] = (_REGS[0x31 + 2 * ch] & 0x30) | ((duty >> 8) & 0x0F)
    elif op == "pwm_freq":
        hz = max(1, min(65535, _num(form, "value")))
        _REGS[0x34] = hz & 0xFF
        _REGS[0x35] = hz >> 8
    elif op == "neo":
        count = max(1, min(32, _num(form, "count")))
        _REGS[0x50] = count
    elif op == "neo_off":
        _REGS[0x50] = 0


def handle(method: str, path: str, form: dict):
    if path == "/api/info":
        return 200, {
            "firmware": "0.1.0",
            "board": "M5StopWatch / ESP32S3",
            "chip": "ESP32-S3",
            "cores": 2,
            "cpuMhz": 240,
            "revision": 0,
            "flashBytes": 8 * 1024 * 1024,
            "freeHeap": 245760,
            "psramBytes": 0,
            "psramFree": 0,
            "mac": "AA:BB:CC:DD:EE:FF",
            "display": {"present": False, "width": 0, "height": 0},
            "ap": {
                "ssid": "M5STP2-EEFF",
                "password": "m5stp2demo",
                "ip": "192.168.4.1",
                "mac": "AA:BB:CC:DD:EE:FF",
            },
            "i2c": {"bus": "M5_INTERNAL", "sda": 47, "scl": 48, "speed": 100000},
            "presets": [{"name": "M5_INTERNAL", "sda": 47, "scl": 48, "speed": 100000}],
        }
    if path == "/api/i2c/scan":
        return 200, {
            "addresses": [0x51, 0x6E],
            "connected": True,
            "message": "",
            "device": {"id": 0x50, "model": 0x01, "hw": 0x01, "sw": 0x06},
        }
    if path == "/api/state":
        return 200, _state()
    if path == "/api/op":
        _apply_op(form)
        return 200, {"ok": True, "state": _state()}
    return None
