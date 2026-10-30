# Stamp Timer Power2 实时 Web 控制台

[English](README_EN.md) | 简体中文

这个仓库同时包含：

- `web/`：GitHub Pages 使用的纯前端交互演示。
- `esp_web/`：烧录到 ESP32 / ESP32-S3 后由设备自己提供的实时控制台。
- 根目录 `platformio.ini`、`src/`、`include/`、`scripts/`：PlatformIO 固件工程。

硬件版不能直接照搬浏览器模拟器：首次连接需要读取设备信息、配置外部 I2C 引脚、扫描并识别 `0x6E`，连接后还要把模拟数据替换成真实寄存器 API。因此使用独立的 `esp_web/`，同时保持原有 `web/` 部署页面不变。

## 两个通用固件

只保留两个 PlatformIO 环境：

| 环境 | 输出 | 适用范围 |
| --- | --- | --- |
| `esp32` | `dist/S021-ESP32-UserDemo-v0.1.0-<commit>(commit)-LHY-<YYYYMMDD>_0x0.bin` | ESP32 目标 |
| `esp32s3` | `dist/S021-ESP32S3-UserDemo-v0.1.0-<commit>(commit)-LHY-<YYYYMMDD>_0x0.bin` | ESP32-S3 目标 |
| Web 包 | `dist/S021-Web-UserDemo-v0.1.0-<commit>(commit)-LHY-<YYYYMMDD>.zip` | `web/` + `esp_web/` |

```bash
# ESP32-S3（默认环境）
pio run

# ESP32
pio run -e esp32

# 单独构建 ESP32-S3
pio run -e esp32s3
```

每个环境会生成一个已经合并 bootloader、分区表和应用的完整镜像，可直接从 Flash 偏移 `0x0` 写入。同一个二进制不绑定某一个 M5 型号。启动时由 M5Unified/M5GFX 自动识别实际板型和屏幕；如果设备带屏幕，就显示 Wi-Fi 二维码，没有屏幕时仍可通过 AP 和网页完成全部操作。

ESP32-S3 固件启用了 `BOARD_HAS_PSRAM` 和 `qio_opi` 内存配置，以支持 StopWatch 的 466×466 QSPI AMOLED framebuffer，同时兼容 CoreS3 等带 PSRAM 的 S3 设备。

`.pio/build/<env>/firmware.bin` 仍然保留，供 PlatformIO 上传和调试使用；用于分发或 M5Burner/其他烧录工具时，使用 `dist/` 下的合并镜像。

固件使用 4 MB Flash 的 `huge_app.csv` 分区布局，以适配常见的 4 MB 及以上 ESP32 / ESP32-S3 设备。目标需要支持 Arduino-ESP32 当前工具链并具备正常 Wi-Fi 能力。

## 启动流程

1. 固件启动 SoftAP：`M5STP2-XXXX`。
2. 默认 Wi-Fi 密码：`m5stp2demo`。
3. 带屏幕设备显示 Wi-Fi 二维码、SSID、密码和控制台地址。466×466 圆形屏使用独立的紧凑布局，二维码限制在圆屏安全区域内。
4. 连接 AP 后，系统 captive portal 探测会自动跳转到 `http://192.168.4.1/`；如果手机没有自动弹出，请手动用浏览器打开该地址。Wi-Fi 二维码本身只负责入网，不能强制所有手机打开浏览器。
5. 页面显示 M5Unified 识别出的板型、芯片、Flash、Heap、MAC、屏幕尺寸和 AP 信息。
6. 默认 I2C 引脚优先取 M5Unified 为该板型提供的内部总线；如果板型未知或用户填写了其他引脚，则改用外部总线。
7. 扫描总线，必须找到 `0x6E` 并成功读取 M5PM1 身份。
8. 成功后自动进入 `/app.html` 实时控制台。

## I2C 总线选择

固件根据 M5Unified 的运行时识别结果选择总线：

- 识别为 M5 设备，且 `M5.In_I2C` 引脚有效时，默认使用 `M5.In_I2C`。这适用于 PMIC 接在内部总线的 StopWatch、CoreS3 等设备。
- M5Unified 无法识别具体板型，或用户填写的 SDA/SCL 与内部总线不同，则使用 `M5.Ex_I2C`。
- 默认 SDA/SCL 来自选中的总线：内部总线取 `M5.In_I2C.getSDA()` / `getSCL()`，外部总线取 `M5.Ex_I2C.getSDA()` / `getSCL()`。
- 如果板型或自定义硬件无法提供默认值，使用构建环境中的回退值：
  - `esp32`：SDA 21 / SCL 22
  - `esp32s3`：SDA 8 / SCL 9
- SDA、SCL 必须不同，并且是当前芯片可输出的 GPIO。
- 扫描成功后，引脚和速率保存到 NVS，下次启动作为初始值。

实际接线仍需外部上拉，Stamp Timer Power2 模组本身不含 I2C 上拉电阻。

## 实时控制台

`/app.html` 复用现有页面视觉、引脚图、原理图和寄存器面板，数据源改为真实 HTTP API：

- 真实寄存器快照、电压、供电来源、GPIO 输入和按键状态。
- GPIO、PWM、ADC、NeoPixel、中断、定时器和电源操作直接写入 M5PM1。
- 关机、下载模式、关闭 DCDC、下载锁和定时关机均有二次确认。
- 控制页每秒轮询一次状态，并对写入操作进行串行化和滑块合并。

## Captive Portal

固件会响应 Android、Apple CNA、Windows NCSI、Samsung 和常见 Linux 网络管理器的探测地址，并返回带 `Captive-Portal` 头的 302 跳转到 `http://192.168.4.1/`。DNS 端口 53 使用通配解析到 SoftAP 地址。

是否自动弹出最终仍由手机系统决定。部分系统会提示“无互联网连接”，需要点击“保持连接”后再次打开浏览器。

## HTTP API

| 方法与路径 | 用途 |
| --- | --- |
| `GET /api/info` | 主控、M5 板型、Flash、Heap、屏幕、AP、I2C 配置 |
| `POST /api/i2c/scan` | 参数 `sda`、`scl`、`speed`；扫描并验证 `0x6E` |
| `GET /api/state` | 真实寄存器、电压、供电和按键状态 |
| `POST /api/op` | 真实写操作，使用 `application/x-www-form-urlencoded` |

尚未连接 M5PM1 时，`/api/state` 返回 `409`，控制页会回到配置页。

## 固件组成

```text
platformio.ini
src/
├── main.cpp                 # M5Unified 板型识别、AP、主循环
├── pm1_controller.*         # M5.In/M5.Ex I2C、扫描、真实寄存器操作
├── web_portal.*             # HTTP API 与嵌入式资源服务
└── display_portal.*         # Wi-Fi 二维码和状态显示
scripts/embed_web.py         # 构建前将 esp_web/ 打包为 gzip 固件资源
scripts/merge_firmware.py    # 合并 bootloader、分区表和应用
scripts/package_web.py        # 打包 web/ 与 esp_web/
scripts/preview_server.py    # 本地网页预览服务器
esp_web/                     # 硬件版离线网页
mock_api.py                  # 本地浏览器预览 API
```

`scripts/embed_web.py` 在 PlatformIO 构建前自动执行，将 `esp_web/` 中的资源生成到 `include/web_assets.h`。无需额外执行 `uploadfs`。

## 依赖

- `lib/M5PM1` submodule：`1.0.7-3-g315d289`
- `lib/M5Unified` submodule：`0.2.28`
- `lib/M5GFX` submodule：`0.2.35`
- PlatformIO：`ricmoo/QRCode@0.0.1`

首次拉取：

```bash
git submodule update --init --recursive
```

## 本地预览

```bash
python3 scripts/preview_server.py \
  --web esp_web --mock mock_api.py --port 8766
```

打开 `http://127.0.0.1:8766/`。模拟 API 会返回一个已连接的 M5PM1，可用于测试扫描跳转、控制台布局和交互。

## 安全提示

- AP 使用 WPA2 密码，但同一 AP 下的访问者都能控制真实 M5PM1。
- 操作电源轨、充电、关机或下载模式前确认负载和电池接线。
- 不要把该 SoftAP 直接桥接到不可信网络或生产网络。
