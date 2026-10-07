#!/usr/bin/env python3
"""把一张图转成黑白，输出 webp 到 public/img/。

灰度算法刻意用 BT.709 亮度权重（0.2126 / 0.7152 / 0.0722）——
与 CSS `filter: grayscale(100%)` 用的是同一套矩阵，所以"烤进文件"与"交给 CSS"
两条路得到的是同一个像素值：页面上无论走哪条，都不会差一档灰。
（Pillow 自带的 convert('L') 用的是 BT.601，与 CSS 差几级灰，故不用它。）

曲线也对齐站点里已有的两条 filter：
  hero    —— .hero-image     grayscale(100%) contrast(1.05)
  archive —— .archive::before grayscale(100%) contrast(1.3) brightness(0.88)
CSS 的 contrast(k) 是 (v - 127.5) * k + 127.5、brightness(k) 是 v * k，
与 PIL 的 ImageEnhance.Contrast / Brightness 算法逐值相同，所以等价可验证。

用法：
  python tools/grayscale.py <源图> [输出路径] [--preset flat|hero|archive] [--quality 88] [--max-width 1600]

  flat    （默认）只转灰，不动曲线。页面上的 contrast 仍由 CSS 负责 ——
           与首图、档案馆照片的做法一致：仓库里放彩色（或已转灰的）原图，
           观感由 CSS 统一给。烤了 flat 再挂 CSS filter，结果与不烤完全相同。
  hero    转灰 + contrast 1.05                —— 与 .hero-image 等价。烤完 CSS 不要再挂 filter
  archive 转灰 + contrast 1.3 + brightness 0.88 —— 与 .archive::before 等价

例：
  python tools/grayscale.py TEMP_Steve_and_Tiffany_lamp_Diana_Walker_x75sqx.jpg public/img/lamp.webp
"""

import argparse
import re
from pathlib import Path

from PIL import Image, ImageEnhance, ImageMath

ROOT = Path(__file__).resolve().parent.parent
IMG_DIR = ROOT / "public" / "img"


def to_gray(im):
    """BT.709 亮度转灰，与 CSS grayscale(100%) 同一套权重。"""
    rgb = im.convert("RGB")
    r, g, b = rgb.split()
    try:
        # 整数运算避免浮点误差：2126*255 + 7152*255 + 722*255 = 10000*255，32 位放得下
        lum = ImageMath.eval(
            "convert((2126 * r + 7152 * g + 722 * b) // 10000, 'L')", r=r, g=g, b=b
        )
    except Exception:
        # 兜底：Pillow 自带转灰（BT.601）。差几级灰，但不会让脚本失败
        lum = rgb.convert("L")
    return lum


def apply_preset(gray, preset):
    if preset == "hero":
        return ImageEnhance.Contrast(gray).enhance(1.05)
    if preset == "archive":
        g = ImageEnhance.Contrast(gray).enhance(1.30)
        return ImageEnhance.Brightness(g).enhance(0.88)
    return gray


def default_out(src):
    """TEMP_xxx_name_x75sqx.jpg → public/img/xxx_name.webp（去掉临时前缀与随机后缀）"""
    stem = re.sub(r"_x[0-9a-z]{4,}$", "", re.sub(r"^TEMP_", "", src.stem, flags=re.I))
    return IMG_DIR / (stem + ".webp")


def main():
    ap = argparse.ArgumentParser(description="按站点既有灰度参数把图片转成黑白")
    ap.add_argument("src", type=Path, help="源图路径")
    ap.add_argument("out", type=Path, nargs="?", help="输出路径，默认 public/img/<源图名>.webp")
    ap.add_argument("--preset", choices=["flat", "hero", "archive"], default="flat")
    ap.add_argument("--quality", type=int, default=88, help="webp 质量，默认 88")
    ap.add_argument("--max-width", type=int, help="长边超过此值时等比缩到该宽度")
    args = ap.parse_args()

    src = args.src if args.src.is_absolute() else ROOT / args.src
    if not src.exists():
        raise SystemExit("找不到源图：" + str(src))

    out = args.out if args.out is not None else default_out(src)
    out = out if out.is_absolute() else ROOT / out
    out.parent.mkdir(parents=True, exist_ok=True)

    im = Image.open(src)
    gray = to_gray(im)

    if args.max_width and gray.width > args.max_width:
        ratio = args.max_width / gray.width
        gray = gray.resize((args.max_width, round(gray.height * ratio)), Image.LANCZOS)

    gray = apply_preset(gray, args.preset)

    gray.save(out, "WEBP", quality=args.quality)
    print("已输出 " + str(out) + f"（{gray.width}×{gray.height}，preset={args.preset}）")


if __name__ == "__main__":
    main()
