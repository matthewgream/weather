
# weather-branna-inkplate2

IOT weather display for Ecowitt devices using Inkpad2

    Ecowitt sources (WN36 array, WN34 temperature sensors) --> sinks (e.g. Ecowitt console WS3900, gateway GW1100)
        sinks --> ecowitt2mqtt (running on a local device as 'weather.local')
                  ecowitt2mqtt (as mqtt publisher) --> mosquitto (localhost)
                  mosquitto (localhost) --> node express app (as mqtt subscriber)

    Inkplate2 Arduino -->
        wake up every N minutes
        connect to WLAN as defined
        request JSON updated variables from node express app
        render variables into epaper display
        go back to deep sleep


