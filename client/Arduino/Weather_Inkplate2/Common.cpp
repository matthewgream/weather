
// -----------------------------------------------------------------------------------------------

#include "Common.hpp"

#include <ArduinoJSon.h>

// -----------------------------------------------------------------------------------------------

#ifdef DEBUG
bool DEBUG_AVAILABLE = false;
#endif

// -----------------------------------------------------------------------------------------------

static void __convert (Variables &vars, const JsonVariantConst& json, const String& path) {
    if (json.is <JsonObjectConst> ()) {
        for (const auto& obj : json.as <JsonObjectConst> ())
            __convert (vars, obj.value (), path.isEmpty () ? obj.key ().c_str () : path + "/" + obj.key ().c_str ());
    } else if (json.is <JsonArrayConst> ()) {
        int index = 0;
        for (const auto& obj : json.as <JsonArrayConst> ())
            __convert (vars, obj, path + "[" + String (index ++) + "]");
    } else {
        vars [path] = json.as <String> ();
    }
}
size_t convert (Variables &vars, const JsonVariantConst& json) {
    __convert (vars, json, "");
    return vars.size ();
}

// -----------------------------------------------------------------------------------------------

#define NIBBLE_TO_HEX_CHAR(nibble) ((char) ((nibble) < 10 ? '0' + (nibble) : 'A' + ((nibble) - 10)))
#define BYTE_TO_HEX(byte) NIBBLE_TO_HEX_CHAR ((byte) >> 4), NIBBLE_TO_HEX_CHAR ((byte) & 0x0F)

String identify (void) {
    uint8_t macaddr [6];
    esp_read_mac (macaddr, ESP_MAC_WIFI_STA);
    const char macstr [12 + 1] = { BYTE_TO_HEX (macaddr [0]), BYTE_TO_HEX (macaddr [1]), BYTE_TO_HEX (macaddr [2]), BYTE_TO_HEX (macaddr [3]), BYTE_TO_HEX (macaddr [4]), BYTE_TO_HEX (macaddr [5]), '\0' };
    return String (macstr);
}

// -----------------------------------------------------------------------------------------------

String time_iso (const std::time_t t) {
    const struct tm *timeinfo = std::gmtime (&t);
    const char timestr [sizeof ("yyyy-mm-ddThh:mm:ssZ") + 1] = { 
        (char) ('0' + ((timeinfo->tm_year + 1900) / 1000) % 10), (char) ('0' + ((timeinfo->tm_year + 1900) / 100) % 10), (char) ('0' + ((timeinfo->tm_year + 1900) / 10) % 10), (char) ('0' + (timeinfo->tm_year + 1900) % 10), '-', 
        (char) ('0' + ((timeinfo->tm_mon + 1) / 10) % 10), (char) ('0' + (timeinfo->tm_mon + 1) % 10), '-', 
        (char) ('0' + ((timeinfo->tm_mday) / 10) % 10), (char) ('0' + (timeinfo->tm_mday) % 10),
        'T', 
        (char) ('0' + ((timeinfo->tm_hour) / 10) % 10), (char) ('0' + (timeinfo->tm_hour) % 10), ':', 
        (char) ('0' + ((timeinfo->tm_min) / 10) % 10), (char) ('0' + (timeinfo->tm_min) % 10), ':', 
        (char) ('0' + ((timeinfo->tm_sec) / 10) % 10), (char) ('0' + (timeinfo->tm_sec) % 10),
        'Z', 
        '\0'
    };
    return String (timestr);
}

// -----------------------------------------------------------------------------------------------
