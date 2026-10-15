import sys
from playwright.sync_api import sync_playwright
base,out=sys.argv[1],sys.argv[2]; errors=[]
with sync_playwright() as p:
    b=p.chromium.launch()
    ctx=b.new_context(viewport={"width":1440,"height":900},locale="pl-PL"); pg=ctx.new_page(); pg.on("pageerror",lambda e: errors.append(str(e)))
    pg.goto(base+"/"); pg.wait_for_selector(".login"); pg.screenshot(path=f"{out}/th-login.png")
    pg.fill("input[name=login]","kierownik"); pg.fill("input[name=password]","demo-cnc-2026"); pg.click("button[type=submit]"); pg.wait_for_selector("main")
    for name,h in [("centrum","#/dzisiaj"),("detale","#/analiza?t=detale"),("programisci","#/analiza?t=programisci"),("narzedzia","#/narzedzia"),("raporty","#/raporty"),("kalendarz","#/kalendarz"),("projekty","#/projekty"),("pracownicy","#/pracownicy")]:
        pg.goto(base+"/"+h); pg.wait_for_timeout(1100); pg.screenshot(path=f"{out}/th-{name}.png", full_page=(name in ("centrum","detale")))
    ctx.close()
    ctx=b.new_context(viewport={"width":412,"height":915},device_scale_factor=2,is_mobile=True,has_touch=True,locale="pl-PL"); pg=ctx.new_page(); pg.on("pageerror",lambda e: errors.append(str(e)))
    pg.goto(base+"/"); pg.wait_for_selector(".login"); pg.screenshot(path=f"{out}/th-tel-login.png")
    pg.fill("input[name=login]","adam"); pg.fill("input[name=password]","demo-cnc-2026"); pg.click("button[type=submit]"); pg.wait_for_selector("main"); pg.wait_for_timeout(1200)
    pg.screenshot(path=f"{out}/th-tel-adam.png")
    pg.click("#moreBtn"); pg.wait_for_timeout(400); pg.screenshot(path=f"{out}/th-tel-adam-menu.png")
    print("ADAM MENU:", pg.inner_text("#rail").replace("\n"," | "))
    print("TABBAR:", pg.inner_text(".tabbar").replace("\n"," | "))
    pg.goto(base+"/#/plan"); pg.wait_for_timeout(800); print("plan->", pg.url, pg.inner_text("h1"))
    pg.goto(base+"/#/zglos"); pg.wait_for_timeout(800); print("zglos->", pg.inner_text("h1"))
    b.close()
print("\n".join(errors) or "OK")
