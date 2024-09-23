
// -----------------------------------------------------------------------------------------------

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>

#include <ArduinoJson.h>

// -----------------------------------------------------------------------------------------------

class Network {
    const String _info;

public:

    Network (const String &host, const String &ssid, const String &pass): _info (ssid)  {
        WiFi.setHostname (host.c_str ());
        WiFi.setAutoReconnect (true);
        WiFi.mode (WIFI_STA);
        WiFi.begin (ssid.c_str (), pass.c_str ());
    }
    ~Network (void) {
        WiFi.mode (WIFI_OFF);
        delay (100);      
    }

    //

    bool connect (void) {
        if (WiFi.isConnected ())
            return true;
        DEBUG_PRINTF ("WiFi connecting to '%s' ...", _info.c_str ());
        int cnt = 0;
        while (!WiFi.isConnected ()) {
            if (++ cnt > DEFAULT_NETWORK_CONNECT_RETRY_COUNT) {
                DEBUG_PRINTF (" failed.\n");
                return false;
            }
            DEBUG_PRINTF (".");
            delay (DEFAULT_NETWORK_CONNECT_RETRY_DELAY);
        }
        DEBUG_PRINTF (" succeeded: address='%s'\n", WiFi.localIP ().toString ().c_str ());
        return true;
    }

    bool disconnect (void) {
        if (!WiFi.isConnected ())
            return true;
        DEBUG_PRINTF ("WiFi disconnecting from '%s' ...", _info.c_str ());
        if (!WiFi.disconnect ()) {
          DEBUG_PRINTF (" failed.\n");
          return false;
        }
        DEBUG_PRINTF (" succeeded.\n");
        return true;
    }

    bool reconnect (void) {
        if (WiFi.isConnected ())
            return true;
        if (!WiFi.reconnect ()) {
            DEBUG_PRINTF ("WiFi reconnecting to '%s' ... failed.\n", _info.c_str ());
            return false;
        }
        return connect ();
    }
   
    //

    bool request (const String &link, JsonDocument &json) {
        if (!reconnect ())
            return false;
        HTTPClient http;
        http.getStream ().setNoDelay (DEFAULT_NETWORK_CLIENT_NODELAY);
        http.getStream ().setTimeout (DEFAULT_NETWORK_CLIENT_TIMEOUT);
        http.setUserAgent (DEFAULT_NETWORK_CLIENT_USERAGENT);
        DEBUG_PRINTF ("WiFi requesting from '%s' ...", link.c_str ());
        http.begin (link);
        const int code = http.GET ();
        if (code == HTTP_CODE_OK) {
            DeserializationError error = deserializeJson (json, http.getStream ());
            if (!error) {
                DEBUG_PRINTF (" succeeded: size='%d'.\n", http.getSize ());
                http.end ();
                return true;
            } else {
                DEBUG_PRINTF (" failed: JSON deserialisation, error='%s'.\n", error.c_str ());
            }
        } else {
            DEBUG_PRINTF (" failed: network request, error='%s'.\n", http.errorToString (code).c_str ());
        }
        http.end ();
        return false;
    }
};

// -----------------------------------------------------------------------------------------------
