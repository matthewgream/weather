
#ifndef __NETWORK_HPP__
#define __NETWORK_HPP__

// -----------------------------------------------------------------------------------------------

#include <ArduinoJson.h>

// -----------------------------------------------------------------------------------------------

class Network {
    public:
        Network (const String &host, const String &ssid, const String &pass);
        ~Network (void);
        bool connect (void);
        bool disconnect (void);
        bool request (const String &link, JsonDocument &json);
    protected:
        bool reconnect (void);
    private:
        const String _info;
};

// -----------------------------------------------------------------------------------------------

#endif
