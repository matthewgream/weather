# -----------
# Simple python script to
# create icon header files for Inkplate 6
# Arduino sketches
#
# Takes all files from /icons and saves them to /binary_Icons
#
# -----------

from PIL import Image
import os, sys

if not os.path.isdir("./icons"):
    os.mkdir(os.path.abspath(os.getcwd()) + "/icons")

for file in os.listdir("./icons_source"):
    im = Image.open("./icons_source/" + file)
    alp = im.split()[-1]
    s = [0 for x in range(32 * 32)]
    for y in range(32):
        for x in range(32):
            # print(im.getpixel((x, y)))
            if alp.getpixel((x, y)) > 128:
                s[(x + 32 * y) // 8] |= 1 << (7 - (x + 32 * y) % 8)

    with open("./icons/icon_" + file[:-4] + ".h", "w") as f:
        print("const uint8_t icon_" + file[:-4] + "[] PROGMEM = {", file=f)
        print(",".join(list(map(hex, s))), file=f)
        print("};", file=f)
