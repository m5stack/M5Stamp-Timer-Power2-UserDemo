#include <Arduino.h>
#include <M5Unified.h>
#include <WiFi.h>

#include <memory>

#include "app_config.h"
#include "display_portal.h"
#include "pm1_controller.h"
#include "web_portal.h"

namespace {
Pm1Controller pm1;
DisplayPortal display;
std::unique_ptr<WebPortal> portal;
String apSsid;
String boardName;
bool lastPm1Connected = false;
uint8_t lastSda       = 255;
uint8_t lastScl       = 255;
uint8_t lastDeviceId  = 0;

String detectBoardName(m5::board_t board)
{
    switch (board) {
        case m5::board_t::board_M5Stack:
            return "M5Stack Core";
        case m5::board_t::board_M5StackCore2:
            return "M5Stack Core2";
        case m5::board_t::board_M5StickC:
            return "M5StickC";
        case m5::board_t::board_M5StickCPlus:
            return "M5StickC Plus";
        case m5::board_t::board_M5StickCPlus2:
            return "M5StickC Plus2";
        case m5::board_t::board_M5StackCoreInk:
            return "M5Stack CoreInk";
        case m5::board_t::board_M5Paper:
            return "M5Paper";
        case m5::board_t::board_M5Tough:
            return "M5Tough";
        case m5::board_t::board_M5Station:
            return "M5Station";
        case m5::board_t::board_M5StackCoreS3:
            return "M5Stack CoreS3";
        case m5::board_t::board_M5StackCoreS3SE:
            return "M5Stack CoreS3 SE";
        case m5::board_t::board_M5AtomS3:
            return "M5AtomS3";
        case m5::board_t::board_M5AtomS3Lite:
            return "M5AtomS3 Lite";
        case m5::board_t::board_M5AtomS3U:
            return "M5AtomS3U";
        case m5::board_t::board_M5Dial:
            return "M5Dial";
        case m5::board_t::board_M5DinMeter:
            return "M5DinMeter";
        case m5::board_t::board_M5Cardputer:
            return "M5Cardputer";
        case m5::board_t::board_M5StampS3:
            return "M5StampS3";
        case m5::board_t::board_M5StampS3Bat:
            return "M5StampS3 Battery";
        case m5::board_t::board_M5StampS3Mini:
            return "M5StampS3 Mini";
        case m5::board_t::board_M5StampPLC:
            return "M5Stamp PLC";
        case m5::board_t::board_M5StickS3:
            return "M5StickS3";
        case m5::board_t::board_M5Capsule:
            return "M5Capsule";
        case m5::board_t::board_M5AtomS3R:
            return "M5AtomS3R";
        case m5::board_t::board_M5AtomS3RCam:
            return "M5AtomS3R Camera";
        case m5::board_t::board_M5AtomS3RExt:
            return "M5AtomS3R Ext";
        case m5::board_t::board_M5AtomVoiceS3R:
            return "M5Atom Voice S3R";
        case m5::board_t::board_M5PaperS3:
            return "M5PaperS3";
        case m5::board_t::board_M5PaperColor:
            return "M5Paper Color";
        case m5::board_t::board_M5PaperMono:
            return "M5Paper Mono";
        case m5::board_t::board_M5PowerHub:
            return "M5PowerHub";
        case m5::board_t::board_M5StopWatch:
            return "M5StopWatch";
        case m5::board_t::board_M5StackChan:
            return "M5StackChan";
        case m5::board_t::board_M5ChainCaptain:
            return "M5ChainCaptain";
        case m5::board_t::board_M5DualKey:
            return "M5DualKey";
        case m5::board_t::board_M5AirQ:
            return "M5AirQ";
        case m5::board_t::board_M5AtomLite:
            return "M5Atom Lite";
        case m5::board_t::board_M5AtomMatrix:
            return "M5Atom Matrix";
        case m5::board_t::board_unknown:
            return "M5Unified unknown board";
        default:
            return "M5 board " + String(static_cast<int>(board));
    }
}

String makeApSsid()
{
    const uint64_t mac = ESP.getEfuseMac();
    char suffix[8];
    snprintf(suffix, sizeof(suffix), "-%04X", static_cast<uint16_t>(mac));
    return String(app_config::kApPrefix) + suffix;
}
}  // namespace

void setup()
{
    Serial.begin(115200);
    delay(150);
    auto m5cfg = M5.config();
    M5.begin(m5cfg);
    boardName = detectBoardName(M5.getBoard()) + " / " + app_config::kBoardName;
    Serial.printf("\n[STP2] %s firmware %s\n", boardName.c_str(), app_config::kFirmwareVersion);
    Serial.printf("[STP2] M5 board enum: %d, PSRAM: %u bytes, free: %u bytes\n", static_cast<int>(M5.getBoard()),
                  ESP.getPsramSize(), ESP.getFreePsram());

    const bool recognizedM5 = M5.getBoard() != m5::board_t::board_unknown;
    pm1.setI2CBuses(&M5.In_I2C, &M5.Ex_I2C, recognizedM5);

    display.begin();
    Serial.printf("[STP2] Display init: board=%d, %ux%u, present=%s\n", static_cast<int>(M5.getBoard()),
                  display.width(), display.height(), display.hasDisplay() ? "yes" : "no");
    if (!display.hasDisplay()) {
        Serial.println("[STP2] WARNING: M5Unified did not report an initialized display; QR output is disabled");
    }
    pm1.begin();

    WiFi.persistent(false);
    WiFi.mode(WIFI_AP);
    WiFi.setSleep(false);
    apSsid               = makeApSsid();
    const bool apStarted = WiFi.softAP(apSsid.c_str(), app_config::kApPassword, 6, false, 4);
    if (!apStarted) {
        Serial.println("[STP2] ERROR: SoftAP failed to start");
    }

    const String url = "http://" + WiFi.softAPIP().toString() + "/";
    display.showAccessPoint(apSsid, app_config::kApPassword, url);
    Serial.printf("[STP2] AP: %s  password: %s  URL: %s\n", apSsid.c_str(), app_config::kApPassword, url.c_str());
    Serial.printf("[STP2] Display: %ux%u (%s)\n", display.width(), display.height(),
                  display.hasDisplay() ? "present" : "not present");
    Serial.printf("[STP2] Default PM1 I2C: %s SDA=%u SCL=%u\n", pm1.defaultBusName(), pm1.savedSda(), pm1.savedScl());

    portal =
        std::make_unique<WebPortal>(pm1, apSsid, boardName, display.hasDisplay(), display.width(), display.height());
    if (!portal->begin()) {
        Serial.println("[STP2] WARNING: captive DNS server failed to start");
    }
    Serial.println("[STP2] Web portal ready");
}

void loop()
{
    if (portal) portal->loop();
    if (pm1.isConnected() != lastPm1Connected || pm1.sda() != lastSda || pm1.scl() != lastScl ||
        pm1.deviceId() != lastDeviceId) {
        lastPm1Connected = pm1.isConnected();
        lastSda          = pm1.sda();
        lastScl          = pm1.scl();
        lastDeviceId     = pm1.deviceId();
        display.setPm1State(lastPm1Connected, lastSda, lastScl, lastDeviceId);
    }
    delay(2);
}
