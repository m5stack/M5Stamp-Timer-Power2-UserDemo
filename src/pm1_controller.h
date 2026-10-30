#pragma once

#include <Arduino.h>
#include <M5Unified.h>
#include <M5PM1.h>
#include <Preferences.h>
#include <vector>

#include "app_config.h"

class Pm1Controller {
public:
    Pm1Controller();

    void begin();
    void setI2CBuses(m5::I2C_Class* internalBus, m5::I2C_Class* externalBus, bool recognizedM5);
    bool scanAndConnect(uint8_t sda, uint8_t scl, uint32_t speed, String& error);
    bool isConnected() const
    {
        return connected_;
    }
    uint8_t sda() const
    {
        return sda_;
    }
    uint8_t scl() const
    {
        return scl_;
    }
    uint32_t speed() const
    {
        return speed_;
    }
    uint8_t deviceId() const
    {
        return deviceId_;
    }
    uint8_t deviceModel() const
    {
        return deviceModel_;
    }
    uint8_t hwVersion() const
    {
        return hwVersion_;
    }
    uint8_t swVersion() const
    {
        return swVersion_;
    }
    const std::vector<uint8_t>& addresses() const
    {
        return addresses_;
    }
    const String& lastError() const
    {
        return lastError_;
    }

    String addressesJson() const;
    String deviceJson() const;
    String stateJson();

    bool writeRegister(uint8_t reg, uint8_t value, String& error);
    bool writeField(uint8_t reg, uint8_t mask, uint8_t value, String& error);
    bool controlGpio(uint8_t pin, const String& kind, uint8_t value, String& error);
    bool setWake(uint8_t pin, bool enable, String& error);
    bool setPwmDuty(uint8_t channel, uint8_t percent, String& error);
    bool setPwmFrequency(uint16_t hz, String& error);
    bool setNeo(const String& colors, uint8_t count, String& error);
    bool disableNeo(String& error);
    bool setTimer(uint32_t seconds, uint8_t action, String& error);
    bool systemCommand(uint8_t command, String& error);
    bool clearInterrupts(String& error);
    bool setLowVoltageCutoff(uint16_t millivolts, String& error);
    bool readAdc(uint8_t channel, String& error);
    bool ping(String& error);

    uint8_t savedSda() const
    {
        return savedSda_;
    }
    uint8_t defaultSda() const
    {
        return defaultSda_;
    }
    uint8_t defaultScl() const
    {
        return defaultScl_;
    }
    const char* defaultBusName() const
    {
        return defaultUsesInternal_ ? "M5_INTERNAL" : "M5_EXTERNAL";
    }
    const char* activeBusName() const
    {
        return activeBus_ != nullptr && activeBus_ == internalBus_ ? "M5_INTERNAL" : "M5_EXTERNAL";
    }
    uint8_t savedScl() const
    {
        return savedScl_;
    }
    uint32_t savedSpeed() const
    {
        return savedSpeed_;
    }

private:
    bool readRegisters(uint8_t* regs);
    bool readBlock(uint8_t start, uint8_t length, uint8_t* out);
    bool readRegister(uint8_t reg, uint8_t& value);
    bool writeRegisterRaw(uint8_t reg, uint8_t value);
    bool checkConnected(String& error);
    static bool writableRegister(uint8_t reg);
    static String m5pm1Error(m5pm1_err_t err);
    void loadPreferences();

    m5::I2C_Class* internalBus_ = nullptr;
    m5::I2C_Class* externalBus_ = nullptr;
    m5::I2C_Class* activeBus_   = nullptr;
    bool recognizedM5_          = false;
    bool defaultUsesInternal_   = false;
    int8_t internalSda_         = -1;
    int8_t internalScl_         = -1;
    M5PM1 pm1_;
    Preferences prefs_;
    bool connected_      = false;
    bool bus_ready_      = false;
    uint8_t sda_         = app_config::kDefaultSda;
    uint8_t scl_         = app_config::kDefaultScl;
    uint32_t speed_      = 100000;
    uint8_t deviceId_    = 0;
    uint8_t deviceModel_ = 0;
    uint8_t hwVersion_   = 0;
    uint8_t swVersion_   = 0;
    uint8_t defaultSda_  = app_config::kDefaultSda;
    uint8_t defaultScl_  = app_config::kDefaultScl;
    uint8_t savedSda_    = app_config::kDefaultSda;
    uint8_t savedScl_    = app_config::kDefaultScl;
    uint32_t savedSpeed_ = 100000;
    std::vector<uint8_t> addresses_;
    String lastError_;
};
