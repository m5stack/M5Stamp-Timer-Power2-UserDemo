#pragma once

#include <Arduino.h>

#ifndef STP2_FW_VERSION
#define STP2_FW_VERSION "0.1.0"
#endif
#ifndef STP2_BOARD_NAME
#define STP2_BOARD_NAME "ESP32"
#endif
#ifndef STP2_AP_PREFIX
#define STP2_AP_PREFIX "M5STP2"
#endif
#ifndef STP2_AP_PASSWORD
#define STP2_AP_PASSWORD "m5stp2demo"
#endif
#ifndef STP2_DEFAULT_SDA
#define STP2_DEFAULT_SDA 21
#endif
#ifndef STP2_DEFAULT_SCL
#define STP2_DEFAULT_SCL 22
#endif

namespace app_config {
inline constexpr char kFirmwareVersion[] = STP2_FW_VERSION;
inline constexpr char kBoardName[]       = STP2_BOARD_NAME;
inline constexpr char kApPrefix[]        = STP2_AP_PREFIX;
inline constexpr char kApPassword[]      = STP2_AP_PASSWORD;
inline constexpr uint8_t kDefaultSda     = STP2_DEFAULT_SDA;
inline constexpr uint8_t kDefaultScl     = STP2_DEFAULT_SCL;
inline constexpr uint8_t kPm1Address     = 0x6E;
inline constexpr char kPrefsNamespace[]  = "stp2";
}  // namespace app_config
