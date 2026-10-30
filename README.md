# Stamp Timer Power2

## Overview

### SKU:S021

Stamp Timer Power2 is a power management module for low-power embedded devices. It integrates the M5PM1 power management IC and adopts a multi-stage power control architecture that enables power for the main controller and various peripherals on demand, effectively reducing overall standby power consumption and extending battery life.

The module supports DC 5V input/output control, DC 3.7V lithium battery power supply, and input voltage detection. It also integrates a lithium battery charging circuit with two adjustable charging current levels. Featuring a 1.27mm castellated-hole package, the module provides 5 programmable IOs in addition to the basic power input/output control pins. These IOs can be configured as GPIO, ADC, PWM, RGB LED, IRQ, and other functions. The module also supports timed wake-up and external input interrupt wake-up, making it suitable for low-power systems with on-demand power-up, periodic operation, and event-triggered operation.

## Features

- Built-in M5PM1 power management IC
- Built-in lithium battery charging IC with two adjustable charging current levels (650mA/180mA)
- 5x programmable expansion IO (GPIO / ADC / PWM / RGB LED / IRQ)
- Supports DC 5V / DC 3.7V battery input power
- I2C communication interface (0x6E)
- 1.27mm-28Pin castellated-hole package

### Peripherals & Control

- Power button input signal interface
- Power indicator signal interface
- Boot control interface for MCU download mode control

## Includes

- 1 x Stamp Timer Power2

## Applications

- Embedded device power management
- Smart home
- Low-power IoT devices

## Specifications

| Specification | Parameter |
| --- | --- |
| Power Management IC | M5PM1 |
| Communication Interface | I2C @ 0x6E, supports 100 kHz (default) / 400 kHz |
| Power Consumption | Shutdown: DC 4.2V@6.72uA<br>Low-power sleep: DC 4.2V@12.27uA |
| Battery Charging IC | LGS4056HDA, provides two adjustable charging current levels: DC 3.3V@650mA / DC 3.3V@180mA |
| Load Capacity | 3V3_DCDC_OUT: DC 3.3V@0.6A<br>3V3_LDO_OUT: DC 3.3V@0.4A<br>PY_3V3: DC 3.3V@0.4A<br>EXT_5V_INOUT: DC 5V@1A |
| Product Size | 18.0 x 14.0 x 2.2mm |
| Product Weight | 0.7g |
| Package Size | 138.0 x 93.0 x 5.0mm |
| Gross Weight | 3.8g |

## ESP32 / ESP32-S3 Live Web Demo

The project now contains both the hosted Pages demo and a complete PlatformIO firmware:

- `web/` — the existing static Pages simulation.
- `esp_web/` — the offline hardware console served by the device.
- `platformio.ini` — only two universal environments: `esp32` and `esp32s3`.
- `src/`, `include/`, `scripts/` — firmware sources and embedded Web asset generation.

M5Unified/M5GFX detect the actual M5 board, display and I2C bus at runtime. Recognized M5 devices default to the internal `M5.In_I2C`; unknown or custom wiring uses `M5.Ex_I2C`. The firmware starts a WPA2 SoftAP, optionally displays a Wi-Fi QR code, guides the user through I2C pin selection and `0x6E` detection, then serves the live console backed by real M5PM1 registers and operations.

```bash
# ESP32-S3 universal binary
pio run -e esp32s3

# ESP32 universal binary
pio run -e esp32
```

Firmware outputs are complete images merged with bootloader and partitions:

- `dist/S021-ESP32-UserDemo-v0.1.0-<commit>-LHY-<YYYYMMDD>_0x0.bin`
- `dist/S021-ESP32S3-UserDemo-v0.1.0-<commit>-LHY-<YYYYMMDD>_0x0.bin`
- `dist/S021-Web-UserDemo-v0.1.0-<commit>-LHY-<YYYYMMDD>.zip` (contains `web/` and `esp_web/`)

Both images are flashed from offset `0x0`.

See the Web console documentation in [Chinese](esp_web/README.md) or [English](esp_web/README_EN.md) for wiring, API, preview and safety details.

## Changelog

See [CHANGELOG.md](CHANGELOG.md).

## Related Links

- [Product Documentation](https://docs.m5stack.com/en/stamp/stamp_timer_power2)
- [Online Interactive Demo](https://m5stack.github.io/M5Stamp-Timer-Power2-UserDemo/)
- [Arduino Quick Start](https://docs.m5stack.com/en/arduino/projects/stamp/stamp_timer_power2)
- [M5PM1 Arduino Driver Library](https://github.com/m5stack/M5PM1)
- [Stamp Timer Power2 Schematics](https://m5stack-doc.oss-cn-shenzhen.aliyuncs.com/1294/S021_Stamp_Timer_Power2_SCH_V0.7.1.pdf)

## Required Libraries

- [M5PM1](https://github.com/m5stack/M5PM1)
- [M5Unified](https://github.com/m5stack/M5Unified) — PlatformIO live web demo
- [M5GFX](https://github.com/m5stack/M5GFX) — PlatformIO live web demo
- [QRCode](https://github.com/ricmoo/QRCode) — PlatformIO live web demo

## Security and Third-Party Notices

- [Security policy](SECURITY.md)
- [Third-party notices](THIRD_PARTY_NOTICES.md)

## License

- [Stamp Timer Power2 - MIT](LICENSE)
