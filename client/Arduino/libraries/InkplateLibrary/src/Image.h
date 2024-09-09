
#ifndef __IMAGE_H__
#define __IMAGE_H__

#include "defines.h"
#include "libs/Adafruit-GFX-Library/Adafruit_GFX.h"

class Image : virtual public Adafruit_GFX
{
  public:

    typedef enum
    {
        Center,
        TopLeft,
        BottomLeft,
        TopRight,
        BottomRight,
    } Position;

    Image(int16_t w, int16_t h);

    virtual void drawPixel(int16_t x, int16_t y, uint16_t color) = 0;

    virtual int16_t width() = 0;
    virtual int16_t height() = 0;

    bool drawImage(const uint8_t *buf, int x, int y, int16_t w, int16_t h, uint8_t c = 0x01, uint8_t bg = 0xFF);

    void getPointsForPosition(const Position &position, const uint16_t imageWidth, const uint16_t imageHeight, const uint16_t screenWidth, const uint16_t screenHeight, uint16_t *posX, uint16_t *posY);

  private:
    virtual void startWrite(void) = 0;
    virtual void writePixel(int16_t x, int16_t y, uint16_t color) = 0;
    virtual void writeFillRect(int16_t x, int16_t y, int16_t w, int16_t h, uint16_t color) = 0;
    virtual void writeFastVLine(int16_t x, int16_t y, int16_t h, uint16_t color) = 0;
    virtual void writeFastHLine(int16_t x, int16_t y, int16_t w, uint16_t color) = 0;
    virtual void writeLine(int16_t x0, int16_t y0, int16_t x1, int16_t y1, uint16_t color) = 0;
    virtual void endWrite(void) = 0;

    uint8_t pixelBuffer[E_INK_HEIGHT * 4 + 5];
};

#endif
