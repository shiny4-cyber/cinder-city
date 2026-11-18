"""Capture the entry's screenshots from the running game: one staged scene per entry of shots.json,
1280x720 JPEG, each under the gate's 256 KiB cap, written to screenshots/.

Usage: python3 tools/make_shots.py [shots.json] [output dir]
Prints the byte size and pixel size of each capture and a coarse brightness grid of the frame, so
an unrendered or blank capture is visible in the log rather than discovered later.
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from drive import BASE, Tab, state, wait_ready  # noqa: E402

MAX_BYTES = 256 * 1024
W, H = 1280, 720


def report(path):
    try:
        from PIL import Image
    except ImportError:
        return {"bytes": os.path.getsize(path)}
    with Image.open(path) as im:
        im = im.convert("L")
        box = im.copy()
    w, h = im.size
    # A 32x9 brightness grid: a blank frame is one flat character, a street is not.
    cell_w, cell_h = max(1, w // 32), max(1, h // 9)
    ramp = " .:-=+*#%@"
    rows = []
    for gy in range(9):
        line = ""
        for gx in range(32):
            crop = box.crop((gx * cell_w, gy * cell_h, (gx + 1) * cell_w, (gy + 1) * cell_h))
            hist = crop.histogram()
            total = sum(hist) or 1
            mean = sum(i * n for i, n in enumerate(hist)) / total
            line += ramp[min(len(ramp) - 1, int(mean / 256 * len(ramp)))]
        rows.append(line)
    return {"bytes": os.path.getsize(path), "size": [w, h], "grid": rows}


def capture(tab, name, query, outdir):
    tab.viewport(W, H)
    tab.goto(f"{BASE}/index.html?{query}", 3)
    for _ in range(80):
        if tab.ev("!!window.__shotReady"):
            break
        tab.pump(0.25)
    shot_error = tab.ev("window.__shotError || null")
    tab.pump(0.4)
    path = os.path.join(outdir, name)
    quality = 92
    size = tab.shot(path, quality)
    while size > MAX_BYTES and quality > 36:
        quality -= 6
        size = tab.shot(path, quality)
    info = report(path)
    info.update({"shot": name, "query": query, "quality": quality, "shotError": shot_error, "state": state(tab)})
    return info


def main():
    shots_path = sys.argv[1] if len(sys.argv) > 1 else "shots.json"
    outdir = sys.argv[2] if len(sys.argv) > 2 else "screenshots"
    os.makedirs(outdir, exist_ok=True)
    with open(shots_path) as fh:
        shots = json.load(fh)
    tab = Tab()
    reportrows = [capture(tab, s["name"], s["query"], outdir) for s in shots]
    for row in reportrows:
        st = row.pop("state", {})
        print(json.dumps(row, indent=1))
        print("  game:", json.dumps({k: st.get(k) for k in ("state", "wanted", "objective", "active", "player")}))
        print("\n".join("  " + line for line in row.get("grid", [])))
    bad = [r["shot"] for r in reportrows if r["bytes"] > MAX_BYTES or r.get("shotError")]
    print(json.dumps({"count": len(reportrows), "over_cap_or_failed": bad}))
    return 0 if not bad else 1


if __name__ == "__main__":
    sys.exit(main())
