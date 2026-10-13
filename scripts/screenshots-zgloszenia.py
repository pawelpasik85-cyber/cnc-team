import sys
from playwright.sync_api import sync_playwright
base, out = sys.argv[1], sys.argv[2]; errors=[]
with sync_playwright() as p:
    b=p.chromium.launch()
    for login, mobile, name, h in [("adam", True, "150-tel-moje-zgloszenia", "#/zglos"), ("kierownik", False, "151-kierownik-zgloszenia", "#/zgloszenia")]:
        ctx=b.new_context(viewport={"width":412,"height":915},device_scale_factor=2,is_mobile=True,has_touch=True,locale="pl-PL") if mobile else b.new_context(viewport={"width":1440,"height":1000},locale="pl-PL")
        pg=ctx.new_page(); pg.on("pageerror",lambda e: errors.append(str(e)))
        pg.goto(base+"/"); pg.fill("input[name=login]",login); pg.fill("input[name=password]","demo-cnc-2026"); pg.click("button[type=submit]"); pg.wait_for_selector("main")
        pg.goto(base+"/"+h); pg.wait_for_timeout(900)
        if pg.locator(".req-badge").count()==0: errors.append("brak symboli: "+login)
        if mobile: pg.locator("text=Moje zgłoszenia").scroll_into_view_if_needed(); pg.wait_for_timeout(200); pg.screenshot(path=f"{out}/{name}.png")
        else: pg.screenshot(path=f"{out}/{name}.png", full_page=True)
        ctx.close()
    b.close()
print("\n".join(errors) or "OK")
