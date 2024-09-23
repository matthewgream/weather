
// -----------------------------------------------------------------------------------------------

#include <map>

typedef std::map <String, String> Variables;

// -----------------------------------------------------------------------------------------------

#include <Arduino.h>

#define DEBUG
#ifdef DEBUG
  bool DEBUG_AVAILABLE = false;
  #define DEBUG_START(...) Serial.begin (DEFAULT_SERIAL_BAUD); DEBUG_AVAILABLE = !Serial ? false : true; delay (5*1000L);
  #define DEBUG_END(...) Serial.flush (); Serial.end ()
  #define DEBUG_PRINTF(...) if (DEBUG_AVAILABLE) Serial.printf (__VA_ARGS__)
#else
  #define DEBUG_START(...)
  #define DEBUG_END(...)
  #define DEBUG_PRINTF(...)
#endif

// -----------------------------------------------------------------------------------------------

#include <nvs_flash.h>

#define DEFAULT_PERSISTENT_PARTITION "nvs"

class _PersistentData {
public:
    static int _initialised;
    static bool _initialise () { return _initialised || (++ _initialised && nvs_flash_init () == ESP_OK && nvs_flash_init_partition (DEFAULT_PERSISTENT_PARTITION) == ESP_OK); }
private:
    nvs_handle_t _handle;
    const bool _okay = false;
public:
    _PersistentData (const char *space): _okay (_initialise () && nvs_open_from_partition (DEFAULT_PERSISTENT_PARTITION, space, NVS_READWRITE, &_handle) == ESP_OK) {}
    ~_PersistentData () { if (_okay) nvs_close (_handle); }
    inline bool get (const char *name, uint32_t *value) const { return (_okay && nvs_get_u32 (_handle, name, value) == ESP_OK); }
    inline bool set (const char *name, uint32_t value) const { return  (_okay && nvs_set_u32 (_handle, name, value) == ESP_OK); }
    inline bool get (const char *name, int32_t *value) const { return (_okay && nvs_get_i32 (_handle, name, value) == ESP_OK); }
    inline bool set (const char *name, int32_t value) const { return  (_okay && nvs_set_i32 (_handle, name, value) == ESP_OK); }

};
int _PersistentData::_initialised = 0;
template <typename T>
class PersistentValue {
    _PersistentData _data;
    const String _name;
    const T _value_default;
public:
    PersistentValue (const char *space, const char *name, const T value_default): _data (space), _name (name), _value_default (value_default) {}
    inline operator T () const { T value; return _data.get (_name.c_str (), &value) ? value : _value_default; }
    inline bool operator= (const T value) { return _data.set (_name.c_str (), value); }
    inline bool operator+= (const T value2) { T value = _value_default; _data.get (_name.c_str (), &value); value += value2; return _data.set (_name.c_str (), value); }
    inline bool operator>= (const T value2) { T value = _value_default; _data.get (_name.c_str (), &value); return value >= value2; }
};

// -----------------------------------------------------------------------------------------------

#include <ArduinoJson.h>

void __convert (Variables &vars, const JsonVariantConst& json, const String& path) {
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

#include <ctime>

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

#include <Arduino.h>

String identify (void) {
    #define NIBBLE_TO_HEX_CHAR(nibble) ((char) ((nibble) < 10 ? '0' + (nibble) : 'A' + ((nibble) - 10)))
    #define BYTE_TO_HEX(byte) NIBBLE_TO_HEX_CHAR ((byte) >> 4), NIBBLE_TO_HEX_CHAR ((byte) & 0x0F)
    uint8_t macaddr [6];
    esp_read_mac (macaddr, ESP_MAC_WIFI_STA);
    const char macstr [12 + 1] = { BYTE_TO_HEX (macaddr [0]), BYTE_TO_HEX (macaddr [1]), BYTE_TO_HEX (macaddr [2]), BYTE_TO_HEX (macaddr [3]), BYTE_TO_HEX (macaddr [4]), BYTE_TO_HEX (macaddr [5]), '\0' };
    return String (macstr);
}

// -----------------------------------------------------------------------------------------------

template <typename F>
void exception_catcher (F&& f) {
    try {
        f ();
    } catch (const std::exception& e) {
        DEBUG_PRINTF ("exception: %s\n", e.what ());
    } catch (...) {
        DEBUG_PRINTF ("exception: unknown\n");
    }
};

// -----------------------------------------------------------------------------------------------
