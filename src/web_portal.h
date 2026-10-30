#pragma once

#include <Arduino.h>
#include <DNSServer.h>
#include <WebServer.h>

#include "pm1_controller.h"

class WebPortal {
public:
    WebPortal(Pm1Controller& controller, String apSsid, String boardName, bool hasDisplay, uint16_t displayWidth,
              uint16_t displayHeight);

    bool begin();
    void loop();

private:
    void registerAssets();
    void handleInfo();
    void handleState();
    void handleScan();
    void handleOperation();
    void handleCaptiveProbe();
    void handleNotFound();
    void sendJson(int code, const String& body);
    static String jsonEscape(const String& input);

    Pm1Controller& controller_;
    WebServer server_{80};
    DNSServer dns_;
    String apSsid_;
    String boardName_;
    bool hasDisplay_;
    uint16_t displayWidth_;
    uint16_t displayHeight_;
};
