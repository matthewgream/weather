
#ifndef __DEFAULTS_HPP__
#define __DEFAULTS_HPP__

// -----------------------------------------------------------------------------------------------

#include "Inkplate.h"
#include "Secrets.hpp"

// -----------------------------------------------------------------------------------------------

#include <map>

typedef std::map <String, String> Variables;

#define DEFAULT_SERIAL_BAUD 115200
#define DEFAULT_RESTART_SECS 30
#define DEFAULT_NETWORK_CONNECT_RETRY_COUNT 20
#define DEFAULT_NETWORK_CONNECT_RETRY_DELAY 1000
#define DEFAULT_NETWORK_REQUEST_RETRY_COUNT 5
#define DEFAULT_NETWORK_REQUEST_RETRY_DELAY 5000
#define DEFAULT_NETWORK_CLIENT_NODELAY true
#define DEFAULT_NETWORK_CLIENT_TIMEOUT 5000
#define DEFAULT_NETWORK_CLIENT_USERAGENT "WeatherDisplay (Inkplate2; ESP32)"

// -----------------------------------------------------------------------------------------------

String identify (void);

const Variables DEFAULT_CONFIG = {
    { "name", "Weather Display Branna" },
    { "vers", "0.99" },
    { "ssid", DEFAULT_NETWORK_SSID },
    { "pass", DEFAULT_NETWORK_PASS },
    { "host", "weather-display-inkplate2-" + identify () },
    { "link", "http://weather.local/vars" },
    { "secs", "300" },
};

// -----------------------------------------------------------------------------------------------

#include <ArduinoJson.h>

size_t convert (Variables &vars, const JsonVariantConst& json);
void output (const Variables &vars);

#include <ctime>

String time_iso (const std::time_t t);

// -----------------------------------------------------------------------------------------------

#endif
