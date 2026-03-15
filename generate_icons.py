#!/usr/bin/env python3
"""Generate PWA icons using Pillow."""
import os
try:
    from PIL import Image, ImageDraw, ImageFont
    HAS_PIL = True
except ImportError:
    HAS_PIL = False

os.makedirs("frontend/public/icons", exist_ok=True)

if HAS_PIL:
    for size in [192, 512]:
        img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        draw = ImageDraw.Draw(img)
        draw.rounded_rectangle([(0, 0), (size - 1, size - 1)], radius=size // 6, fill="#1e40af")
        try:
            font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", int(size * 0.55))
        except Exception:
            font = ImageFont.load_default()
        bbox = draw.textbbox((0, 0), "D", font=font)
        tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
        draw.text(((size - tw) / 2, (size - th) / 2 - bbox[1]), "D", fill="white", font=font)
        img.save(f"frontend/public/icons/icon-{size}.png")
        print(f"Created icon-{size}.png")
else:
    # Create minimal 1x1 PNG as placeholder
    import struct, zlib
    def make_png(size, color=(30, 64, 175)):
        def chunk(name, data):
            c = struct.pack(">I", len(data)) + name + data
            return c + struct.pack(">I", zlib.crc32(name + data) & 0xFFFFFFFF)
        sig = b"\x89PNG\r\n\x1a\n"
        ihdr = chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0))
        row = b"\x00" + bytes(color) * size
        raw = row * size
        idat = chunk(b"IDAT", zlib.compress(raw))
        iend = chunk(b"IEND", b"")
        return sig + ihdr + idat + iend

    for size in [192, 512]:
        with open(f"frontend/public/icons/icon-{size}.png", "wb") as f:
            f.write(make_png(size))
        print(f"Created placeholder icon-{size}.png")

print("Done.")
