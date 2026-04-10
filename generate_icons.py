"""
KRAM Icon Generator
====================
Generates a modern, professional icon set for KRAM:
  - backend/assets/icon.ico      (Windows EXE icon, all sizes)
  - backend/assets/icon.png      (512x512 high-res PNG)
  - frontend/public/icon-192.png (PWA icon)
  - frontend/public/icon-512.png (PWA icon)
  - frontend/public/favicon.ico  (browser favicon)

Design: Dark slate rounded-square background, brand-blue accent border,
        glowing white "K" letterform, lightning bolt badge (bottom-right).

Run: python generate_icons.py
"""

import os
import math
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT   = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(ROOT, "backend", "assets")
PUBLIC = os.path.join(ROOT, "frontend", "public")
os.makedirs(ASSETS, exist_ok=True)
os.makedirs(PUBLIC, exist_ok=True)


# ── Brand palette ─────────────────────────────────────────────────────────────
DARK_BG    = (15,  23,  42)   # slate-950
MID_BG     = (30,  41,  59)   # slate-800
BRAND_DARK = (30,  64, 175)   # blue-800
BRAND_MID  = (37,  99, 235)   # blue-600
BRAND_LT   = (96, 165, 250)   # blue-400
ACCENT     = (147, 197, 253)  # blue-300
WHITE      = (255, 255, 255)
TRANSPARENT = (0, 0, 0, 0)


def lerp(a, b, t):
    return int(a + (b - a) * t)

def lerp_color(c1, c2, t):
    return tuple(lerp(a, b, t) for a, b in zip(c1, c2))


def _load_font(size: int):
    candidates = [
        "C:/Windows/Fonts/arialbd.ttf",
        "C:/Windows/Fonts/calibrib.ttf",
        "C:/Windows/Fonts/trebucbd.ttf",
        "C:/Windows/Fonts/segoeui.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf",
        "/Library/Fonts/Arial Bold.ttf",
        os.path.join(ASSETS, "DejaVuSans-Bold.ttf"),
    ]
    for path in candidates:
        if os.path.isfile(path):
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                continue
    return ImageFont.load_default(size=max(10, size))


def draw_icon(size: int) -> Image.Image:
    S = size
    pad = max(2, S // 20)
    inner = S - pad * 2
    r = inner // 5

    img = Image.new("RGBA", (S, S), TRANSPARENT)

    # ── Drop shadow ───────────────────────────────────────────────────────────
    shadow = Image.new("RGBA", (S, S), TRANSPARENT)
    ImageDraw.Draw(shadow).rounded_rectangle(
        [pad + 3, pad + 5, pad + inner + 3, pad + inner + 5],
        radius=r, fill=(0, 0, 0, 90),
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(max(2, S // 28)))
    img = Image.alpha_composite(img, shadow)

    # ── Gradient background ───────────────────────────────────────────────────
    bg = Image.new("RGBA", (S, S), TRANSPARENT)
    bg_draw = ImageDraw.Draw(bg)
    for y in range(pad, pad + inner + 1):
        t = (y - pad) / max(inner - 1, 1)
        col = lerp_color(MID_BG, DARK_BG, t ** 1.2) + (255,)
        bg_draw.line([(pad, y), (pad + inner, y)], fill=col)
    mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(mask).rounded_rectangle([pad, pad, pad + inner, pad + inner], radius=r, fill=255)
    bg.putalpha(mask)
    img = Image.alpha_composite(img, bg)

    draw = ImageDraw.Draw(img)

    # ── Outer border (brand blue) ─────────────────────────────────────────────
    bw = max(1, S // 28)
    draw.rounded_rectangle(
        [pad, pad, pad + inner, pad + inner],
        radius=r, outline=(*BRAND_MID, 210), width=bw,
    )

    # ── Inner top highlight ───────────────────────────────────────────────────
    draw.rounded_rectangle(
        [pad + bw + 1, pad + bw + 1, pad + inner - bw - 1, pad + bw + max(2, S // 24)],
        radius=max(1, r - bw),
        fill=(*ACCENT, 35),
    )

    # ── Letter "K" with glow ──────────────────────────────────────────────────
    fs = int(inner * 0.60)
    font = _load_font(fs)
    letter = "K"

    bb = ImageDraw.Draw(Image.new("RGBA", (1, 1))).textbbox((0, 0), letter, font=font)
    tw, th = bb[2] - bb[0], bb[3] - bb[1]
    tx = (S - tw) / 2 - bb[0]
    ty = (S - th) / 2 - bb[1] - max(1, S // 32)

    # Glow layers
    if S >= 32:
        glow = Image.new("RGBA", (S, S), TRANSPARENT)
        gd = ImageDraw.Draw(glow)
        steps = max(3, S // 20)
        for i in range(steps, 0, -1):
            a = int(20 * (i / steps))
            gd.text((tx, ty), letter, font=font, fill=(*BRAND_LT, a))
        glow = glow.filter(ImageFilter.GaussianBlur(max(1, S // 20)))
        img = Image.alpha_composite(img, glow)
        draw = ImageDraw.Draw(img)

    # Subtle blue shadow offset
    draw.text((tx + max(1, S // 56), ty + max(1, S // 56)), letter, font=font, fill=(*BRAND_LT, 140))
    # Crisp white K
    draw.text((tx, ty), letter, font=font, fill=(*WHITE, 255))

    # ── Lightning bolt badge (bottom-right) ───────────────────────────────────
    if S >= 48:
        bx = int(S * 0.73)
        by = int(S * 0.71)
        br = int(S * 0.155)

        # Badge circle with gradient-ish feel
        draw.ellipse([bx - br, by - br, bx + br, by + br], fill=(*BRAND_DARK, 255))
        draw.ellipse([bx - br, by - br, bx + br, by + br],
                     outline=(*BRAND_LT, 200), width=max(1, br // 5))

        # Lightning bolt polygon (↯)
        lw = br * 0.52
        lh = br * 0.88
        bolt = [
            (bx + lw * 0.08,  by - lh * 0.50),
            (bx - lw * 0.12,  by - lh * 0.04),
            (bx + lw * 0.22,  by - lh * 0.04),
            (bx - lw * 0.08,  by + lh * 0.50),
            (bx + lw * 0.12,  by + lh * 0.04),
            (bx - lw * 0.22,  by + lh * 0.04),
        ]
        draw.polygon(bolt, fill=(*ACCENT, 255))

    return img


def save_ico(path: str, imgs: list):
    imgs[0].save(
        path, format="ICO",
        sizes=[(i.width, i.height) for i in imgs],
        append_images=imgs[1:],
    )
    print(f"  OK  {os.path.relpath(path, ROOT)}")


def save_png(path: str, img: Image.Image):
    img.save(path, format="PNG", optimize=True)
    print(f"  OK  {os.path.relpath(path, ROOT)}")


def main():
    print()
    print("=" * 45)
    print("  KRAM -- Icon Generator")
    print("=" * 45)
    print()

    sizes = [16, 24, 32, 48, 64, 128, 256, 512]
    icons = {}
    for s in sizes:
        print(f"  Rendering {s:>3}×{s}…", end="\r")
        icons[s] = draw_icon(s)
    print("  All sizes rendered.              ")
    print()

    # Windows EXE multi-res .ico
    save_ico(
        os.path.join(ASSETS, "icon.ico"),
        [icons[s] for s in [16, 24, 32, 48, 64, 128, 256]],
    )

    # High-res PNGs for tray / marketing
    save_png(os.path.join(ASSETS, "icon.png"), icons[512])

    # PWA / browser
    save_png(os.path.join(PUBLIC, "icon-192.png"), icons[128].resize((192, 192), Image.LANCZOS))
    save_png(os.path.join(PUBLIC, "icon-512.png"), icons[512])
    save_ico(
        os.path.join(PUBLIC, "favicon.ico"),
        [icons[s] for s in [16, 32, 48]],
    )

    print()
    print("  Done! Files written:")
    print("    backend/assets/icon.ico      (Windows EXE icon, 7 sizes)")
    print("    backend/assets/icon.png      (512x512 PNG)")
    print("    frontend/public/icon-192.png (PWA icon)")
    print("    frontend/public/icon-512.png (PWA icon)")
    print("    frontend/public/favicon.ico  (Browser tab)")
    print()


if __name__ == "__main__":
    main()
