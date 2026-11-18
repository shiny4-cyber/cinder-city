"""Check that the HUD is really in the captured frames: minimap (bottom left), wanted stars (top
right) and the objective line (bottom centre), measured on the saved JPEGs, not on the game state."""
import os
import sys

from PIL import Image, ImageStat

REGIONS = {
    "minimap": (24, 528, 192, 696),
    "stars": (1108, 56, 1266, 86),
    "objective": (380, 642, 900, 700),
}


def main(directory="screenshots"):
    for name in sorted(os.listdir(directory)):
        if not name.lower().endswith(('.jpg', '.jpeg', '.png')):
            continue
        path = os.path.join(directory, name)
        with Image.open(path) as im:
            im = im.convert("RGB")
            print(f"{name}  {os.path.getsize(path)} bytes  {im.size[0]}x{im.size[1]}")
            for label, box in REGIONS.items():
                crop = im.crop(box)
                stat = ImageStat.Stat(crop)
                mean = sum(stat.mean) / 3
                sd = sum(stat.stddev) / 3
                colours = len(crop.convert("RGB").getcolors(maxcolors=9_000_000) or [])
                print(f"  {label:10s} mean {mean:6.1f}  sd {sd:6.1f}  colours {colours}")


if __name__ == "__main__":
    main(*sys.argv[1:])
