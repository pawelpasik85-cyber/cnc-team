"""Zrzuty ekranów: zgłoszenia do weryfikacji, gość, opóźnienie projektów, historia zmian (runda 3).
Użycie: python scripts/screenshots-v3.py http://127.0.0.1:3000 docs/screenshots — kod 1 przy błędach konsoli."""
import sys
from playwright.sync_api import sync_playwright

base = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:3000"
out = sys.argv[2] if len(sys.argv) > 2 else "docs/screenshots"
PW = "demo-cnc-2026"
errors = []


def ctx_page(b, mobile=False):
    if mobile:
        ctx = b.new_context(viewport={"width": 412, "height": 915}, device_scale_factor=2.625, is_mobile=True, has_touch=True, locale="pl-PL", timezone_id="Europe/Warsaw")
    else:
        ctx = b.new_context(viewport={"width": 1440, "height": 1000}, locale="pl-PL", timezone_id="Europe/Warsaw")
    page = ctx.new_page()
    page.on("console", lambda m: errors.append(f"{m.type}: {m.text}") if m.type == "error" and "status of 4" not in m.text else None)
    page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    return ctx, page


def login(page, user, pw=PW, wait=".rail"):
    page.goto(base + "/")
    page.fill("input[name=login]", user)
    page.fill("input[name=password]", pw)
    page.click("button[type=submit]")
    if wait:
        page.wait_for_selector(wait)


def shot(page, name, h=None, full=True, settle=500):
    if h is not None:
        page.goto(base + "/" + h)
    page.wait_for_timeout(settle)
    page.screenshot(path=f"{out}/{name}.png", full_page=full)


with sync_playwright() as p:
    b = p.chromium.launch()
    # Kierownik
    ctx, page = ctx_page(b)
    login(page, "kierownik")
    shot(page, "50-kierownik-zgloszenia", "#/zgloszenia")
    page.click("[data-racc]")
    page.wait_for_selector("dialog[open]")
    shot(page, "51-kierownik-przyjecie-odrobienia", full=False)
    page.click("dialog[open] [data-close]")
    shot(page, "52-projekty-opoznienie", "#/projekty")
    page.goto(base + "/#/projekty/PRJ-2026-0001")
    page.wait_for_selector("#loadHist")
    page.click("#loadHist")
    page.wait_for_timeout(600)
    shot(page, "53-projekt-historia")
    shot(page, "54-konta-gosc", "#/ustawienia?t=konta")
    shot(page, "55-historia-zmian", "#/ustawienia?t=historia", full=False)
    shot(page, "56-kierownik-dzisiaj", "#/dzisiaj")
    ctx.close()
    # Pracownik — komputer i telefon
    ctx, page = ctx_page(b)
    login(page, "celina")
    shot(page, "57-pracownik-zglos", "#/zglos")
    shot(page, "58-pracownik-projekty-tylko-swoje", "#/projekty")
    shot(page, "66-pracownik-projekt-szczegoly", "#/projekty/PRJ-2026-0001")
    page.goto(base + "/#/projekty/PRJ-2026-0003")
    page.wait_for_timeout(600)
    if "Brak uprawnień" not in page.inner_text("main"):
        errors.append("pracownica widzi nieprzypisany projekt PRJ-2026-0003")
    ctx.close()
    ctx, page = ctx_page(b, mobile=True)
    login(page, "bartosz", wait=".shell")
    shot(page, "59-telefon-pracownik-dzisiaj", "#/dzisiaj")
    page.goto(base + "/#/zglos")
    page.wait_for_selector("[data-kind=spoznienie]")
    page.click("[data-kind=spoznienie]")
    page.fill("input[name=time_to]", "07:20")
    page.fill("textarea[name=note]", "Awaria samochodu")
    shot(page, "60-telefon-zglos-spoznienie", full=True)
    page.click("#reqF button[type=submit]")
    page.wait_for_timeout(800)
    shot(page, "61-telefon-po-wyslaniu")
    ctx.close()
    # Gość
    ctx, page = ctx_page(b)
    login(page, "gosc")
    shot(page, "62-gosc-status")
    page.click("details summary")
    shot(page, "63-gosc-etapy")
    ctx.close()
    ctx, page = ctx_page(b, mobile=True)
    login(page, "gosc", wait=".shell")
    shot(page, "64-telefon-gosc")
    ctx.close()
    # Blokada logowania
    ctx, page = ctx_page(b)
    for _ in range(6):
        login(page, "kierownik-test", pw="zle-haslo-123", wait=None)
        page.wait_for_timeout(250)
    shot(page, "65-blokada-logowania", full=False)
    ctx.close()
    b.close()

if errors:
    print("Błędy konsoli:")
    for e in errors:
        print("  " + e)
    sys.exit(1)
print("Brak błędów konsoli.")
