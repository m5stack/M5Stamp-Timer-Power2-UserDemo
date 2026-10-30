#pragma once

#include <Arduino.h>

class DisplayPortal {
public:
    bool begin();
    bool hasDisplay() const
    {
        return hasDisplay_;
    }
    uint16_t width() const
    {
        return width_;
    }
    uint16_t height() const
    {
        return height_;
    }

    void showAccessPoint(const String& ssid, const String& password, const String& url);
    void setPm1State(bool connected, uint8_t sda, uint8_t scl, uint8_t deviceId);

private:
    void draw(const String& ssid, const String& password, const String& url);
    void centered(const String& text, int16_t y, uint8_t size, uint16_t color);

    bool hasDisplay_ = false;
    bool roundLarge_ = false;
    uint16_t width_  = 0;
    uint16_t height_ = 0;
    String ssid_;
    String password_;
    String url_;
    bool pm1Connected_ = false;
    uint8_t sda_       = 0;
    uint8_t scl_       = 0;
    uint8_t deviceId_  = 0;
};
