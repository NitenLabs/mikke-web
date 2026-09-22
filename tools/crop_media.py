#!/usr/bin/env python3
# 選んだ候補を各枠の形に切り出し、EXIF/位置情報を落として media/ に保存する。
# PIL は明示的に渡さない限り EXIF を保存しないので、save() で GPS は落ちる。
import sys
from PIL import Image

MEDIA = "samples/ashiyado/media"
CAND = "refs/candidates"

# (asset_key, source_file, target_w, target_h, focal_x, focal_y)
#   focal は「残したい点」の元画像に対する割合（cover 切り出しの中心）
JOBS = [
    ("ast_A.jpg",  "A-1.jpg",     1600, 800,  0.50, 0.42),  # FV 背景（暗いnerikiriトレイ）
    ("ast_B.jpg",  "B-1.jpg",     1132, 840,  0.50, 0.50),  # ABOUT 手元
    ("ast_C.jpg",  "C-1.jpg",     1132, 840,  0.50, 0.55),  # ABOUT 中央 上生菓子
    ("ast_D.jpg",  "D-1.jpg",     1132, 840,  0.50, 0.50),  # ABOUT 設え
    ("ast_E.jpg",  "F-2.jpg",     1098, 808,  0.50, 0.40),  # FEATURE1 季節の上生菓子（集合・上寄せで下の箱を避ける）
    ("ast_F.jpg",  "F-3.jpg",     1098, 808,  0.46, 0.52),  # FEATURE2 甘味処（あんみつ）
    ("ast_G.jpg",  "E-1.jpg",     852,  852,  0.50, 0.50),  # カード 上生菓子（黒盆）
    ("ast_H.jpg",  "DORA-2.jpg",  852,  852,  0.50, 0.50),  # カード どら焼き
    ("ast_I.jpg",  "WARABI-1.jpg",852,  852,  0.50, 0.56),  # カード わらび餅（皿を残す）
    ("ast_J.jpg",  "J-2.jpg",     946,  1120, 0.50, 0.50),  # ACCESS 夜の店構え
    ("ast_K.jpg",  "K-1.jpg",     1600, 656,  0.50, 0.50),  # CONTACT 背景 質感
    ("ast_L.jpg",  "F-2.jpg",     1600, 445,  0.50, 0.38),  # お品書き帯（横長・上寄せ）
]

def cover_crop(im, tw, th, fx, fy):
    sw, sh = im.size
    scale = max(tw / sw, th / sh)
    nw, nh = round(sw * scale), round(sh * scale)
    im2 = im.resize((nw, nh), Image.LANCZOS)
    # focal point in scaled space
    cx, cy = fx * nw, fy * nh
    left = round(cx - tw / 2); top = round(cy - th / 2)
    left = max(0, min(left, nw - tw)); top = max(0, min(top, nh - th))
    return im2.crop((left, top, left + tw, top + th))

rows = []
for key, src, tw, th, fx, fy in JOBS:
    im = Image.open(f"{CAND}/{src}").convert("RGB")
    out = cover_crop(im, tw, th, fx, fy)
    dst = f"{MEDIA}/{key}"
    out.save(dst, "JPEG", quality=82, optimize=True)  # 新規JPEG＝元EXIF/GPSは付かない
    import os
    rows.append((key, tw, th, os.path.getsize(dst)))
    print(f"{key:12s} {tw}x{th}  {os.path.getsize(dst)} bytes  <- {src}")

# 後段（assets.json 更新）用に width/height/bytes を出力
import json
print("DIMS=" + json.dumps({k: {"w": w, "h": h, "bytes": b} for k, w, h, b in rows}))
