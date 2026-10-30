# Stamp Timer Power2 Live Web Console

[简体中文](README.md) | English

This repository contains both the hosted browser demo and a complete PlatformIO firmware project:

- `web/`: the static GitHub Pages simulation.
- `esp_web/`: the offline live console served by the ESP32 / ESP32-S3.
- `platformio.ini`, `src/`, `include/`, `scripts/`: the PlatformIO firmware project.

The hardware console cannot reuse the simulator page unchanged: the first connection must read device information, configure and scan I2C, verify address `0x6E`, and then replace simulated data with a real register API. It therefore has its own `esp_web/` directory while the original `web/` deployment remains unchanged.

## Two Universal Firmware Images

Only two PlatformIO environments are provided:

| Environment | Output | Target |
| --- | --- | --- |
| `esp32` | `dist/S021-ESP32-UserDemo-v0.1.0-<commit>-LHY-<YYYYMMDD>_0x0.bin` | ESP32 |
| `esp32s3` | `dist/S021-ESP32S3-UserDemo-v0.1.0-<commit>-LHY-<YYYYMMDD>_0x0.bin` | ESP32-S3 |

```bash
# ESP32-S3 (default environment)
pio run

# ESP32
pio run -e esp32

# ESP32-S3 only
pio run -e esp32s3
```

Each build produces one complete image containing the bootloader, partition table and application. Flash the merged image at offset `0x0`. A single architecture image is not tied to one M5 model: M5Unified/M5GFX detects the actual board and display at runtime. Devices with a display show a Wi-Fi QR code; devices without a display still expose the same AP and Web UI.

The ESP32-S3 image enables `BOARD_HAS_PSRAM` with a `qio_opi` memory layout. This is required for the StopWatch 466×466 QSPI AMOLED framebuffer and also supports PSRAM-equipped S3 devices such as CoreS3.

The `.pio/build/<env>/firmware.bin` files remain available for PlatformIO upload and debugging. For distribution or third-party flashing tools, use the merged images in `dist/`.

The firmware uses a 4 MB `huge_app.csv` partition layout for compatibility with common ESP32 / ESP32-S3 devices with at least 4 MB Flash. The target must support the current Arduino-ESP32 toolchain and Wi-Fi.

## Startup Flow

1. The device starts a WPA2 SoftAP named `M5STP2-XXXX`.
2. The default Wi-Fi password is `m5stp2demo`.
3. Devices with a display show the Wi-Fi QR code, SSID, password and console URL. A dedicated compact layout keeps the QR code inside the visible area of the 466×466 round display.
4. After joining, captive-portal detection redirects compatible phones to `http://192.168.4.1/`. If no browser opens automatically, open that address manually. A Wi-Fi QR code only joins the network; it cannot force every phone to open a browser.
5. The page shows the detected M5 board, chip, Flash, heap, MAC, display size and AP information.
6. The default I2C pins come from the M5Unified internal bus when the board is recognized. If the board is unknown or the user enters different pins, the external bus is used.
7. The bus is scanned and M5PM1 must respond at `0x6E` and pass device identification.
8. On success, the browser opens `/app.html`, the live console.

## I2C Bus Selection

The firmware selects the bus from M5Unified's runtime board detection:

- On a recognized M5 device with valid `M5.In_I2C` pins, `M5.In_I2C` is the default. This covers devices whose PMIC is on the internal bus, including StopWatch and CoreS3.
- If the board is unknown, or the user enters SDA/SCL pins different from the internal bus, `M5.Ex_I2C` is used.
- Default pins come from the selected bus: `M5.In_I2C.getSDA()` / `getSCL()` for the internal bus and `M5.Ex_I2C.getSDA()` / `getSCL()` for the external bus.
- Build-time fallback pins are:
  - `esp32`: SDA 21 / SCL 22
  - `esp32s3`: SDA 8 / SCL 9
- SDA and SCL must be different, output-capable GPIOs.
- A successful scan stores the pins and speed in NVS for the next boot.

External pull-ups are still required. The Stamp Timer Power2 module does not include I2C pull-ups.

## Live Console

`/app.html` keeps the visual style, pin diagram, schematic and register panel from the original demo, but uses the real HTTP API:

- Real register snapshots, voltages, power source, GPIO inputs and button state.
- GPIO, PWM, ADC, NeoPixel, interrupt, timer and power operations write directly to M5PM1.
- Power-off, download mode, DCDC disable, download lock and timed power-off require confirmation.
- The page polls state once per second and serializes writes while coalescing slider updates.

## Captive Portal

The firmware answers common Android, Apple CNA, Windows NCSI, Samsung and Linux connectivity probes with a `302` redirect to `http://192.168.4.1/` and a `Captive-Portal` response header. DNS port 53 resolves all names to the SoftAP address.

Automatic browser launch is ultimately controlled by the phone OS. Some systems show a "No internet" prompt first; choose to keep the connection and open the browser if needed.

## HTTP API

| Method and path | Purpose |
| --- | --- |
| `GET /api/info` | Host, M5 board, Flash, heap, display, AP and I2C configuration |
| `POST /api/i2c/scan` | Form fields `sda`, `scl`, `speed`; scan and validate `0x6E` |
| `GET /api/state` | Real registers, voltages, power and button state |
| `POST /api/op` | Real write operations using `application/x-www-form-urlencoded` |

Before M5PM1 is connected, `/api/state` returns `409` and the console redirects to the setup page.

## Firmware Layout

```text
platformio.ini
src/
├── main.cpp                 # M5Unified board detection, AP and main loop
├── pm1_controller.*         # M5.In/M5.Ex I2C, scan and real register operations
├── web_portal.*             # HTTP API and embedded asset server
└── display_portal.*         # Wi-Fi QR code and status display
scripts/embed_web.py         # gzip and embed esp_web/ before build
scripts/merge_firmware.py    # merge bootloader, partitions and app
scripts/preview_server.py    # local Web UI preview server
esp_web/                     # offline hardware console
mock_api.py                  # local browser preview API
```

`scripts/embed_web.py` runs automatically before each PlatformIO build and generates `include/web_assets.h`. No separate `uploadfs` step is required.

## Dependencies

- `lib/M5PM1` submodule: `1.0.7-3-g315d289`
- `lib/M5Unified` submodule: `0.2.28`
- `lib/M5GFX` submodule: `0.2.35`
- PlatformIO library: `ricmoo/QRCode@0.0.1`

Initialize submodules after cloning:

```bash
git submodule update --init --recursive
```

## Local Preview

```bash
python3 scripts/preview_server.py \
  --web esp_web --mock mock_api.py --port 8766
```

Open `http://127.0.0.1:8766/`. The mock API reports a connected M5PM1 and allows testing the scan redirect, console layout and interactions without hardware.

## Safety Notes

- The AP uses WPA2, but anyone who can join it can operate the real M5PM1.
- Verify load and battery wiring before changing power rails, charging, shutdown or download mode.
- Do not bridge this SoftAP to an untrusted or production network.
