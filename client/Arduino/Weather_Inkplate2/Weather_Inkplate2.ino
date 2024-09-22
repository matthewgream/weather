
// -----------------------------------------------------------------------------------------------

#include "Inkplate.h"

#include "Common.hpp"
#include "Secrets.hpp"
#include "Config.hpp"
#include "Network.hpp"
#include "Render.hpp"
#include "Program.hpp"

#include "UtilityOTA.hpp"

// -----------------------------------------------------------------------------------------------

#define COMPILE_Y ((__DATE__[7] - '0') * 1000 + (__DATE__[8] - '0') * 100 + (__DATE__[9] - '0') * 10 + (__DATE__[10] - '0'))
#define COMPILE_M ((__DATE__[0] == 'J') ? ((__DATE__[1] == 'a') ? 1 : ((__DATE__[2] == 'n') ? 6 : 7)) : (__DATE__[0] == 'F') ? 2 : (__DATE__[0] == 'M') ? ((__DATE__[2] == 'r') ? 3 : 5) \
    : (__DATE__[0] == 'A') ? ((__DATE__[2] == 'p') ? 4 : 8) : (__DATE__[0] == 'S') ? 9 : (__DATE__[0] == 'O') ? 10 : (__DATE__[0] == 'N') ? 11 : (__DATE__[0] == 'D') ? 12 : 0)
#define COMPILE_D ((__DATE__[4] == ' ') ? (__DATE__[5] - '0') : (__DATE__[4] - '0') * 10 + (__DATE__[5] - '0'))
#define COMPILE_T __TIME__
static constexpr char __COMPILE_TIMESTAMP__ [] = { 
  COMPILE_Y/1000 + '0', (COMPILE_Y%1000)/100 + '0', (COMPILE_Y%100)/10 + '0', COMPILE_Y%10 + '0',  COMPILE_M/10 + '0', COMPILE_M%10 + '0',  COMPILE_D/10 + '0', COMPILE_D%10 + '0',
  COMPILE_T [0], COMPILE_T [1], COMPILE_T [3], COMPILE_T [4], COMPILE_T [6], COMPILE_T [7],
  '\0'
};

// -----------------------------------------------------------------------------------------------

static const String build (DEFAULT_CONFIG.at ("name") + " V" + DEFAULT_CONFIG.at ("vers") + "-" + __COMPILE_TIMESTAMP__ + " (" + DEFAULT_CONFIG.at ("host") + ")");
static Inkplate view;
static Program program (DEFAULT_CONFIG);

void setup () {

    DEBUG_START ();
    DEBUG_PRINTLN ();
    DEBUG_PRINTLN ("*** " + build + " ***");
    DEBUG_PRINTLN ();

    int secs = DEFAULT_RESTART_SECS;
    exception_catcher ([&] () { 
        secs = program.exec (view);
    });

    // XXX this needs to be once per day to save power ...
    ota_check_and_update (DEFAULT_CONFIG.at ("ssid"), DEFAULT_CONFIG.at ("pass"), DEFAULT_NETWORK_CONNECT_RETRY_COUNT, DEFAULT_NETWORK_CONNECT_RETRY_DELAY,
      DEFAULT_CONFIG.at ("sw-json"), DEFAULT_CONFIG.at ("sw-type"), DEFAULT_CONFIG.at ("sw-vers"));

    DEBUG_PRINTLN ();
    DEBUG_PRINT ("[deep sleep: ");
    DEBUG_PRINT (secs);
    DEBUG_PRINTLN (" secs]");
    DEBUG_END ();

    if (secs > 0)
        esp_sleep_enable_timer_wakeup (1000L * 1000L * secs);
    esp_deep_sleep_start ();
}

void loop () {
    // n/a
}

// -----------------------------------------------------------------------------------------------
