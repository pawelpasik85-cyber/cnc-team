"""Zrzuty i klikanie: runda 24 — okienka w kalendarzu, inna praca w planie, prośba o urlop. Użycie: python scripts/screenshots-r24.py http://127.0.0.1:3000 docs/screenshots"""
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
    # plan: „Inna praca” — okno otwierane, szybkie dodanie obowiązku
    pg.goto(base + "/#/plan?d=2026-10-07"); pg.wait_for_selector(".pm-group")
    pg.click("details.pm-closed >> nth=0 >> summary"); pg.wait_for_timeout(200)
    shot(pg, "140-plan-inna-praca-okno", full=False)
    pg.fill("details.pm-closed[open] input[name=title] >> nth=0", "Szkolenie BHP — 1 h"); pg.fill("details.pm-closed[open] input[name=h] >> nth=0", "1")
    pg.click("details.pm-closed[open] button[type=submit] >> nth=0"); pg.wait_for_timeout(900)
    if "Szkolenie BHP" not in pg.inner_text("main"): errors.append("szybkie dodanie innej pracy nie zadziałało")
    shot(pg, "141-plan-inna-praca-dodana")
    # kalendarz: kliknięcie nieobecności i tematu na maszynie
    pg.goto(base + "/#/kalendarz?tryb=tydzien&data=2026-10-05"); pg.wait_for_selector(".cal")
    pg.click(".cal .ev-tag[data-ev] >> nth=0"); pg.wait_for_selector("dialog.info-dialog[open]"); shot(pg, "142-kalendarz-nieobecnosc-okno", full=False)
    if pg.locator("dialog[open][data-shift], dialog[open] form [name=shift_template_id]").count(): errors.append("kliknięcie tagu otworzyło edycję zmiany")
    pg.click("dialog.info-dialog[open] [data-close] >> nth=0")
    pg.click(".cal .mc-open >> nth=0"); pg.wait_for_selector("dialog.info-dialog[open]"); pg.wait_for_timeout(400); shot(pg, "143-kalendarz-temat-okno", full=False)
    pg.click("dialog.info-dialog[open] [data-close] >> nth=0")
    ctx.close()
    ctx, pg = mk(b); login(pg, "przelozony")
    pg.goto(base + "/#/kalendarz?tryb=tydzien&data=2026-10-05"); pg.wait_for_selector(".cal")
    if pg.locator(".cal .mc-open").count() == 0: errors.append("przełożony nie ma klikalnych tematów")
    pg.click(".cal .mc-open >> nth=0"); pg.wait_for_selector("dialog.info-dialog[open]"); pg.wait_for_timeout(300)
    ctx.close()
    ctx, pg = mk(b, True); login(pg, "adam")
    pg.goto(base + "/#/kalendarz?tryb=tydzien&data=2026-10-05"); pg.wait_for_timeout(700)
    if pg.locator(".cal .mc-open").count(): errors.append("programista ma klikalne tematy maszyn")
    shot(pg, "144-tel-plan-programista", "#/plan?d=2026-10-06", full=False)
    if pg.locator(".pm-group.theme-grimme").count() == 0: errors.append("brak okna Grimme u programisty")
    pg.goto(base + "/#/zglos"); pg.wait_for_selector("[data-kind=urlop]")
    pg.click("[data-kind=urlop]"); pg.check("input[name=lmode][value=dni]"); pg.fill("input[name=date_from]", "2026-10-12"); pg.fill("input[name=days]", "5"); pg.wait_for_timeout(200)
    shot(pg, "145-tel-zglos-urlop", full=False)
    if "16.10.2026" not in pg.inner_text(".leave-sum"): errors.append("zła data końca: " + pg.inner_text(".leave-sum"))
    pg.click("#reqF button[type=submit]"); pg.wait_for_timeout(900)
    txt = pg.inner_text("main")
    if "Urlop" not in txt or "5 dni rob." not in txt: errors.append("zgłoszenie urlopu nie widoczne")
    shot(pg, "146-tel-zglos-wyslane", full=False)
    ctx.close(); b.close()
print("\n".join(errors) or "OK")
