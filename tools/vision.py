"""Ask a vision model what is in a screenshot. Provider: the local river router
(OpenAI-compatible, http://127.0.0.1:8765/v1), model deepseek-ai/DeepSeek-V4.1-Flash-1017,
key read from ~/.hermes/config.yaml. Usage: python3 tools/vision.py <image> "<question>"
"""
import base64
import json
import os
import re
import sys
import urllib.request

CFG = os.path.expanduser("~/.hermes/config.yaml")
MODEL = "deepseek-ai/DeepSeek-V4.1-Flash-1017"


def river_key():
    text = open(CFG).read()
    m = re.search(r"\n  river:\n(?:.*\n)*?    api_key: (\S+)", text)
    if not m:
        raise SystemExit("no river api_key in config")
    return m.group(1)


def ask(image_path, question, max_tokens=700):
    b = base64.b64encode(open(image_path, "rb").read()).decode()
    req = {
        "model": MODEL,
        "messages": [{
            "role": "user",
            "content": [
                {"type": "text", "text": question},
                {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64," + b}},
            ],
        }],
        "max_tokens": max_tokens,
    }
    r = urllib.request.Request(
        "http://127.0.0.1:8765/v1/chat/completions",
        data=json.dumps(req).encode(),
        headers={"Content-Type": "application/json", "Authorization": "Bearer " + river_key()},
    )
    out = json.load(urllib.request.urlopen(r, timeout=180))
    return out["choices"][0]["message"]["content"]


if __name__ == "__main__":
    img = sys.argv[1]
    q = sys.argv[2] if len(sys.argv) > 2 else "Describe this game screenshot in detail."
    print(ask(img, q))
