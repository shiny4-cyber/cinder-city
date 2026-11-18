"""A local stand-in for the sealed gate's five rows (RULES.txt, 'The gate'), so a broken row shows
up here rather than at submission: game_files, references, screenshots, dossier_matches, js_parses.
Run from the repository root: python3 tools/gate_check.py
Exit code 1 when any row fails.
"""
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
GAME = os.path.join(ROOT, "game")
SHOTS = os.path.join(ROOT, "screenshots")
ROWS = []


def row(name, ok, detail):
    ROWS.append({"row": name, "ok": bool(ok), "detail": detail})
    print(("PASS " if ok else "FAIL ") + name + "  " + str(detail))


def check_game_files():
    problems = []
    entries = 0
    total = 0
    for base, dirs, files in os.walk(GAME):
        entries += len(dirs)
        for name in files:
            p = os.path.join(base, name)
            entries += 1
            if os.path.islink(p):
                problems.append(f"symlink {p}")
                continue
            size = os.path.getsize(p)
            total += size
            rel = os.path.relpath(p, ROOT)
            if len(rel.encode()) > 1000:
                problems.append(f"path too long {rel}")
    index = os.path.join(GAME, "index.html")
    if not os.path.isfile(index) or os.path.islink(index):
        problems.append("game/index.html is not a regular file")
    elif os.path.getsize(index) > 1024 * 1024:
        problems.append("game/index.html over 1 MiB")
    if entries > 993:
        problems.append(f"{entries} entries over 993")
    if total > 48 * 1024 * 1024:
        problems.append(f"{total} bytes over 48 MiB")
    row("game_files", not problems, problems or f"{entries} entries, {total} bytes, index.html {os.path.getsize(index)} bytes")


SPEC_HTML = re.compile(r'<(script|link|img|source|video|audio|iframe)\b[^>]*>', re.I)
ATTR = re.compile(r'\b(src|href)\s*=\s*["\']([^"\']+)["\']', re.I)
IMPORT = re.compile(r"(?:^|[\s;{}])(?:import|export)\s+(?:[^'\";]*?\s+from\s+)?[\"']([^\"']+)[\"']", re.M)
DYN = re.compile(r"import\s*\(\s*[\"']([^\"']+)[\"']\s*\)")


def resolve(spec, base_dir):
    """(status, path): status is ok, data, network, outside or missing."""
    if spec.startswith("data:"):
        return ("data", None)
    if re.match(r"^[a-zA-Z][a-zA-Z0-9+.-]*:", spec) or spec.startswith("//"):
        return ("network", None)
    path = os.path.join(GAME, spec.lstrip("/")) if spec.startswith("/") else os.path.join(base_dir, spec)
    path = os.path.abspath(path)
    if not (path == GAME or path.startswith(GAME + os.sep)):
        return ("outside", path)
    if not os.path.isfile(path):
        return ("missing", path)
    return ("ok", path)


def check_references():
    problems = []
    reachable = []
    index = os.path.join(GAME, "index.html")
    html = open(index, encoding="utf-8").read()
    for tag in SPEC_HTML.findall(html):
        pass
    for tag_text in re.findall(r"<(?:script|link|img|source|video|audio|iframe)\b[^>]*>", html, re.I):
        for _, spec in ATTR.findall(tag_text):
            status, path = resolve(spec, GAME)
            if status not in ("ok", "data"):
                problems.append(f"index.html {spec}: {status}")
            elif status == "ok" and path.endswith((".js", ".mjs")):
                reachable.append(path)
    seen = set()
    while reachable:
        path = reachable.pop()
        if path in seen:
            continue
        seen.add(path)
        source = open(path, encoding="utf-8").read()
        for spec in IMPORT.findall(source) + DYN.findall(source):
            status, target = resolve(spec, os.path.dirname(path))
            if status not in ("ok", "data"):
                problems.append(f"{os.path.relpath(path, ROOT)} imports {spec}: {status}")
            elif status == "ok" and target.endswith((".js", ".mjs")):
                reachable.append(target)
    row("references", not problems, problems or f"{len(seen)} modules reached, nothing outside game/")


def check_screenshots():
    from PIL import Image
    problems = []
    names = sorted(n for n in os.listdir(SHOTS) if not n.startswith("."))
    if not 3 <= len(names) <= 4:
        problems.append(f"{len(names)} screenshots")
    for name in names:
        p = os.path.join(SHOTS, name)
        if not re.fullmatch(r"[A-Za-z0-9._-]{1,128}", name) or name[0] in ".-":
            problems.append(f"bad name {name}")
        size = os.path.getsize(p)
        if size > 256 * 1024:
            problems.append(f"{name} {size} bytes over 256 KiB")
        try:
            with Image.open(p) as im:
                im.verify()
            with Image.open(p) as im:
                w, h = im.size
                if max(w, h) > 1280 or min(w, h) < 480:
                    problems.append(f"{name} {w}x{h} out of bounds")
        except Exception as exc:
            problems.append(f"{name} not a whole image: {exc}")
    row("screenshots", not problems, problems or f"{len(names)} images, " + ", ".join(f"{n} {os.path.getsize(os.path.join(SHOTS, n))}B" for n in names))


def check_dossier():
    problems = []
    outputs = []
    for _ in range(2):
        tmp = tempfile.mkdtemp()
        env = dict(os.environ, MAKEFUN_OUTPUT_DIR=tmp)
        proc = subprocess.run(["node", "main.ts"], cwd=ROOT, env=env, capture_output=True, text=True)
        if proc.returncode != 0:
            problems.append(f"main.ts exit {proc.returncode}: {proc.stderr.strip()[:200]}")
        outputs.append(tmp)
    a = open(os.path.join(outputs[0], "dossier.json"), "rb").read()
    b = open(os.path.join(outputs[1], "dossier.json"), "rb").read()
    if a != b:
        problems.append("two runs wrote different dossier bytes")
    if len(a) > 1536 * 1024:
        problems.append(f"dossier {len(a)} bytes over 1.5 MiB")
    built = json.loads(a.decode())
    games = os.path.join(outputs[0], "game")
    for base, _, files in os.walk(GAME):
        for name in files:
            rel = os.path.relpath(os.path.join(base, name), GAME)
            if not os.path.isfile(os.path.join(games, rel)):
                problems.append(f"dossier run copied no {rel}")
    for tmp in outputs:
        shutil.rmtree(tmp, ignore_errors=True)
    row("dossier_matches", not problems, problems or f"two runs identical, {len(a)} bytes, keys {sorted(built)[:6]}")


def check_parses():
    problems = []
    count = 0
    for base, _, files in os.walk(GAME):
        for name in files:
            if not name.endswith((".js", ".mjs")):
                continue
            count += 1
            p = os.path.join(base, name)
            proc = subprocess.run(["node", "--input-type=module", "--check"], stdin=open(p, "rb"), capture_output=True, text=True)
            if proc.returncode != 0:
                problems.append(f"{os.path.relpath(p, ROOT)}: {proc.stderr.strip().splitlines()[:3]}")
    row("js_parses", not problems, problems or f"{count} scripts parse as ES modules")


if __name__ == "__main__":
    check_game_files()
    check_references()
    check_screenshots()
    check_dossier()
    check_parses()
    failed = [r for r in ROWS if not r["ok"]]
    print(json.dumps({"passed": len(ROWS) - len(failed), "failed": len(failed), "failed_rows": [r["row"] for r in failed]}))
    sys.exit(0 if not failed else 1)
