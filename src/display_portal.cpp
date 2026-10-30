#include "display_portal.h"

#include <M5Unified.h>
#include <qrcode.h>

#include <algorithm>

namespace {
constexpr uint16_t kBackground = 0x0861;  // deep navy
constexpr uint16_t kBlue       = 0x049F;  // M5 blue-ish
constexpr uint16_t kGreen      = 0x2E68;
constexpr uint16_t kMuted      = 0x9CF3;

String wifiQrEscape(const String& value)
{
    String escaped;
    escaped.reserve(value.length() + 8);
    for (size_t i = 0; i < value.length(); ++i) {
        const char c = value[i];
        if (c == '\\' || c == ';' || c == ',' || c == ':' || c == '"') escaped += '\\';
        escaped += c;
    }
    return escaped;
}
}  // namespace

bool DisplayPortal::begin()
{
    width_      = M5.Display.width();
    height_     = M5.Display.height();
    hasDisplay_ = width_ > 32 && height_ > 32;
    if (hasDisplay_) {
        M5.Display.setRotation(1);
        width_      = M5.Display.width();
        height_     = M5.Display.height();
        roundLarge_ = width_ == height_ && width_ >= 400;
        M5.Display.setBrightness(90);
        M5.Display.setTextWrap(false);
    }
    return hasDisplay_;
}

void DisplayPortal::centered(const String& text, int16_t y, uint8_t size, uint16_t color)
{
    if (!hasDisplay_) return;
    M5.Display.setTextSize(size);
    M5.Display.setTextColor(color, kBackground);

    String shown           = text;
    const int maxTextWidth = width_ - 16;
    if (M5.Display.textWidth(shown) > maxTextWidth) {
        while (shown.length() > 3 && M5.Display.textWidth(shown) > maxTextWidth - 18) {
            shown.remove(shown.length() - 1);
        }
        shown += "...";
    }
    const int16_t x = std::max<int16_t>(4, (width_ - M5.Display.textWidth(shown)) / 2);
    M5.Display.drawString(shown, x, y);
}

void DisplayPortal::showAccessPoint(const String& ssid, const String& password, const String& url)
{
    ssid_     = ssid;
    password_ = password;
    url_      = url;
    draw(ssid_, password_, url_);
}

void DisplayPortal::setPm1State(bool connected, uint8_t sda, uint8_t scl, uint8_t deviceId)
{
    pm1Connected_ = connected;
    sda_          = sda;
    scl_          = scl;
    deviceId_     = deviceId;
    draw(ssid_, password_, url_);
}

void DisplayPortal::draw(const String& ssid, const String& password, const String& url)
{
    if (!hasDisplay_) return;

    M5.Display.startWrite();
    M5.Display.fillScreen(kBackground);
    centered("STAMP TIMER POWER2", roundLarge_ ? 24 : 7, 1, kMuted);

    const String payload = "WIFI:T:WPA;S:" + wifiQrEscape(ssid) + ";P:" + wifiQrEscape(password) + ";;";
    QRCode qr{};
    uint8_t qrData[qrcode_getBufferSize(8)]{};
    const uint8_t qrVersion = payload.length() <= 106 ? 5 : 8;
    const int8_t result     = qrcode_initText(&qr, qrData, qrVersion, ECC_LOW, payload.c_str());
    if (result == 0) {
        int maxWidth  = width_ - 20;
        int maxHeight = height_ - 108;
        if (roundLarge_) {
            // Keep the QR square safely inside the 466/468 px circular visible area.
            // The normal payload uses version 5 at 7x scale (259x259 px). Long
            // custom credentials fall back to version 8 and a smaller integer scale.
            const int roundSafe = (width_ * 56) / 100;
            maxWidth            = std::min(maxWidth, roundSafe);
            maxHeight           = std::min(maxHeight, roundSafe);
        }
        int scale = std::min(maxWidth / qr.size, maxHeight / qr.size);
        if (scale < 1) scale = 1;
        const int qrPixels = qr.size * scale;
        const int qrX      = (width_ - qrPixels) / 2;
        const int qrY      = roundLarge_ ? 52 : 28;
        const int pad      = roundLarge_ ? 8 : 5;
        M5.Display.fillRoundRect(qrX - pad, qrY - pad, qrPixels + pad * 2, qrPixels + pad * 2, 5, TFT_WHITE);
        for (uint8_t y = 0; y < qr.size; ++y) {
            for (uint8_t x = 0; x < qr.size; ++x) {
                if (qrcode_getModule(&qr, x, y)) {
                    M5.Display.fillRect(qrX + x * scale, qrY + y * scale, scale, scale, TFT_BLACK);
                }
            }
        }

        int textY = qrY + qrPixels + 13;
        centered("SSID  " + ssid, textY, 1, TFT_WHITE);
        centered("PASS  " + password, textY + 14, 1, TFT_WHITE);
        String shortUrl = url;
        shortUrl.replace("http://", "");
        shortUrl.replace("https://", "");
        if (shortUrl.endsWith("/")) shortUrl.remove(shortUrl.length() - 1);
        centered("OPEN  " + shortUrl, textY + 28, 1, kBlue);
        const String state = pm1Connected_ ? "PM1 0x" + String(static_cast<unsigned>(deviceId_), HEX) + "  " +
                                                 String(sda_) + "/" + String(scl_)
                                           : "Open 192.168.4.1";
        centered(state, roundLarge_ ? height_ - 54 : height_ - 18, 1, pm1Connected_ ? kGreen : kMuted);
    } else {
        centered("QR generation failed", height_ / 2, 1, TFT_RED);
    }
    M5.Display.endWrite();
}
