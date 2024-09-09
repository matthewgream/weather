
#ifndef __INKPLATE_H__
#define __INKPLATE_H__

#include "defines.h"
#include "Graphics.h"

class Inkplate : public Graphics
{
  public:
    Inkplate();
    void begin();
    bool display(void);
    void clearDisplay();

  private:
    void resetPanel();
    void sendCommand(uint8_t _command);
    void sendData(uint8_t *_data, int _n);
    void sendData(uint8_t _data);
    bool setPanelDeepSleep(bool _state);
    bool waitForEpd(uint16_t _timeout);
};

#endif
