"""Zrzuty: runda 23 — plan pracy wg maszyn, kolory urlopów, karta pracownika, narzędzia. Użycie: python scripts/screenshots-r23.py http://127.0.0.1:3000 docs/screenshots"""
import sys
from playwright.sync_api import sync_playwright
base, out = sys.argv[1], sys.argv[2]
errors = []
def mk(b, mobile=False):
    ctx = b.new_context(viewport={"width": 412, "height": 915}, device_scale_factor=2, is_mobile=True, has_touch=True, locale="pl-PL") if mobile else b.new_context(viewport={"width": 1440, "height": 1000}, locale="pl-PL")
    pg = ctx.new_page()
    pg.on("console", lambda m: errors.append(m.text) if m.type == "error" and "status of 4" not in m.text else None)
    pg.on("pageerror", lambda e: errors.append(str(e)))
    return ctx, pg
def login(pg, u):
    pg.goto(base + "/"); pg.fill("input[name=login]", u); pg.fill("input[name=password]", "demo-cnc-2026"); pg.click("button[type=submit]"); pg.wait_for_selector("main")
def shot(pg, name, h=None, full=True, settle=800):
    if h: pg.goto(base + "/" + h)
    pg.wait_for_timeout(settle); pg.screenshot(path=f"{out}/{name}.png", full_page=full)
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx, pg = mk(b); login(pg, "kierownik")
    shot(pg, "130-plan-maszyny", "#/plan?d=2026-10-06")
    if pg.locator(".pm-group").count() < 4: errors.append("brak grup maszyn w planie")
    pg.click(".pm-other-add >> nth=0"); pg.wait_for_selector("dialog[open]"); shot(pg, "131-plan-inna-praca", full=False)
    pg.click("dialog[open] [data-close]")
    shot(pg, "132-pracownicy", "#/pracownicy")
    shot(pg, "133-kalendarz-kolory", "#/kalendarz?tryb=tydzien&data=2026-10-05", full=False)
    shot(pg, "134-urlopy-kolory", "#/absencje")
    shot(pg, "135-narzedzia-frezy", "#/narzedzia?rodzaj=frez", full=False)
    ctx.close()
    ctx, pg = mk(b, True); login(pg, "adam")
    shot(pg, "136-tel-plan-programista", "#/plan?d=2026-10-06", full=False)
    shot(pg, "137-tel-profil", "#/pracownicy", full=False)
    shot(pg, "138-tel-narzedzia", "#/narzedzia?rodzaj=frez", full=False)
    ctx.close(); b.close()
print("\n".join(errors) or "OK")
