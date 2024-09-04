
#include "Inkplate.h"

Inkplate::Inkplate() : Adafruit_GFX(E_INK_WIDTH, E_INK_HEIGHT), Graphics(E_INK_WIDTH, E_INK_HEIGHT) {
}

void Inkplate::clearDisplay() {
    memset (DMemory4Bit, 0xFF, E_INK_WIDTH * E_INK_HEIGHT / 4);
}

