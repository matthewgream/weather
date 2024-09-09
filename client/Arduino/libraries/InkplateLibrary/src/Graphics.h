

#ifndef __GRAPHICS_H__
#define __GRAPHICS_H__

#include "defines.h"
#include "Image.h"
#include "Shapes.h"

/**
 * @brief       Graphics class that holds basic functionalities for Inkplate
 * display
 */
class Graphics : public Shapes, public Image
{
  public:
    Graphics(int16_t w, int16_t h) : Adafruit_GFX(w, h), Shapes(w, h), Image(w, h){};

    void setRotation(uint8_t r);
    uint8_t getRotation();

    void drawPixel(int16_t x, int16_t y, uint16_t color) override;

    int16_t width() override;
    int16_t height() override;

    uint8_t *DMemory4Bit;

    const uint8_t pixelMaskLUT[8] = {0x1, 0x2, 0x4, 0x8, 0x10, 0x20, 0x40, 0x80};

  private:
    void startWrite(void) override;
    void writePixel(int16_t x, int16_t y, uint16_t color) override;
    void writeFillRect(int16_t x, int16_t y, int16_t w, int16_t h, uint16_t color) override;
    void writeFastVLine(int16_t x, int16_t y, int16_t h, uint16_t color) override;
    void writeFastHLine(int16_t x, int16_t y, int16_t w, uint16_t color) override;
    void writeLine(int16_t x0, int16_t y0, int16_t x1, int16_t y1, uint16_t color) override;
    void endWrite(void) override;
};

#endif