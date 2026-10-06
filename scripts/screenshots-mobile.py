"""Zrzuty aplikacji pracownika (narzędzie deweloperskie). Wymaga Playwright dla Pythona.
Użycie: python scripts/screenshots-mobile.py http://127.0.0.1:8099 docs/screenshots  (serwer z atrapą chmury)"""
import sys
from playwright.sync_api import sync_playwright

base, out = sys.argv[1], sys.argv[2]
errors = []
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(**p.devices["Pixel 7"], locale="pl-PL", timezone_id="Europe/Warsaw")
    page = ctx.new_page()
    page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    page.on("console", lambda m: errors.append(f"console: {m.text}") if m.type == "error" else None)
    page.goto(base + "/")
    page.wait_for_selector("#lf")
    page.screenshot(path=f"{out}/40-pracownik-logowanie.png")
    page.fill("input[name=email]", "adam@firma.pl")
    page.fill("input[name=password]", "haslo-123456")
    page.check("input[name=first]")
    page.click("button[type=submit]")
    page.wait_for_selector(".tabbar")
    page.wait_for_timeout(800)
    page.screenshot(path=f"{out}/41-pracownik-start.png")
    page.click("[data-tab=zglos]")
    page.click("label.kind:nth-of-type(2)")
    page.fill("input[name=time_to_late]", "06:40")
    page.fill("textarea[name=note]", "Korek na A4")
    page.screenshot(path=f"{out}/42-pracownik-zgloszenie.png")
    page.click("#rf button[type=submit]")
    page.wait_for_timeout(1200)
    page.screenshot(path=f"{out}/43-pracownik-po-wyslaniu.png")
    page.click("[data-tab=grafik]")
    page.wait_for_timeout(300)
    page.screenshot(path=f"{out}/44-pracownik-grafik.png")
    page.click("[data-tab=moje]")
    page.wait_for_timeout(300)
    page.screenshot(path=f"{out}/45-pracownik-moje.png", full_page=True)
    # tryb offline: zgłoszenie trafia do kolejki
    ctx.set_offline(True)
    page.click("[data-tab=zglos]")
    page.fill("input[name=date_from]", "2026-10-09")
    page.click("#rf button[type=submit]")
    page.wait_for_timeout(800)
    page.screenshot(path=f"{out}/46-pracownik-offline.png")
    q = page.evaluate("JSON.parse(localStorage.getItem('cnc.outbox') || '[]').length")
    if q != 1:
        errors.append(f"kolejka offline: {q}")
    ctx.set_offline(False)
    page.evaluate("window.dispatchEvent(new Event('online'))")
    page.wait_for_timeout(1500)
    q = page.evaluate("JSON.parse(localStorage.getItem('cnc.outbox') || '[]').length")
    if q != 0:
        errors.append(f"kolejka po połączeniu: {q}")
    b.close()
errors = [e for e in errors if "Failed to load resource" not in e]
print("\n".join(errors) if errors else "Brak błędów.")
sys.exit(1 if errors else 0)
