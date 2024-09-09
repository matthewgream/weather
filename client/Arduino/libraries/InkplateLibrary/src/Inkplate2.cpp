
#include "defines.h"
#include "Inkplate.h"
#include "Graphics.h"

#include "SPI.h"

SPIClass epdSPI(VSPI);

SPISettings epdSpiSettings(1000000UL, MSBFIRST, SPI_MODE0);

void Graphics::writePixel(int16_t x0, int16_t y0, uint16_t _color)
{
    if (x0 > width() - 1 || y0 > height() - 1 || x0 < 0 || y0 < 0)
        return;
    if (_color > 2)
        return;

    switch (rotation)
    {
    case 3:
        _swap_int16_t(x0, y0);
        x0 = height() - x0 - 1;
        break;
    case 0:
        x0 = width() - x0 - 1;
        y0 = height() - y0 - 1;
        break;
    case 1:
        _swap_int16_t(x0, y0);
        y0 = width() - y0 - 1;
        break;
    }

    int _x = x0 / 8;
    int _xSub = x0 % 8;

    int _position = E_INK_WIDTH / 8 * y0 + _x;

    *(DMemory4Bit + _position) |= (pixelMaskLUT[7 - _xSub]);
    *(DMemory4Bit + (E_INK_WIDTH * E_INK_HEIGHT / 8) + _position) |= (pixelMaskLUT[7 - _xSub]);

    if (_color < 2)
        *(DMemory4Bit + _position) &= ~(_color << (7 - _xSub));
    else
        *(DMemory4Bit + (E_INK_WIDTH * E_INK_HEIGHT / 8) + _position) &= ~(pixelMaskLUT[7 - _xSub]);
}

void Inkplate::begin () {
	DMemory4Bit = (uint8_t *)ps_malloc(E_INK_WIDTH * E_INK_HEIGHT / 4);

	clearDisplay();

	setRotation(1);
}

bool Inkplate::display() {
    if (!setPanelDeepSleep(false))
    	return false;
    delay(20);

    sendCommand(0x10);
    sendData(DMemory4Bit, (E_INK_WIDTH * E_INK_HEIGHT / 8));

    sendCommand(0x13);
    sendData(DMemory4Bit + (E_INK_WIDTH * E_INK_HEIGHT / 8), (E_INK_WIDTH * E_INK_HEIGHT / 8));

    sendCommand(0x11);
    sendData(0x00);

    sendCommand(0x12);
    delayMicroseconds(500);
    waitForEpd(60000);

    setPanelDeepSleep(true);

    return true;
}

bool Inkplate::setPanelDeepSleep(bool _state)
{
    if (!_state)
    {
        epdSPI.begin(EPAPER_CLK, -1, EPAPER_DIN, -1);

        pinMode(EPAPER_CS_PIN, OUTPUT);
        pinMode(EPAPER_DC_PIN, OUTPUT);
        pinMode(EPAPER_RST_PIN, OUTPUT);
        pinMode(EPAPER_BUSY_PIN, INPUT_PULLUP);

        delay(10);

        resetPanel();

        sendCommand(0x04);
        if (!waitForEpd(BUSY_TIMEOUT_MS))
            return false;

        sendCommand(0x00);
        sendData(0x0f);
        sendData(0x89);

        sendCommand(0x61);
        sendData(E_INK_WIDTH);
        sendData(E_INK_HEIGHT >> 8);
        sendData(E_INK_HEIGHT & 0xff);

        sendCommand(0x50);
        sendData(0x77);

        return true;
    }
    else
    {
        sendCommand(0X50);
        sendData(0xf7);
        sendCommand(0X02);
        waitForEpd(BUSY_TIMEOUT_MS);
        sendCommand(0X07);
        sendData(0xA5);
        delay(1);

        epdSPI.end();

        pinMode(EPAPER_RST_PIN, INPUT);
        pinMode(EPAPER_DC_PIN, INPUT);
        pinMode(EPAPER_CS_PIN, INPUT);
        pinMode(EPAPER_BUSY_PIN, INPUT);
        pinMode(EPAPER_CLK, INPUT);
        pinMode(EPAPER_DIN, INPUT);

        return true;
    }
}

void Inkplate::resetPanel()
{
    digitalWrite(EPAPER_RST_PIN, LOW);
    delay(100);
    digitalWrite(EPAPER_RST_PIN, HIGH);
    delay(100);
}

void Inkplate::sendCommand(uint8_t _command)
{
    digitalWrite(EPAPER_CS_PIN, LOW);
    digitalWrite(EPAPER_DC_PIN, LOW);
    delayMicroseconds(10);
    epdSPI.beginTransaction(epdSpiSettings);
    epdSPI.transfer(_command);
    epdSPI.endTransaction();
    digitalWrite(EPAPER_CS_PIN, HIGH);
    delay(1);
}

void Inkplate::sendData(uint8_t *_data, int _n)
{
    digitalWrite(EPAPER_CS_PIN, LOW);
    digitalWrite(EPAPER_DC_PIN, HIGH);
    delayMicroseconds(10);
    epdSPI.beginTransaction(epdSpiSettings);
    epdSPI.writeBytes(_data, _n);
    epdSPI.endTransaction();
    digitalWrite(EPAPER_CS_PIN, HIGH);
    delay(1);
}

void Inkplate::sendData(uint8_t _data)
{
    digitalWrite(EPAPER_CS_PIN, LOW);
    digitalWrite(EPAPER_DC_PIN, HIGH);
    delayMicroseconds(10);
    epdSPI.beginTransaction(epdSpiSettings);
    epdSPI.transfer(_data);
    epdSPI.endTransaction();
    digitalWrite(EPAPER_CS_PIN, HIGH);
    delay(1);
}

bool Inkplate::waitForEpd(uint16_t _timeout)
{
    unsigned long _time = millis();
    while (!digitalRead(EPAPER_BUSY_PIN) && ((millis() - _time) < _timeout))
        ;
    if (!digitalRead(EPAPER_BUSY_PIN))
        return false;
    delay(200);
    return true;
}
