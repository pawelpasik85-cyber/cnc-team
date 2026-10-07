"""Generuje ikony aplikacji (PWA / ekran główny telefonu) z logo w public/brand.js (frez w rzucie izometrycznym).
Narzędzie deweloperskie: wymaga Pythona + Playwright. Użycie: python scripts/make-icons.py → public/icons/*.png, public/favicon.svg"""
import os, re, subprocess, json
from playwright.sync_api import sync_playwright

ROOT = os.path.join(os.path.dirname(__file__), "..")
OUT = os.path.join(ROOT, "public", "icons")
js = """
global.esc = s => String(s);
eval(require('fs').readFileSync(process.argv[1], 'utf8') + ';process.stdout.write(appLogo(64));');
"""
svg = subprocess.check_output(["node", "-e", js, os.path.join(ROOT, "public", "brand.js")]).decode()
svg = re.sub(r'\s(width|height|style)="[^"]*"', "", svg, count=3)
svg = svg.replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" ', 1)
open(os.path.join(ROOT, "public", "favicon.svg"), "w").write(svg)


def page_html(size, bleed):
    inner = size if not bleed else int(size * 0.78)
    bg = "#1b2024" if bleed else "transparent"
    return f'<html><body style="margin:0;width:{size}px;height:{size}px;background:{bg};display:flex;align-items:center;justify-content:center">' \
           f'<div style="width:{inner}px;height:{inner}px">{svg.replace("<svg ", "<svg width=%d height=%d " % (inner, inner), 1)}</div></body></html>'


with sync_playwright() as p:
    b = p.chromium.launch()
    for name, size, bleed, transparent in [("icon-192.png", 192, False, True), ("icon-512.png", 512, False, True), ("icon-maskable-512.png", 512, True, False), ("apple-touch-icon.png", 180, False, False)]:
        pg = b.new_page(viewport={"width": size, "height": size})
        html = page_html(size, bleed)
        if not transparent and not bleed:
            html = html.replace("background:transparent", "background:#1b2024")
        pg.set_content(html)
        pg.screenshot(path=os.path.join(OUT, name), omit_background=transparent)
        pg.close()
    b.close()
print("Ikony zapisane w public/icons, favicon.svg zaktualizowany.")
