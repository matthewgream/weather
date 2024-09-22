
// -----------------------------------------------------------------------------------------------

#define DEFAULT_SERIAL_BAUD 115200
#define DEFAULT_RESTART_SECS 30
//  #define DEFAULT_NETWORK_SSID "SSID" // Secrets.hpp
//  #define DEFAULT_NETWORK_PASS "PASS" // Secrets.hpp
#define DEFAULT_NETWORK_CONNECT_RETRY_COUNT 20
#define DEFAULT_NETWORK_CONNECT_RETRY_DELAY 1000
#define DEFAULT_NETWORK_REQUEST_RETRY_COUNT 5
#define DEFAULT_NETWORK_REQUEST_RETRY_DELAY 5000
#define DEFAULT_NETWORK_CLIENT_NODELAY true
#define DEFAULT_NETWORK_CLIENT_TIMEOUT 5000
#define DEFAULT_NETWORK_CLIENT_USERAGENT "WeatherDisplay (Inkplate2; ESP32)"

#define DEFAULT_SOFTWARE_TIME (60*60*12) // check every 12 hours
#define DEFAULT_SOFTWARE_TYPE "weatherdisplay-inkplate2-esp32"
#define DEFAULT_SOFTWARE_VERS "1.2.0"
#define DEFAULT_SOFTWARE_JSON "http://weather.local/images/images.json"

// -----------------------------------------------------------------------------------------------

const Variables DEFAULT_CONFIG = {
    { "name", "Weather Display Branna" },
    { "vers", DEFAULT_SOFTWARE_VERS },
    { "host", "weather-display-inkplate2-" + identify () },
    { "ssid", DEFAULT_NETWORK_SSID },
    { "pass", DEFAULT_NETWORK_PASS },
    { "link", "http://weather.local/vars" },
    { "secs", "300" },

    { "sw-type", DEFAULT_SOFTWARE_TYPE },
    { "sw-vers", DEFAULT_SOFTWARE_VERS },
    { "sw-json", DEFAULT_SOFTWARE_JSON },
};

// -----------------------------------------------------------------------------------------------
