
# weather-ecowitt-inkplate2

IOT weather display for Ecowitt devices using Inkpad2.

    Ecowitt sources (e.g. WN36 weather array, WN34 temperature sensors)
        --> rf 866 mhz --> Ecowitt sinks (e.g. console WS3900, gateway GW1100)
        --> http --> ecowitt2mqtt (as mqtt publisher, on local device)
        --> mqtt (localhost) --> mosquitto (on same device)
        --> mqtt (localhost) --> nodejs app w/ express (as mqtt subscriber, on same device)

    Inkplate2 Arduino -->
        wake up from deep sleep every N=5 minutes
        connect to WLAN
        request JSON variables, served by nodejs app
        render variables into epaper display
        deep sleep

In this case, the local device is a Raspberry Pi Zero (32 bit) running DietPI, with an Ethernet HAT
and one of the sinks is a GW1100, both mounted outside (for proximity to sensors in a lake) in an 
IP67 case and powered by PoE. There are two other sinks (WS3900 consoles) inside separate houses.

## display (hardware)

    Inkplate2 (with case & battery) -- https://soldered.com/product/inkplate-2

![Display](images/display.jpg)

## station (hardware: server + gateway)

    Raspbery Pi Zero H (WiFi version not needed) -- https://www.aliexpress.com/item/1005007064834607.html
    Waveshave Ethernet/USB Hat -- https://www.aliexpress.com/item/4000022488083.html
    Ecowitt Gateway GW1100 (WiFi only) -- https://www.aliexpress.com/item/1005005264135330.html
    Generic 10/100 POE splitter --  https://www.aliexpress.com/item/1005004230399849.html
    USBA splitter (for POE splitter to both Zero and Gateway) -- https://www.aliexpress.com/item/1005006147721647.html
    USBA to Micro-USB (to power the Zero)
    IP67 box 200x120x75 (for external mounting) -- https://www.aliexpress.com/item/1005005367221276.html

If you use an external PoE cable, make sure to isolate the Ethernet cable on entry to your property,
and preferably use shielded cable and ground the shielding. Do not ground these to your electricity supply
ground, but ground directly to earth bonding.

![Station](images/station.jpg)

## server (software)

    DietPI (as base system) -- https://dietpi.com
    ecowitt2mqtt -- https://github.com/bachya/ecowitt2mqtt
    mosquitto (for MQTT broker) -- https://github.com/eclipse/mosquitto
    avahi (for multicast DNS) -- https://avahi.org
    http-server (nodejs + express) -- https://nodejs.org
    noip update scripts
    ddns update scripts

Sources: https://github.com/matthewgream/weather/tree/main/server

Install DietPI then the software components including systemd service scripts and defaults. The system is minimal
and all processes, including server components, run as root. The MQTT broker is not password protected. The server publishes itself 
as 'weather.local' using mDNS via. avahi. UPnP is used to configure an inbound sshd gateway and No-IP for DDNS. Configure sshd as public
key authentication only -- no password. The Ecowitt sinks must to be configured as per ecowitt2mqtt instructions. The sinks can still
publish to other services including Ecowitt itself.

![Server](images/server.jpg)

## client (software)

    Arduino IDE -- https://www.arduino.cc/en/software
    ArduinoJson library -- https://arduinojson.org
    Inkplate2 library -- https://github.com/SolderedElectronics/Inkplate-Arduino-library

Sources: https://github.com/matthewgream/weather/tree/main/display/Arduino

The client software builds under Arduino IDE and is simple in execution as below. Note the intent to minimise wifi enablement time
and power on time to conserve battery, and to only refresh display if network update succeeds. Will update with battery performance at
a later time. The standard Inkplate library has been included and stripped down to remove unneeded modules (e.g. JPG, PNG and BMP
images, and colour dithering), but the code will build against the standard library. The files Secrets.hpp (in the Arduino project
folder) and secrets.txt (in the server config files) have been suppressed from the repository for obvious reasons.

![Client](images/client.jpg)

