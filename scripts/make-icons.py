"""Generuje ikony aplikacji (PWA / ekran główny telefonu) — własny rysunek frezu, bez zewnętrznych zasobów.
Użycie: python scripts/make-icons.py  → public/icons/*.png"""
from PIL import Image, ImageDraw
import os

OUT = os.path.join(os.path.dirname(__file__), "..", "public", "icons")
os.makedirs(OUT, exist_ok=True)
GRAPHITE = (35, 40, 45, 255)
TEAL = (43, 179, 177, 255)


def draw(size, maskable=False, rounded=True):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if maskable or not rounded:
        d.rectangle([0, 0, size, size], fill=GRAPHITE)
    else:
        d.rounded_rectangle([0, 0, size - 1, size - 1], radius=int(size * 0.18), fill=GRAPHITE)
    # strefa bezpieczna: maskowalna 60%, zwykła 76%
    scale = size * (0.60 if maskable else 0.76) / 24
    off = (size - 24 * scale) / 2
    p = lambda x, y: (off + x * scale, off + y * scale)
    w = max(2, int(1.9 * scale))
    # chwyt
    d.rectangle([p(10, 2), p(14, 8)], outline=TEAL, width=w)
    # część robocza z ostrzem
    d.line([p(9, 8), p(15, 8), p(15, 19), p(12, 22), p(9, 19), p(9, 8)], fill=TEAL, width=w, joint="curve")
    # rowki spiralne
    for y in (11, 14, 17):
        d.line([p(9, y), p(15, y + 2)], fill=TEAL, width=w)
    return img


for name, size, mask, rounded in [("icon-192.png", 192, False, True), ("icon-512.png", 512, False, True),
                                   ("icon-maskable-512.png", 512, True, False), ("apple-touch-icon.png", 180, False, False)]:
    draw(size, mask, rounded).save(os.path.join(OUT, name))
print("ikony zapisane w", os.path.abspath(OUT))
