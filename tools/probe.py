"""Headless probe: load the game, record console errors and network requests, report state."""
import sys, json, asyncio
from playwright.async_api import async_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8099/index.html"
WAIT = float(sys.argv[2]) if len(sys.argv) > 2 else 3.0

async def main():
    logs, errs, reqs = [], [], []
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(args=["--use-gl=swiftshader", "--enable-unsafe-swiftshader"])
        page = await browser.new_page(viewport={"width": 1280, "height": 720})
        page.on("console", lambda m: (logs.append(f"{m.type}: {m.text}"), errs.append(m.text) if m.type == "error" else None))
        page.on("pageerror", lambda e: errs.append(f"pageerror: {e}"))
        page.on("request", lambda r: reqs.append(r.url))
        await page.goto(URL, wait_until="load")
        await page.wait_for_timeout(int(WAIT * 1000))
        info = await page.evaluate("""() => {
            const g = window.__game;
            if (!g) return { ready: false };
            return {
                ready: true,
                state: g.state,
                time: g.time,
                player: { x: Math.round(g.player.x), y: Math.round(g.player.y), hp: g.player.health, inCar: !!g.player.inCar },
                vehicles: g.vehicles.length,
                peds: g.peds.length,
                cops: g.cops.length,
                wanted: g.wanted.stars,
                money: g.economy.money,
                objective: g.missions.objective(),
                shotReady: !!window.__shotReady,
                shotError: window.__shotError || null,
                canvas: [document.getElementById('game').width, document.getElementById('game').height],
            };
        }""")
        await browser.close()
    print(json.dumps({"info": info, "errors": errs[:20], "requests": sorted(set(reqs))[:20], "console": logs[:20]}, indent=1))

asyncio.run(main())
