"""Raw-CDP harness for the game: navigate, drive the keyboard and mouse, read the game's own
state, collect console errors and network requests, and take JPEG screenshots at 1280x720.

Usage:
  python3 tools/drive.py <scenario>
Scenarios live at the bottom; each prints a JSON report.
"""
import base64
import json
import sys
import time
import urllib.request

import websocket

import os
PORT = int(os.environ.get("CDP_PORT", "9333"))
BASE = os.environ.get("BASE", "http://127.0.0.1:8080").rstrip("/")


class Tab:
    def __init__(self, port=PORT):
        targets = json.load(urllib.request.urlopen(f"http://127.0.0.1:{port}/json/list", timeout=20))
        pages = [t for t in targets if t.get("type") == "page" and t.get("url", "").startswith(BASE)]
        if not pages:
            try:
                urllib.request.urlopen(urllib.request.Request(f"http://127.0.0.1:{port}/json/new?about:blank", method="PUT"), timeout=20)
            except Exception:
                pass
            time.sleep(0.6)
            targets = json.load(urllib.request.urlopen(f"http://127.0.0.1:{port}/json/list", timeout=20))
            pages = [t for t in targets if t.get("type") == "page" and t.get("url", "").startswith("about:")]
        if not pages:
            pages = [t for t in targets if t.get("type") == "page"]
        self.ws = websocket.create_connection(pages[0]["webSocketDebuggerUrl"], timeout=60)
        self.mid = 0
        self.logs = []
        self.errors = []
        self.requests = []
        for dom in ("Runtime", "Log", "Network", "Page"):
            self.send(f"{dom}.enable", {})
        self.send("Network.setCacheDisabled", {"cacheDisabled": True})
        try:
            self.send("Emulation.setFocusEmulationEnabled", {"enabled": True})
        except Exception:
            pass
        try:
            self.send("Page.bringToFront", {})
        except Exception:
            pass

    def send(self, method, params=None):
        self.mid += 1
        mid = self.mid
        self.ws.send(json.dumps({"id": mid, "method": method, "params": params or {}}))
        while True:
            msg = json.loads(self.ws.recv())
            if msg.get("id") == mid:
                if "error" in msg:
                    raise RuntimeError(f"{method}: {msg['error']}")
                return msg.get("result", {})
            self._event(msg)

    def _event(self, msg):
        m = msg.get("method", "")
        p = msg.get("params", {})
        if m == "Runtime.consoleAPICalled":
            text = " ".join(str(a.get("value", a.get("description", ""))) for a in p.get("args", []))
            self.logs.append(f"{p.get('type')}: {text}")
            if p.get("type") in ("error", "assert"):
                self.errors.append(text)
        elif m == "Runtime.exceptionThrown":
            d = p.get("exceptionDetails", {})
            self.errors.append(f"EXCEPTION {d.get('text')} {d.get('exception', {}).get('description', '')}"[:400])
        elif m == "Log.entryAdded":
            e = p.get("entry", {})
            if e.get("level") == "error":
                self.errors.append(f"{e.get('source')}: {e.get('text')}"[:400])
        elif m == "Network.requestWillBeSent":
            self.requests.append(p.get("request", {}).get("url", ""))

    def pump(self, seconds=1.0):
        end = time.time() + seconds
        self.ws.settimeout(0.15)
        while time.time() < end:
            try:
                msg = json.loads(self.ws.recv())
            except websocket.WebSocketTimeoutException:
                continue
            except Exception:
                break
            self._event(msg)
        self.ws.settimeout(60)

    def ev(self, expr):
        r = self.send("Runtime.evaluate", {"expression": expr, "returnByValue": True, "awaitPromise": True})
        if "exceptionDetails" in r:
            return {"EXC": r["exceptionDetails"].get("exception", {}).get("description", "")[:300]}
        return r.get("result", {}).get("value")

    def goto(self, url, wait=2.5):
        self.send("Page.navigate", {"url": url})
        self.pump(wait)
        return self.ev("location.href")

    def viewport(self, w=1280, h=720):
        self.send("Emulation.setDeviceMetricsOverride", {"width": w, "height": h, "deviceScaleFactor": 1, "mobile": False})

    def key(self, code, key, vk=0, down=True):
        typ = "rawKeyDown" if down else "keyUp"
        self.send("Input.dispatchKeyEvent", {"type": typ, "code": code, "key": key, "windowsVirtualKeyCode": vk, "nativeVirtualKeyCode": vk})

    def press(self, code, key, vk=0, hold=0.08):
        self.key(code, key, vk, True)
        self.pump(hold)
        self.key(code, key, vk, False)
        self.pump(0.05)

    def mouse(self, x, y, click=False):
        self.send("Input.dispatchMouseEvent", {"type": "mouseMoved", "x": x, "y": y, "button": "none"})
        if click:
            self.send("Input.dispatchMouseEvent", {"type": "mousePressed", "x": x, "y": y, "button": "left", "clickCount": 1})
            self.send("Input.dispatchMouseEvent", {"type": "mouseReleased", "x": x, "y": y, "button": "left", "clickCount": 1})

    def shot(self, path, quality=88):
        r = self.send("Page.captureScreenshot", {"format": "jpeg", "quality": quality, "captureBeyondViewport": False})
        data = base64.b64decode(r["data"])
        with open(path, "wb") as f:
            f.write(data)
        return len(data)


def wait_ready(tab, timeout=15.0):
    end = time.time() + timeout
    while time.time() < end:
        if tab.ev("!!(window.__game && window.__game.player)"):
            tab.pump(0.2)
            return True
        tab.pump(0.25)
    return False


def state(tab):
    return tab.ev("""(() => { const g = window.__game; if (!g) return {ready:false};
      return { ready:true, state:g.state, time:+g.time.toFixed(2),
        player:{x:Math.round(g.player.x),y:Math.round(g.player.y),hp:Math.round(g.player.health),inCar:g.player.inCar?g.player.inCar.type:null},
        vehicles:g.vehicles.length, peds:g.peds.length, cops:g.cops.length,
        wanted:g.wanted.stars, heat:+g.wanted.heat.toFixed(2), money:g.economy.money,
        objective:g.missions.objective(), active:g.missions.active?g.missions.active.def.id:null,
        completed:[...g.missions.completed], shotReady:!!window.__shotReady, shotError:window.__shotError||null };
    })()""")


# ---------------------------------------------------------------------------------
# Scenarios
# ---------------------------------------------------------------------------------

def scenario_load(tab):
    tab.viewport()
    tab.goto(f"{BASE}/index.html?seed=7", 1.0)
    wait_ready(tab)
    tab.errors.clear(); tab.logs.clear(); tab.requests.clear()
    tab.pump(1)
    st = state(tab)
    tab.mouse(640, 300)
    tab.press("Enter", "Enter", 13)
    tab.pump(1.5)
    st2 = state(tab)
    return {"loaded": st, "afterEnter": st2, "errors": tab.errors[:12], "requests": sorted(set(tab.requests))}


def scenario_loop(tab):
    """Prove the core loop: spawn, walk, enter a car, drive, steal, shoot, wanted rises."""
    tab.viewport()
    tab.goto(f"{BASE}/index.html?seed=7", 1.0)
    wait_ready(tab)
    tab.errors.clear(); tab.requests.clear()
    tab.mouse(640, 300)
    tab.press("Enter", "Enter", 13)
    tab.pump(1.0)
    out = {"start": state(tab)}

    # Walk east for a second.
    tab.key("KeyD", "d", 68, True)
    tab.pump(1.0)
    tab.key("KeyD", "d", 68, False)
    tab.pump(0.2)
    out["afterWalk"] = state(tab)

    # Teleport next to a parked car (test affordance: the game exposes its own state).
    moved = tab.ev("""(() => { const g=window.__game; const v=g.vehicles.find(v=>!v.driver && !v.dead);
      g.player.x=v.x+30; g.player.y=v.y+10; g.player.vx=0; g.player.vy=0;
      return {car:v.type, x:Math.round(v.x), y:Math.round(v.y)}; })()""")
    out["carNearby"] = moved
    tab.pump(0.3)
    tab.press("KeyE", "e", 69)
    tab.pump(0.5)
    out["inCar"] = state(tab)

    # Drive: throttle for 1.6 s, steering a touch.
    tab.key("KeyW", "w", 87, True)
    tab.pump(1.6)
    out["driving"] = state(tab)
    tab.key("Space", " ", 32, True)
    tab.pump(0.5)
    tab.key("Space", " ", 32, False)
    tab.key("KeyW", "w", 87, False)
    tab.pump(0.4)
    out["afterHandbrake"] = state(tab)

    # Shoot: leave the car, aim at the pavement and fire.
    tab.press("KeyE", "e", 69)
    tab.pump(0.3)
    tab.mouse(900, 200)
    for _ in range(3):
        tab.mouse(900, 200, click=True)
        tab.pump(0.25)
    out["afterShots"] = state(tab)

    # Wanted level from a scripted crime, then the police response.
    tab.ev("""(() => { const g=window.__game; g.witnessCrime('murder', g.player.x, g.player.y); g.witnessCrime('gunfire', g.player.x, g.player.y); })()""")
    tab.pump(2.5)
    out["wanted"] = state(tab)

    # Mission: stand on the first contact and let it start, then complete it by driving.
    tab.ev("""(() => { const g=window.__game; const c=g.missions.contact(); if(c){ g.player.x=c.x; g.player.y=c.y; } })()""")
    tab.pump(0.6)
    out["missionStart"] = state(tab)
    tab.ev("""(() => { const g=window.__game; const m=g.missions.active; if(!m) return 'no mission';
      const def=m.def; return {id:def.id, step:def.steps[m.index].text}; })()""")
    out["errorsMid"] = tab.errors[:8]
    return out


def scenario_mission(tab):
    """Run the first job through to its payout, headlessly."""
    tab.viewport()
    tab.goto(f"{BASE}/index.html?seed=7", 1.0)
    wait_ready(tab)
    tab.mouse(640, 300)
    tab.press("Enter", "Enter", 13)
    tab.pump(1.0)
    steps = []
    tab.ev("""(() => { const g=window.__game; const c=g.missions.contact(); g.player.x=c.x; g.player.y=c.y; })()""")
    tab.pump(0.5)
    steps.append(state(tab))
    # Advance to the hero car and get in.
    tab.ev("""(() => { const g=window.__game; const m=g.missions.active; if(!m) return 'none';
       const hero = g.placeHero(); g.player.x=hero.x+24; g.player.y=hero.y; })()""")
    tab.pump(0.3)
    tab.press("KeyE", "e", 69)
    tab.pump(0.4)
    steps.append(state(tab))
    # Drive to the docks marker.
    tab.ev("""(() => { const g=window.__game; const p=g.world.places.docks; const c=g.player.inCar;
       if(!c) return 'no car'; c.x=p.x; c.y=p.y; c.vx=0; c.vy=0; return 'moved'; })()""")
    tab.pump(0.8)
    steps.append(state(tab))
    return {"steps": steps, "money": tab.ev("window.__game.economy.money"), "errors": tab.errors[:10]}


def scenario_shot(tab, name):
    tab.viewport()
    tab.goto(f"{BASE}/index.html?seed=11&shot={name}", 3)
    for _ in range(60):
        if tab.ev("!!window.__shotReady"):
            break
        tab.pump(0.25)
    tab.pump(0.3)
    st = state(tab)
    size = tab.shot(f"/tmp/shot-{name}.jpg", 90)
    return {"shot": name, "bytes": size, "state": st, "errors": tab.errors[:8]}


if __name__ == "__main__":
    name = sys.argv[1] if len(sys.argv) > 1 else "load"
    tab = Tab()
    if name == "load":
        rep = scenario_load(tab)
    elif name == "loop":
        rep = scenario_loop(tab)
    elif name == "mission":
        rep = scenario_mission(tab)
    elif name.startswith("shot:"):
        rep = scenario_shot(tab, name.split(":", 1)[1])
    else:
        rep = {"unknown": name}
    print(json.dumps(rep, indent=1)[:6000])
