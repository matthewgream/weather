
// -----------------------------------------------------------------------------------------------

#include <flashz.hpp>
#include <esp32fota.h>
#include <WiFi.h>

static void __ota_update_progress (const size_t progress, const size_t size) {
    DEBUG_PRINTF (progress < size ? "." : "\n");
}
static void __ota_update_failure (const char *process, const int partition, const int error = 0) {
    DEBUG_PRINTF ("OTA_CHECK_AND_UPDATE: update failed, process=%s, partition=%s, error=%d\n", process, partition == U_SPIFFS ? "spiffs" : "firmware", error ? error : -1);
}
static void __ota_update_success (const int partition, const bool restart) {
    DEBUG_PRINTF ("OTA_CHECK_AND_UPDATE: update succeeded, partition=%s, restart=%d\n", partition == U_SPIFFS ? "spiffs" : "firmware", restart);
}
static bool __ota_network_connect (const char *ssid, const char *pass, const int retry_count, const int retry_delay) {
    DEBUG_PRINTF ("OTA_CHECK_AND_UPDATE: WiFi connecting to %s ...", ssid);
    WiFi.begin (ssid,  pass);
    int cnt = 0;
    while (WiFi.status () != WL_CONNECTED) {
      if (++ cnt > retry_count) {
          DEBUG_PRINTF (" failed\n");
          return false;
      }
      DEBUG_PRINTF (".");
      delay (retry_delay);
    }
    DEBUG_PRINTF (" succeeded, address=%s\n", WiFi.localIP ().toString ().c_str ());
    return true;
}
static void __ota_server_check_and_update (const char *json, const char *type, const char *vers, const std::function <void ()> &func) {
    DEBUG_PRINTF ("OTA_CHECK_AND_UPDATE: check json=%s, type=%s, vers=%s ...", json, type, vers);
    esp32FOTA ota (type, vers);
    ota.setManifestURL (String (String (json) + String ("?version=") + String (vers)).c_str ());
    const bool update = ota.execHTTPcheck ();
    if (update) {
        char version [32] = { '\0' }; ota.getPayloadVersion (version);
        DEBUG_PRINTF (" newer vers=%s, downloading and installing\n", version);
        ota.setProgressCb (__ota_update_progress);
        ota.setUpdateBeginFailCb ([](int partition) { __ota_update_failure ("begin", partition); });
        ota.setUpdateCheckFailCb ([](int partition, int error) { __ota_update_failure ("check", partition, error); });
        bool restart = false;
        ota.setUpdateFinishedCb ([&](int partition, bool _restart) { __ota_update_success (partition, _restart); restart = _restart; });
        ota.execOTA ();
        if (func != nullptr)
          func ();
        if (restart)
            ESP.restart ();
    } else {
        DEBUG_PRINTF (" no newer vers, no action taken\n");
    }
}
static void ota_check_and_update (const String& ssid, const String& pass, const int retry_count, const int retry_delay, const String& json, const String& type, const String& vers, const std::function <void ()> &func = nullptr) {
    WiFi.mode (WIFI_STA);
    if (__ota_network_connect (ssid.c_str (), pass.c_str (), retry_count, retry_delay))
        __ota_server_check_and_update (json.c_str (), type.c_str (), vers.c_str (), func);
    WiFi.mode (WIFI_OFF);
}

// -----------------------------------------------------------------------------------------------
