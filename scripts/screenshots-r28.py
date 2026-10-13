import sys
from playwright.sync_api import sync_playwright
base, out, tag = sys.argv[1], sys.argv[2], sys.argv[3]; errors=[]
with sync_playwright() as p:
    b=p.chromium.launch()
    for (w,h,name,mob) in [(1440,1100,"pc",False),(1024,900,"lap",False),(412,915,"tel",True)]:
        ctx=b.new_context(viewport={"width":w,"height":h},device_scale_factor=1 if not mob else 2,is_mobile=mob,has_touch=mob,locale="pl-PL")
        pg=ctx.new_page(); pg.on("pageerror",lambda e: errors.append(str(e)))
        pg.goto(base+"/"); pg.fill("input[name=login]","kierownik"); pg.fill("input[name=password]","demo-cnc-2026"); pg.click("button[type=submit]"); pg.wait_for_selector("main")
        pg.goto(base+"/#/dzisiaj"); pg.wait_for_timeout(1200)
        pg.screenshot(path=f"{out}/{tag}-{name}.png", full_page=True)
        ctx.close()
    b.close()
print("\n".join(errors) or "OK")
