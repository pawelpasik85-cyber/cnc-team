"""Zrzuty kluczowych ekranów (narzędzie deweloperskie, opcjonalne: wymaga pakietu playwright dla Pythona).
Użycie: python scripts/screenshots.py http://127.0.0.1:3000 docs/screenshots
Zgłasza błędy konsoli przeglądarki — skrypt kończy się kodem 1, jeśli wystąpią."""
import sys
from playwright.sync_api import sync_playwright

base = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:3000"
out = sys.argv[2] if len(sys.argv) > 2 else "docs/screenshots"
PW = "demo-cnc-2026"
errors = []

PAGES_ADMIN = [
    ("01-dzisiaj", "#/dzisiaj"), ("02-kalendarz-miesiac", "#/kalendarz"), ("03-kalendarz-tydzien", "#/kalendarz?tryb=tydzien&data=2026-10-05"),
    ("04-zdarzenia", "#/zdarzenia"), ("05-pracownicy", "#/pracownicy"), ("06-wyjscia", "#/wyjscia"), ("07-wyjscia-wrzesien-zamkniety", "#/wyjscia?m=2026-09"),
    ("08-absencje", "#/absencje"), ("09-urlop-wypoczynkowy", "#/absencje?t=urlop"), ("10-sila-wyzsza-188", "#/absencje?t=jednostki"),
    ("11-katalog", "#/absencje?t=katalog"), ("12-projekty", "#/projekty"), ("13-projekt", "#/projekty/PRJ-2026-0001"), ("14-maszyny", "#/maszyny"),
    ("15-przekazanie", "#/przekazanie"), ("16-raport-plan-wykonanie", "#/raporty?r=plan_wykonanie"), ("17-raport-wyjscia", "#/raporty?r=wyjscia"),
    ("18-ustawienia-integracja", "#/ustawienia?t=integracja"), ("19-historia", "#/ustawienia?t=historia"),
]


def login(page, user):
    page.goto(base + "/")
    page.fill("input[name=login]", user)
    page.fill("input[name=password]", PW)
    page.click("button[type=submit]")
    page.wait_for_selector(".rail")


with sync_playwright() as p:
    b = p.chromium.launch()
    for user, pages, scheme in [("kierownik", PAGES_ADMIN, "light"), ("kierownik", [("20-dzisiaj-ciemny", "#/dzisiaj")], "dark"),
                                ("adam", [("21-pracownik-dzisiaj", "#/dzisiaj"), ("22-pracownik-kalendarz", "#/kalendarz"), ("23-pracownik-raporty-odmowa", "#/raporty")], "light")]:
        ctx = b.new_context(viewport={"width": 1440, "height": 1000}, color_scheme=scheme, locale="pl-PL", timezone_id="Europe/Warsaw")
        page = ctx.new_page()
        page.on("console", lambda m: errors.append(f"{m.type}: {m.text}") if m.type == "error" and "status of 401" not in m.text and "status of 403" not in m.text else None)
        page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
        login(page, user)
        for name, h in pages:
            page.goto(base + "/" + h)
            page.wait_for_timeout(700)
            bad = page.query_selector("main .notice.danger")
            if bad and "raporty-odmowa" not in name:
                errors.append(f"{name}: {bad.inner_text()}")
            page.screenshot(path=f"{out}/{name}.png", full_page=True)
        ctx.close()
    # okno formularza (admin)
    ctx = b.new_context(viewport={"width": 1440, "height": 1000}, locale="pl-PL")
    page = ctx.new_page()
    page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    login(page, "kierownik")
    page.goto(base + "/#/wyjscia")
    page.wait_for_timeout(600)
    page.click("#addMk")
    page.select_option("select[name=employee_id]", "1")
    page.wait_for_timeout(300)
    page.screenshot(path=f"{out}/24-formularz-odrabiania.png")
    page.keyboard.press("Escape")
    page.goto(base + "/#/absencje?t=urlop")
    page.wait_for_timeout(600)
    page.click("[data-adjust]")
    page.fill("input[name=minutes__h]", "8")
    page.wait_for_timeout(200)
    page.screenshot(path=f"{out}/25-korekta-urlopu.png")
    ctx.close()
    # telefon (Android, 412×915) — pracownik i administrator, menu, formularz; kontrola service workera
    for user, shots in [("adam", [("30-telefon-dzisiaj", "#/dzisiaj"), ("31-telefon-kalendarz", "#/kalendarz"), ("32-telefon-wyjscia", "#/wyjscia")]),
                        ("kierownik", [("33-telefon-maszyny", "#/maszyny"), ("34-telefon-projekt", "#/projekty/PRJ-2026-0001"), ("35-telefon-saldo", "#/wyjscia")])]:
        ctx = b.new_context(**p.devices["Pixel 7"], locale="pl-PL", timezone_id="Europe/Warsaw")
        page = ctx.new_page()
        page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
        login(page, user)
        for name, h in shots:
            page.goto(base + "/" + h)
            page.wait_for_timeout(700)
            page.screenshot(path=f"{out}/{name}.png", full_page=False)
        if user == "kierownik":
            page.click("#menuBtn")
            page.wait_for_timeout(300)
            page.screenshot(path=f"{out}/36-telefon-menu.png")
            page.keyboard.press("Escape")
            page.goto(base + "/#/wyjscia")
            page.wait_for_timeout(600)
            page.click("#addExit")
            page.wait_for_timeout(300)
            page.screenshot(path=f"{out}/37-telefon-formularz.png")
            sw = page.evaluate("navigator.serviceWorker ? navigator.serviceWorker.ready.then(r => !!r.active) : false")
            if not sw:
                errors.append("service worker nie jest aktywny")
            man = page.evaluate("fetch('/manifest.webmanifest').then(r => r.json()).then(m => m.display + '|' + m.icons.length)")
            if man != "standalone|3":
                errors.append(f"manifest: {man}")
        ctx.close()
    b.close()

print("\n".join(errors) if errors else "Brak błędów konsoli.")
sys.exit(1 if errors else 0)
