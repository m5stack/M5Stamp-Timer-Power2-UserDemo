#include "web_portal.h"

#include <WiFi.h>

#include <cerrno>
#include <cstdlib>
#include <utility>

#include "app_config.h"
#include "web_assets.h"

namespace {
String boolText(bool value)
{
    return value ? "true" : "false";
}

bool parseInteger(WebServer& server, const char* name, long minimum, long maximum, long& output)
{
    if (!server.hasArg(name)) return false;
    const String text = server.arg(name);
    if (text.isEmpty()) return false;
    char* end         = nullptr;
    errno             = 0;
    const long parsed = strtol(text.c_str(), &end, 10);
    if (errno != 0 || end == text.c_str() || *end != '\0' || parsed < minimum || parsed > maximum) return false;
    output = parsed;
    return true;
}
}  // namespace

WebPortal::WebPortal(Pm1Controller& controller, String apSsid, String boardName, bool hasDisplay, uint16_t displayWidth,
                     uint16_t displayHeight)
    : controller_(controller),
      apSsid_(std::move(apSsid)),
      boardName_(std::move(boardName)),
      hasDisplay_(hasDisplay),
      displayWidth_(displayWidth),
      displayHeight_(displayHeight)
{
}

bool WebPortal::begin()
{
    registerAssets();

    // Common connectivity probes used by Android, Apple CNA, Windows NCSI,
    // Samsung and Linux network managers. Returning a redirect makes the
    // operating system classify this SoftAP as a captive portal.
    static constexpr const char* kProbePaths[] = {
        "/generate_204",
        "/gen_204",
        "/hotspot-detect.html",
        "/library/test/success.html",
        "/success.txt",
        "/connecttest.txt",
        "/ncsi.txt",
        "/canonical.html",
        "/redirect",
        "/connectivity-check",
    };
    for (const char* path : kProbePaths) {
        server_.on(path, HTTP_GET, [this]() { handleCaptiveProbe(); });
        server_.on(path, HTTP_HEAD, [this]() { handleCaptiveProbe(); });
    }

    server_.on("/api/info", HTTP_GET, [this]() { handleInfo(); });
    server_.on("/api/state", HTTP_GET, [this]() { handleState(); });
    server_.on("/api/i2c/scan", HTTP_POST, [this]() { handleScan(); });
    server_.on("/api/op", HTTP_POST, [this]() { handleOperation(); });
    server_.onNotFound([this]() { handleNotFound(); });
    server_.begin();

    dns_.setErrorReplyCode(DNSReplyCode::NoError);
    return dns_.start(53, "*", WiFi.softAPIP());
}

void WebPortal::loop()
{
    dns_.processNextRequest();
    server_.handleClient();
}

void WebPortal::registerAssets()
{
    for (size_t i = 0; i < WEB_ASSET_COUNT; ++i) {
        const WebAsset asset = WEB_ASSETS[i];
        server_.on(asset.path, HTTP_GET, [this, asset]() {
            server_.sendHeader("Content-Encoding", "gzip");
            server_.sendHeader("Cache-Control", "no-cache");
            server_.sendHeader("X-Content-Type-Options", "nosniff");
            server_.send_P(200, asset.content_type, reinterpret_cast<PGM_P>(asset.data), asset.size);
        });
    }
}

void WebPortal::handleInfo()
{
    const String chip = ESP.getChipModel();
    const String mac  = WiFi.softAPmacAddress();
    String body;
    body.reserve(900);
    body += F("{\"firmware\":\"");
    body += app_config::kFirmwareVersion;
    body += F("\",\"board\":\"");
    body += jsonEscape(boardName_);
    body += F("\",\"chip\":\"");
    body += jsonEscape(chip);
    body += F("\",\"cores\":");
    body += ESP.getChipCores();
    body += F(",\"cpuMhz\":");
    body += ESP.getCpuFreqMHz();
    body += F(",\"revision\":");
    body += ESP.getChipRevision();
    body += F(",\"flashBytes\":");
    body += ESP.getFlashChipSize();
    body += F(",\"freeHeap\":");
    body += ESP.getFreeHeap();
    body += F(",\"psramBytes\":");
    body += ESP.getPsramSize();
    body += F(",\"psramFree\":");
    body += ESP.getFreePsram();
    body += F(",\"mac\":\"");
    body += mac;
    body += F("\",\"display\":{\"present\":");
    body += boolText(hasDisplay_);
    body += F(",\"width\":");
    body += displayWidth_;
    body += F(",\"height\":");
    body += displayHeight_;
    body += F("},\"ap\":{\"ssid\":\"");
    body += jsonEscape(apSsid_);
    body += F("\",\"password\":\"");
    body += jsonEscape(app_config::kApPassword);
    body += F("\",\"ip\":\"");
    body += WiFi.softAPIP().toString();
    body += F("\",\"mac\":\"");
    body += mac;
    body += F("\"},\"i2c\":{\"bus\":\"");
    body += controller_.defaultBusName();
    body += F("\",\"sda\":");
    body += controller_.savedSda();
    body += F(",\"scl\":");
    body += controller_.savedScl();
    body += F(",\"speed\":");
    body += controller_.savedSpeed();
    body += F("},\"presets\":[{\"name\":\"");
    body += controller_.defaultBusName();
    body += F("\",\"sda\":");
    body += controller_.defaultSda();
    body += F(",\"scl\":");
    body += controller_.defaultScl();
    body += F(",\"speed\":100000}]}");
    sendJson(200, body);
}

void WebPortal::handleState()
{
    if (!controller_.isConnected()) {
        sendJson(409, F("{\"message\":\"M5PM1 is not connected; return to / and scan I2C\"}"));
        return;
    }
    sendJson(200, controller_.stateJson());
}

void WebPortal::handleScan()
{
    long sda   = 0;
    long scl   = 0;
    long speed = 0;
    if (!parseInteger(server_, "sda", 0, 255, sda) || !parseInteger(server_, "scl", 0, 255, scl) ||
        !parseInteger(server_, "speed", 100000, 400000, speed) || (speed != 100000 && speed != 400000)) {
        sendJson(400, F("{\"message\":\"sda, scl and speed are invalid\"}"));
        return;
    }

    String error;
    const bool connected = controller_.scanAndConnect(static_cast<uint8_t>(sda), static_cast<uint8_t>(scl),
                                                      static_cast<uint32_t>(speed), error);
    String body;
    body.reserve(420);
    body += F("{\"addresses\":");
    body += controller_.addressesJson();
    body += F(",\"connected\":");
    body += boolText(connected);
    body += F(",\"message\":\"");
    body += jsonEscape(error);
    body += F("\",\"device\":");
    body += controller_.deviceJson();
    body += '}';
    sendJson(200, body);
}

void WebPortal::handleOperation()
{
    if (!server_.hasArg("op")) {
        sendJson(400, F("{\"message\":\"op is required\"}"));
        return;
    }

    const String op = server_.arg("op");
    String error;
    bool ok = false;
    long a  = 0;
    long b  = 0;
    long c  = 0;

    if (op == "write") {
        if (!parseInteger(server_, "reg", 0, 255, a) || !parseInteger(server_, "value", 0, 255, b)) {
            sendJson(400, F("{\"message\":\"reg and value must be 0..255\"}"));
            return;
        }
        ok = controller_.writeRegister(static_cast<uint8_t>(a), static_cast<uint8_t>(b), error);
    } else if (op == "field") {
        if (!parseInteger(server_, "reg", 0, 255, a) || !parseInteger(server_, "mask", 1, 255, b) ||
            !parseInteger(server_, "value", 0, 255, c)) {
            sendJson(400, F("{\"message\":\"reg, mask and value are invalid\"}"));
            return;
        }
        ok = controller_.writeField(static_cast<uint8_t>(a), static_cast<uint8_t>(b), static_cast<uint8_t>(c), error);
    } else if (op == "gpio") {
        if (!server_.hasArg("kind") || !parseInteger(server_, "pin", 0, 4, a) ||
            !parseInteger(server_, "value", 0, 3, b)) {
            sendJson(400, F("{\"message\":\"pin, kind and value are invalid\"}"));
            return;
        }
        ok = controller_.controlGpio(static_cast<uint8_t>(a), server_.arg("kind"), static_cast<uint8_t>(b), error);
    } else if (op == "wake") {
        if (!parseInteger(server_, "pin", 0, 4, a) || !parseInteger(server_, "value", 0, 1, b)) {
            sendJson(400, F("{\"message\":\"pin and value are invalid\"}"));
            return;
        }
        ok = controller_.setWake(static_cast<uint8_t>(a), b != 0, error);
    } else if (op == "pwm_duty") {
        if (!parseInteger(server_, "ch", 0, 1, a) || !parseInteger(server_, "value", 0, 100, b)) {
            sendJson(400, F("{\"message\":\"PWM channel or duty is invalid\"}"));
            return;
        }
        ok = controller_.setPwmDuty(static_cast<uint8_t>(a), static_cast<uint8_t>(b), error);
    } else if (op == "pwm_freq") {
        if (!parseInteger(server_, "value", 1, 65535, a)) {
            sendJson(400, F("{\"message\":\"PWM frequency must be 1..65535\"}"));
            return;
        }
        ok = controller_.setPwmFrequency(static_cast<uint16_t>(a), error);
    } else if (op == "neo") {
        if (!server_.hasArg("colors") || !parseInteger(server_, "count", 1, 32, a)) {
            sendJson(400, F("{\"message\":\"NeoPixel count or colors are invalid\"}"));
            return;
        }
        ok = controller_.setNeo(server_.arg("colors"), static_cast<uint8_t>(a), error);
    } else if (op == "neo_off") {
        ok = controller_.disableNeo(error);
    } else if (op == "timer") {
        if (!parseInteger(server_, "sec", 0, 2147483647L, a) || !parseInteger(server_, "action", 0, 4, b)) {
            sendJson(400, F("{\"message\":\"timer seconds or action are invalid\"}"));
            return;
        }
        ok = controller_.setTimer(static_cast<uint32_t>(a), static_cast<uint8_t>(b), error);
    } else if (op == "sys") {
        if (!parseInteger(server_, "cmd", 1, 3, a)) {
            sendJson(400, F("{\"message\":\"system command must be 1..3\"}"));
            return;
        }
        ok = controller_.systemCommand(static_cast<uint8_t>(a), error);
    } else if (op == "clear_irq") {
        ok = controller_.clearInterrupts(error);
    } else if (op == "lvp") {
        if (!parseInteger(server_, "value", 2000, 4000, a)) {
            sendJson(400, F("{\"message\":\"low-voltage cut-off must be 2000..4000 mV\"}"));
            return;
        }
        ok = controller_.setLowVoltageCutoff(static_cast<uint16_t>(a), error);
    } else if (op == "adc") {
        if (!parseInteger(server_, "ch", 1, 6, a) || (a != 1 && a != 2 && a != 6)) {
            sendJson(400, F("{\"message\":\"ADC channel must be 1, 2, or 6\"}"));
            return;
        }
        ok = controller_.readAdc(static_cast<uint8_t>(a), error);
    } else if (op == "ping") {
        ok = controller_.ping(error);
    } else {
        sendJson(400, F("{\"message\":\"unknown operation or missing parameter\"}"));
        return;
    }

    if (!ok) {
        String body;
        body.reserve(error.length() + 32);
        body += F("{\"message\":\"");
        body += jsonEscape(error);
        body += F("\"}");
        sendJson(controller_.isConnected() ? 400 : 409, body);
        return;
    }

    String body;
    body.reserve(controller_.isConnected() ? 780 : 64);
    body += F("{\"ok\":true,\"state\":");
    body += controller_.stateJson();
    body += '}';
    sendJson(200, body);
}

void WebPortal::handleCaptiveProbe()
{
    const String portalUrl = "http://" + WiFi.softAPIP().toString() + "/";
    server_.sendHeader("Cache-Control", "no-store, no-cache, must-revalidate", true);
    server_.sendHeader("Pragma", "no-cache", true);
    server_.sendHeader("Expires", "0", true);
    server_.sendHeader("Captive-Portal", portalUrl, true);
    server_.sendHeader("Location", portalUrl, true);
    server_.sendHeader("Connection", "close", true);
    String body = F("<!doctype html><meta charset=\"utf-8\"><meta http-equiv=\"refresh\" content=\"0;url=");
    body += portalUrl;
    body += F("\"><title>Stamp Timer Power2</title><a href=\"");
    body += portalUrl;
    body += F("\">Open Stamp Timer Power2</a>");
    server_.send(302, "text/html; charset=utf-8", body);
}

void WebPortal::handleNotFound()
{
    if (server_.uri().startsWith("/api/")) {
        sendJson(404, F("{\"message\":\"Not found\"}"));
        return;
    }
    handleCaptiveProbe();
}

void WebPortal::sendJson(int code, const String& body)
{
    server_.sendHeader("Cache-Control", "no-store");
    server_.sendHeader("X-Content-Type-Options", "nosniff");
    server_.send(code, "application/json; charset=utf-8", body);
}

String WebPortal::jsonEscape(const String& input)
{
    String out;
    out.reserve(input.length() + 8);
    for (size_t i = 0; i < input.length(); ++i) {
        const char c = input[i];
        switch (c) {
            case '\\':
                out += F("\\\\");
                break;
            case '"':
                out += F("\\\"");
                break;
            case '\n':
                out += F("\\n");
                break;
            case '\r':
                out += F("\\r");
                break;
            case '\t':
                out += F("\\t");
                break;
            default:
                out += c;
                break;
        }
    }
    return out;
}
