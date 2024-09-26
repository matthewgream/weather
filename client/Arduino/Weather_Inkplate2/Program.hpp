
// -----------------------------------------------------------------------------------------------

#include <ArduinoJson.h>

// -----------------------------------------------------------------------------------------------

class Program {
    const Variables &_conf;

public:
    Program (const Variables &conf): _conf (conf) {}

    void reset () {
        _PersistentData::_reset ();
    }
    
    long exec (Inkplate &view) {
        Variables sets, vars, varx;
        if (setup (_conf, sets) && load (_conf, vars)) {
            view.begin ();
#ifdef DEBUG
            for (const auto& pair : sets)
                DEBUG_PRINTF ("= %s = %s\n", pair.first.c_str (), pair.second.c_str ());
            for (const auto& pair : vars)
                DEBUG_PRINTF ("# %s = %s\n", pair.first.c_str (), pair.second.c_str ());
            if (vars.find ("timestamp") != vars.end ())
                DEBUG_PRINTF ("produced at '%s'.\n", time_iso (std::atol (vars.at ("timestamp").c_str ())).c_str ()); 
#endif
            for (const auto& pair : sets) {
                const auto search = vars.find (pair.second);
                if (search != vars.end ())
                  varx [pair.first] = search->second;
            }
            if (show (_conf, varx, view))
                view.display ();
        }
        return strtol (_conf.at ("secs").c_str (), NULL, 10);
    }

protected:
  
    bool setup (const Variables &conf, Variables& sets) {
        PersistentValue <String> s ("program", "sets", "");
        String c = (String) s;
        JsonDocument json;
        if (c.isEmpty ()) {
          //
          Network network (conf.at ("host"), conf.at ("ssid"), conf.at ("pass"));
          if (!network.connect ())
              throw std::runtime_error ("network connect failed");
          int cnt = 0;
          String link (conf.at ("sets") + String ("?mac=") + identify ());
          while (!network.request (link, json) || !serializeJson (json, c)) {
              if (++ cnt > DEFAULT_NETWORK_REQUEST_RETRY_COUNT)
                  throw std::runtime_error ("network request failed");
              DEBUG_PRINTF ("network request retry #%d\n", cnt);
              delay (DEFAULT_NETWORK_REQUEST_RETRY_DELAY);
          }
          network.disconnect ();
          s = c;
          DEBUG_PRINTF ("fetch conf = %s\n", c.c_str ());
        } else {
          deserializeJson (json, c);
      }
      return convert (sets, json.as <JsonVariant> ());
    }
    
    bool load (const Variables &conf, Variables &vars) {
        JsonDocument json;
        Network network (conf.at ("host"), conf.at ("ssid"), conf.at ("pass"));
        if (!network.connect ())
            throw std::runtime_error ("network connect failed");
        int cnt = 0;
        while (!network.request (conf.at ("link"), json) || !convert (vars, json.as <JsonVariant> ())) {
            if (++ cnt > DEFAULT_NETWORK_REQUEST_RETRY_COUNT)
                throw std::runtime_error ("network request failed");
            DEBUG_PRINTF ("network request retry #%d\n", cnt);
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
