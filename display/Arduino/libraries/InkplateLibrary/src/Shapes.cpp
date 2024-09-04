
#include "Shapes.h"

void Shapes::drawElipse(int rx, int ry, int xc, int yc, int c)
{
    float dx, dy, d1, d2, x, y;
    x = 0;
    y = ry;

    d1 = (ry * ry) - (rx * rx * ry) + (0.25 * rx * rx);
    dx = 2 * ry * ry * x;
    dy = 2 * rx * rx * y;

    while (dx < dy)
    {
        drawPixel(x + xc, y + yc, c);
        drawPixel(-x + xc, y + yc, c);
        drawPixel(x + xc, -y + yc, c);
        drawPixel(-x + xc, -y + yc, c);

        if (d1 < 0)
        {
            x++;
            dx = dx + (2 * ry * ry);
            d1 = d1 + dx + (ry * ry);
        }
        else
        {
            x++;
            y--;
            dx = dx + (2 * ry * ry);
            dy = dy - (2 * rx * rx);
            d1 = d1 + dx - dy + (ry * ry);
        }
    }

    d2 = ((ry * ry) * ((x + 0.5) * (x + 0.5))) + ((rx * rx) * ((y - 1) * (y - 1))) - (rx * rx * ry * ry);
    while (y >= 0)
    {
        drawPixel(x + xc, y + yc, c);
        drawPixel(-x + xc, y + yc, c);
        drawPixel(x + xc, -y + yc, c);
        drawPixel(-x + xc, -y + yc, c);

        if (d2 > 0)
        {
            y--;
            dy = dy - (2 * rx * rx);
            d2 = d2 + (rx * rx) - dy;
        }
        else
        {
            y--;
            x++;
            dx = dx + (2 * ry * ry);
            dy = dy - (2 * rx * rx);
            d2 = d2 + dx - dy + (rx * rx);
        }
    }
}

void Shapes::fillElipse(int rx, int ry, int xc, int yc, int c)
{
    int hh = ry * ry;
    int ww = rx * rx;
    int hhww = hh * ww;
    int x0 = rx;
    int dx = 0;

    for (int x = -rx; x <= rx; x++)
        drawPixel(xc + x, yc, c);

    for (int y = 1; y <= ry; y++)
    {
        int x1 = x0 - (dx - 1);
        for (; x1 > 0; x1--)
            if (x1 * x1 * hh + y * y * ww <= hhww)
                break;
        dx = x0 - x1;
        x0 = x1;

        for (int x = -x0; x <= x0; x++)
        {
            drawPixel(xc + x, yc - y, c);
            drawPixel(xc + x, yc + y, c);
        }
    }
}

void Shapes::drawThickLine(int x1, int y1, int x2, int y2, int color, float thickness)
{
    float deg = atan2f((float)(y2 - y1), (float)(x2 - x1));

    float l1 = tan(deg);

    float degShift = (l1 < 0 ? M_PI_2 : -M_PI_2);

    int x3 = (int)round((float)x1 + thickness / 2.0 * cos(deg + degShift));
    int y3 = (int)round((float)y1 + thickness / 2.0 * sin(deg + degShift));

    int x4 = (int)round((float)x2 + thickness / 2.0 * cos(deg + degShift));
    int y4 = (int)round((float)y2 + thickness / 2.0 * sin(deg + degShift));

    x1 = (int)round((float)x1 + thickness / 2.0 * cos(deg - degShift));
    y1 = (int)round((float)y1 + thickness / 2.0 * sin(deg - degShift));

    x2 = (int)round((float)x2 + thickness / 2.0 * cos(deg - degShift));
    y2 = (int)round((float)y2 + thickness / 2.0 * sin(deg - degShift));

    fillTriangle(x1, y1, x2, y2, x3, y3, color);
    fillTriangle(x2, y2, x4, y4, x3, y3, color);
}

void Shapes::drawGradientLine(int x1, int y1, int x2, int y2, int color1, int color2, float thickness)
{
    int n = color2 - color1;

    float px = (float)(x2 - x1) / (float)n;
    float py = (float)(y2 - y1) / (float)n;

    for (int i = 0; i < n; ++i)
    {
        if (abs(thickness + 1) < 0.1)
            drawLine((int)((float)x1 + (float)i * px), (int)((float)y1 + (float)i * py),
                     (int)((float)x1 + (float)(i + 1) * px), (int)((float)y1 + (float)(i + 1) * py), color1 + i);
        else
            drawThickLine((int)((float)x1 + (float)i * px), (int)((float)y1 + (float)i * py),
                          (int)((float)x1 + (float)(i + 1) * px), (int)((float)y1 + (float)(i + 1) * py), color1 + i,
                          thickness);
    }
}

void Shapes::initedgeTable()
{
    int i;
    for (i = 0; i < maxHt; i++)
        edgeTable[i].countEdgeBucket = 0;
    activeEdgeTuple.countEdgeBucket = 0;
}

void Shapes::insertionSort(edgeTableTuple *ett)
{
    int i, j;
    EdgeBucket temp;

    for (i = 1; i < ett->countEdgeBucket; i++)
    {
        temp.ymax = ett->buckets[i].ymax;
        temp.xofymin = ett->buckets[i].xofymin;
        temp.slopeinverse = ett->buckets[i].slopeinverse;
        j = i - 1;

        while ((temp.xofymin < ett->buckets[j].xofymin) && (j >= 0))
        {
            ett->buckets[j + 1].ymax = ett->buckets[j].ymax;
            ett->buckets[j + 1].xofymin = ett->buckets[j].xofymin;
            ett->buckets[j + 1].slopeinverse = ett->buckets[j].slopeinverse;
            j = j - 1;
        }
        ett->buckets[j + 1].ymax = temp.ymax;
        ett->buckets[j + 1].xofymin = temp.xofymin;
        ett->buckets[j + 1].slopeinverse = temp.slopeinverse;
    }
}

void Shapes::storeEdgeInTuple(edgeTableTuple *receiver, int ym, int xm, float slopInv)
{
    (receiver->buckets[(receiver)->countEdgeBucket]).ymax = ym;
    (receiver->buckets[(receiver)->countEdgeBucket]).xofymin = (float)xm;
    (receiver->buckets[(receiver)->countEdgeBucket]).slopeinverse = slopInv;

    insertionSort(receiver);

    (receiver->countEdgeBucket)++;
}

void Shapes::storeEdgeInTable(int x1, int y1, int x2, int y2)
{
    float m, minv;
    int ymaxTS, xwithyminTS, scanline; // ts stands for "to store"

    if (x2 == x1)
    {
        minv = 0.000000;
    }
    else
    {
        m = ((float)(y2 - y1)) / ((float)(x2 - x1));

        if (y2 == y1)
            return;

        minv = (float)1.0 / m;
    }

    if (y1 > y2)
    {
        scanline = y2;
        ymaxTS = y1;
        xwithyminTS = x2;
    }
    else
    {
        scanline = y1;
        ymaxTS = y2;
        xwithyminTS = x1;
    }
    storeEdgeInTuple(&edgeTable[scanline], ymaxTS, xwithyminTS, minv);
}

void Shapes::removeEdgeByYmax(edgeTableTuple *tup, int yy)
{
    int i, j;
    for (i = 0; i < tup->countEdgeBucket; i++)
    {
        if (tup->buckets[i].ymax == yy)
        {
            for (j = i; j < tup->countEdgeBucket - 1; j++)
            {
                tup->buckets[j].ymax = tup->buckets[j + 1].ymax;
                tup->buckets[j].xofymin = tup->buckets[j + 1].xofymin;
                tup->buckets[j].slopeinverse = tup->buckets[j + 1].slopeinverse;
            }
            tup->countEdgeBucket--;
            i--;
        }
    }
}

void Shapes::updatexbyslopeinv(edgeTableTuple *tup)
{
    int i;

    for (i = 0; i < tup->countEdgeBucket; i++)
    {
        (tup->buckets[i]).xofymin = (tup->buckets[i]).xofymin + (tup->buckets[i]).slopeinverse;
    }
}

void Shapes::scanlineFill(uint8_t c)
{
    int i, j, x1, ymax1, x2, ymax2, FillFlag = 0, coordCount;

    for (i = 0; i < maxHt; i++)
    {
        for (j = 0; j < edgeTable[i].countEdgeBucket; j++)
            storeEdgeInTuple(&activeEdgeTuple, edgeTable[i].buckets[j].ymax, edgeTable[i].buckets[j].xofymin,
                             edgeTable[i].buckets[j].slopeinverse);

        removeEdgeByYmax(&activeEdgeTuple, i);
        insertionSort(&activeEdgeTuple);

        j = 0;
        FillFlag = 0;
        coordCount = 0;
        x1 = 0;
        x2 = 0;
        ymax1 = 0;
        ymax2 = 0;
        while (j < activeEdgeTuple.countEdgeBucket)
        {
            if (coordCount % 2 == 0)
            {
                x1 = (int)(activeEdgeTuple.buckets[j].xofymin);
                ymax1 = activeEdgeTuple.buckets[j].ymax;
                if (x1 == x2)
                {
                    if (((x1 == ymax1) && (x2 != ymax2)) || ((x1 != ymax1) && (x2 == ymax2)))
                    {
                        x2 = x1;
                        ymax2 = ymax1;
                    }

                    else
                    {
                        coordCount++;
                    }
                }
                else
                {
                    coordCount++;
                }
            }
            else
            {
                x2 = (int)activeEdgeTuple.buckets[j].xofymin;
                ymax2 = activeEdgeTuple.buckets[j].ymax;

                FillFlag = 0;
                if (x1 == x2)
                {
                    if (((x1 == ymax1) && (x2 != ymax2)) || ((x1 != ymax1) && (x2 == ymax2)))
                    {
                        x1 = x2;
                        ymax1 = ymax2;
                    }
                    else
                    {
                        coordCount++;
                        FillFlag = 1;
                    }
                }
                else
                {
                    coordCount++;
                    FillFlag = 1;
                }

                if (FillFlag)
                {
                    drawLine(x1, i, x2, i, c);
                }
            }

            j++;
        }
        updatexbyslopeinv(&activeEdgeTuple);
    }
}

void Shapes::drawPolygon(int *x, int *y, int n, int color)
{
    for (int i = 0; i < n; ++i)
        drawLine(x[i], y[i], x[(i + 1) % n], y[(i + 1) % n], color);
}

void Shapes::fillPolygon(int *x, int *y, int n, int color)
{
    edgeTable = (edgeTableTuple *)ps_malloc(maxHt * sizeof(edgeTableTuple));
    initedgeTable();

    int count = 0, x1 = 0, y1 = 0, x2 = 0, y2 = 0;

    for (int i = 0; i < n + 1; ++i)
    {
        count++;
        if (count > 2)
        {
            x1 = x2;
            y1 = y2;
            count = 2;
        }
        if (count == 1)
        {
            x1 = x[i % n];
            y1 = y[i % n];
        }
        else
        {
            x2 = x[i % n];
            y2 = y[i % n];
            drawLine(x1, y1, x2, y2, color);
            storeEdgeInTable(x1, y1, x2, y2);
        }
    }
    scanlineFill(color);
    free(edgeTable);
}

