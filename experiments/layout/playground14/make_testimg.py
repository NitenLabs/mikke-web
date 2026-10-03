#!/usr/bin/env python3
# 作業票10 §4 の試験画像を作る。四分割（左上 赤 / 右上 緑 / 左下 青 / 右下 黄）。
# 見せる範囲がどこを映しているかを色で確かめるため。
import os
from PIL import Image

TL = (0xd0, 0x00, 0x00)  # 左上 赤
TR = (0x00, 0xa0, 0x00)  # 右上 緑
BL = (0x00, 0x40, 0xd0)  # 左下 青
BR = (0xe0, 0xc0, 0x00)  # 右下 黄

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "testimg")
os.makedirs(OUT, exist_ok=True)


def quad(w, h):
    im = Image.new("RGB", (w, h))
    hw, hh = w // 2, h // 2
    for (box, col) in [((0, 0, hw, hh), TL), ((hw, 0, w, hh), TR), ((0, hh, hw, h), BL), ((hw, hh, w, h), BR)]:
        im.paste(col, box)
    return im


def save_jpg(name, w, h):
    quad(w, h).save(os.path.join(OUT, name), "JPEG", quality=92)


def save_png(name, w, h):
    quad(w, h).save(os.path.join(OUT, name), "PNG")


save_jpg("wide.jpg", 1600, 600)
save_jpg("tall.jpg", 600, 1600)
save_jpg("big.jpg", 6000, 4000)
save_png("small.png", 300, 200)

# rotated.jpg：正しい向き（表示）は 1200×1600 の縦長の四分割。保存は 1600×1200・向き情報 6（右に90度回して見る）。
# 表示 D を 90度 CCW で保存すれば、ビューアが 90度 CW で回して D に戻る＝向き6。
disp = quad(1200, 1600)
stored = disp.rotate(90, expand=True)          # 1600×1200
exif = stored.getexif()
exif[274] = 6                                  # 274 = Orientation
stored.save(os.path.join(OUT, "rotated.jpg"), "JPEG", quality=92, exif=exif)

with open(os.path.join(OUT, "notimage.txt"), "w", encoding="utf-8") as f:
    f.write("これは画像ではありません。読めないファイルの試験用。")

for f in sorted(os.listdir(OUT)):
    p = os.path.join(OUT, f)
    print(f, os.path.getsize(p), "bytes")
