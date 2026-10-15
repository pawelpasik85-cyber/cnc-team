import sys
from playwright.sync_api import sync_playwright
base,out=sys.argv[1],sys.argv[2]; errors=[]
with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={"width":1440,"height":1000},locale="pl-PL",accept_downloads=True); pg=ctx.new_page(); pg.on("pageerror",lambda e: errors.append(str(e)))
    pg.on("console", lambda m: errors.append("console: "+m.text) if m.type=="error" else None)
    pg.goto(base+"/"); pg.fill("input[name=login]","kierownik"); pg.fill("input[name=password]","demo-cnc-2026"); pg.click("button[type=submit]"); pg.wait_for_selector("main")
    rail=pg.inner_text("#rail"); print("RAIL:", rail.replace("\n"," | "))
    for t in ["programisci","detale","struktura","maszyny","miesiac","rok"]:
        pg.goto(base+f"/#/analiza?t={t}"); pg.wait_for_timeout(1200)
        pg.screenshot(path=f"{out}/an-{t}.png", full_page=True)
        for kind in ["pdf","png"]:
            with pg.expect_download() as dl:
                pg.click(f"[data-export={kind}]")
            d=dl.value; d.save_as(f"{out}/exp-{t}.{kind}")
    pg.goto(base+"/#/raporty?r=obecnosc"); pg.wait_for_timeout(1000)
    with pg.expect_download() as dl: pg.click("[data-export=pdf]")
    dl.value.save_as(f"{out}/exp-raport-obecnosc.pdf")
    with pg.expect_download() as dl: pg.click("[data-export=png]")
    dl.value.save_as(f"{out}/exp-raport-obecnosc.png")
    b.close()
print("\n".join(errors) or "OK")
