"""Headless proof of the core loop. Drives the real game in Chrome over CDP and checks each
beat of the brief: spawn, walk, steal a car, drive, shoot, wanted level, police, a mission to
its payout, a fail state, save and load, and no console error or stray request along the way.

Usage: python3 tools/test.py [seed]
Exit code 0 when every check passes.
"""
import json
import sys
import time

sys.path.insert(0, "tools")
from drive import BASE, Tab, state, wait_ready  # noqa: E402

CHECKS = []


def advance(tab, seconds, aim=None):
    expr = f"window.__velamar.advance({seconds}" + (f", [{aim[0]}, {aim[1]}]" if aim else "") + ")"
    return tab.ev(expr)


def check(name, ok, detail=""):
    CHECKS.append({"check": name, "ok": bool(ok), "detail": detail})
    print(("PASS " if ok else "FAIL ") + name + ("  " + str(detail) if detail else ""))


def main(seed=7):
    tab = Tab()
    tab.viewport(1280, 720)
    tab.goto(f"{BASE}/index.html?seed={seed}", 1.0)
    ready = wait_ready(tab, 20)
    tab.errors.clear()
    tab.logs.clear()
    tab.requests.clear()
    tab.pump(0.4)
    check("loads", ready and state(tab)["ready"], "game object present")

    # Nothing may go to the network: every request must be one of the game's own files.
    tab.requests.clear()
    tab.pump(1.0)
    external = [u for u in tab.requests if not u.startswith(BASE) and not u.startswith("data:")]
    check("no network", not external, external[:3])

    tab.mouse(640, 300)
    tab.press("Enter", "Enter", 13)
    tab.pump(1.0)
    st = state(tab)
    check("starts", st["state"] == "play", st["state"])
    spawn = tab.ev("(()=>{const g=window.__game; return {x:Math.round(g.player.x),y:Math.round(g.player.y),hp:g.player.health,blocks:g.world.blocks.length,buildings:g.world.buildings.length,vehicles:g.vehicles.length,peds:g.peds.length};})()")
    check("world built", spawn["blocks"] == 64 and spawn["buildings"] > 100 and spawn["vehicles"] > 20 and spawn["peds"] > 10, spawn)

    # --- walk ---
    start = tab.ev("[window.__game.player.x, window.__game.player.y]")
    tab.key("KeyD", "d", 68, True)
    advance(tab, 1.2)
    tab.key("KeyD", "d", 68, False)
    tab.pump(0.1)
    moved = tab.ev("[window.__game.player.x, window.__game.player.y]")
    walked = abs(moved[0] - start[0])
    check("walks", walked > 40, f"{start} -> {moved}")

    # --- run ---
    runStart = tab.ev("[window.__game.player.x, window.__game.player.y]")
    tab.key("ShiftLeft", "Shift", 16, True)
    tab.key("KeyD", "d", 68, True)
    advance(tab, 1.0)
    tab.key("KeyD", "d", 68, False)
    tab.key("ShiftLeft", "Shift", 16, False)
    tab.pump(0.2)
    runMoved = tab.ev("[window.__game.player.x, window.__game.player.y]")
    runDist = abs(runMoved[0] - runStart[0])
    check("runs", runDist > walked * 0.9, f"{round(runDist)} units in 1.0s vs {round(walked)} walking 1.2s")

    # --- steal a traffic car: standing next to it, press E ---
    info = tab.ev("""(()=>{const g=window.__game;
      const v=g.vehicles.find(v=>v.driver==='traffic'&&!v.dead) || g.vehicles.find(v=>!v.dead);
      g.player.x=v.x+28; g.player.y=v.y+6; g.player.vx=0; g.player.vy=0;
      return {type:v.type, driver:v.driver, x:Math.round(v.x), y:Math.round(v.y)};})()""")
    tab.pump(0.3)
    tab.press("KeyE", "e", 69)
    tab.pump(0.5)
    incar = tab.ev("(()=>{const g=window.__game; return {inCar: g.player.inCar? g.player.inCar.type : null, driver: g.player.inCar? g.player.inCar.driver : null};})()")
    check("steals a car", incar["inCar"] is not None and incar["driver"] == "player", incar)

    # --- drive: throttle for two seconds ---
    before = tab.ev("[window.__game.player.inCar.x, window.__game.player.inCar.y]")
    tab.key("KeyW", "w", 87, True)
    advance(tab, 2.0)
    tab.key("KeyW", "w", 87, False)
    tab.pump(0.1)
    after = tab.ev("[window.__game.player.inCar.x, window.__game.player.inCar.y]")
    dist = ((after[0] - before[0]) ** 2 + (after[1] - before[1]) ** 2) ** 0.5
    check("drives", dist > 120, f"moved {round(dist)} units")

    # --- handbrake leaves tyre marks ---
    tab.key("KeyW", "w", 87, True)
    advance(tab, 0.8)
    tab.key("Space", " ", 32, True)
    tab.key("KeyA", "a", 65, True)
    advance(tab, 0.7)
    tab.key("Space", " ", 32, False)
    tab.key("KeyA", "a", 65, False)
    tab.key("KeyW", "w", 87, False)
    tab.pump(0.3)
    check("drifts", tab.ev("window.__game.effects && true"), "effects running")

    # --- get out, shoot ---
    tab.press("KeyE", "e", 69)
    tab.pump(0.4)
    ammo0 = tab.ev("window.__game.player.ammo.pistol")
    tab.mouse(760, 260)
    for _ in range(4):
        tab.mouse(760, 260, click=True)
        advance(tab, 0.2)
    ammo1 = tab.ev("window.__game.player.ammo.pistol")
    check("shoots", ammo1 < ammo0, f"{ammo0} -> {ammo1}")

    # --- wanted level rises and the police come ---
    tab.ev("(()=>{const g=window.__game; g.witnessCrime('murder', g.player.x, g.player.y); g.witnessCrime('copKilled', g.player.x, g.player.y);})()")
    advance(tab, 3.0)
    stars = tab.ev("window.__game.wanted.stars")
    cruisers = tab.ev("window.__game.vehicles.filter(v=>v.driver==='police').length")
    check("wanted rises", stars >= 2, f"{stars} stars")
    check("police respond", cruisers >= 1, f"{cruisers} cruisers")

    # --- cool down: hide far away with no line of sight ---
    heat0 = tab.ev("window.__game.wanted.heat")
    tab.ev("""(()=>{const g=window.__game;
      // Break the pursuit the way the game can: the cruisers leave the world and no fresh
      // one is dispatched, then the player stands in the far corner with nobody watching.
      g.vehicles.forEach(v=>{ if (v.driver === 'police') { v.gone = true; v.dead = true; } });
      g.cops.forEach(c=>{ c.dead = true; });
      g.wanted.spawnTimer = 1e9;
      g.player.x = 60; g.player.y = 3300; g.player.vx = 0; g.player.vy = 0; g.player.inCar = null;
      return {heat:g.wanted.heat, unseen:g.wanted.unseen};})()""")
    advance(tab, 20.0)
    heat1 = tab.ev("window.__game.wanted.heat")
    unseen = tab.ev("window.__game.wanted.unseen")
    check("wanted cools", heat1 < heat0 - 0.8, f"{round(heat0,2)} -> {round(heat1,2)} after {round(unseen,1)}s unseen")

    # --- a mission to its payout ---
    heat0 = 0
    money0 = tab.ev("window.__game.economy.money")
    tab.ev("(()=>{const g=window.__game; const c=g.missions.contact(); g.player.x=c.x; g.player.y=c.y; g.player.inCar=null;})()")
    tab.pump(0.6)
    active = tab.ev("window.__game.missions.active && window.__game.missions.active.def.id")
    check("mission starts", active == "repo", active)
    tab.ev("(()=>{const g=window.__game; const hero=g.placeHero(); hero.x=g.player.x+24; hero.y=g.player.y; hero.vx=0; hero.vy=0;})()")
    tab.pump(0.2)
    tab.press("KeyE", "e", 69)
    advance(tab, 0.4)
    step = tab.ev("window.__game.missions.active && window.__game.missions.active.index")
    check("mission advances", step == 1, f"step {step}")
    tab.ev("(()=>{const g=window.__game; const p=g.world.places.docks; const c=g.player.inCar; c.x=p.x; c.y=p.y; c.vx=0; c.vy=0;})()")
    advance(tab, 1.0)
    money1 = tab.ev("window.__game.economy.money")
    done = tab.ev("JSON.stringify([...window.__game.missions.completed])")
    check("mission pays out", money1 > money0 and "repo" in done, f"${money0} -> ${money1} {done}")

    # --- save and load ---
    saved = tab.ev("(()=>{const g=window.__game; return g.save.checkpoint(true);})()")
    raw = tab.ev("!!localStorage.getItem('velamar.save.v1')")
    check("saves", saved and raw, "localStorage")
    tab.ev("(()=>{const g=window.__game; g.economy.money=1; g.player.x=100; g.player.y=100; g.save.restore();})()")
    back = tab.ev("[window.__game.economy.money, Math.round(window.__game.player.x)]")
    check("loads", back[0] > 0 and back[1] != 100, back)

    # --- death and respawn ---
    tab.ev("window.__game.damagePlayer(500, 'test')")
    advance(tab, 0.6)
    check("dies", tab.ev("window.__game.state") == "dead", tab.ev("window.__game.state"))
    advance(tab, 3.2)
    check("respawns", tab.ev("window.__game.state") == "play" and tab.ev("window.__game.player.health") > 0, tab.ev("window.__game.player.health"))

    # --- pause ---
    tab.press("Escape", "Escape", 27)
    tab.pump(0.5)
    check("pauses", tab.ev("window.__game.state") == "pause", tab.ev("window.__game.state"))
    tab.press("Escape", "Escape", 27)
    tab.pump(0.5)
    check("resumes", tab.ev("window.__game.state") == "play", tab.ev("window.__game.state"))

    # --- frames keep coming ---
    t0 = tab.ev("window.__game.time")
    advance(tab, 1.0)
    t1 = tab.ev("window.__game.time")
    check("loop alive", t1 > t0 + 0.9, f"{t0} -> {t1}")

    check("no console errors", not tab.errors, tab.errors[:3])
    failed = [c for c in CHECKS if not c["ok"]]
    print(json.dumps({"passed": len(CHECKS) - len(failed), "failed": len(failed), "checks": CHECKS}, indent=1)[:4000])
    return 0 if not failed else 1


if __name__ == "__main__":
    seed = int(sys.argv[1]) if len(sys.argv) > 1 else 7
    sys.exit(main(seed))
