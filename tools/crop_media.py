#!/usr/bin/env python3
# 選んだ候補を各枠の形に切り出し、トーンを参照元にそろえ、EXIF/位置情報を落として media/ に保存する。
# PIL は明示的に渡さない限り EXIF を保存しないので、save() で GPS は落ちる。
#
# トーン調整（grade）は全12枚に同一のパラメータで掛ける（1枚ずつ別々にしない）。
# 参照元（studio テンプレート）の5枚の写真の実測レンジに合わせて決めた固定値。
#   参照元 平均: brightness=80 / saturation=36 / temp(R-B)=+13
#   目的  : 芦屋堂の写真（平均 bright=103・temp=+29＝明るく暖かすぎ）を暗く・やや寒色へ寄せ、
#           ハイライトの緩い圧縮で C/H/I（白背景・明るい外れ値）を範囲側へ引き下げる。
import sys
import numpy as np
from PIL import Image

# --- トーン調整パラメータ（全枚共通・固定＝毎回同じ結果） ---
WB_R  = 0.955   # 白の色温度：赤を下げ
WB_B  = 1.075   # 青を上げて暖色を弱める
GAIN  = 0.80    # 露出：全体を暗く（明るすぎを補正）
KNEE  = 0.44    # ハイライト圧縮の膝：これ以上明るい画素を tanh で丸める（白背景を範囲側へ）
SAT   = 1.16    # 彩度：わずかに上げて参照元(36)へ
KGAIN_K = 2.6   # 枠Kだけの露出（§3.8。CONTACT背景を参照元の明るさ≈46に近づける）

def grade(im):
    a = np.asarray(im, dtype=np.float64) / 255.0
    a[..., 0] *= WB_R
    a[..., 2] *= WB_B
    a *= GAIN
    k = KNEE
    hi = a > k
    a[hi] = k + (1.0 - k) * np.tanh((a[hi] - k) / (1.0 - k))
    luma = (0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2])[..., None]
    a = luma + (a - luma) * SAT
    a = np.clip(a, 0.0, 1.0)
    return Image.fromarray((a * 255.0 + 0.5).astype(np.uint8), "RGB")

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
    ("ast_J.jpg",  "JA-access.jpg", 1098, 808, 0.50, 0.44),  # ACCESS 夜の町家・格子窓の明かり（fix04・横長）
    ("ast_K.jpg",  "JC-contact.jpg", 1600, 656, 0.50, 0.30),  # CONTACT 背景 暗い軒先（fix04・候補1）
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
    out = grade(out)
    # 枠K（CONTACT背景・お問い合わせ帯）は暗すぎて参照元CONTACTの明るさ(≈46)に届かないため、
    # K だけ露出を上げる（§3.8。暗化%と合わせて背景の明るさを参照元±10に入れる）。
    if key == "ast_K.jpg":
        a = np.asarray(out, dtype=np.float64) * KGAIN_K
        out = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), "RGB")
    dst = f"{MEDIA}/{key}"
    out.save(dst, "JPEG", quality=82, optimize=True)  # 新規JPEG＝元EXIF/GPSは付かない
    import os
    rows.append((key, tw, th, os.path.getsize(dst)))
    print(f"{key:12s} {tw}x{th}  {os.path.getsize(dst)} bytes  <- {src}")

# 後段（assets.json 更新）用に width/height/bytes を出力
import json
print("DIMS=" + json.dumps({k: {"w": w, "h": h, "bytes": b} for k, w, h, b in rows}))
