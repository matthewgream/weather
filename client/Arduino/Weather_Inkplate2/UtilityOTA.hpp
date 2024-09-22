
// -----------------------------------------------------------------------------------------------

#include <flashz.hpp>
#include <esp32fota.h>
#include <WiFi.h>

static void __ota_update_progress (const size_t progress, const size_t size) {
    if (progress == size) Serial.println (); else Serial.print (".");
}
static void __ota_update_failure (const char *process, const int partition, const int error = 0) {
    Serial.print ("OTA_CHECK_AND_UPDATE: update failed, process='");
    Serial.print (process);
    Serial.print ("', partition='");
    Serial.print (partition == U_SPIFFS ? "spiffs" : "firmware");
    if (error)
      Serial.print ("', error='"), Serial.print (error);
    Serial.println ("'.");
}
static void __ota_update_success (const int partition, const bool restart) {
    Serial.print ("OTA_CHECK_AND_UPDATE: update succeeded, partition='");
    Serial.print (partition == U_SPIFFS ? "spiffs" : "firmware");
    Serial.print ("', restart='");
    Serial.print (restart);
    Serial.println ("'.");
}
static bool __ota_network_connect (const char *ssid, const char *pass, const int retry_count, const int retry_delay) {
    Serial.print ("OTA_CHECK_AND_UPDATE: WiFi connecting to '");
    Serial.print (ssid);
    Serial.print ("' ...");
    WiFi.begin (ssid,  pass);
    int cnt = 0;
    while (WiFi.status () != WL_CONNECTED) {
      if (++ cnt > retry_count) {
          Serial.println (" failed.");
          return false;
      }
      Serial.print (".");
      delay (retry_delay);
    }
    Serial.print (" succeeded, address='");
    Serial.print (WiFi.localIP ());
    Serial.println ("'.");
    return true;
}
static void __ota_server_check_and_update (const char *json, const char *type, const char *vers) {
    Serial.print ("OTA_CHECK_AND_UPDATE: check json='");
    Serial.print (json);
    Serial.print ("', type='");
    Serial.print (type);
    Serial.print ("', vers='");
    Serial.print (vers);
    Serial.print ("' ...");
    esp32FOTA ota (type, vers);
    ota.setManifestURL (json);
    const bool update = ota.execHTTPcheck ();
    if (update) {
        char version [32] = { '\0' }; ota.getPayloadVersion (version);
        Serial.print (" newer vers='");
        Serial.print (version);
        Serial.println ("', downloading and installing.");
        ota.setProgressCb (__ota_update_progress);
        ota.setUpdateBeginFailCb ([](int partition) { __ota_update_failure ("begin", partition); });
        ota.setUpdateCheckFailCb ([](int partition, int error) { __ota_update_failure ("check", partition, error); });
        bool restart = false;
        ota.setUpdateFinishedCb ([&](int partition, bool _restart) { __ota_update_success (partition, _restart); restart = _restart; });
        ota.execOTA ();
        if (restart)
            ESP.restart ();
    } else {
        Serial.println (" no newer vers, no action taken.");
    }
}

static void ota_check_and_update (const String& ssid, const String& pass, const int retry_count, const int retry_delay, const String& json, const String& type, const String& vers) {
    WiFi.mode (WIFI_STA);
    if (__ota_network_connect (ssid.c_str (), pass.c_str (), retry_count, retry_delay))
        __ota_server_check_and_update (json.c_str (), type.c_str (), vers.c_str ());
    WiFi.mode (WIFI_OFF);
}

// -----------------------------------------------------------------------------------------------
