"""Zrzuty: Narzędzia i oprawki (rundy 18–19). Użycie: python scripts/screenshots-tools.py http://127.0.0.1:3000 docs/screenshots — kod 1 przy błędach."""
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
    pg.goto(base + "/"); pg.fill("input[name=login]", u); pg.fill("input[name=password]", "demo-cnc-2026"); pg.click("button[type=submit]"); pg.wait_for_selector(".rail")
def shot(pg, name, h=None, full=True, settle=600):
    if h: pg.goto(base + "/" + h)
    pg.wait_for_timeout(settle); pg.screenshot(path=f"{out}/{name}.png", full_page=full)
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx, pg = mk(b); login(pg, "kierownik")
    for k, n in [("oprawka", "110-narzedzia-oprawki"), ("glowica", "111-narzedzia-glowice"), ("plytka", "112-narzedzia-plytki"), ("frez", "113-narzedzia-frezy")]:
        shot(pg, n, f"#/narzedzia?rodzaj={k}")
    pg.goto(base + "/#/narzedzia?rodzaj=glowica"); pg.wait_for_timeout(500)
    pg.click(".tl-card .tl-pic >> nth=0"); pg.wait_for_selector("dialog[open]"); shot(pg, "114-narzedzia-szczegoly", full=False)
    pg.click("dialog[open] [data-act=edit]"); pg.wait_for_selector("dialog[open] .tl-preview svg"); shot(pg, "115-narzedzia-edycja", full=False)
    pg.fill("dialog[open] input[name=location]", "Szafa G / półka 5"); pg.fill("dialog[open] input[name=reason]", "przeniesiona"); pg.click("dialog[open] button[type=submit]"); pg.wait_for_timeout(800)
    if pg.locator("dialog[open]").count(): errors.append("edycja nie zapisała: " + pg.inner_text("dialog[open] .form-error"))
    loc = pg.evaluate("fetch('/api/tools').then(r=>r.json()).then(l=>l.find(t=>t.name==='Głowica Ø32 RDMT10'))")
    if loc["location"] != "Szafa G / półka 5" or loc["params"]["insert_code"] != "RDMT10" or loc["params"]["D"] != 32: errors.append("zły zapis: " + str(loc))
    pg.goto(base + "/#/narzedzia?rodzaj=frez"); pg.wait_for_timeout(400); pg.click("#addTool"); pg.wait_for_selector("dialog[open]")
    pg.fill("dialog[open] input[name=name]", "Wiertło Ø5 ostre"); pg.select_option("dialog[open] select[name=p_type]", "wiertlo"); pg.fill("dialog[open] input[name=p_D]", "5"); pg.fill("dialog[open] input[name=p_angle]", "30"); pg.fill("dialog[open] input[name=p_z]", "2"); pg.fill("dialog[open] input[name=p_Lc]", "10"); pg.fill("dialog[open] input[name=p_L]", "60")
    pg.dispatch_event("dialog[open] form", "change"); pg.wait_for_timeout(200); shot(pg, "117-narzedzia-nowy-podglad", full=False)
    pg.click("dialog[open] button[type=submit]"); pg.wait_for_timeout(800)
    if pg.locator("dialog[open]").count(): errors.append("dodanie nie zapisało: " + pg.inner_text("dialog[open] .form-error"))
    pg.goto(base + "/#/narzedzia?rodzaj=frez&szukaj=szyjka"); pg.wait_for_timeout(500); pg.click(".tl-card .tl-pic >> nth=0"); pg.wait_for_selector("dialog[open]"); shot(pg, "118-narzedzia-frez-wymiary", full=False)
    pg.click("dialog[open] [data-act=edit]"); pg.wait_for_selector("dialog[open] .tl-preview svg"); shot(pg, "119-narzedzia-frez-formularz", full=False)
    ctx.close()
    ctx, pg = mk(b, True); login(pg, "adam")
    shot(pg, "116-narzedzia-programista-telefon", "#/narzedzia?rodzaj=frez", full=False)
    if pg.locator("#addTool").count(): errors.append("programista widzi przycisk dodawania")
    if pg.locator('a[data-nav="narzedzia"]').count() == 0: errors.append("brak w menu programisty")
    ctx.close(); b.close()
print("\n".join(errors) or "OK")
sys.exit(1 if errors else 0)
