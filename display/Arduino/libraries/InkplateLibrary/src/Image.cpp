
#include "Image.h"

Image::Image(int16_t w, int16_t h) : Adafruit_GFX(w, h)
{
}

bool Image::drawImage(const uint8_t *buf, int x, int y, int16_t w, int16_t h, uint8_t c, uint8_t bg)
{
    uint16_t scaled_w = ceil(w / 4.0);
    for (int i = 0; i < h; i++)
    {
        for (int j = 0; j < scaled_w; j++)
        {
            writePixel(4 * j + x, i + y, (buf[scaled_w * i + j] & 0xC0) >> 6);
            writePixel(4 * j + x + 1, i + y, (buf[scaled_w * i + j] & 0x30) >> 4);
            writePixel(4 * j + x + 2, i + y, (buf[scaled_w * i + j] & 0x0C) >> 2);
            writePixel(4 * j + x + 3, i + y, (buf[scaled_w * i + j] & 0x03));
        }
    }
    return 1;
}

void Image::getPointsForPosition(const Position &position, const uint16_t imageWidth, const uint16_t imageHeight, const uint16_t screenWidth, const uint16_t screenHeight, uint16_t *posX, uint16_t *posY)
{
    *posX = 0;
    *posY = 0;

    switch (position)
    {
    case TopLeft:
        break;
    case Center:
        if (imageWidth < screenWidth)
            *posX = (screenWidth - imageWidth) >> 1;
        if (imageHeight < screenHeight)
            *posY = (screenHeight - imageHeight) >> 1;
        break;
    case BottomLeft:
        if (imageHeight < screenHeight)
            *posY = screenHeight - imageHeight;
        break;
    case TopRight:
        if (imageWidth < screenWidth)
            *posX = screenWidth - imageWidth;
        break;
    case BottomRight:
        if (imageWidth < screenWidth)
            *posX = screenWidth - imageWidth;
        if (imageHeight < screenHeight)
            *posY = screenHeight - imageHeight;
        break;
    default:
        break;
    }
}
