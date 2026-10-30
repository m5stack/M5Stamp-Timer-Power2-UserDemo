#include "pm1_controller.h"

#include <algorithm>
#include <cstdlib>

namespace {
struct RegisterRange {
    uint8_t start;
    uint8_t length;
};

// Readable register windows documented by M5PM1. Gaps are reserved and are
// intentionally left as zero in the snapshot.
constexpr RegisterRange kReadableRanges[] = {
    {0x00, 0x0D}, {0x10, 0x0A}, {0x20, 0x0B}, {0x30, 0x06}, {0x38, 0x06},
    {0x40, 0x06}, {0x48, 0x03}, {0x50, 0x01}, {0x53, 0x01},
};

}  // namespace

Pm1Controller::Pm1Controller() = default;

void Pm1Controller::begin()
{
    loadPreferences();
}

void Pm1Controller::setI2CBuses(m5::I2C_Class* internalBus, m5::I2C_Class* externalBus, bool recognizedM5)
{
    internalBus_  = internalBus;
    externalBus_  = externalBus;
    recognizedM5_ = recognizedM5;

    internalSda_          = internalBus_ != nullptr ? internalBus_->getSDA() : -1;
    internalScl_          = internalBus_ != nullptr ? internalBus_->getSCL() : -1;
    const int externalSda = externalBus_ != nullptr ? externalBus_->getSDA() : -1;
    const int externalScl = externalBus_ != nullptr ? externalBus_->getSCL() : -1;

    const bool internalValid = digitalPinCanOutput(internalSda_) && digitalPinCanOutput(internalScl_) &&
                               internalSda_ != internalScl_ && internalBus_ != nullptr;
    const bool externalValid = digitalPinCanOutput(externalSda) && digitalPinCanOutput(externalScl) &&
                               externalSda != externalScl && externalBus_ != nullptr;

    if (recognizedM5_ && internalValid) {
        defaultSda_          = static_cast<uint8_t>(internalSda_);
        defaultScl_          = static_cast<uint8_t>(internalScl_);
        defaultUsesInternal_ = true;
    } else if (externalValid) {
        defaultSda_          = static_cast<uint8_t>(externalSda);
        defaultScl_          = static_cast<uint8_t>(externalScl);
        defaultUsesInternal_ = false;
    } else {
        defaultUsesInternal_ = false;
    }
}

void Pm1Controller::loadPreferences()
{
    prefs_.begin(app_config::kPrefsNamespace, true);
    savedSda_   = prefs_.getUChar("sda", defaultSda_);
    savedScl_   = prefs_.getUChar("scl", defaultScl_);
    savedSpeed_ = prefs_.getUInt("speed", 100000);
    prefs_.end();
    if (savedSpeed_ != 100000 && savedSpeed_ != 400000) savedSpeed_ = 100000;
    sda_   = savedSda_;
    scl_   = savedScl_;
    speed_ = savedSpeed_;
}

bool Pm1Controller::scanAndConnect(uint8_t sda, uint8_t scl, uint32_t speed, String& error)
{
    if (sda == scl) {
        error = "SDA and SCL must be different pins";
        return false;
    }
    if (!digitalPinCanOutput(sda) || !digitalPinCanOutput(scl)) {
        error = "SDA and SCL must be valid output-capable GPIO pins";
        return false;
    }
    if (speed != 100000 && speed != 400000) {
        error = "I2C speed must be 100000 or 400000";
        return false;
    }

    connected_ = false;
    activeBus_ = nullptr;
    addresses_.clear();
    sda_       = sda;
    scl_       = scl;
    speed_     = speed;
    lastError_ = "";

    const bool useInternalBus = recognizedM5_ && internalBus_ != nullptr && internalBus_->isEnabled() &&
                                static_cast<uint8_t>(internalSda_) == sda && static_cast<uint8_t>(internalScl_) == scl;

    if (useInternalBus) {
        activeBus_ = internalBus_;
        bus_ready_ = true;
    } else {
        if (externalBus_ == nullptr) {
            error = "M5Unified external I2C bus is unavailable";
            return false;
        }
        activeBus_      = externalBus_;
        i2c_port_t port = activeBus_->getPort();
        if (port < 0 || port >= I2C_NUM_MAX) port = I2C_NUM_0;
        bus_ready_ = activeBus_->begin(port, sda, scl);
        if (!bus_ready_) {
            error      = "Failed to initialize the M5 external I2C controller";
            activeBus_ = nullptr;
            return false;
        }
    }
    delay(10);

    for (uint8_t address = 0x08; address < 0x78; ++address) {
        if (activeBus_->scanID(address, speed)) addresses_.push_back(address);
        delay(1);
    }

    const bool found = std::find(addresses_.begin(), addresses_.end(), app_config::kPm1Address) != addresses_.end();
    if (!found) {
        error      = "M5PM1 address 0x6E was not found";
        lastError_ = error;
        return false;
    }

    // A sleeping M5PM1 may NACK the first transaction. M5PM1::begin handles the
    // bus setup, then a bounded retry verifies that the device can be identified.
    m5pm1_err_t result = M5PM1_FAIL;
    for (uint8_t attempt = 0; attempt < 3; ++attempt) {
        result = pm1_.begin(activeBus_, app_config::kPm1Address, speed);
        if (result == M5PM1_OK) {
            uint8_t id = 0;
            result     = pm1_.getDeviceId(&id);
            if (result == M5PM1_OK) {
                deviceId_ = id;
                break;
            }
        }
        delay(40);
    }
    if (result != M5PM1_OK) {
        error      = "0x6E responded, but M5PM1 identification failed: " + m5pm1Error(result);
        lastError_ = error;
        return false;
    }

    pm1_.setAutoSnapshot(false);
    pm1_.getDeviceModel(&deviceModel_);
    pm1_.getHwVersion(&hwVersion_);
    pm1_.getSwVersion(&swVersion_);
    connected_ = true;

    prefs_.begin(app_config::kPrefsNamespace, false);
    prefs_.putUChar("sda", sda_);
    prefs_.putUChar("scl", scl_);
    prefs_.putUInt("speed", speed_);
    prefs_.end();
    savedSda_   = sda_;
    savedScl_   = scl_;
    savedSpeed_ = speed_;
    return true;
}

String Pm1Controller::addressesJson() const
{
    String out;
    out.reserve(addresses_.size() * 5 + 2);
    out += '[';
    for (size_t i = 0; i < addresses_.size(); ++i) {
        if (i) out += ',';
        out += addresses_[i];
    }
    out += ']';
    return out;
}

String Pm1Controller::deviceJson() const
{
    String out;
    out.reserve(80);
    out += "{\"id\":";
    out += deviceId_;
    out += ",\"model\":";
    out += deviceModel_;
    out += ",\"hw\":";
    out += hwVersion_;
    out += ",\"sw\":";
    out += swVersion_;
    out += '}';
    return out;
}

bool Pm1Controller::readBlock(uint8_t start, uint8_t length, uint8_t* out)
{
    if (!bus_ready_ || activeBus_ == nullptr) return false;
    return activeBus_->readRegister(app_config::kPm1Address, start, out, length, speed_);
}

bool Pm1Controller::readRegisters(uint8_t* regs)
{
    memset(regs, 0, 256);
    bool ok = true;
    for (const auto& range : kReadableRanges) {
        if (!readBlock(range.start, range.length, regs + range.start)) ok = false;
    }
    return ok;
}

bool Pm1Controller::readRegister(uint8_t reg, uint8_t& value)
{
    return bus_ready_ && activeBus_ != nullptr &&
           activeBus_->readRegister(app_config::kPm1Address, reg, &value, 1, speed_);
}

bool Pm1Controller::writeRegisterRaw(uint8_t reg, uint8_t value)
{
    return bus_ready_ && activeBus_ != nullptr &&
           activeBus_->writeRegister8(app_config::kPm1Address, reg, value, speed_);
}

bool Pm1Controller::writableRegister(uint8_t reg)
{
    switch (reg) {
        case 0x05:
        case 0x06:
        case 0x07:
        case 0x08:
        case 0x09:
        case 0x0A:
        case 0x0B:
        case 0x0C:
        case 0x10:
        case 0x11:
        case 0x13:
        case 0x14:
        case 0x15:
        case 0x16:
        case 0x17:
        case 0x18:
        case 0x19:
        case 0x2A:
        case 0x30:
        case 0x31:
        case 0x32:
        case 0x33:
        case 0x34:
        case 0x35:
        case 0x38:
        case 0x39:
        case 0x3A:
        case 0x3B:
        case 0x3C:
        case 0x3D:
        case 0x40:
        case 0x41:
        case 0x42:
        case 0x43:
        case 0x44:
        case 0x45:
        case 0x49:
        case 0x4A:
        case 0x50:
        case 0x53:
            return true;
        default:
            return reg >= 0x60 && reg <= 0x9F;
    }
}

bool Pm1Controller::checkConnected(String& error)
{
    if (!connected_ || !bus_ready_ || activeBus_ == nullptr) {
        error = "M5PM1 is not connected; configure and scan I2C first";
        return false;
    }
    return true;
}

bool Pm1Controller::writeRegister(uint8_t reg, uint8_t value, String& error)
{
    if (!checkConnected(error)) return false;
    if (!writableRegister(reg)) {
        error = "Register is read-only or outside the writable map";
        return false;
    }
    if (!writeRegisterRaw(reg, value)) {
        error = "I2C write failed";
        return false;
    }
    return true;
}

bool Pm1Controller::writeField(uint8_t reg, uint8_t mask, uint8_t value, String& error)
{
    if (!checkConnected(error)) return false;
    if (!writableRegister(reg) || mask == 0) {
        error = "Register or field is not writable";
        return false;
    }
    uint8_t old = 0;
    if (!readRegister(reg, old)) {
        error = "I2C read failed";
        return false;
    }
    return writeRegister(reg, static_cast<uint8_t>((old & ~mask) | (value & mask)), error);
}

bool Pm1Controller::controlGpio(uint8_t pin, const String& kind, uint8_t value, String& error)
{
    if (!checkConnected(error)) return false;
    if (pin > 4) {
        error = "M5PM1 GPIO must be 0..4";
        return false;
    }
    m5pm1_err_t result = M5PM1_ERR_INVALID_ARG;
    const auto gpio    = static_cast<m5pm1_gpio_num_t>(pin);
    if (kind == "func" && value <= 3) {
        result = pm1_.gpioSetFunc(gpio, static_cast<m5pm1_gpio_func_t>(value));
    } else if (kind == "pull" && value <= 2) {
        result = pm1_.gpioSetPull(gpio, static_cast<m5pm1_gpio_pull_t>(value));
    } else if (kind == "mode" && value <= 1) {
        result = pm1_.gpioSetMode(gpio, static_cast<m5pm1_gpio_mode_t>(value));
    } else if (kind == "out" && value <= 1) {
        result = pm1_.gpioSetOutput(gpio, value);
    } else if (kind == "drv" && value <= 1) {
        result = pm1_.gpioSetDrive(gpio, static_cast<m5pm1_gpio_drive_t>(value));
    }
    if (result != M5PM1_OK) {
        error = m5pm1Error(result);
        return false;
    }
    return true;
}

bool Pm1Controller::setWake(uint8_t pin, bool enable, String& error)
{
    if (!checkConnected(error)) return false;
    if (pin > 4 || pin == 1) {
        error = "This M5PM1 GPIO does not support wake";
        return false;
    }
    const auto result = pm1_.gpioSetWakeEnable(static_cast<m5pm1_gpio_num_t>(pin), enable);
    if (result != M5PM1_OK) {
        error = m5pm1Error(result);
        return false;
    }
    return true;
}

bool Pm1Controller::setPwmDuty(uint8_t channel, uint8_t percent, String& error)
{
    if (!checkConnected(error)) return false;
    if (channel > 1 || percent > 100) {
        error = "PWM channel must be 0/1 and duty must be 0..100";
        return false;
    }
    const auto result = pm1_.setPwmDuty(static_cast<m5pm1_pwm_channel_t>(channel), percent);
    if (result != M5PM1_OK) {
        error = m5pm1Error(result);
        return false;
    }
    return true;
}

bool Pm1Controller::setPwmFrequency(uint16_t hz, String& error)
{
    if (!checkConnected(error)) return false;
    if (hz == 0) {
        error = "PWM frequency must be greater than zero";
        return false;
    }
    const auto result = pm1_.setPwmFrequency(hz);
    if (result != M5PM1_OK) {
        error = m5pm1Error(result);
        return false;
    }
    return true;
}

bool Pm1Controller::setNeo(const String& colors, uint8_t count, String& error)
{
    if (!checkConnected(error)) return false;
    if (count == 0 || count > 32) {
        error = "NeoPixel count must be 1..32";
        return false;
    }
    m5pm1_rgb_t parsed[32]{};
    size_t parsedCount = 0;
    int cursor         = 0;
    while (cursor < static_cast<int>(colors.length()) && parsedCount < 32) {
        const int semi    = colors.indexOf(';', cursor);
        const String item = colors.substring(cursor, semi < 0 ? colors.length() : semi);
        const int c1      = item.indexOf(',');
        const int c2      = item.indexOf(',', c1 + 1);
        if (c1 <= 0 || c2 <= c1) {
            error = "Invalid NeoPixel color list";
            return false;
        }
        const long r = item.substring(0, c1).toInt();
        const long g = item.substring(c1 + 1, c2).toInt();
        const long b = item.substring(c2 + 1).toInt();
        if (r < 0 || r > 255 || g < 0 || g > 255 || b < 0 || b > 255) {
            error = "NeoPixel channel must be 0..255";
            return false;
        }
        parsed[parsedCount++] = {static_cast<uint8_t>(r), static_cast<uint8_t>(g), static_cast<uint8_t>(b)};
        if (semi < 0) break;
        cursor = semi + 1;
    }
    if (!parsedCount) {
        error = "No NeoPixel colors supplied";
        return false;
    }
    // The UI supplies a palette (for example one red entry for a whole strip).
    // Expand it to the requested LED count because M5PM1::setLeds requires one
    // entry per physical LED.
    m5pm1_rgb_t expanded[32]{};
    for (uint8_t i = 0; i < count; ++i) expanded[i] = parsed[i % parsedCount];
    const auto result = pm1_.setLeds(expanded, count, count, true);
    if (result != M5PM1_OK) {
        error = m5pm1Error(result);
        return false;
    }
    return true;
}

bool Pm1Controller::disableNeo(String& error)
{
    if (!checkConnected(error)) return false;
    const auto result = pm1_.disableLeds();
    if (result != M5PM1_OK) {
        error = m5pm1Error(result);
        return false;
    }
    return true;
}

bool Pm1Controller::setTimer(uint32_t seconds, uint8_t action, String& error)
{
    if (!checkConnected(error)) return false;
    if (action > 4) {
        error = "Timer action must be 0..4";
        return false;
    }
    const auto result = pm1_.timerSet(seconds, static_cast<m5pm1_tim_action_t>(action));
    if (result != M5PM1_OK) {
        error = m5pm1Error(result);
        return false;
    }
    return true;
}

bool Pm1Controller::systemCommand(uint8_t command, String& error)
{
    if (!checkConnected(error)) return false;
    if (command < 1 || command > 3) {
        error = "System command must be 1 (off), 2 (reset), or 3 (download)";
        return false;
    }
    const auto result = pm1_.sysCmd(static_cast<m5pm1_sys_cmd_t>(command));
    if (result != M5PM1_OK) {
        error = m5pm1Error(result);
        return false;
    }
    return true;
}

bool Pm1Controller::clearInterrupts(String& error)
{
    if (!checkConnected(error)) return false;
    bool ok = pm1_.irqClearGpioAll() == M5PM1_OK;
    ok      = (pm1_.irqClearSysAll() == M5PM1_OK) && ok;
    ok      = (pm1_.irqClearBtnAll() == M5PM1_OK) && ok;
    ok      = (pm1_.clearWakeSource(static_cast<uint8_t>(0x7F)) == M5PM1_OK) && ok;
    if (!ok) {
        error = "One or more interrupt-clear operations failed";
        return false;
    }
    return true;
}

bool Pm1Controller::setLowVoltageCutoff(uint16_t millivolts, String& error)
{
    if (!checkConnected(error)) return false;
    if (millivolts < 2000 || millivolts > 4000) {
        error = "Low-voltage cut-off must be 2000..4000 mV";
        return false;
    }
    const auto result = pm1_.setBatteryLvp(millivolts);
    if (result != M5PM1_OK) {
        error = m5pm1Error(result);
        return false;
    }
    return true;
}

bool Pm1Controller::readAdc(uint8_t channel, String& error)
{
    if (!checkConnected(error)) return false;
    if (channel != 1 && channel != 2 && channel != 6) {
        error = "ADC channel must be 1, 2, or 6";
        return false;
    }
    uint16_t value    = 0;
    const auto result = pm1_.analogRead(static_cast<m5pm1_adc_channel_t>(channel), &value);
    if (result != M5PM1_OK) {
        error = m5pm1Error(result);
        return false;
    }
    return true;
}

bool Pm1Controller::ping(String& error)
{
    if (!checkConnected(error)) return false;
    uint8_t id        = 0;
    const auto result = pm1_.getDeviceId(&id);
    if (result != M5PM1_OK) {
        error = m5pm1Error(result);
        return false;
    }
    deviceId_ = id;
    return true;
}

String Pm1Controller::stateJson()
{
    String out;
    if (!connected_ || !bus_ready_ || activeBus_ == nullptr) {
        out = "{\"connected\":false}";
        return out;
    }

    uint8_t regs[256]{};
    readRegisters(regs);

    uint16_t vref         = regs[0x20] | (regs[0x21] << 8);
    uint16_t measuredVref = 0;
    if (pm1_.readVref(&measuredVref) == M5PM1_OK && measuredVref > 0) vref = measuredVref;
    uint16_t vbat = 0;
    uint16_t vin  = 0;
    uint16_t ext  = 0;
    if (pm1_.readVbat(&vbat) != M5PM1_OK) vbat = 0;
    if (pm1_.readVin(&vin) != M5PM1_OK) vin = 0;
    if (pm1_.read5VInOut(&ext) != M5PM1_OK) ext = 0;
    m5pm1_pwr_src_t powerSource = M5PM1_PWR_SRC_UNKNOWN;
    pm1_.getPowerSource(&powerSource);
    bool btnPressed = false;
    pm1_.btnGetState(&btnPressed);

    // Show the measured voltages in the register panel too. They are read-only
    // fields in the UI, but users expect the displayed value to be live.
    regs[0x22] = vbat & 0xFF;
    regs[0x23] = vbat >> 8;
    regs[0x24] = vin & 0xFF;
    regs[0x25] = vin >> 8;
    regs[0x26] = ext & 0xFF;
    regs[0x27] = ext >> 8;

    static constexpr char kHexDigits[] = "0123456789ABCDEF";
    char regHex[513];
    for (size_t i = 0; i < 256; ++i) {
        regHex[i * 2]     = kHexDigits[regs[i] >> 4];
        regHex[i * 2 + 1] = kHexDigits[regs[i] & 0x0F];
    }
    regHex[512] = '\0';

    out.reserve(760);
    out += F("{\"connected\":true,\"sda\":");
    out += sda_;
    out += F(",\"scl\":");
    out += scl_;
    out += F(",\"speed\":");
    out += speed_;
    out += F(",\"vinMv\":");
    out += vin;
    out += F(",\"vbatMv\":");
    out += vbat;
    out += F(",\"extMv\":");
    out += ext;
    out += F(",\"powerSource\":");
    out += static_cast<uint8_t>(powerSource);
    out += F(",\"vref\":");
    out += vref;
    out += F(",\"gpioIn\":");
    out += regs[0x12] & 0x1F;
    out += F(",\"btnPressed\":");
    out += btnPressed ? F("true") : F("false");
    out += F(",\"bus\":\"");
    out += activeBusName();
    out += F("\",\"tempC\":0,\"regs\":\"");
    out += regHex;
    out += F("\"}");
    return out;
}

String Pm1Controller::m5pm1Error(m5pm1_err_t err)
{
    switch (err) {
        case M5PM1_OK:
            return F("OK");
        case M5PM1_FAIL:
            return F("general failure");
        case M5PM1_ERR_I2C_CONFIG:
            return F("I2C configuration error");
        case M5PM1_ERR_RULE_VIOLATION:
            return F("rule violation");
        case M5PM1_ERR_INVALID_ARG:
            return F("invalid argument");
        case M5PM1_ERR_TIMEOUT:
            return F("timeout");
        case M5PM1_ERR_NOT_SUPPORTED:
            return F("not supported");
        case M5PM1_ERR_I2C_COMM:
            return F("I2C communication error");
        case M5PM1_ERR_NOT_INIT:
            return F("driver not initialized");
        case M5PM1_ERR_INTERNAL:
            return F("internal error");
        case M5PM1_ERR_VERIFY_FAILED:
            return F("configuration verify failed");
        default:
            return String(static_cast<int>(err));
    }
}
