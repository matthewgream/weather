
// -----------------------------------------------------------------------------------------------

#include <ArduinoJson.h>

// -----------------------------------------------------------------------------------------------

class Program {
    const Variables &_conf;

public:
    Program (const Variables &conf): _conf (conf) {}
    
    long exec (Inkplate &view) {
        Variables vars;
        if (load (_conf, vars)) {
            view.begin ();
#ifdef DEBUG
            for (const auto& pair : vars) {
                DEBUG_PRINT (pair.first);
                DEBUG_PRINT (" = ");
                DEBUG_PRINTLN (pair.second);
            }
            if (vars.find ("timestamp") != vars.end ()) {
                DEBUG_PRINT ("produced at ");
                DEBUG_PRINTLN (time_iso (std::atol (vars.at ("timestamp").c_str ()))); 
            }
#endif
            if (show (_conf, vars, view))
                view.display ();
        }
        return strtol (_conf.at ("secs").c_str (), NULL, 10);
    }

protected:
    bool load (const Variables &conf, Variables &vars) {
        JsonDocument json;
        Network network (conf.at ("host"), conf.at ("ssid"), conf.at ("pass"));
        if (!network.connect ())
            throw std::runtime_error ("network connect failed");
        int cnt = 0;
        while (!network.request (conf.at ("link"), json) || !convert (vars, json.as <JsonVariant> ())) {
            if (++ cnt > DEFAULT_NETWORK_REQUEST_RETRY_COUNT)
                throw std::runtime_error ("network request failed");
            DEBUG_PRINT ("network request retry #");
            DEBUG_PRINTLN (cnt);
            delay (DEFAULT_NETWORK_REQUEST_RETRY_DELAY);
        }
        network.disconnect ();
        return true;
    }
  
    bool show (const Variables &conf, const Variables &vars, Inkplate &view) const {
        for (const auto *renderer : renderers_default)
            renderer->render (view);
        for (const auto &pair : renderers_byvalue) {
            const auto search = vars.find (pair.first);
            if (search != vars.end ())
              pair.second->render (view, search->second, vars);
            else
              pair.second->render (view);
        }
        return true;
    }
};

// -----------------------------------------------------------------------------------------------
