
// -----------------------------------------------------------------------------------------------

#include "Common.hpp"
#include "Network.hpp"

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>

#include <ArduinoJson.h>

// -----------------------------------------------------------------------------------------------

Network::Network (const String &host, const String &ssid, const String &pass): _info (ssid)  {
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
    Serial.print ("WiFi connecting to '");
    Serial.print (_info);
    Serial.print ("' ...");
    int cnt = 0;
    while (!WiFi.isConnected ()) {
        if (++ cnt > DEFAULT_NETWORK_CONNECT_RETRY_COUNT) {
            Serial.println (" failed.");
            return false;
        }
        Serial.print (".");
        delay (DEFAULT_NETWORK_CONNECT_RETRY_DELAY);
    }
    Serial.print (" succeeded, address = '");
    Serial.print (WiFi.localIP ());
    Serial.println ("'.");
    return true;
}

bool Network::reconnect (void) {
    if (WiFi.isConnected ())
        return true;
    if (!WiFi.reconnect ()) {
        Serial.print ("WiFi reconnecting to '");
        Serial.print (_info);
        Serial.println ("' ... failed.");
        return false;
    }
    return connect ();
}

bool Network::disconnect (void) {
    if (!WiFi.isConnected ())
        return true;
    Serial.print ("WiFi disconnecting from '");
    Serial.print (_info);
    Serial.print ("' ...");
    if (!WiFi.disconnect ()) {
      Serial.println (" failed.");
      return false;
    }
    Serial.println (" succeeded.");
    return true;
}

bool Network::request (const String &link, JsonDocument &json) {
    if (!reconnect ())
        return false;
    HTTPClient http;
    http.getStream ().setNoDelay (DEFAULT_NETWORK_CLIENT_NODELAY);
    http.getStream ().setTimeout (DEFAULT_NETWORK_CLIENT_TIMEOUT);
    http.setUserAgent (DEFAULT_NETWORK_CLIENT_USERAGENT);
    Serial.print ("WiFi requesting from '");
    Serial.print (link);
    Serial.print ("' ...");
    http.begin (link);
    const int code = http.GET ();
    if (code == HTTP_CODE_OK) {
        DeserializationError error = deserializeJson (json, http.getStream ());
        if (!error) {
            Serial.print (" succeeded, size = ");
            Serial.print (http.getSize ());
            Serial.println (" bytes");
            // Serial.println ("JSON -->");
            // serializeJsonPretty (json, Serial);
            // Serial.println ();
            // Serial.println ("<--");
            http.end ();
            return true;
        } else {
            Serial.print (" failed, JSON deserialisation error = '");
            Serial.print (error.c_str ());
            Serial.println ("'.");
        }
    } else {
        Serial.print (" failed, network request error = '");
        Serial.print (http.errorToString (code).c_str ());
        Serial.println ("'.");
    }
    http.end ();
    return false;
}

// -----------------------------------------------------------------------------------------------
