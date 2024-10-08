
// -----------------------------------------------------------------------------------------------

#include "fonts/FreeSansBold9pt7b.h"
#include "fonts/Org_01.h"
#include "icons/icon_home.h"
#include "icons/icon_lake.h"
#include "icons/icon_tree.h"

#include <vector>
#include <map>

// -----------------------------------------------------------------------------------------------

class Renderer {
public:
    Renderer (const int x, const int y): _x (x), _y (y) {};
    virtual void render (Inkplate &view, const String &value, const Variables &vars) const {};
    virtual void render (Inkplate &view) const {};
protected:
    const int _x, _y;
};

// -----------------------------------------------------------------------------------------------

class Renderer_Bitmap: public Renderer {
public:
    Renderer_Bitmap (const int x, const int y, const uint8_t *data, const int ws, const int hs, const int fg, const int bg): Renderer (x, y), _data (data), _ws (ws), _hs (hs), _fg (fg), _bg (bg) {};
    void render (Inkplate &view, const String &value, const Variables &vars) const {
        view.drawBitmap (_x, _y, _data, _ws, _hs, _fg, _bg);
    };
    void render (Inkplate &view) const {
        view.drawBitmap (_x, _y, _data, _ws, _hs, _fg, _bg);
    };
protected:
    const uint8_t *_data;
    const int _ws, _hs, _fg, _bg;
};

// -----------------------------------------------------------------------------------------------

class Renderer_String: public Renderer {
public:
    Renderer_String (const int x, const int y, const int fg, const int bg): Renderer (x, y), _fg (fg), _bg (bg) {};
protected:
    void render_string (Inkplate &view, const char string [], const int offsetx = 0, const int offsety = 0) const {
        view.setFont (&FreeSansBold9pt7b);
        view.setTextSize (1);
        view.setTextColor (_fg, _bg); 
        view.setCursor (_x + offsetx, _y + offsety);
        view.print (string);
    }
    const int _fg, _bg;
};

// -----------------------------------------------------------------------------------------------

class Renderer_Faulty: public Renderer {
public:
    Renderer_Faulty (const int x, const int y, const int ws, const int hs, const int fg, const int bg, const std::vector <String> vars = std::vector <String> ()): Renderer (x, y), _ws (ws), _hs (hs), _fg (fg), _bg (bg), _vars (vars) {};
    void render (Inkplate &view, const String &value, const Variables &vars) const {
        if (std::any_of (_vars.cbegin (), _vars.cend (), [vars] (const String &s) { return vars.find (s) == vars.end (); }))
            render (view);
    };
    void render (Inkplate &view) const {
        // red cross
        view.drawLine (_x, _y, _x + _ws, _y + _hs, _fg);
        view.drawLine (_x + 1, _y, _x + 1 + _ws, _y + _hs, _fg);
        view.drawLine (_x + 2, _y, _x + 2 + _ws, _y + _hs, _fg);
        view.drawLine (_x, _y + _hs, _x + _ws, _y, _fg);
        view.drawLine (_x + 1, _y + _hs, _x + 1 + _ws, _y, _fg);
        view.drawLine (_x + 2, _y + _hs, _x + 2 + _ws, _y, _fg);
    };
protected:
    const int _ws, _hs, _fg, _bg;
    const std::vector <String> _vars;
};

// -----------------------------------------------------------------------------------------------

class Renderer_BatteryLow: public Renderer_Faulty {
public:
    Renderer_BatteryLow (const int x, const int y, const int ws, const int hs, const int fg, const int bg, const float threshold): Renderer_Faulty (x, y, ws, hs, fg, bg), _threshold (threshold) {};
    void render (Inkplate &view, const String &value, const Variables &vars) const {
        if (std::atof (value.c_str ()) < _threshold)
            Renderer_Faulty::render (view);
    };
protected:
    const float _threshold;
};

// -----------------------------------------------------------------------------------------------

class Renderer_StringFloat: public Renderer_String {
public:
    Renderer_StringFloat (const int x, const int y, const int fg, const int bg, const int numdigits): Renderer_String (x, y, fg, bg), _numdigits (numdigits) {};

    virtual int make_offset (const float &data) const = 0;
    virtual void render_symbol (Inkplate &view) const = 0;

    void render (Inkplate &view, const String& value, const Variables &vars) const {
        char string [_stringsz]; 
        const float data = std::atof (value.c_str ());
        dtostrf (data, - (_stringsz - 1), _numdigits, string);
        render_string (view, string, make_offset (data));
        render_symbol (view);
    }
protected:
    const int _numdigits;
    static constexpr int _stringsz = 6, _digitswidth = 10, _minuswidth = 6; // font dependent
};

// -----------------------------------------------------------------------------------------------

class Renderer_Temperature: public Renderer_StringFloat {
public:
    Renderer_Temperature (const int x, const int y, const int fg, const int bg): Renderer_StringFloat (x, y, fg, bg, 1) {};
    int make_offset (const float &data) const {
        return (data >= 0 ? _minuswidth : 0) + ((data > -10.0 && data < 10.0) ? _digitswidth : 0);
    }
    void render_symbol (Inkplate &view) const {
        // superscript degree symbol
        const int r = _digitswidth/3, x = view.getCursorX () + 2 + r, y = view.getCursorY () - 10;
        view.drawCircle (x, y, r, _fg);
        view.drawCircle (x, y, r - 1, _fg);
    };
};

// -----------------------------------------------------------------------------------------------

class Renderer_Humidity: public Renderer_StringFloat {
public:
    Renderer_Humidity (const int x, const int y, const int fg, const int bg): Renderer_StringFloat (x, y, fg, bg, 0) {};
    int make_offset (const float &data) const {
        return (data >= 0 ? _minuswidth : 0) + ((data > -10.0 && data < 10.0) ? _digitswidth : 0) - (data >= 100.0 ? 10 : 0);
    }
    void render_symbol (Inkplate &view) const {
        // superscript percent symbol
        const int d = 2 * (_digitswidth/3), x = view.getCursorX () + 2, y = view.getCursorY () - 6, r = 1;
        view.drawLine (x, y, x + d, y - d, _fg);
        view.drawLine (x + 1, y, x + 1 + d, y - d, _fg);
        view.drawCircle (x + r, y - d + r, r, _fg);
        view.drawCircle (x + r + d - r, y - r, r, _fg);
    };
};

// -----------------------------------------------------------------------------------------------

class Renderer_Pressure: public Renderer_StringFloat {
public:
    Renderer_Pressure (const int x, const int y, const int fg, const int bg): Renderer_StringFloat (x, y, fg, bg, 0) {};
    int make_offset (const float &data) const {
        return (data < 1000.0) ? _digitswidth : 0;
    }
    void render_symbol (Inkplate &view) const {
        // superscript 'hpa'
        view.setFont (&Org_01);
        view.setCursor (view.getCursorX () + 2, view.getCursorY () - 8);
        view.print ("hPa");
    };
};

// -----------------------------------------------------------------------------------------------

#define I_SIZ 32
#define T_SIZ 24

#define I_BORDER 1
#define I_FRAME_X (I_BORDER + I_SIZ + I_BORDER)
#define I_FRAME_Y (I_BORDER + I_SIZ + I_BORDER)

#define X_MAX (E_INK_HEIGHT) // 212
#define Y_MAX (E_INK_WIDTH) // 104
#define X_OFF (4)
#define Y_OFF ((Y_MAX - (3 * I_FRAME_Y)) / 2)

#define I_OFF_X X_OFF
#define I_OFF_Y(x) (Y_OFF + (I_FRAME_Y * (x)))

#define T_PRE_X (8)
#define T_ADJ_Y (6)
#define T_SPC_X (const int []){ 0, 5*10*1 + 6, 5*10*2 - 10 + 6 }
#define T_OFF_X(x) (X_OFF + I_FRAME_X + T_PRE_X + T_SPC_X [x])
#define T_OFF_Y(x) (I_OFF_Y (x) + ((I_FRAME_Y - T_SIZ) / 2) + T_SIZ - T_ADJ_Y)

const std::vector <Renderer*> renderers_default = {
    new Renderer_Bitmap (I_OFF_X, I_OFF_Y (0), icon_home, I_SIZ, I_SIZ, INKPLATE2_BLACK, INKPLATE2_WHITE),
    new Renderer_Bitmap (I_OFF_X, I_OFF_Y (1), icon_tree, I_SIZ, I_SIZ, INKPLATE2_BLACK, INKPLATE2_WHITE),
    new Renderer_Bitmap (I_OFF_X, I_OFF_Y (2), icon_lake, I_SIZ, I_SIZ, INKPLATE2_BLACK, INKPLATE2_WHITE),
};
typedef std::pair <String, Renderer*> RendererPair;
const std::vector <RendererPair> renderers_byvalue = {
    { "house/__runtime",    new Renderer_Faulty       (I_OFF_X, I_OFF_Y (0), I_SIZ, I_SIZ, INKPLATE2_RED, INKPLATE2_WHITE, { "house/__checks[0]", "house/__checks[1]", "house/__checks[2]" }) },
    { "house/temp",         new Renderer_Temperature  (T_OFF_X (0), T_OFF_Y (0), INKPLATE2_BLACK, INKPLATE2_WHITE) },
    { "house/humidity",     new Renderer_Humidity     (T_OFF_X (1), T_OFF_Y (0), INKPLATE2_BLACK, INKPLATE2_WHITE) },
    { "house/barom",        new Renderer_Pressure     (T_OFF_X (2), T_OFF_Y (0), INKPLATE2_BLACK, INKPLATE2_WHITE) },
    { "outside/__runtime",  new Renderer_Faulty       (I_OFF_X, I_OFF_Y (1), I_SIZ, I_SIZ, INKPLATE2_RED, INKPLATE2_WHITE, { "outside/__checks[0]", "outside/__checks[1]", "outside/__checks[2]" }) },
    { "outside/temp",       new Renderer_Temperature  (T_OFF_X (0), T_OFF_Y (1), INKPLATE2_BLACK, INKPLATE2_WHITE) },
    { "outside/humidity",   new Renderer_Humidity     (T_OFF_X (1), T_OFF_Y (1), INKPLATE2_BLACK, INKPLATE2_WHITE) },
    { "outside/barom",      new Renderer_Pressure     (T_OFF_X (2), T_OFF_Y (1), INKPLATE2_BLACK, INKPLATE2_WHITE) },
    { "outside/__runtime",  new Renderer_Faulty       (I_OFF_X, I_OFF_Y (2), I_SIZ, I_SIZ, INKPLATE2_RED, INKPLATE2_WHITE, { "lake/surface_temp", "lake/submerged_temp" }) },
    { "lake/surface_temp",  new Renderer_Temperature  (T_OFF_X (0), T_OFF_Y (2), INKPLATE2_BLACK, INKPLATE2_WHITE) }, 
    { "lake/submerged_temp",new Renderer_Temperature  (T_OFF_X (1), T_OFF_Y (2), INKPLATE2_BLACK, INKPLATE2_WHITE) },
    { "lake/surface_batt",  new Renderer_BatteryLow   (I_OFF_X, I_OFF_Y (2), I_SIZ, I_SIZ, INKPLATE2_RED, INKPLATE2_WHITE, 1.5) },
    { "lake/submerged_batt",new Renderer_BatteryLow   (I_OFF_X, I_OFF_Y (2), I_SIZ, I_SIZ, INKPLATE2_RED, INKPLATE2_WHITE, 1.5) },
};

// -----------------------------------------------------------------------------------------------
