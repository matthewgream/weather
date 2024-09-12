
// -----------------------------------------------------------------------------------------------

#include "Common.hpp"
#include "Network.hpp"

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>

#include <ArduinoJson.h>

// -----------------------------------------------------------------------------------------------

Network::Network (const String &host, const String &ssid, const String &pass): _info (ssid)  {
    WiFi.persistent (false);
    WiFi.setHostname (host.c_str ());
    WiFi.setAutoReconnect (true);
    WiFi.mode (WIFI_STA);
    WiFi.begin (ssid.c_str (), pass.c_str ());
}

Network::~Network (void) {
    WiFi.mode (WIFI_OFF);
    delay (100);
}

bool Network::connect (void) {
    if (WiFi.isConnected ())
        return true;
    DEBUG_PRINT ("WiFi connecting to '");
    DEBUG_PRINT (_info);
    DEBUG_PRINT ("' ...");
    int cnt = 0;
    while (!WiFi.isConnected ()) {
        if (++ cnt > DEFAULT_NETWORK_CONNECT_RETRY_COUNT) {
            DEBUG_PRINTLN (" failed.");
            return false;
        }
        DEBUG_PRINT (".");
        delay (DEFAULT_NETWORK_CONNECT_RETRY_DELAY);
    }
    DEBUG_PRINT (" succeeded, address = '");
    DEBUG_PRINT (WiFi.localIP ());
    DEBUG_PRINTLN ("'.");
    return true;
}

bool Network::reconnect (void) {
    if (WiFi.isConnected ())
        return true;
    if (!WiFi.reconnect ()) {
        DEBUG_PRINT ("WiFi reconnecting to '");
        DEBUG_PRINT (_info);
        DEBUG_PRINTLN ("' ... failed.");
        return false;
    }
    return connect ();
}

bool Network::disconnect (void) {
    if (!WiFi.isConnected ())
        return true;
    DEBUG_PRINT ("WiFi disconnecting from '");
    DEBUG_PRINT (_info);
    DEBUG_PRINT ("' ...");
    if (!WiFi.disconnect ()) {
      DEBUG_PRINTLN (" failed.");
      return false;
    }
    DEBUG_PRINTLN (" succeeded.");
    return true;
}

bool Network::request (const String &link, JsonDocument &json) {
    if (!reconnect ())
        return false;
    HTTPClient http;
    http.getStream ().setNoDelay (DEFAULT_NETWORK_CLIENT_NODELAY);
    http.getStream ().setTimeout (DEFAULT_NETWORK_CLIENT_TIMEOUT);
    http.setUserAgent (DEFAULT_NETWORK_CLIENT_USERAGENT);
    DEBUG_PRINT ("WiFi requesting from '");
    DEBUG_PRINT (link);
    DEBUG_PRINT ("' ...");
    http.begin (link);
    const int code = http.GET ();
    if (code == HTTP_CODE_OK) {
        DeserializationError error = deserializeJson (json, http.getStream ());
        if (!error) {
            DEBUG_PRINT (" succeeded, size = ");
            DEBUG_PRINT (http.getSize ());
            DEBUG_PRINTLN (" bytes");
            // DEBUG_PRINTLN ("JSON -->");
            // serializeJsonPretty (json, Serial);
            // DEBUG_PRINTLN ();
            // DEBUG_PRINTLN ("<--");
            http.end ();
            return true;
        } else {
            DEBUG_PRINT (" failed, JSON deserialisation error = '");
            DEBUG_PRINT (error.c_str ());
            DEBUG_PRINTLN ("'.");
        }
    } else {
        DEBUG_PRINT (" failed, network request error = '");
        DEBUG_PRINT (http.errorToString (code).c_str ());
        DEBUG_PRINTLN ("'.");
    }
    http.end ();
    return false;
}

// -----------------------------------------------------------------------------------------------
