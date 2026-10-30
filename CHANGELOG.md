# Changelog

## v0.1.0 - 2026-10-30

### 中文更新说明

- 新增 ESP32 / ESP32-S3 两个通用 PlatformIO 固件环境，由 M5Unified/M5GFX 在运行时识别具体 M5 设备。
- 设备启动后开启 WPA2 SoftAP，带屏幕设备显示 Wi-Fi 二维码；手机连接后通过 captive portal 跳转到 `http://192.168.4.1/`。
- 新增设备信息读取、I2C 引脚配置、总线扫描和 M5PM1 `0x6E` 身份验证流程。
- 控制台复用现有 Stamp Timer Power2 网页视觉，并接入真实 M5PM1 寄存器、电压、GPIO、PWM、ADC、NeoPixel、定时器和电源操作。
- M5 设备优先使用内部 `M5.In_I2C`，未知板型或自定义引脚使用 `M5.Ex_I2C`。
- 修复 StopWatch 板型名称和 OPI PSRAM/QSPI AMOLED 初始化，并为 466×466 圆屏增加紧凑二维码布局。
- 完善 Android、Apple、Windows、Samsung 等 captive portal 探测响应。
- 新增 API 参数边界校验、GitHub Actions 固件构建、第三方许可证说明和安全策略。
- 新增网页中文/英文 README 与本地 mock/预览工具。

### English Release Notes

- Added universal ESP32 and ESP32-S3 PlatformIO environments with runtime board detection through M5Unified/M5GFX.
- Added a WPA2 SoftAP, on-device Wi-Fi QR code, captive portal and device-hosted setup/control pages.
- Added device information reporting, I2C pin configuration, bus scanning and M5PM1 `0x6E` identity verification.
- Added a live console backed by real M5PM1 registers, voltages, GPIO, PWM, ADC, NeoPixel, timer and power operations.
- Recognized M5 devices now default to the internal `M5.In_I2C`; unknown boards or custom pins use `M5.Ex_I2C`.
- Fixed StopWatch board identification, OPI PSRAM/QSPI AMOLED initialization and the compact QR layout for its 466×466 round display.
- Added captive portal responses for Android, Apple, Windows, Samsung and common Linux probes.
- Added API validation, GitHub Actions firmware builds, third-party notices, security guidance and Chinese/English Web console documentation.

### Firmware Images

Merged release images use this name format and are flashed at `0x0`:

```text
S021-ESP32-UserDemo-v0.1.0-<8-char-commit>-LHY-<YYYYMMDD>_0x0.bin
S021-ESP32S3-UserDemo-v0.1.0-<8-char-commit>-LHY-<YYYYMMDD>_0x0.bin
```

See `dist/SHA256SUMS` in the release assets for integrity verification.
