
#ifndef __COMMON_HPP__
#define __COMMON_HPP__

// -----------------------------------------------------------------------------------------------

#include "Inkplate.h"
#include "Secrets.hpp"

// -----------------------------------------------------------------------------------------------

//#define DEBUG
#ifdef DEBUG
  extern bool DEBUG_AVAILABLE;
  #define DEBUG_START(...) Serial.begin (DEFAULT_SERIAL_BAUD); DEBUG_AVAILABLE = !Serial ? false : true;
  #define DEBUG_END(...) Serial.flush (); Serial.end ()
  #define DEBUG_PRINT(...) if (DEBUG_AVAILABLE) Serial.print(__VA_ARGS__)
  #define DEBUG_PRINTLN(...) if (DEBUG_AVAILABLE) Serial.println(__VA_ARGS__)
#else
  #define DEBUG_START(...)
  #define DEBUG_END(...)
  #define DEBUG_PRINT(...)
  #define DEBUG_PRINTLN(...)
#endif

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

#include <ctime>

String time_iso (const std::time_t t);

// -----------------------------------------------------------------------------------------------

template <typename F>
void exception_catcher (F&& f) {
    try {
        f ();
    } catch (const std::exception& e) {
        DEBUG_PRINT ("exception: "); DEBUG_PRINTLN (e.what ());
    } catch (...) {
        DEBUG_PRINT ("exception: "); DEBUG_PRINTLN ("unknown");
    }
};

// -----------------------------------------------------------------------------------------------

#endif
